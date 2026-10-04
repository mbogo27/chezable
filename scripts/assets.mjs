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
// fonts are inlined as data URLs: Chrome won't load file:// fonts into setContent pages
const font = (f) => 'data:font/woff2;base64,' + fsSync.readFileSync(path.join(root, 'packages/ui/fonts', f)).toString('base64');
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p));
await mkdir(path.join(pub, 'icons'), { recursive: true });
await mkdir(path.join(pub, 'og'), { recursive: true });

const mark = (fill) => `<svg viewBox="${logo.markViewBox}" xmlns="http://www.w3.org/2000/svg"><path fill="${fill}" fill-rule="evenodd" d="${logo.mark}"/></svg>`;
const lockup = `<svg viewBox="${logo.viewBox}" xmlns="http://www.w3.org/2000/svg"><path fill="#1B1D1E" fill-rule="evenodd" d="${logo.mark}"/><path fill="#5271FF" fill-rule="evenodd" d="${logo.chez}"/><path fill="#1B1D1E" fill-rule="evenodd" d="${logo.able}"/></svg>`;

// favicon: white figure on brand blue, rounded
const [vx, vy, vw, vh] = logo.markViewBox.split(' ').map(Number);
const side = Math.max(vw, vh) * 1.5, ox = vx - (side - vw) / 2, oy = vy - (side - vh) / 2;
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ox} ${oy} ${side} ${side}"><rect x="${ox}" y="${oy}" width="${side}" height="${side}" rx="${side * 0.22}" fill="#5271FF"/><path fill="#FFFFFF" fill-rule="evenodd" d="${logo.mark}"/></svg>\n`;
await writeFile(path.join(pub, 'icons/favicon.svg'), favicon);
await writeFile(path.join(root, 'brand/chezable-icon.svg'), favicon);

const base = `<style>
@font-face{font-family:"Archivo Black";src:url(${font('archivo-black.woff2')})}
@font-face{font-family:"Barlow";font-weight:600;src:url(${font('barlow-600.woff2')})}
@font-face{font-family:"Barlow";font-weight:700;src:url(${font('barlow-700.woff2')})}
*{box-sizing:border-box;margin:0}
body{width:var(--w);height:var(--h);overflow:hidden;font-family:Barlow,sans-serif}
.peg{background:radial-gradient(circle,rgba(40,58,64,.2) 3px,transparent 3.6px) 0 0/32px 32px,#DFE4E2}
</style>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
async function shot(html, w, h, out) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head>${base}<style>:root{--w:${w}px;--h:${h}px}</style></head><body>${html}</body></html>`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, omitBackground: false });
  console.log('wrote', path.relative(root, out));
}

// app icons
const icon = (pad) => `<div style="width:100%;height:100%;background:#5271FF;display:grid;place-items:center"><div style="width:${100 - pad * 2}%;height:${100 - pad * 2}%;display:grid;place-items:center">${mark('#FFFFFF').replace('<svg', '<svg style="height:100%;width:auto"')}</div></div>`;
await shot(icon(18), 192, 192, path.join(pub, 'icons/icon-192.png'));
await shot(icon(18), 512, 512, path.join(pub, 'icons/icon-512.png'));
await shot(icon(26), 512, 512, path.join(pub, 'icons/icon-maskable-512.png'));
await shot(icon(16), 180, 180, path.join(pub, 'icons/apple-touch-icon.png'));

// OG: the brand card
const plank = (text, size) => `<div style="position:relative;display:inline-block;padding:18px 44px;border:6px solid #1B1D1E;border-radius:14px;transform:rotate(-2deg);
  background:repeating-linear-gradient(177deg,transparent 0 10px,rgba(120,62,18,.16) 10px 12px,transparent 12px 22px),linear-gradient(180deg,#eab978,#cf904d);box-shadow:0 10px 0 #1B1D1E">
  <span style="font-family:'Archivo Black';font-size:${size}px;color:#fff;-webkit-text-stroke:6px #1B1D1E;paint-order:stroke fill;white-space:nowrap;text-shadow:0 5px 0 rgba(0,0,0,.25)">${text}</span></div>`;
await shot(`<div class="peg" style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px">
  <div style="width:760px">${lockup}</div>
  <p style="font-size:44px;font-weight:700;color:#1B1D1E">Short games. Solo or head to head. Built to share.</p></div>`, 1200, 630, path.join(pub, 'og/chezable.png'));

// OG: one per stage
for (const dir of await readdir(path.join(root, 'games'))) {
  const f = path.join(root, 'games', dir, 'stage.json');
  if (!existsSync(f)) continue;
  const g = JSON.parse(await readFile(f, 'utf8'));
  const color = (g.card && g.card.color) || '#F26B1D', ic = (g.card && g.card.icon) || '';
  await shot(`<div class="peg" style="width:100%;height:100%;position:relative;padding:56px 64px;display:flex;flex-direction:column;justify-content:space-between">
    <div style="display:flex;align-items:center;gap:40px">
      <div style="width:200px;height:200px;border-radius:44px;border:8px solid #1B1D1E;background:${color};display:grid;place-items:center;font-size:120px;box-shadow:0 12px 0 #1B1D1E">${ic}</div>
      ${plank(g.title.en, g.title.en.length > 11 ? 78 : 96)}
    </div>
    <p style="font-size:46px;font-weight:700;line-height:1.2;color:#1B1D1E;max-width:1000px">${g.rule.en}</p>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="width:330px">${lockup}</div>
      <span style="font-family:'Archivo Black';font-size:34px;background:#F26B1D;border:6px solid #1B1D1E;border-radius:18px;padding:12px 28px;box-shadow:0 8px 0 #1B1D1E">Play free</span>
    </div></div>`, 1200, 630, path.join(pub, `og/${g.id}.png`));
}
await browser.close();
