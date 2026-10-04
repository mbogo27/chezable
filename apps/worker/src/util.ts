export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  PEPPER?: string;
  PUBLIC_ORIGIN?: string;
}

export interface Player {
  id: string;
  handle: string | null;
  secret_hash: string;
  recovery_hash: string | null;
  lang: string;
  xp: number;
  coins: number;
  level: number;
  variant_cohort: string | null;
  created_at: number;
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, public extra: Record<string, unknown> = {}) {
    super(code);
  }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers },
  });
}

const enc = new TextEncoder();
export const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}
function hexBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function randomId(len: number, abc: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len * 2));
  let out = '';
  for (let i = 0; out.length < len && i < bytes.length; i++) {
    const b = bytes[i];
    if (b < Math.floor(256 / abc.length) * abc.length) out += abc[b % abc.length];
  }
  while (out.length < len) out += abc[crypto.getRandomValues(new Uint8Array(1))[0] % abc.length];
  return out;
}

/**
 * Request signing: the client keeps a random device secret and signs every authenticated request with
 * HMAC-SHA256 keyed by SHA-256(secret). The server stores only that hash (secret_hash) and never sees
 * the secret again after registration. Signature covers method, path+query, timestamp and body hash.
 */
export async function authenticate(req: Request, env: Env, bodyText: string): Promise<Player> {
  const id = req.headers.get('X-Chez-Player');
  const ts = req.headers.get('X-Chez-Ts');
  const sig = req.headers.get('X-Chez-Sig');
  if (!id || !ts || !sig) throw new HttpError(401, 'auth_required');
  if (Math.abs(Date.now() - Number(ts)) > 10 * 60 * 1000) throw new HttpError(401, 'stale_request');
  const player = await env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(id).first<Player>();
  if (!player) throw new HttpError(401, 'unknown_player');
  const url = new URL(req.url);
  const msg = `${req.method}\n${url.pathname}${url.search}\n${ts}\n${await sha256Hex(bodyText)}`;
  const key = await crypto.subtle.importKey('raw', hexBytes(player.secret_hash), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const ok = /^[0-9a-f]{64}$/.test(sig) && (await crypto.subtle.verify('HMAC', key, hexBytes(sig), enc.encode(msg)));
  if (!ok) throw new HttpError(401, 'bad_signature');
  return player;
}

export async function optionalAuth(req: Request, env: Env, bodyText: string): Promise<Player | null> {
  if (!req.headers.get('X-Chez-Player')) return null;
  try {
    return await authenticate(req, env, bodyText);
  } catch {
    return null;
  }
}

/** Fixed-window rate limit in D1. Throws 429 when exceeded. */
export async function rateLimit(env: Env, key: string, limit: number, windowMs: number): Promise<void> {
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (k, n, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT(k) DO UPDATE SET
       n = CASE WHEN reset_at <= ?3 THEN 1 ELSE n + 1 END,
       reset_at = CASE WHEN reset_at <= ?3 THEN ?2 ELSE reset_at END
     RETURNING n`
  ).bind(key, now + windowMs, now).first<{ n: number }>();
  if (row && row.n > limit) throw new HttpError(429, 'rate_limited');
}

export function origin(req: Request, env: Env): string {
  return env.PUBLIC_ORIGIN || new URL(req.url).origin;
}

export function displayName(p: { handle?: string | null; id?: string } | null): string | null {
  return p && p.handle ? p.handle : null;
}

export async function readJson<T = any>(text: string): Promise<T> {
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'bad_json');
  }
}

export const clampStr = (s: unknown, max: number) => (typeof s === 'string' ? s.slice(0, max) : null);
