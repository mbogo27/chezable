// Stage catalogue (generated from games/*/stage.json at build time) plus score formatting.
import data from './catalog.generated.json';
import { L } from './i18n.js';
import { scoreDef } from './rules.js';

export const games = data.games;
export const bySlug = Object.fromEntries(games.map((g) => [g.id, g]));
export const HOME_DAILIES = ['arrow-puzzle', 'cap-drop', 'nyanya-jetpack'];

export function game(slug) { return bySlug[slug] || null; }

export function formatScore(slug, mode, score) {
  const g = game(slug);
  if (!g || score == null) return String(score ?? '–');
  const def = scoreDef(g, mode);
  const d = def.decimals || 0;
  const s = d ? Number(score).toFixed(d) : String(Math.round(score));
  const tpl = L(Number(score) === 1 && def.templateOne ? def.templateOne : def.template);
  return tpl ? tpl.replace('{s}', s) : s;
}
