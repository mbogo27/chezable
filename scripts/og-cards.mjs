// Builds the data the Worker needs to draw per-challenge preview cards (spec v1 §B2) on the free plan:
//   - one 600x315 base card per featured game, quantised to a 224-colour palette (pixels stored as indices)
//   - a glyph atlas (printable ASCII) for the name line and the score line, as 16-level coverage masks
// The Worker blends glyphs into the card's pure-white panel using two 16-step palette ramps, then writes an
// uncompressed ("stored" deflate) indexed PNG: no image library, no compression cost, a few ms of CPU.
//   node scripts/og-cards.mjs     (run by the build)
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import fsSync, { existsSync } from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const W = 600, H = 315;
// panel where the Worker writes text; must be pure white in every base card
export const PANEL = { x: 24, y: 120, w: 552, h: 124, padX: 22, nameY: 128, scoreY: 186 };
const INK = [0x11, 0x11, 0x11], BLUE = [0x4f, 0x63, 0xf5]; // spec 2 tokens: --ink, --brand
const BASE_COLORS = 224;

const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p));
const logo = JSON.parse(await readFile(path.join(root, 'brand/logo-paths.json'), 'utf8'));
const lockup = `<svg viewBox="${logo.viewBox}" xmlns="http://www.w3.org/2000/svg" style="height:100%;width:auto"><path fill="#4F63F5" fill-rule="evenodd" d="${logo.mark}"/><path fill="#4F63F5" fill-rule="evenodd" d="${logo.chez}"/><path fill="#111111" fill-rule="evenodd" d="${logo.able}"/></svg>`;
// spec 2 §2.2 type: Bricolage Grotesque for display, Figtree for body (from Google Fonts while rendering)
const CSS = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Figtree:wght@400;600;700&display=block">
<style>*{margin:0;box-sizing:border-box}body{width:${W}px;height:${H}px;overflow:hidden;font-family:Figtree,sans-serif;color:#111}</style>`;
const iconSvg = (g) => { const f = path.join(root, 'apps/web/public', (g.card && g.card.icon) || ''); return g.card && g.card.icon && g.card.icon.startsWith('/') && existsSync(f) ? fsSync.readFileSync(f, 'utf8').replace('<svg ', '<svg width="56" height="56" ') : (g.card && g.card.icon) || ''; };

// glyph sets: [key, CSS font, px size, line box height, weight]
const FONTS = [
  ['name', '"Bricolage Grotesque"', 34, 46, 800],
  ['nameSm', '"Bricolage Grotesque"', 26, 46, 800],
  ['score', 'Figtree', 30, 40, 700],
  ['scoreSm', 'Figtree', 24, 40, 700],
];

/**
 * Popularity quantiser: bin RGB to 5 bits per channel, keep the `n` most common bins (plus pure white),
 * map every pixel to the nearest kept colour. Good enough for flat sticker art at preview size.
 */
function quantize(rgb, n) {
  const count = new Map();
  for (let i = 0; i < rgb.length; i += 3) { const k = ((rgb[i] >> 3) << 10) | ((rgb[i + 1] >> 3) << 5) | (rgb[i + 2] >> 3); count.set(k, (count.get(k) || 0) + 1); }
  const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  const pal = top.map((k) => [((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4]);
  pal.push([255, 255, 255]);
  const nearest = new Map();
  const indices = new Uint8Array(rgb.length / 3);
  for (let i = 0, p = 0; i < rgb.length; i += 3, p++) {
    const k = ((rgb[i] >> 3) << 10) | ((rgb[i + 1] >> 3) << 5) | (rgb[i + 2] >> 3);
    let idx = nearest.get(k);
    if (idx === undefined) {
      let bd = Infinity;
      for (let j = 0; j < pal.length; j++) { const d = (pal[j][0] - rgb[i]) ** 2 + (pal[j][1] - rgb[i + 1]) ** 2 + (pal[j][2] - rgb[i + 2]) ** 2; if (d < bd) { bd = d; idx = j; } }
      nearest.set(k, idx);
    }
    indices[p] = idx;
  }
  const palette = Buffer.alloc((n + 1) * 3);
  pal.forEach((c, j) => { palette[j * 3] = c[0]; palette[j * 3 + 1] = c[1]; palette[j * 3 + 2] = c[2]; });
  return { indices, palette };
}

/* ---------- tiny PNG reader (kept for checking palette PNGs) ---------- */
function readPalettePng(buf) {
  let p = 8, width, height, depth, ctype, plte, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; }
    if (type === 'PLTE') plte = Buffer.from(data);
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  if (ctype !== 3) throw new Error('expected an indexed PNG');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 1, stride = Math.ceil((width * depth) / 8);
  const out = new Uint8Array(width * height), prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      if (depth === 8) out[y * width + x] = cur[x];
      else { const per = 8 / depth, byte = cur[Math.floor(x / per)], shift = 8 - depth * ((x % per) + 1); out[y * width + x] = (byte >> shift) & ((1 << depth) - 1); }
    }
    prev.set(cur);
  }
  return { width, height, indices: out, palette: plte };
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

/* ---------- base cards ---------- */
const cards = {};
for (const dir of await readdir(path.join(root, 'games'))) {
  const f = path.join(root, 'games', dir, 'stage.json');
  if (!existsSync(f)) continue;
  const g = JSON.parse(await readFile(f, 'utf8'));
  if (!g.featured) continue;
  const color = (g.card && g.card.color) || '#E1E5FF';
  const title = g.title.en;
  // flat, light, high contrast (spec 2 §2): the game's colour, its icon, a white panel the Worker writes into
  await page.setContent(`<!doctype html><html><head>${CSS}</head><body>
    <div style="position:absolute;inset:0;background:${color}"></div>
    <div style="position:absolute;left:24px;top:22px;width:80px;height:80px;border-radius:18px;border:3px solid #111;background:#fff;display:grid;place-items:center;font-size:46px">${iconSvg(g)}</div>
    <div style="position:absolute;left:122px;top:28px;right:24px;font-family:'Bricolage Grotesque';font-weight:800;font-size:${title.length > 13 ? 36 : 42}px;line-height:1.05;letter-spacing:-.01em">${title}</div>
    <div style="position:absolute;left:124px;top:${title.length > 13 ? 72 : 78}px;font-weight:700;font-size:20px">Challenge on Chezable</div>
    <div style="position:absolute;left:${PANEL.x}px;top:${PANEL.y}px;width:${PANEL.w}px;height:${PANEL.h}px;border-radius:8px;background:#FFFFFF"></div>
    <div style="position:absolute;left:24px;bottom:22px;font-family:'Bricolage Grotesque';font-weight:800;font-size:26px">Can you beat it?</div>
    <div style="position:absolute;right:24px;bottom:16px;height:38px;background:#fff;border-radius:999px;padding:6px 14px">${lockup}</div>
  </body></html>`, { waitUntil: 'load', timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: 'png' });
  const { indices, palette } = quantize((await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })).data, BASE_COLORS - 1);
  // the panel interior must be one exact white index so glyph ramps blend correctly
  const nColors = BASE_COLORS;
  let white = 0, bestD = Infinity;
  for (let i = 0; i < nColors; i++) { const d = (255 - palette[i * 3]) + (255 - palette[i * 3 + 1]) + (255 - palette[i * 3 + 2]); if (d < bestD) { bestD = d; white = i; } }
  palette[white * 3] = palette[white * 3 + 1] = palette[white * 3 + 2] = 255;
  for (let y = PANEL.y + 6; y < PANEL.y + PANEL.h - 6; y++) for (let x = PANEL.x + 6; x < PANEL.x + PANEL.w - 6; x++) indices[y * W + x] = white;
  cards[g.id] = { pixels: zlib.deflateRawSync(Buffer.from(indices), { level: 9 }).toString('base64'), palette: palette.toString('base64'), colors: nColors, white };
  console.log(`card ${g.id}: ${nColors} colours, ${(cards[g.id].pixels.length / 1024).toFixed(1)} KB`);
}

/* ---------- glyph atlases ---------- */
const glyphs = {};
let chars = '';
for (let c = 32; c < 127; c++) chars += String.fromCharCode(c);
for (const [key, family, size, lineH, weight] of FONTS) {
  const res = await page.evaluate(async ({ family, size, lineH, chars, weight }) => {
    await document.fonts.ready;
    const c = document.createElement('canvas'); const g = c.getContext('2d');
    const out = {};
    for (const ch of chars) {
      g.font = `${weight} ${size}px ${family}`;
      const adv = Math.ceil(g.measureText(ch).width);
      const w = Math.max(1, adv + 4);
      c.width = w; c.height = lineH;
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, lineH);
      g.font = `${weight} ${size}px ${family}`; g.fillStyle = '#000'; g.textBaseline = 'alphabetic';
      g.fillText(ch, 2, Math.round(lineH * 0.78));
      const d = g.getImageData(0, 0, w, lineH).data;
      const cov = [];
      for (let i = 0; i < w * lineH; i++) cov.push(Math.round(((255 - d[i * 4]) / 255) * 15));
      out[ch] = { adv, w, cov };
    }
    return out;
  }, { family, size, lineH, chars, weight });
  const table = {}, blob = [];
  for (const ch of chars) {
    const gl = res[ch];
    table[ch] = [gl.adv, gl.w, blob.length];
    blob.push(...gl.cov);
  }
  glyphs[key] = { lineH, table, data: zlib.deflateRawSync(Buffer.from(blob), { level: 9 }).toString('base64') };
  console.log(`glyphs ${key}: ${(glyphs[key].data.length / 1024).toFixed(1)} KB`);
}
await browser.close();

const ramp = (rgb) => Array.from({ length: 16 }, (_, k) => rgb.map((c) => Math.round(255 + (c - 255) * (k / 15))));
await writeFile(path.join(root, 'apps/worker/src/og-data.generated.json'),
  JSON.stringify({ W, H, PANEL, cards, glyphs, ramps: { ink: ramp(INK), blue: ramp(BLUE) } }));
console.log('wrote apps/worker/src/og-data.generated.json');
