// Generates the PWA icons and the static Open Graph images (spec §6.3, §9.5, launch item 11)
// into apps/web/public/{icons,og}. Renders HTML in headless Chrome so the real fonts and logo are used.
//   node scripts/assets.mjs
import puppeteer from 'puppeteer-core';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import fsSync, { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'apps/web/public');
const logo = JSON.parse(await readFile(path.join(root, 'brand/logo-paths.json'), 'utf8'));
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p));
await mkdir(path.join(pub, 'icons'), { recursive: true });
await mkdir(path.join(pub, 'og'), { recursive: true });

const mark = (fill) => `<svg viewBox="${logo.markViewBox}" xmlns="http://www.w3.org/2000/svg"><path fill="${fill}" fill-rule="evenodd" d="${logo.mark}"/></svg>`;
const lockup = `<svg viewBox="${logo.viewBox}" xmlns="http://www.w3.org/2000/svg"><path fill="#4F63F5" fill-rule="evenodd" d="${logo.mark}"/><path fill="#4F63F5" fill-rule="evenodd" d="${logo.chez}"/><path fill="#111111" fill-rule="evenodd" d="${logo.able}"/></svg>`;

// favicon: white figure on brand blue, rounded
const [vx, vy, vw, vh] = logo.markViewBox.split(' ').map(Number);
const side = Math.max(vw, vh) * 1.5, ox = vx - (side - vw) / 2, oy = vy - (side - vh) / 2;
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ox} ${oy} ${side} ${side}"><rect x="${ox}" y="${oy}" width="${side}" height="${side}" rx="${side * 0.22}" fill="#4F63F5"/><path fill="#FFFFFF" fill-rule="evenodd" d="${logo.mark}"/></svg>\n`;
await writeFile(path.join(pub, 'icons/favicon.svg'), favicon);
await writeFile(path.join(root, 'brand/chezable-icon.svg'), favicon);

// spec 2 §2: flat and light; Bricolage Grotesque and Figtree, from Google Fonts while rendering
const base = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Figtree:wght@400;600;700&display=block">
<style>*{box-sizing:border-box;margin:0}
body{width:var(--w);height:var(--h);overflow:hidden;font-family:Figtree,sans-serif;color:#111}
.peg{background:#F4F4F1}
.d{font-family:'Bricolage Grotesque';font-weight:800;letter-spacing:-.015em}
</style>`;
const iconSvg = (g, size) => { const f = path.join(pub, (g.card && g.card.icon) || ''); return g.card && g.card.icon && g.card.icon.startsWith('/') && existsSync(f) ? fsSync.readFileSync(f, 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `) : `<span style="font-size:${size * 0.7}px">${(g.card && g.card.icon) || ''}</span>`; };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
async function shot(html, w, h, out) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head>${base}<style>:root{--w:${w}px;--h:${h}px}</style></head><body>${html}</body></html>`, { waitUntil: 'load', timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, omitBackground: false });
  console.log('wrote', path.relative(root, out));
}

// app icons
const icon = (pad) => `<div style="width:100%;height:100%;background:#4F63F5;display:grid;place-items:center"><div style="width:${100 - pad * 2}%;height:${100 - pad * 2}%;display:grid;place-items:center">${mark('#FFFFFF').replace('<svg', '<svg style="height:100%;width:auto"')}</div></div>`;
await shot(icon(18), 192, 192, path.join(pub, 'icons/icon-192.png'));
await shot(icon(18), 512, 512, path.join(pub, 'icons/icon-512.png'));
await shot(icon(26), 512, 512, path.join(pub, 'icons/icon-maskable-512.png'));
await shot(icon(16), 180, 180, path.join(pub, 'icons/apple-touch-icon.png'));

// OG: the brand card
await shot(`<div class="peg" style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px">
  <div style="width:760px">${lockup}</div>
  <p class="d" style="font-size:52px;text-align:center;max-width:1000px">Short games. Solo or head to head. Built to share.</p></div>`, 1200, 630, path.join(pub, 'og/chezable.png'));

// OG: one per stage, in its own colour
for (const dir of await readdir(path.join(root, 'games'))) {
  const f = path.join(root, 'games', dir, 'stage.json');
  if (!existsSync(f)) continue;
  const g = JSON.parse(await readFile(f, 'utf8'));
  const color = (g.card && g.card.color) || '#E1E5FF';
  const line = (g.tagline && g.tagline.en) || g.rule.en;
  await shot(`<div style="width:100%;height:100%;background:${color};padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between">
    <div style="display:flex;align-items:center;gap:40px">
      <div style="width:200px;height:200px;border-radius:44px;border:6px solid #111;background:#fff;display:grid;place-items:center">${iconSvg(g, 150)}</div>
      <h1 class="d" style="font-size:${g.title.en.length > 11 ? 92 : 112}px;line-height:1">${g.title.en}</h1>
    </div>
    <p style="font-size:48px;font-weight:600;line-height:1.2;max-width:1000px">${line}</p>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="width:330px;background:#fff;border-radius:999px;padding:14px 28px">${lockup}</div>
      <span style="font-weight:700;font-size:36px;background:#111;color:#fff;border-radius:999px;padding:18px 40px">Play free</span>
    </div></div>`, 1200, 630, path.join(pub, `og/${g.id}.png`));
}
await browser.close();
