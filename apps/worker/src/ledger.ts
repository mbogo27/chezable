// XP and coins ledger (spec §4.3). The server is the only writer; awards are per event, never per score,
// and every cap is enforced here. Coins are closed-loop: there is no endpoint that spends or sells them.
import { AWARDS, levelFor, nairobiDay, nairobiDayStart } from '../../../packages/chez-sdk/src/rules.js';
import type { Env } from './util';

export interface Award { event: string; xp: number; coins: number }

type AwardRule = { xp: number; coins: number; coinCapPerDay?: number; perGamePerDay?: number; oncePerGame?: boolean; perDay?: number };

export async function award(env: Env, playerId: string, event: string, game: string | null, ref: string | null, now = Date.now()): Promise<Award | null> {
  const rule = (AWARDS as Record<string, AwardRule>)[event];
  if (!rule) return null;
  const dayStart = nairobiDayStart(nairobiDay(now));
  let xp = rule.xp, coins = rule.coins;

  if (rule.oncePerGame) {
    const r = await env.DB.prepare('SELECT 1 FROM ledger WHERE player_id = ? AND event = ? AND game = ? LIMIT 1').bind(playerId, event, game).first();
    if (r) return null;
  }
  if (rule.perGamePerDay) {
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM ledger WHERE player_id = ? AND event = ? AND game = ? AND created_at >= ?')
      .bind(playerId, event, game, dayStart).first<{ n: number }>();
    if (r && r.n >= rule.perGamePerDay) return null;
  }
  if (rule.perDay) {
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM ledger WHERE player_id = ? AND event = ? AND created_at >= ?')
      .bind(playerId, event, dayStart).first<{ n: number }>();
    if (r && r.n >= rule.perDay) return null;
  }
  if (rule.coinCapPerDay) {
    const r = await env.DB.prepare('SELECT COALESCE(SUM(coin_delta), 0) AS c FROM ledger WHERE player_id = ? AND event = ? AND created_at >= ?')
      .bind(playerId, event, dayStart).first<{ c: number }>();
    if (r && r.c + coins > rule.coinCapPerDay) coins = Math.max(0, rule.coinCapPerDay - r.c);
  }
  if (!xp && !coins) return null;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO ledger (player_id, event, game, ref, xp_delta, coin_delta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(playerId, event, game, ref, xp, coins, now),
    env.DB.prepare('UPDATE players SET xp = xp + ?, coins = coins + ? WHERE id = ?').bind(xp, coins, playerId),
  ]);
  return { event, xp, coins };
}

/** Recompute the stored level from XP. Returns the new totals and whether the level went up. */
export async function settleLevel(env: Env, playerId: string) {
  const p = await env.DB.prepare('SELECT xp, coins, level FROM players WHERE id = ?').bind(playerId).first<{ xp: number; coins: number; level: number }>();
  if (!p) return { xp: 0, coins: 0, level: 1, levelUp: false };
  const level = levelFor(p.xp);
  if (level !== p.level) await env.DB.prepare('UPDATE players SET level = ? WHERE id = ?').bind(level, playerId).run();
  return { xp: p.xp, coins: p.coins, level, levelUp: level > p.level };
}

export async function edge(env: Env, a: string, b: string, game: string, kind: string, now = Date.now()) {
  if (!a || !b || a === b) return;
  await env.DB.prepare(
    `INSERT INTO edges (a_id, b_id, game, kind, count, last_at) VALUES (?, ?, ?, ?, 1, ?)
     ON CONFLICT(a_id, b_id, game, kind) DO UPDATE SET count = count + 1, last_at = excluded.last_at`
  ).bind(a, b, game, kind, now).run();
}
