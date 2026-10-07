// Routes handled by the Worker besides /api:
//   /c/<code>               the app shell with Open Graph tags for the challenge, in the initial HTML (spec v1 §B2)
//   /og/c/<code>.png        the challenge's preview card: game art, challenger name, score, logo
//   /b/<brand>/<slug>/      a stage served with a brand skin (spec §12.1)
import type { Env } from './util';
import { HttpError } from './util';
import { renderCard, hasCard } from './og';
import { isChallengeId, decodeChallenge } from '../../../packages/chez-sdk/src/codes.js';
import { threadIdFromPath, threadDef } from '../../../packages/chez-sdk/src/threads.js';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function fmt(g: any, score: number | null): string {
  if (score == null) return '';
  const def = { ...(g.score || {}), ...((g.score && g.score.modes && g.score.modes.h2h) || {}) };
  const d = def.decimals || 0;
  const s = d ? Number(score).toFixed(d) : String(Math.round(score));
  const tpl = (score === 1 && def.templateOne ? def.templateOne : def.template) || {};
  return (tpl.en || '{s}').replace('{s}', s);
}

async function loadForPreview(env: Env, code: string, games: Record<string, any>) {
  const row = await env.DB.prepare(
    `SELECT c.kind, c.game, c.creator_score, p.handle, COALESCE(p.status, 'ok') AS status, COALESCE(r.hidden, 0) AS hidden, COALESCE(r.flagged, 0) AS flagged
     FROM challenges c LEFT JOIN players p ON p.id = c.creator_id LEFT JOIN runs r ON r.id = c.creator_run_id WHERE c.id = ?`
  ).bind(code).first<any>();
  if (row) return row;
  // a device-made code its creator hasn't registered yet: the code itself carries the game and score
  const d = decodeChallenge(code, Object.keys(games));
  return d && d.kind === 'beat' ? { kind: 'beat', game: d.game, creator_score: d.score, handle: null, status: 'ok', hidden: 0, flagged: 0 } : null;
}
const isHidden = (c: any) => c.status === 'hidden' || c.hidden === 1 || c.flagged === 1;

export async function challengeLanding(req: Request, env: Env, url: URL, games: Record<string, any>): Promise<Response> {
  const id = url.pathname.split('/')[2] || '';
  const shell = await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin).toString(), { headers: req.headers }));
  if (!isChallengeId(id)) return shell;
  const c = await loadForPreview(env, id, games);
  if (!c || !games[c.game]) return shell;
  const g = games[c.game];
  const gameName = g.title.en;
  const name = c.handle || 'A friend';
  let title: string, desc: string, image = `${url.origin}/og/${c.game}.png`;
  if (c.kind === 'beat' && isHidden(c)) {
    // moderated: preview the plain game, not the challenger
    title = `${gameName} on Chezable`;
    desc = g.rule.en;
  } else if (c.kind === 'revive') {
    title = `${name} needs rescuing in ${gameName}`;
    desc = `${name} crashed at ${fmt(g, c.creator_score)}. Catch the falling tomato to bring them back.`;
  } else if (c.kind === 'turn') {
    title = `${name} wants a game of ${gameName}`;
    desc = 'Move by move, through this link. Your move.';
  } else {
    title = `${name} scored ${fmt(g, c.creator_score)}. Can you beat it?`;
    desc = `${gameName} on Chezable. ${g.rule.en}`;
    if (hasCard(c.game)) image = `${url.origin}/og/c/${id}.png`;
  }
  return withMeta(shell, { title, desc, image, url: `${url.origin}/c/${id}`, card: true });
}

/** The app shell with a page's own title, description and preview image in the initial HTML. */
function withMeta(shell: Response, m: { title: string; desc: string; image: string; url: string; card?: boolean }): Response {
  const { title, desc, image } = m;
  const set = (attr: string) => ({ element(el: Element) { el.setAttribute('content', attr); } });
  const res = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(`${esc(title)} · Chezable`, { html: true }); } })
    .on('meta[name="description"]', set(desc))
    .on('meta[property="og:title"]', set(title))
    .on('meta[property="og:description"]', set(desc))
    .on('meta[property="og:image"]', set(image))
    .on('meta[property="og:url"]', set(m.url))
    .on('meta[name="twitter:title"]', set(title))
    .on('meta[name="twitter:description"]', set(desc))
    .on('meta[name="twitter:image"]', set(image))
    .on('head', { element(el) { if (m.card) el.append(`<meta property="og:image:width" content="600"><meta property="og:image:height" content="315">`, { html: true }); } })
    .transform(shell);
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');
  out.headers.set('Content-Type', 'text/html; charset=utf-8');
  return out;
}

/** /og/c/<code>.png: drawn once per code per location, then served from the edge cache. */
export async function challengeCard(req: Request, env: Env, url: URL, games: Record<string, any>, ctx: ExecutionContext): Promise<Response> {
  const m = url.pathname.match(/^\/og\/c\/([A-Za-z0-9._~-]{6,140})\.png$/);
  if (!m || !isChallengeId(m[1])) throw new HttpError(404, 'not_found');
  const cache = caches.default;
  const hit = await cache.match(req);
  if (hit) return hit;
  const c = await loadForPreview(env, m[1], games);
  if (!c || !games[c.game] || c.kind !== 'beat' || isHidden(c) || !hasCard(c.game)) {
    return Response.redirect(`${url.origin}/og/${c && games[c.game] ? c.game : 'chezable'}.png`, 302);
  }
  const png = await renderCard(c.game, c.handle || 'A friend', fmt(games[c.game], c.creator_score));
  const res = new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
  ctx.waitUntil(cache.put(req, res.clone()));
  return res;
}

/** /t/<date> and /t/anytime-<id>: the app shell with the thread's preview tags (spec 2 §5.6). */
export async function threadLanding(req: Request, env: Env, url: URL): Promise<Response> {
  const shell = await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin).toString(), { headers: req.headers }));
  const id = threadIdFromPath(url.pathname.split('/')[2] || '');
  const def = id ? threadDef(id) : null;
  if (!def) return shell;
  const when = def.day ? new Date(def.day + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
  const name = def.kind === 'daily' ? `Today's Thread · ${when}` : 'An anytime thread';
  let title = `${name} on Chezable`;
  const from = url.searchParams.get('from') || '';
  if (/^\ds[0-9a-z]{6}$/.test(from)) {
    const c = await env.DB.prepare("SELECT p.handle FROM challenges c LEFT JOIN players p ON p.id = c.creator_id WHERE c.id = ? AND c.kind = 'thread'").bind(from).first<any>();
    title = `${(c && c.handle) || 'A friend'} got ${from[0]}/9 stars in ${name}. Can you beat it?`;
  }
  return withMeta(shell, { title, desc: 'Three games, one run. Lives and coins carry over.', image: `${url.origin}/og/chezable.png`, url: `${url.origin}${url.pathname}${url.search}` });
}

// Old Swahili game slugs, for branded links made before the rename
const LEGACY = { kifuniko: 'cap-drop', toka: 'arrow-puzzle', 'kata-nusu': 'cut-in-half' } as Record<string, string>;

export async function brandedStage(req: Request, env: Env, url: URL): Promise<Response> {
  const m = url.pathname.match(/^\/b\/([a-z0-9-]+)\/([a-z0-9-]+)\/?$/);
  if (!m) throw new HttpError(404, 'not_found');
  const [, brand, slug] = m;
  if (LEGACY[slug]) return Response.redirect(`${url.origin}/b/${brand}/${LEGACY[slug]}/${url.search}`, 301);
  if (!url.pathname.endsWith('/')) return Response.redirect(`${url.origin}${url.pathname}/${url.search}`, 301);
  const skin = await env.ASSETS.fetch(new Request(`${url.origin}/g/${slug}/skins/${brand}.json`));
  if (!skin.ok) throw new HttpError(404, 'no_such_brand');
  const page = await env.ASSETS.fetch(new Request(`${url.origin}/g/${slug}/`, { headers: req.headers }));
  const out = new Response(page.body, page);
  out.headers.set('Cache-Control', 'no-store');
  return out;
}
