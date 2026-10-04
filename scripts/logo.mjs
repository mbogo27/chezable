// Vectorises brand/chezable-logo.png (454x153) into SVGs (spec §2.1):
//   brand/chezable-mark.svg     figure mark only
//   brand/chezable-lockup.svg   mark + wordmark ("Chez" blue, "able" black)
//   brand/chezable-mono.svg     single-colour lockup (currentColor)
// Estimates per-pixel ink coverage for each colour (keeps the anti-aliased edges),
// splits the figure from the wordmark by connected components, upsamples and traces with potrace.
import sharp from 'sharp';
import potrace from 'potrace';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'brand/chezable-logo.png');
const SCALE = 6;

const { data, info } = await sharp(src).flatten({ background: '#ffffff' }).raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const N = W * H;
const clamp = (v) => Math.max(0, Math.min(1, v));

// coverage: dark ink (#1B1D1E) read from the blue channel (blue ink keeps b≈255),
// blue ink (#5271FF) from the red channel minus the dark share.
const darkCov = new Float32Array(N), blueCov = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const r = data[i * C], b = data[i * C + 2];
  const d = clamp((255 - b) / (255 - 30));
  darkCov[i] = d;
  blueCov[i] = clamp((255 - r) / (255 - 82) - d * ((255 - 27) / (255 - 82)));
}

// connected components of dark ink; components that start left of the first blue pixel are the figure
let firstBlueX = W;
for (let i = 0; i < N; i++) if (blueCov[i] > 0.5) firstBlueX = Math.min(firstBlueX, i % W);
const comp = new Int32Array(N).fill(-1);
const isMark = [];
let nComp = 0;
for (let i = 0; i < N; i++) {
  if (darkCov[i] < 0.2 || comp[i] >= 0) continue;
  let minX = W;
  const stack = [i]; comp[i] = nComp;
  while (stack.length) {
    const p = stack.pop(), x = p % W, y = (p / W) | 0;
    minX = Math.min(minX, x);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (comp[q] < 0 && darkCov[q] >= 0.2) { comp[q] = nComp; stack.push(q); }
    }
  }
  isMark[nComp++] = minX < firstBlueX;
}
// faint edge pixels (<0.2) join the component of their nearest strong neighbour
function owner(i) {
  if (comp[i] >= 0) return comp[i];
  const x = i % W, y = (i / W) | 0;
  for (let r = 1; r <= 2; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < W && ny < H && comp[ny * W + nx] >= 0) return comp[ny * W + nx];
  }
  return -1;
}

const markG = Buffer.alloc(N, 255), ableG = Buffer.alloc(N, 255), blueG = Buffer.alloc(N, 255);
let bb = { x0: W, y0: H, x1: 0, y1: 0 }, mb = { x0: W, y0: H, x1: 0, y1: 0 };
const grow = (b, i) => { const x = i % W, y = (i / W) | 0; b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); };
for (let i = 0; i < N; i++) {
  if (darkCov[i] > 0.02) {
    const o = owner(i);
    const g = Math.round(255 * (1 - darkCov[i]));
    if (o >= 0 && isMark[o]) { markG[i] = g; if (darkCov[i] > 0.5) { grow(mb, i); grow(bb, i); } }
    else { ableG[i] = g; if (darkCov[i] > 0.5) grow(bb, i); }
  }
  if (blueCov[i] > 0.02) { blueG[i] = Math.round(255 * (1 - blueCov[i])); if (blueCov[i] > 0.5) grow(bb, i); }
}

// integer coordinates: one unit is 1/6 of a source pixel, well below what the eye can see
const round = (d) => d.replace(/-?\d+\.\d+/g, (n) => String(Math.round(+n)));
async function trace(gray) {
  const png = await sharp(gray, { raw: { width: W, height: H, channels: 1 } })
    .resize(W * SCALE, H * SCALE, { kernel: 'lanczos3' }).png().toBuffer();
  return new Promise((res, rej) => potrace.trace(png, { threshold: 128, turdSize: 60, optTolerance: 0.4, alphaMax: 1.0 }, (e, svg) => {
    if (e) return rej(e);
    res(round((svg.match(/ d="([^"]+)"/) || [])[1] || ''));
  }));
}

const markD = await trace(markG), chezD = await trace(blueG), ableD = await trace(ableG);
const pad = 4 * SCALE;
const box = (b) => [b.x0 * SCALE - pad, b.y0 * SCALE - pad, (b.x1 - b.x0 + 1) * SCALE + pad * 2, (b.y1 - b.y0 + 1) * SCALE + pad * 2].map(Math.round).join(' ');
const vb = box(bb), markVb = box(mb);

const P = (cls, fill, d) => `<path${cls ? ` class="${cls}"` : ''}${fill ? ` fill="${fill}"` : ''} fill-rule="evenodd" d="${d}"/>`;
await writeFile(path.join(root, 'brand/chezable-lockup.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="Chezable">${P('mark', '#1B1D1E', markD)}${P('chez', '#5271FF', chezD)}${P('able', '#1B1D1E', ableD)}</svg>\n`);
await writeFile(path.join(root, 'brand/chezable-mono.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="Chezable" fill="currentColor">${P('', '', markD)}${P('', '', chezD)}${P('', '', ableD)}</svg>\n`);
await writeFile(path.join(root, 'brand/chezable-mark.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${markVb}" role="img" aria-label="Chezable">${P('', '#1B1D1E', markD)}</svg>\n`);
await writeFile(path.join(root, 'brand/logo-paths.json'), JSON.stringify({ viewBox: vb, markViewBox: markVb, mark: markD, chez: chezD, able: ableD }));
console.log('viewBox', vb, 'mark', markVb, 'bytes', markD.length + chezD.length + ableD.length);
