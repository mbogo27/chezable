// Downloads the latin subsets of Archivo Black and Barlow 500/600/700 as WOFF2 into packages/ui/fonts.
// Run once (npm run fonts); the files are committed so builds never hit Google at runtime (spec §2.3).
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'packages/ui/fonts');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const families = [
  ['Archivo+Black', 400, 'archivo-black'],
  ['Barlow', 600, 'barlow-600'],
  ['Barlow', 700, 'barlow-700'],
];

let TEXT = '';
for (let c = 0x20; c < 0x7f; c++) TEXT += String.fromCharCode(c);
TEXT += '×·–—‘’“”…°•’éèêáàâíóúñçöüÉ';

await mkdir(out, { recursive: true });
let total = 0;
for (const [fam, w, name] of families) {
  // Subset to printable ASCII plus the few typographic marks English and Swahili copy uses.
  // Anything outside the subset (player names with rare letters) falls back to system-ui.
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${fam}:wght@${w}&display=swap&text=${encodeURIComponent(TEXT)}`, { headers: { 'User-Agent': UA } })).text();
  const url = css.match(/url\((https:[^)]+)\)\s*format\('woff2'\)/)[1];
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  await writeFile(path.join(out, `${name}.woff2`), buf);
  total += buf.length;
  console.log(`${name}.woff2  ${(buf.length / 1024).toFixed(1)} KB`);
}
console.log(`total ${(total / 1024).toFixed(1)} KB (budget 60 KB)`);
