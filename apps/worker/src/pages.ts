// HTML routes handled by the Worker:
//   /c/<id>                 the SPA shell with Open Graph tags rewritten for the challenge (spec §6.3)
//   /b/<brand>/<slug>/      a stage served with a brand skin (spec §12.1)
import type { Env } from './util';
import { HttpError } from './util';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function fmt(g: any, score: number | null): string {
  if (score == null) return '';
  const def = { ...(g.score || {}), ...((g.score && g.score.modes && g.score.modes.h2h) || {}) };
  const d = def.decimals || 0;
  const s = d ? Number(score).toFixed(d) : String(Math.round(score));
  const tpl = (score === 1 && def.templateOne ? def.templateOne : def.template) || {};
  return (tpl.en || '{s}').replace('{s}', s);
}

export async function challengeLanding(req: Request, env: Env, url: URL, games: Record<string, any>): Promise<Response> {
  const id = url.pathname.split('/')[2] || '';
  const shell = await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin).toString(), { headers: req.headers }));
  if (!/^[A-Za-z0-9]{6,12}$/.test(id)) return shell;
  const c = await env.DB.prepare(
    'SELECT c.kind, c.game, c.creator_score, p.handle FROM challenges c LEFT JOIN players p ON p.id = c.creator_id WHERE c.id = ?'
  ).bind(id).first<any>();
  if (!c || !games[c.game]) return shell;
  const g = games[c.game];
  const name = c.handle || 'A friend';
  const gameName = g.title.en;
  let title: string, desc: string;
  if (c.kind === 'revive') {
    title = `${name} needs rescuing in ${gameName}`;
    desc = `${name} crashed at ${fmt(g, c.creator_score)}. Catch the falling tomato to bring them back.`;
  } else if (c.kind === 'turn') {
    title = `${name} wants a game of ${gameName}`;
    desc = 'Move by move, through this link. Your move.';
  } else {
    title = `${name} challenged you: ${fmt(g, c.creator_score)}`;
    desc = `${gameName}. ${g.rule.en} Can you beat it?`;
  }
  const image = `${url.origin}/og/${c.game}.png`;
  const set = (attr: string) => ({ element(el: Element) { el.setAttribute('content', attr); } });
  const res = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(`${esc(title)} · Chezable`, { html: true }); } })
    .on('meta[name="description"]', set(desc))
    .on('meta[property="og:title"]', set(title))
    .on('meta[property="og:description"]', set(desc))
    .on('meta[property="og:image"]', set(image))
    .on('meta[property="og:url"]', set(`${url.origin}/c/${id}`))
    .on('meta[name="twitter:title"]', set(title))
    .on('meta[name="twitter:description"]', set(desc))
    .on('meta[name="twitter:image"]', set(image))
    .transform(shell);
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');
  out.headers.set('Content-Type', 'text/html; charset=utf-8');
  return out;
}

export async function brandedStage(req: Request, env: Env, url: URL): Promise<Response> {
  const m = url.pathname.match(/^\/b\/([a-z0-9-]+)\/([a-z0-9-]+)\/?$/);
  if (!m) throw new HttpError(404, 'not_found');
  const [, brand, slug] = m;
  if (!url.pathname.endsWith('/')) return Response.redirect(`${url.origin}${url.pathname}/${url.search}`, 301);
  const skin = await env.ASSETS.fetch(new Request(`${url.origin}/g/${slug}/skins/${brand}.json`));
  if (!skin.ok) throw new HttpError(404, 'no_such_brand');
  const page = await env.ASSETS.fetch(new Request(`${url.origin}/g/${slug}/`, { headers: req.headers }));
  const out = new Response(page.body, page);
  out.headers.set('Cache-Control', 'no-store');
  return out;
}
