// Chezable API (spec §10.3) and the challenge landing rewrite (§6.3). Static files are served by the
// assets layer; this Worker only runs for /api/*, /c/* and /b/*.
import catalogData from './catalog.generated.json';
import { scoreDef, compareRuns, isBetter, nameProblem, nairobiDay, ID_ABC, RECOVERY_ABC } from '../../../packages/chez-sdk/src/rules.js';
import * as shisima from '../../../games/water-bugs/logic.js';
import { award, settleLevel, edge, type Award } from './ledger';
import { Env, Player, HttpError, json, sha256Hex, randomId, authenticate, optionalAuth, rateLimit, origin, readJson, clampStr } from './util';
import { challengeLanding, brandedStage } from './pages';

// stage manifests are validated by the build; typed loosely here because each one has its own shape
type Stage = Record<string, any>;
const GAMES: Record<string, Stage> = Object.fromEntries((catalogData.games as Stage[]).map((g) => [g.id, g]));
const DAY = 86400000;
const CHALLENGE_TTL = 7 * DAY;
const SPECIAL_MODES = ['okoa', 'revive', 'turn'];

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, env, url, ctx);
      if (url.pathname.startsWith('/c/')) return await challengeLanding(req, env, url, GAMES);
      if (url.pathname.startsWith('/b/')) return await brandedStage(req, env, url);
      return env.ASSETS.fetch(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, ...e.extra }, e.status);
      console.error(e);
      return json({ error: 'server_error' }, 500);
    }
  },
};

async function api(req: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
  const path = url.pathname.slice(4); // strip /api
  const method = req.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204 });
  const body = method === 'GET' || method === 'HEAD' ? '' : await req.text();
  if (body.length > 64 * 1024) throw new HttpError(413, 'too_large');
  let m: RegExpMatchArray | null;

  if (method === 'POST' && path === '/player') return createPlayer(req, env, body);
  if (method === 'POST' && path === '/player/recover') return recoverPlayer(req, env, body);
  if (method === 'GET' && (m = path.match(/^\/daily\/([a-z0-9-]+)$/))) return daily(env, m[1]);
  if (method === 'GET' && (m = path.match(/^\/top\/([a-z0-9-]+)$/))) return top(req, env, url, m[1], body);
  if (method === 'GET' && (m = path.match(/^\/challenge\/([A-Za-z0-9]{6,12})$/))) return getChallenge(req, env, m[1], body);
  if (method === 'GET' && path === '/catalog') return json(catalogData, 200, { 'Cache-Control': 'public, max-age=300' });
  if (method === 'GET' && path === '/health') return json({ ok: true, day: nairobiDay() });

  const me = await authenticate(req, env, body);
  if (method === 'GET' && path === '/me') return getMe(env, me);
  if (method === 'POST' && path === '/player/name') return claimName(env, me, body);
  if (method === 'POST' && path === '/player/recovery') return newRecovery(env, me);
  if (method === 'POST' && path === '/run/start') return runStart(req, env, me, body);
  if (method === 'POST' && path === '/run/finish') return runFinish(req, env, me, body);
  if (method === 'POST' && path === '/challenge') return createChallenge(req, env, me, body);
  if (method === 'GET' && path === '/challenges') return listChallenges(req, env, me);
  if (method === 'POST' && (m = path.match(/^\/challenge\/([A-Za-z0-9]{6,12})\/move$/))) return turnMove(req, env, me, m[1], body);
  if (method === 'POST' && path === '/events') return events(env, me, body, ctx);
  throw new HttpError(404, 'not_found');
}

/* ======================= players ======================= */
async function createPlayer(req: Request, env: Env, body: string) {
  const b = await readJson(body);
  const id = String(b.id || '');
  const secret = String(b.secret || '');
  if (!/^[0-9a-f-]{36}$/.test(id) || secret.length < 32 || secret.length > 128) throw new HttpError(400, 'bad_player');
  const ip = req.headers.get('CF-Connecting-IP') || 'local';
  await rateLimit(env, `reg:${ip}`, 60, 3600 * 1000);
  const secretHash = await sha256Hex(secret);
  const existing = await env.DB.prepare('SELECT secret_hash, handle, variant_cohort FROM players WHERE id = ?').bind(id).first<any>();
  if (existing) {
    if (existing.secret_hash !== secretHash) throw new HttpError(409, 'player_exists');
    return json({ id, handle: existing.handle, cohort: existing.variant_cohort });
  }
  // §11.2 cohort: 80% classic-default, 20% native-default, assigned at creation (the client's draw is kept
  // so offline-first players see the same default before and after registering)
  const cohort = b.cohort === 'native' || b.cohort === 'classic' ? b.cohort : Math.random() < 0.2 ? 'native' : 'classic';
  const lang = b.lang === 'sw' ? 'sw' : 'en';
  await env.DB.prepare('INSERT INTO players (id, secret_hash, lang, variant_cohort, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, secretHash, lang, cohort, Date.now()).run();
  return json({ id, handle: null, cohort }, 201);
}

function newCode(): string {
  return randomId(12, RECOVERY_ABC);
}
const formatCode = (c: string) => c.match(/.{1,4}/g)!.join('-');
const recoveryHash = (env: Env, code: string) => sha256Hex(`${env.PEPPER || 'chezable-dev-pepper'}:${code.toUpperCase().replace(/[^A-Z0-9]/g, '')}`);

async function claimName(env: Env, me: Player, body: string) {
  const b = await readJson(body);
  const name = String(b.name || '').trim();
  const problem = nameProblem(name);
  if (problem) throw new HttpError(422, problem);
  const taken = await env.DB.prepare('SELECT id FROM players WHERE lower(handle) = lower(?) AND id != ?').bind(name, me.id).first();
  if (taken) throw new HttpError(409, 'name_taken');
  await rateLimit(env, `name:${me.id}`, 10, DAY);
  let recovery: string | null = null;
  if (!me.recovery_hash) {
    recovery = newCode();
    await env.DB.prepare('UPDATE players SET handle = ?, recovery_hash = ? WHERE id = ?').bind(name, await recoveryHash(env, recovery), me.id).run();
  } else {
    await env.DB.prepare('UPDATE players SET handle = ? WHERE id = ?').bind(name, me.id).run();
  }
  return json({ handle: name, recovery: recovery ? formatCode(recovery) : null });
}

async function newRecovery(env: Env, me: Player) {
  if (!me.handle) throw new HttpError(422, 'name_required');
  await rateLimit(env, `recovery:${me.id}`, 5, DAY);
  const code = newCode();
  await env.DB.prepare('UPDATE players SET recovery_hash = ? WHERE id = ?').bind(await recoveryHash(env, code), me.id).run();
  return json({ recovery: formatCode(code) });
}

async function recoverPlayer(req: Request, env: Env, body: string) {
  const b = await readJson(body);
  const ip = req.headers.get('CF-Connecting-IP') || 'local';
  await rateLimit(env, `recover:${ip}`, 10, 3600 * 1000);
  const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const secret = String(b.secret || '');
  if (code.length !== 12 || secret.length < 32) throw new HttpError(400, 'bad_code');
  const p = await env.DB.prepare('SELECT * FROM players WHERE recovery_hash = ?').bind(await recoveryHash(env, code)).first<Player>();
  if (!p) throw new HttpError(404, 'no_match');
  // the restoring device gets a fresh secret; the old device's secret stops working
  await env.DB.prepare('UPDATE players SET secret_hash = ? WHERE id = ?').bind(await sha256Hex(secret), p.id).run();
  return json({ id: p.id, handle: p.handle, cohort: p.variant_cohort, xp: p.xp, coins: p.coins, level: p.level });
}

async function getMe(env: Env, me: Player) {
  const bests = await env.DB.prepare(
    `SELECT game, mode, variant, assist, COUNT(*) AS runs, MAX(score) AS hi, MIN(score) AS lo
     FROM runs WHERE player_id = ? AND finished_at IS NOT NULL AND mode IN ('solo','daily','h2h','revive')
     GROUP BY game, mode, variant, assist`
  ).bind(me.id).all<any>();
  const out: any[] = [];
  for (const r of bests.results || []) {
    const g = GAMES[r.game];
    if (!g) continue;
    const def = scoreDef(g, r.mode);
    out.push({ game: r.game, mode: r.mode, variant: r.variant, assist: r.assist, runs: r.runs, best: def.order === 'asc' ? r.lo : r.hi });
  }
  const level = await settleLevel(env, me.id);
  return json({ id: me.id, handle: me.handle, xp: level.xp, coins: level.coins, level: level.level, cohort: me.variant_cohort, hasRecovery: !!me.recovery_hash, bests: out, createdAt: me.created_at });
}

/* ======================= daily ======================= */
async function dailySeed(env: Env, game: string, day = nairobiDay()): Promise<string> {
  const row = await env.DB.prepare('SELECT seed FROM daily_seeds WHERE game = ? AND day = ?').bind(game, day).first<{ seed: string }>();
  if (row) return row.seed;
  const seed = `${game}-${day}-${randomId(6, ID_ABC)}`;
  await env.DB.prepare('INSERT OR IGNORE INTO daily_seeds (game, day, seed) VALUES (?, ?, ?)').bind(game, day, seed).run();
  const again = await env.DB.prepare('SELECT seed FROM daily_seeds WHERE game = ? AND day = ?').bind(game, day).first<{ seed: string }>();
  return again!.seed;
}
async function daily(env: Env, game: string) {
  const g = GAMES[game];
  if (!g || !(g.modes || []).includes('daily')) throw new HttpError(404, 'no_daily');
  const day = nairobiDay();
  return json({ game, day, seed: await dailySeed(env, game, day) }, 200, { 'Cache-Control': 'public, max-age=60' });
}

/* ======================= runs ======================= */
function stageOrThrow(game: string): Stage {
  const g = GAMES[game];
  if (!g) throw new HttpError(400, 'unknown_game');
  return g;
}
function hasNative(g: Stage) { return !!(g.variants && g.variants.native); }

async function loadChallenge(env: Env, id: string) {
  return env.DB.prepare('SELECT * FROM challenges WHERE id = ?').bind(id).first<any>();
}

async function runStart(req: Request, env: Env, me: Player, body: string) {
  const b = await readJson(body);
  const g = stageOrThrow(String(b.game));
  let mode = String(b.mode || 'solo');
  let variant = b.variant === 'native' && hasNative(g) ? 'native' : 'classic';
  const assist = b.assist && g.assist ? 1 : 0;
  await rateLimit(env, `runs:${me.id}`, 150, 3600 * 1000);
  const now = Date.now();
  let seed = '';
  let counted = true;
  let challengeId: string | null = null;
  let challengeOut: any = null;

  if (b.challengeId) {
    const c = await loadChallenge(env, String(b.challengeId));
    if (!c || c.game !== g.id) throw new HttpError(404, 'challenge_missing');
    challengeId = c.id;
    variant = c.variant;
    seed = c.seed;
    const expired = c.expires_at < now;
    if (c.kind === 'beat') {
      if (expired) throw new HttpError(410, 'challenge_expired');
      mode = 'h2h';
      const entry = await env.DB.prepare('SELECT 1 FROM challenge_entries WHERE challenge_id = ? AND player_id = ?').bind(c.id, me.id).first();
      counted = !entry && c.creator_id !== me.id;
    } else if (c.kind === 'revive') {
      if (c.creator_id === me.id) {
        mode = 'revive';
        const state = c.state ? JSON.parse(c.state) : {};
        const caught = await env.DB.prepare("SELECT 1 FROM challenge_entries WHERE challenge_id = ? AND result = 'caught' LIMIT 1").bind(c.id).first();
        if (!caught || state.continued) throw new HttpError(409, 'nothing_to_continue');
      } else {
        if (expired) throw new HttpError(410, 'challenge_expired');
        mode = 'okoa';
        const entry = await env.DB.prepare('SELECT 1 FROM challenge_entries WHERE challenge_id = ? AND player_id = ?').bind(c.id, me.id).first();
        counted = !entry;
      }
    } else throw new HttpError(400, 'not_a_run_challenge');
    challengeOut = await publicChallenge(req, env, c, me);
    await env.DB.prepare('INSERT OR IGNORE INTO challenge_views (challenge_id, player_id, at) VALUES (?, ?, ?)').bind(c.id, me.id, now).run();
  } else {
    if (SPECIAL_MODES.includes(mode) || mode === 'h2h') throw new HttpError(400, 'challenge_required');
    if (!(g.modes || []).includes(mode) && !(variant === 'native' && (g.variants.native.modes || []).includes(mode))) throw new HttpError(400, 'bad_mode');
    seed = mode === 'daily' ? await dailySeed(env, g.id) : `${g.id}-${randomId(10, ID_ABC)}`;
  }
  const runId = 'r' + randomId(15, ID_ABC);
  await env.DB.prepare('INSERT INTO runs (id, player_id, game, mode, variant, seed, assist, challenge_id, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(runId, me.id, g.id, mode, variant, seed, assist, challengeId, now).run();
  return json({ runId, seed, startedAt: now, mode, variant, counted, challenge: challengeOut });
}

function boardGroup(g: Stage, mode: string) {
  return g.score && g.score.modes && g.score.modes[mode] ? mode : 'base';
}
function sameGroupModes(g: Stage, mode: string): string[] {
  const grp = boardGroup(g, mode);
  return ['solo', 'daily', 'h2h', 'revive'].filter((m) => boardGroup(g, m) === grp && (m !== 'daily' || mode === 'daily') && (mode !== 'daily' || m === 'daily'));
}

async function runFinish(req: Request, env: Env, me: Player, body: string) {
  const b = await readJson(body);
  const now = Date.now();
  let run: any;
  if (typeof b.runId === 'string' && b.runId.startsWith('L') && b.local) {
    // finished offline (or pass the phone): create the record now, with T0 checks on the claimed data
    const l = b.local;
    const g = stageOrThrow(String(l.game));
    const mode = String(l.mode || 'solo');
    if (SPECIAL_MODES.includes(mode) || mode === 'h2h') throw new HttpError(400, 'online_only');
    const startedAt = Math.min(Number(l.startedAt) || now, now);
    if (now - startedAt > 14 * DAY) throw new HttpError(410, 'too_old');
    const exists = await env.DB.prepare('SELECT id FROM runs WHERE id = ?').bind(b.runId).first();
    if (exists) throw new HttpError(409, 'already_finished');
    run = { id: b.runId, player_id: me.id, game: g.id, mode, variant: l.variant === 'native' && hasNative(g) ? 'native' : 'classic', seed: String(l.seed || '').slice(0, 80) || 'local',
      assist: l.assist && g.assist ? 1 : 0, challenge_id: null, started_at: startedAt, finished_at: null, local: 1 };
    await env.DB.prepare('INSERT INTO runs (id, player_id, game, mode, variant, seed, assist, started_at, local) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)')
      .bind(run.id, me.id, run.game, run.mode, run.variant, run.seed, run.assist, run.started_at).run();
  } else {
    run = await env.DB.prepare('SELECT * FROM runs WHERE id = ? AND player_id = ?').bind(String(b.runId), me.id).first<any>();
    if (!run) throw new HttpError(404, 'run_missing');
    if (run.finished_at) throw new HttpError(409, 'already_finished');
  }
  const g = stageOrThrow(run.game);
  const def = scoreDef(g, run.mode);
  const score = Number(b.score);
  const tiebreak = b.tiebreak == null || !isFinite(Number(b.tiebreak)) ? null : Number(b.tiebreak);
  if (!isFinite(score)) throw new HttpError(422, 'bad_score');
  if (run.mode !== 'okoa' && run.mode !== 'pass' && ((def.min != null && score < def.min) || (def.max != null && score > def.max))) throw new HttpError(422, 'score_out_of_bounds');
  const elapsed = run.local ? Number(b.durationMs) || 0 : now - run.started_at;
  const dur = (g.duration || {}) as { minMs?: number; maxMs?: number };
  if (run.mode !== 'okoa' && run.mode !== 'pass' && dur.minMs && elapsed < dur.minMs) throw new HttpError(422, 'too_fast');
  if (!run.local && dur.maxMs && elapsed > dur.maxMs * 3) throw new HttpError(422, 'too_slow');
  const detail: any = b.detail && typeof b.detail === 'object' ? b.detail : {};
  if (b.ghost && Array.isArray(b.ghost) && JSON.stringify(b.ghost).length < 12000) detail.ghost = b.ghost;
  const detailText = JSON.stringify(detail).slice(0, 16000);
  const day = nairobiDay(now);
  await env.DB.prepare('UPDATE runs SET score = ?, tiebreak = ?, detail = ?, input_hash = ?, finished_at = ?, day = ? WHERE id = ?')
    .bind(score, tiebreak, detailText, clampStr(b.inputHash, 80), now, day, run.id).run();

  const awards: Award[] = [];
  const push = (a: Award | null) => { if (a) awards.push(a); };
  const firstPlay = !(await env.DB.prepare("SELECT 1 FROM ledger WHERE player_id = ? AND event = 'stage.first_play' AND game = ?").bind(me.id, g.id).first());
  if (run.mode !== 'okoa') push(await award(env, me.id, 'run.finished', g.id, run.id, now));
  push(await award(env, me.id, 'stage.first_play', g.id, run.id, now));
  if (run.variant === 'native') push(await award(env, me.id, 'native.played', g.id, run.id, now));

  // personal best within the same board group, variant and assist flag (pass and rescue runs don't count)
  let pb = false, best: number | null = null;
  if (!['pass', 'okoa', 'turn'].includes(run.mode)) {
    const modes = sameGroupModes(g, run.mode);
    const agg = def.order === 'asc' ? 'MIN' : 'MAX';
    const prev = await env.DB.prepare(
      `SELECT ${agg}(score) AS s FROM runs WHERE player_id = ? AND game = ? AND variant = ? AND assist = ? AND finished_at IS NOT NULL AND id != ? AND mode IN (${modes.map(() => '?').join(',')})`
    ).bind(me.id, g.id, run.variant, run.assist, run.id, ...modes).first<{ s: number | null }>();
    best = prev ? prev.s : null;
    pb = best != null && isBetter(def, score, best);
    if (pb) push(await award(env, me.id, 'run.personal_best', g.id, run.id, now));
    best = best == null ? score : pb ? score : best;
  }
  if (run.mode === 'daily') {
    const firstToday = await env.DB.prepare("SELECT COUNT(*) AS n FROM runs WHERE player_id = ? AND game = ? AND mode = 'daily' AND day = ? AND finished_at IS NOT NULL").bind(me.id, g.id, day).first<{ n: number }>();
    if (firstToday && firstToday.n === 1) push(await award(env, me.id, 'daily.completed', g.id, run.id, now));
  }

  let challengeOut: any = null;
  if (run.challenge_id) challengeOut = await settleChallengeRun(env, me, run, g, def, score, tiebreak, now, push);

  const lvl = await settleLevel(env, me.id);
  let rank: number | null = null;
  if (['solo', 'daily', 'h2h'].includes(run.mode)) rank = await todayRank(env, g, run, def, me.id, day);
  return json({ ok: true, runId: run.id, awards, xp: lvl.xp, coins: lvl.coins, level: lvl.level, levelUp: lvl.levelUp, pb, best, rank, firstPlay, challenge: challengeOut });
}

async function settleChallengeRun(env: Env, me: Player, run: any, g: Stage, def: any, score: number, tiebreak: number | null, now: number, push: (a: Award | null) => void) {
  const c = await loadChallenge(env, run.challenge_id);
  if (!c) return null;
  const creator = await env.DB.prepare('SELECT id, handle, created_at FROM players WHERE id = ?').bind(c.creator_id).first<any>();
  if (c.kind === 'revive') {
    if (run.mode === 'revive' && c.creator_id === me.id) {
      const state = c.state ? JSON.parse(c.state) : {};
      state.continued = 1; state.finalScore = score;
      await env.DB.prepare('UPDATE challenges SET state = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(state), now, c.id).run();
      return { kind: 'revive', continued: true };
    }
    const exists = await env.DB.prepare('SELECT 1 FROM challenge_entries WHERE challenge_id = ? AND player_id = ?').bind(c.id, me.id).first();
    if (exists) return { kind: 'revive', counted: false, caught: score >= 1 };
    const caught = score >= 1;
    await env.DB.prepare('INSERT INTO challenge_entries (challenge_id, player_id, run_id, score, result, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(c.id, me.id, run.id, score, caught ? 'caught' : 'missed', now).run();
    await edge(env, c.creator_id, me.id, g.id, 'challenged', now);
    if (caught) await edge(env, me.id, c.creator_id, g.id, 'revived', now);
    if (me.created_at > c.created_at) {
      await edge(env, c.creator_id, me.id, g.id, 'recruited', now);
      await award(env, c.creator_id, 'challenge.accepted_by_new_player', g.id, c.id, now);
      await settleLevel(env, c.creator_id);
    }
    push(await award(env, me.id, 'h2h.played', g.id, c.id, now));
    return { kind: 'revive', counted: true, caught, creatorName: creator && creator.handle };
  }
  // beat: only the first run counts; the creator can't take their own challenge
  const exists = await env.DB.prepare('SELECT score, tiebreak FROM challenge_entries WHERE challenge_id = ? AND player_id = ?').bind(c.id, me.id).first<any>();
  const cmp = compareRuns(def, { score, tiebreak }, { score: c.creator_score, tiebreak: c.creator_tiebreak });
  const result = cmp < 0 ? 'win' : cmp > 0 ? 'loss' : 'tie';
  const base = { kind: 'beat', creatorScore: c.creator_score, creatorName: creator && creator.handle, creatorId: c.creator_id };
  if (exists || c.creator_id === me.id) return { ...base, result, counted: false };
  await env.DB.prepare('INSERT INTO challenge_entries (challenge_id, player_id, run_id, score, tiebreak, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(c.id, me.id, run.id, score, tiebreak, result, now).run();
  await edge(env, c.creator_id, me.id, g.id, 'challenged', now);
  if (result === 'win') { await edge(env, me.id, c.creator_id, g.id, 'beat', now); await edge(env, c.creator_id, me.id, g.id, 'lost_to', now); }
  if (result === 'loss') { await edge(env, c.creator_id, me.id, g.id, 'beat', now); await edge(env, me.id, c.creator_id, g.id, 'lost_to', now); }
  push(await award(env, me.id, 'h2h.played', g.id, c.id, now));
  if (result === 'win') push(await award(env, me.id, 'h2h.won', g.id, c.id, now));
  await award(env, c.creator_id, 'h2h.played', g.id, c.id, now);
  if (result === 'loss') await award(env, c.creator_id, 'h2h.won', g.id, c.id, now);
  if (me.created_at > c.created_at) {
    await edge(env, c.creator_id, me.id, g.id, 'recruited', now);
    await award(env, c.creator_id, 'challenge.accepted_by_new_player', g.id, c.id, now);
  }
  await settleLevel(env, c.creator_id);
  return { ...base, result, counted: true };
}

/* ======================= leaderboards ======================= */
function boardSql(order: string, firstAttempt: boolean) {
  const ord = firstAttempt ? 'r.finished_at ASC' : `r.score ${order === 'asc' ? 'ASC' : 'DESC'}, COALESCE(r.tiebreak, 1e18) ASC, r.finished_at ASC`;
  return `WITH ranked AS (
      SELECT r.player_id, r.score, r.tiebreak, r.finished_at,
             ROW_NUMBER() OVER (PARTITION BY r.player_id ORDER BY ${ord}) AS rn
      FROM runs r WHERE %WHERE%
    )
    SELECT ranked.player_id, ranked.score, ranked.tiebreak, ranked.finished_at, p.handle
    FROM ranked JOIN players p ON p.id = ranked.player_id
    WHERE rn = 1
    ORDER BY ranked.score ${order === 'asc' ? 'ASC' : 'DESC'}, COALESCE(ranked.tiebreak, 1e18) ASC, ranked.finished_at ASC`;
}

async function boardRows(env: Env, g: Stage, opts: { board: string; mode: string; variant: string; assist: number; ids?: string[]; day: string }) {
  const def = scoreDef(g, opts.mode);
  const modes = opts.mode === 'daily' ? ['daily'] : sameGroupModes(g, opts.mode).filter((m) => m !== 'daily');
  const where = ['r.game = ?', 'r.variant = ?', 'r.assist = ?', 'r.finished_at IS NOT NULL', 'r.score IS NOT NULL', `r.mode IN (${modes.map(() => '?').join(',')})`];
  const params: any[] = [g.id, opts.variant, opts.assist, ...modes];
  if (opts.board === 'today') { where.push('r.day = ?'); params.push(opts.day); }
  if (opts.ids) { where.push(`r.player_id IN (${opts.ids.map(() => '?').join(',')})`); params.push(...opts.ids); }
  const firstAttempt = opts.board === 'today' && opts.mode === 'daily';
  const sql = boardSql(def.order, firstAttempt).replace('%WHERE%', where.join(' AND '));
  const res = await env.DB.prepare(sql).bind(...params).all<any>();
  return { rows: res.results || [], def };
}

async function friendIds(env: Env, meId: string): Promise<string[]> {
  const res = await env.DB.prepare('SELECT DISTINCT b_id AS id FROM edges WHERE a_id = ? UNION SELECT DISTINCT a_id AS id FROM edges WHERE b_id = ?').bind(meId, meId).all<{ id: string }>();
  return [meId, ...(res.results || []).map((r) => r.id)].slice(0, 300);
}

async function top(req: Request, env: Env, url: URL, slug: string, body: string) {
  const g = stageOrThrow(slug);
  const board = ['today', 'all', 'friends'].includes(url.searchParams.get('board') || '') ? url.searchParams.get('board')! : 'today';
  const mode = url.searchParams.get('mode') || ((g.modes || []).includes('daily') ? 'daily' : 'solo');
  const variant = url.searchParams.get('variant') === 'native' ? 'native' : 'classic';
  const assist = url.searchParams.get('assist') === '1' ? 1 : 0;
  const me = await optionalAuth(req, env, body);
  if (board === 'friends' && !me) throw new HttpError(401, 'auth_required');
  const ids = board === 'friends' && me ? await friendIds(env, me.id) : undefined;
  const { rows } = await boardRows(env, g, { board, mode, variant, assist, ids, day: nairobiDay() });
  const out = rows.map((r: any, i: number) => ({ rank: i + 1, name: r.handle, score: r.score, tiebreak: r.tiebreak, me: me ? r.player_id === me.id : false }));
  const mine = me ? out.find((r: any) => r.me) || null : null;
  return json({ game: g.id, board, mode, variant, assist, day: nairobiDay(), rows: out.slice(0, 50), me: mine },
    200, { 'Cache-Control': board === 'friends' || me ? 'no-store' : 'public, max-age=30' });
}

async function todayRank(env: Env, g: Stage, run: any, def: any, meId: string, day: string): Promise<number | null> {
  const mode = run.mode === 'daily' ? 'daily' : 'solo';
  const { rows } = await boardRows(env, g, { board: 'today', mode, variant: run.variant, assist: run.assist, day });
  const i = rows.findIndex((r: any) => r.player_id === meId);
  return i >= 0 ? i + 1 : null;
}

/* ======================= challenges ======================= */
async function createChallenge(req: Request, env: Env, me: Player, body: string) {
  const b = await readJson(body);
  const kind = ['beat', 'revive', 'turn'].includes(b.kind) ? b.kind : 'beat';
  await rateLimit(env, `challenge:${me.id}`, 60, DAY);
  const now = Date.now();
  const id = randomId(8, ID_ABC);
  const payload = b.payload == null ? null : JSON.stringify(b.payload);
  if (payload && payload.length > 12000) throw new HttpError(413, 'payload_too_large');
  const target = typeof b.targetId === 'string' && /^[0-9a-f-]{36}$/.test(b.targetId) ? b.targetId : null;

  if (kind === 'turn') {
    const g = stageOrThrow(String(b.game));
    if (!g.turnBased) throw new HttpError(400, 'not_turn_based');
    const seed = b.daily ? await dailySeed(env, g.id) : `${g.id}-${randomId(10, ID_ABC)}`;
    const state = shisima.initialState(seed);
    await env.DB.prepare(
      `INSERT INTO challenges (id, kind, game, variant, seed, payload, creator_id, creator_run_id, created_at, expires_at, target_id, state, turn_of, updated_at)
       VALUES (?, 'turn', ?, 'classic', ?, NULL, ?, '', ?, ?, ?, ?, ?, ?)`
    ).bind(id, g.id, seed, me.id, now, now + CHALLENGE_TTL, target, JSON.stringify(state), me.id, now).run();
    await award(env, me.id, 'challenge.sent', g.id, id, now);
    return json({ id, url: `${origin(req, env)}/c/${id}`, state, seed }, 201);
  }

  const run = await env.DB.prepare('SELECT * FROM runs WHERE id = ? AND player_id = ?').bind(String(b.runId), me.id).first<any>();
  if (!run || !run.finished_at) throw new HttpError(404, 'run_missing');
  const g = stageOrThrow(run.game);
  if (kind === 'beat' && !(g.modes || []).includes('h2h')) throw new HttpError(400, 'no_h2h');
  if (kind === 'revive' && !(g.variants && g.variants.native && g.variants.native.revive && run.variant === 'native')) throw new HttpError(400, 'no_revive');
  if (run.mode === 'pass' || run.mode === 'okoa') throw new HttpError(400, 'bad_run');
  let pl = payload;
  if (kind === 'beat' && run.detail) {
    try {
      const d = JSON.parse(run.detail);
      if (d.ghost) pl = JSON.stringify({ ...(payload ? JSON.parse(payload) : {}), ghost: d.ghost });
    } catch {}
  }
  // level ladders (Arrow Puzzle, Cap Drop) score solo runs by level, but a challenge is played on one level and
  // compared on that level's head-to-head metric, which the stage reports alongside
  let creatorScore = run.score, creatorTiebreak = run.tiebreak;
  if (kind === 'beat' && run.mode === 'solo' && g.score && g.score.modes && g.score.modes.h2h && b.payload && typeof b.payload.h2hScore === 'number') {
    const h = scoreDef(g, 'h2h');
    if (b.payload.h2hScore < (h.min ?? 0) || b.payload.h2hScore > (h.max ?? Infinity)) throw new HttpError(422, 'score_out_of_bounds');
    creatorScore = b.payload.h2hScore;
    creatorTiebreak = typeof b.payload.h2hTiebreak === 'number' ? b.payload.h2hTiebreak : null;
  }
  if (kind === 'revive') {
    const existing = await env.DB.prepare("SELECT id FROM challenges WHERE creator_run_id = ? AND kind = 'revive'").bind(run.id).first<{ id: string }>();
    if (existing) return json({ id: existing.id, url: `${origin(req, env)}/c/${existing.id}` });
  }
  await env.DB.prepare(
    `INSERT INTO challenges (id, kind, game, variant, seed, payload, creator_id, creator_run_id, creator_score, creator_tiebreak, created_at, expires_at, target_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, kind, g.id, run.variant, run.seed, pl, me.id, run.id, creatorScore, creatorTiebreak, now, now + CHALLENGE_TTL, target, now).run();
  await award(env, me.id, 'challenge.sent', g.id, id, now);
  await settleLevel(env, me.id);
  return json({ id, url: `${origin(req, env)}/c/${id}` }, 201);
}

async function publicChallenge(req: Request, env: Env, c: any, me: Player | null) {
  const g = GAMES[c.game];
  const def = scoreDef(g, 'h2h');
  const creator = await env.DB.prepare('SELECT id, handle FROM players WHERE id = ?').bind(c.creator_id).first<any>();
  const entries = await env.DB.prepare(
    'SELECT e.player_id, e.score, e.tiebreak, e.result, e.created_at, p.handle FROM challenge_entries e JOIN players p ON p.id = e.player_id WHERE e.challenge_id = ?'
  ).bind(c.id).all<any>();
  const list = (entries.results || []).map((e: any) => ({ id: e.player_id, name: e.handle, score: e.score, tiebreak: e.tiebreak, result: e.result, at: e.created_at }));
  if (c.kind === 'beat') list.sort((a: any, b: any) => compareRuns(def, a, b));
  const mineEntry = me ? list.find((e: any) => e.id === me.id) : null;
  const state = c.state ? JSON.parse(c.state) : null;
  const out: any = {
    id: c.id, kind: c.kind, game: c.game, variant: c.variant, seed: c.seed,
    payload: c.payload ? JSON.parse(c.payload) : null,
    creator: { id: c.creator_id, name: creator ? creator.handle : null },
    creatorScore: c.creator_score, creatorTiebreak: c.creator_tiebreak,
    createdAt: c.created_at, expiresAt: c.expires_at, expired: c.expires_at < Date.now(),
    entries: list.slice(0, 20), url: `${origin(req, env)}/c/${c.id}`,
    mine: me ? { played: !!mineEntry, score: mineEntry ? mineEntry.score : null, isCreator: me.id === c.creator_id } : null,
    continued: state && state.continued ? 1 : 0,
  };
  if (c.kind === 'turn') {
    const opp = c.opponent_id ? await env.DB.prepare('SELECT handle FROM players WHERE id = ?').bind(c.opponent_id).first<any>() : null;
    out.state = state;
    out.opponent = c.opponent_id ? { id: c.opponent_id, name: opp ? opp.handle : null } : null;
    out.turnOf = c.turn_of;
    out.yourTurn = !!me && !state.winner && (c.turn_of === me.id || (c.turn_of === '*' && me.id !== c.creator_id));
    out.youAre = me ? (me.id === c.creator_id ? 1 : me.id === c.opponent_id || (c.turn_of === '*' && !c.opponent_id) ? 2 : 0) : 0;
    out.waitingOn = c.turn_of === c.creator_id ? (creator && creator.handle) : (opp && opp.handle);
  }
  return out;
}

async function getChallenge(req: Request, env: Env, id: string, body: string) {
  const c = await loadChallenge(env, id);
  if (!c) throw new HttpError(404, 'challenge_missing');
  const me = await optionalAuth(req, env, body);
  if (me && me.id !== c.creator_id) await env.DB.prepare('INSERT OR IGNORE INTO challenge_views (challenge_id, player_id, at) VALUES (?, ?, ?)').bind(c.id, me.id, Date.now()).run();
  return json(await publicChallenge(req, env, c, me));
}

async function listChallenges(req: Request, env: Env, me: Player) {
  const now = Date.now();
  const o = origin(req, env);
  const row = (c: any, extra: any = {}) => ({
    id: c.id, kind: c.kind, game: c.game, variant: c.variant, url: `${o}/c/${c.id}`, createdAt: c.created_at, updatedAt: c.updated_at || c.created_at,
    expiresAt: c.expires_at, creatorScore: c.creator_score, creatorName: c.creator_handle ?? null, creatorId: c.creator_id, ...extra,
  });
  const waitingYou = await env.DB.prepare(
    `SELECT c.*, p.handle AS creator_handle FROM challenges c JOIN players p ON p.id = c.creator_id
     WHERE c.kind = 'beat' AND c.expires_at > ?1 AND c.creator_id != ?2
       AND (c.target_id = ?2 OR c.id IN (SELECT challenge_id FROM challenge_views WHERE player_id = ?2))
       AND NOT EXISTS (SELECT 1 FROM challenge_entries e WHERE e.challenge_id = c.id AND e.player_id = ?2)
     ORDER BY c.created_at DESC LIMIT 30`
  ).bind(now, me.id).all<any>();
  const revived = await env.DB.prepare(
    `SELECT c.*, p.handle AS rescuer FROM challenges c
     JOIN challenge_entries e ON e.challenge_id = c.id AND e.result = 'caught'
     JOIN players p ON p.id = e.player_id
     WHERE c.kind = 'revive' AND c.creator_id = ?1 AND (c.state IS NULL OR c.state NOT LIKE '%"continued":1%')
     GROUP BY c.id ORDER BY c.created_at DESC LIMIT 10`
  ).bind(me.id).all<any>();
  const turns = await env.DB.prepare(
    `SELECT c.*, p.handle AS creator_handle, q.handle AS opponent_handle FROM challenges c
     JOIN players p ON p.id = c.creator_id LEFT JOIN players q ON q.id = c.opponent_id
     WHERE c.kind = 'turn' AND c.expires_at > ?1 AND (c.creator_id = ?2 OR c.opponent_id = ?2 OR (c.turn_of = '*' AND c.id IN (SELECT challenge_id FROM challenge_views WHERE player_id = ?2)))
     ORDER BY c.updated_at DESC LIMIT 30`
  ).bind(now, me.id).all<any>();
  const mine = await env.DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM challenge_entries e WHERE e.challenge_id = c.id) AS n FROM challenges c
     WHERE c.creator_id = ? AND c.kind IN ('beat','revive') ORDER BY c.created_at DESC LIMIT 40`
  ).bind(me.id).all<any>();
  const played = await env.DB.prepare(
    `SELECT c.*, e.score AS my_score, e.result AS my_result, e.created_at AS played_at, p.handle AS creator_handle FROM challenge_entries e
     JOIN challenges c ON c.id = e.challenge_id JOIN players p ON p.id = c.creator_id
     WHERE e.player_id = ? ORDER BY e.created_at DESC LIMIT 30`
  ).bind(me.id).all<any>();

  const you: any[] = (waitingYou.results || []).map((c: any) => row(c, { action: 'play' }));
  for (const c of revived.results || []) you.push(row(c, { action: 'continue', rescuer: c.rescuer }));
  const them: any[] = [];
  const finished: any[] = [];
  for (const c of turns.results || []) {
    const st = c.state ? JSON.parse(c.state) : {};
    const r = row(c, { opponentName: c.creator_id === me.id ? c.opponent_handle : c.creator_handle, winner: st.winner || 0, youAre: c.creator_id === me.id ? 1 : 2 });
    if (st.winner) finished.push(r);
    else if (c.turn_of === me.id || (c.turn_of === '*' && c.creator_id !== me.id)) you.push({ ...r, action: 'move' });
    else them.push(r);
  }
  for (const c of mine.results || []) {
    if (c.n === 0 && c.expires_at > now) them.push(row(c));
    else if (c.n > 0) {
      const top = await env.DB.prepare(
        'SELECT e.score, e.result, p.handle FROM challenge_entries e JOIN players p ON p.id = e.player_id WHERE e.challenge_id = ? ORDER BY e.created_at DESC LIMIT 1'
      ).bind(c.id).first<any>();
      finished.push(row(c, { entries: c.n, lastName: top && top.handle, lastScore: top && top.score, lastResult: top && top.result, mine: true }));
    }
  }
  for (const c of played.results || []) finished.push(row(c, { myScore: c.my_score, myResult: c.my_result, updatedAt: c.played_at }));
  finished.sort((a, b) => b.updatedAt - a.updatedAt);
  return json({ waitingYou: you, waitingThem: them, finished: finished.slice(0, 40) });
}

async function turnMove(req: Request, env: Env, me: Player, id: string, body: string) {
  const b = await readJson(body);
  const c = await loadChallenge(env, id);
  if (!c || c.kind !== 'turn') throw new HttpError(404, 'challenge_missing');
  const now = Date.now();
  if (c.expires_at < now) throw new HttpError(410, 'challenge_expired');
  let who: 1 | 2;
  if (c.creator_id === me.id) who = 1;
  else if (c.opponent_id === me.id || (!c.opponent_id && c.turn_of === '*')) who = 2;
  else throw new HttpError(403, 'not_your_game');
  const state = JSON.parse(c.state);
  if (state.winner) throw new HttpError(409, 'game_over');
  if (state.toMove !== who) throw new HttpError(409, 'not_your_turn');
  let next;
  try { next = shisima.applyMove(state, b.move, who); } catch (e: any) { throw new HttpError(422, 'illegal_move'); }
  const opponent = c.opponent_id || (who === 2 ? me.id : null);
  const turnOf = next.winner ? null : next.toMove === 1 ? c.creator_id : opponent || '*';
  await env.DB.prepare('UPDATE challenges SET state = ?, turn_of = ?, opponent_id = ?, updated_at = ?, expires_at = ? WHERE id = ?')
    .bind(JSON.stringify(next), turnOf, opponent, now, now + CHALLENGE_TTL, c.id).run();
  if (who === 2 && !c.opponent_id) {
    await edge(env, c.creator_id, me.id, c.game, 'challenged', now);
    if (me.created_at > c.created_at) {
      await edge(env, c.creator_id, me.id, c.game, 'recruited', now);
      await award(env, c.creator_id, 'challenge.accepted_by_new_player', c.game, c.id, now);
    }
  }
  const awards: Award[] = [];
  if (next.winner && opponent) {
    const players = [c.creator_id, opponent];
    for (const p of players) { const a = await award(env, p, 'h2h.played', c.game, c.id, now); if (a && p === me.id) awards.push(a); }
    if (next.winner === 1 || next.winner === 2) {
      const w = next.winner === 1 ? c.creator_id : opponent, l = next.winner === 1 ? opponent : c.creator_id;
      const a = await award(env, w, 'h2h.won', c.game, c.id, now);
      if (a && w === me.id) awards.push(a);
      await edge(env, w, l, c.game, 'beat', now);
      await edge(env, l, w, c.game, 'lost_to', now);
    }
    await env.DB.prepare('INSERT OR REPLACE INTO challenge_entries (challenge_id, player_id, run_id, score, result, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(c.id, opponent, '', next.winner === 2 ? 1 : 0, next.winner === 2 ? 'win' : next.winner === 1 ? 'loss' : 'tie', now).run();
    for (const p of players) await settleLevel(env, p);
  }
  const lvl = await settleLevel(env, me.id);
  return json({ state: next, turnOf, awards, xp: lvl.xp, coins: lvl.coins, level: lvl.level });
}

/* ======================= telemetry ======================= */
async function events(env: Env, me: Player, body: string, ctx: ExecutionContext) {
  const b = await readJson(body);
  const list = Array.isArray(b.events) ? b.events.slice(0, 60) : [];
  await rateLimit(env, `events:${me.id}`, 600, 3600 * 1000);
  const stmts = [];
  for (const e of list) {
    const name = String(e.name || '');
    if (!/^[a-z_.]{3,40}$/.test(name)) continue;
    const props = e.props ? JSON.stringify(e.props).slice(0, 1000) : null;
    const ts = Math.min(Number(e.ts) || Date.now(), Date.now());
    stmts.push(env.DB.prepare('INSERT INTO events (player_id, session_id, name, game, props, ts) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(me.id, clampStr(e.session, 40), name, clampStr(e.game, 40), props, ts));
  }
  if (stmts.length) ctx.waitUntil(env.DB.batch(stmts));
  return json({ ok: true, n: stmts.length });
}
