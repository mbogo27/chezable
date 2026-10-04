// Checks the performance budgets from spec §9.5 against apps/web/dist (run after a build).
//   shell JS ≤ 40 KB gzipped · each game ≤ 120 KB gzipped (excluding fonts) · fonts ≤ 60 KB
import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/web/dist');
const gz = async (f) => gzipSync(await readFile(f), { level: 9 }).length;
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
let fail = 0;
const check = (label, size, limit) => { const ok = size <= limit; if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${label.padEnd(34)} ${kb(size).padStart(9)}  (budget ${kb(limit)})`); };

// shell: chez.js + the shell pages' own bundle
const assets = (await readdir(path.join(dist, 'assets'))).filter((f) => f.endsWith('.js'));
let spa = 0; for (const f of assets) spa += await gz(path.join(dist, 'assets', f));
check('shell SDK /shell/chez.js', await gz(path.join(dist, 'shell/chez.js')), 40 * 1024);
check('shell pages (Vite bundle)', spa, 40 * 1024);
const css = (await gz(path.join(dist, 'shell/ui.css'))) + (await Promise.all((await readdir(path.join(dist, 'assets'))).filter((f) => f.endsWith('.css')).map((f) => gz(path.join(dist, 'assets', f))))).reduce((a, b) => a + b, 0);
console.log(`  shell CSS ${kb(css)} gzipped`);

let fonts = 0;
for (const f of await readdir(path.join(dist, 'shell/fonts'))) fonts += (await stat(path.join(dist, 'shell/fonts', f))).size;
check('fonts (WOFF2, already compressed)', fonts, 60 * 1024);

for (const g of await readdir(path.join(dist, 'g'))) {
  let total = 0;
  async function walk(d) { for (const e of await readdir(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) await walk(p); else total += await gz(p); } }
  await walk(path.join(dist, 'g', g));
  check(`game ${g}`, total, 120 * 1024);
}
process.exit(fail ? 1 : 0);
