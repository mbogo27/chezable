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
