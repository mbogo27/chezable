// Admin API (spec v1 §B1 "report name" + admin tool, §B5 hide scores/players). Behind the ADMIN_TOKEN secret:
//   Authorization: Bearer <ADMIN_TOKEN>
// Used by the /admin page. If the secret isn't set, every admin route is a 404.
import type { Env } from './util';
import { HttpError, json, readJson, sha256Hex } from './util';
import { nameKey } from '../../../packages/chez-sdk/src/names.js';
import { checkName } from './moderation.js';

async function authorised(req: Request, env: Env): Promise<boolean> {
  const want = env.ADMIN_TOKEN;
  const got = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!want || !got) return false;
  // compare digests so the comparison time doesn't depend on how much of the token matched
  return (await sha256Hex(want)) === (await sha256Hex(got));
}

export async function admin(req: Request, env: Env, path: string, body: string, games: Record<string, any>): Promise<Response> {
  if (!env.ADMIN_TOKEN) throw new HttpError(404, 'not_found');
  if (!(await authorised(req, env))) throw new HttpError(401, 'admin_only');
  const DB = env.DB;

  if (req.method === 'GET' && path === '/overview') {
    const since = Date.now() - 30 * 86400000;
    const [reports, flaggedNames, flaggedRuns, hiddenPlayers, rejections] = await Promise.all([
      DB.prepare(`SELECT r.id, r.player_id, p.handle, p.status, r.reason, r.created_at,
                  (SELECT COUNT(*) FROM reports r2 WHERE r2.player_id = r.player_id AND r2.resolved = 0) AS open_count
                  FROM reports r JOIN players p ON p.id = r.player_id WHERE r.resolved = 0 ORDER BY r.created_at DESC LIMIT 100`).all(),
      DB.prepare("SELECT id, handle, created_at FROM players WHERE status = 'flagged' ORDER BY created_at DESC LIMIT 100").all(),
      DB.prepare(`SELECT r.id, r.game, r.mode, r.score, r.finished_at, p.handle FROM runs r JOIN players p ON p.id = r.player_id
                  WHERE r.flagged = 1 AND r.hidden = 0 ORDER BY r.finished_at DESC LIMIT 100`).all(),
      DB.prepare("SELECT id, handle FROM players WHERE status = 'hidden' LIMIT 100").all(),
      DB.prepare(`SELECT json_extract(props, '$.tier') AS tier, COUNT(*) AS n FROM events WHERE name = 'name_rejected' AND ts > ? GROUP BY tier`).bind(since).all(),
    ]);
    return json({ reports: reports.results, flaggedNames: flaggedNames.results, flaggedRuns: flaggedRuns.results, hiddenPlayers: hiddenPlayers.results, rejections30d: rejections.results, games: Object.keys(games) });
  }

  if (req.method === 'GET' && path.startsWith('/metrics')) {
    const days = Math.max(0, Math.min(365, Number(new URL(req.url).searchParams.get('days') ?? 14) || 0));
    return json(await metrics(DB, days));
  }

  if (req.method === 'GET' && path.startsWith('/player/')) {
    const q = decodeURIComponent(path.slice(8));
    const p = await DB.prepare('SELECT id, handle, status, created_at, name_changes FROM players WHERE id = ? OR name_normalized = ?').bind(q, nameKey(q)).first();
    if (!p) throw new HttpError(404, 'no_such_player');
    const runs = await DB.prepare('SELECT id, game, mode, score, flagged, hidden, finished_at FROM runs WHERE player_id = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 50').bind((p as any).id).all();
    return json({ player: p, runs: runs.results });
  }

  if (req.method === 'POST' && path === '/player') {
    const b = await readJson(body);
    const id = String(b.id || '');
    switch (b.action) {
      case 'hide': await DB.prepare("UPDATE players SET status = 'hidden' WHERE id = ?").bind(id).run(); break;
      case 'unhide':
      case 'approve': await DB.prepare("UPDATE players SET status = 'ok' WHERE id = ?").bind(id).run(); break;
      case 'clear_name': await DB.prepare("UPDATE players SET handle = NULL, name_normalized = NULL, status = 'ok' WHERE id = ?").bind(id).run(); break;
      case 'rename': {
        const name = String(b.name || '');
        const v = checkName(name);
        if (!v.ok) throw new HttpError(422, 'name_blocked');
        const taken = await DB.prepare('SELECT id FROM players WHERE name_normalized = ? AND id != ?').bind(nameKey(name), id).first();
        if (taken) throw new HttpError(409, 'name_taken');
        await DB.prepare("UPDATE players SET handle = ?, name_normalized = ?, status = 'ok' WHERE id = ?").bind(name, nameKey(name), id).run();
        break;
      }
      default: throw new HttpError(400, 'bad_action');
    }
    if (b.resolveReports) await DB.prepare('UPDATE reports SET resolved = 1 WHERE player_id = ?').bind(id).run();
    return json({ ok: true });
  }

  if (req.method === 'POST' && path === '/run') {
    const b = await readJson(body);
    const id = String(b.id || '');
    if (b.action === 'hide') await DB.prepare('UPDATE runs SET hidden = 1 WHERE id = ?').bind(id).run();
    else if (b.action === 'unhide') await DB.prepare('UPDATE runs SET hidden = 0 WHERE id = ?').bind(id).run();
    else if (b.action === 'approve') await DB.prepare('UPDATE runs SET flagged = 0, hidden = 0 WHERE id = ?').bind(id).run();
    else throw new HttpError(400, 'bad_action');
    return json({ ok: true });
  }

  if (req.method === 'POST' && path === '/report') {
    const b = await readJson(body);
    await DB.prepare('UPDATE reports SET resolved = 1 WHERE id = ?').bind(Number(b.id)).run();
    return json({ ok: true });
  }
  throw new HttpError(404, 'not_found');
}

/* ---------- success metrics (spec v1 §0), worked out from what is already collected ---------- */
// Targets set by the owner on 2026-10-04. `value` and `target` are fractions, except the viral coefficient.
export const TARGETS = { claim: 0.4, share: 0.2, linkToPlay: 0.6, viral: 0.4, d1: 0.25, d7: 0.1 };
const DAY = 86400000, EAT = 3 * 3600000;
// a timestamp's day number in Kenya time (EAT, UTC+3), for "came back on day 1 / day 7"
const dayOf = (col: string) => `((${col} + ${EAT}) / ${DAY})`;

async function metrics(DB: D1Database, days: number) {
  const now = Date.now();
  const since = days ? now - days * DAY : 0;
  const sinceDay = Math.floor((since + EAT) / DAY), today = Math.floor((now + EAT) / DAY);
  const ret = (n: number) => DB.prepare(
    `SELECT COUNT(*) AS den, COALESCE(SUM(EXISTS (SELECT 1 FROM runs r WHERE r.player_id = f.player_id AND ${dayOf('r.started_at')} = f.d0 + ?1)), 0) AS num
     FROM (SELECT player_id, ${dayOf('MIN(started_at)')} AS d0 FROM runs GROUP BY player_id) f
     WHERE f.d0 >= ?2 AND f.d0 + ?1 < ?3`).bind(n, sinceDay, today).first<any>();
  const [claim, share, link, viralNum, viralDen, d1, d7] = await Promise.all([
    // players whose first finished game falls in the window, and how many of them have a name now
    DB.prepare(`SELECT COUNT(*) AS den, COALESCE(SUM(p.handle IS NOT NULL), 0) AS num
      FROM (SELECT player_id, MIN(finished_at) AS f FROM runs WHERE finished_at IS NOT NULL GROUP BY player_id HAVING f >= ?) x
      JOIN players p ON p.id = x.player_id`).bind(since).first<any>(),
    // sessions with a finished game, and how many of those also had a share tap
    DB.prepare(`SELECT COUNT(DISTINCT g.session_id) AS den,
      COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM events s WHERE s.name IN ('share_tap', 'share_tapped') AND s.session_id = g.session_id) THEN g.session_id END) AS num
      FROM events g WHERE g.name = 'game_end' AND g.ts >= ? AND g.session_id IS NOT NULL`).bind(since).first<any>(),
    // challenge links opened by someone other than their creator, and how many led to a started game
    DB.prepare(`SELECT COUNT(*) AS den,
      COALESCE(SUM(EXISTS (SELECT 1 FROM runs r WHERE r.player_id = o.player_id AND r.challenge_id = o.code)), 0) AS num
      FROM (SELECT DISTINCT player_id, json_extract(props, '$.code') AS code FROM events WHERE name = 'link_open' AND ts >= ? AND player_id IS NOT NULL) o
      LEFT JOIN challenges c ON c.id = o.code
      WHERE o.code IS NOT NULL AND (c.creator_id IS NULL OR c.creator_id != o.player_id)`).bind(since).first<any>(),
    // new players who arrived through someone's challenge (the play graph's "recruited" edges) ...
    DB.prepare(`SELECT COUNT(DISTINCT e.b_id) AS n FROM edges e JOIN players p ON p.id = e.b_id
      WHERE e.kind = 'recruited' AND p.created_at >= ?`).bind(since).first<any>(),
    // ... per player who tapped a share button
    DB.prepare(`SELECT COUNT(DISTINCT player_id) AS n FROM events WHERE name IN ('share_tap', 'share_tapped') AND ts >= ?`).bind(since).first<any>(),
    ret(1), ret(7),
  ]);
  const m = (key: keyof typeof TARGETS, label: string, def: string, num: number, den: number, ratio = true) =>
    ({ key, label, def, num, den, value: den ? num / den : null, target: TARGETS[key], ratio });
  return {
    days, since, generatedAt: now,
    metrics: [
      m('claim', 'Name claim rate', 'players who claimed a name / players who finished a first game', claim.num, claim.den),
      m('share', 'Share rate', 'sessions with a share tap / sessions with a finished game', share.num, share.den),
      m('linkToPlay', 'Link-to-play', 'challenge links opened that led to a started game / links opened', link.num, link.den),
      m('viral', 'Viral coefficient', 'new players from challenge links / players who shared', viralNum.n, viralDen.n, false),
      m('d1', 'D1 return', 'players who played again the day after their first game (Kenya time)', d1.num, d1.den),
      m('d7', 'D7 return', 'players who played again 7 days after their first game', d7.num, d7.den),
    ],
  };
}
