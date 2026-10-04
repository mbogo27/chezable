// Headless browser test: opens the shell and every stage in the locally installed Chrome, plays a run
// with the keyboard (or a stage-specific script), and checks that the result sheet appears, the run
// reaches the API and nothing throws. Needs the local Worker running (npm run dev).
//   node scripts/browser.mjs [baseUrl] [slug...]
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const BASE = args[0] && args[0].startsWith('http') ? args.shift() : 'http://127.0.0.1:8787';
const only = args;
const shots = path.join(root, 'tests', 'screens');
mkdirSync(shots, { recursive: true });
const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && existsSync(p));

// How each stage gets played to the end by a robot. Most are "press Space until the sheet shows".
const PLAYERS = {
  default: { keys: ['Space'], every: 180, timeout: 120000 },
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
let failures = 0;
const log = (...a) => console.log(...a);

async function newPage(width = 390, height = 844) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600 });
  page.setDefaultNavigationTimeout(90000);
  page.setDefaultTimeout(90000);
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  return page;
}

// --- shell pages
{
  const page = await newPage();
  for (const p of ['/', '/daily', '/challenges', '/me', '/about', '/privacy', '/terms']) {
    await page.goto(BASE + p, { waitUntil: 'networkidle0' });
    const h = await page.$eval('main', (m) => m.innerText.slice(0, 60).replace(/\s+/g, ' '));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    log(`${overflow ? '✗' : '✓'} ${p.padEnd(12)} ${h}${overflow ? '  (horizontal scroll!)' : ''}`);
    if (overflow) failures++;
  }
  await page.screenshot({ path: path.join(shots, 'home.png') });
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(shots, 'home.png'), fullPage: true });
  if (page.errors.length) { failures++; log('  errors:', page.errors); }
  await page.close();
}

// --- stages
const cat = await (await fetch(BASE + '/api/catalog')).json();
for (const g of cat.games) {
  if (only.length && !only.includes(g.id)) continue;
  const page = await newPage();
  const t0 = Date.now();
  await page.goto(`${BASE}/g/${g.id}/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { const c = document.querySelector('[data-variant=classic]'); if (c) c.click(); });
  const hasSolo = await page.$('[data-mode=solo]');
  if (!hasSolo) { log(`- ${g.id}: no solo mode, skipped`); await page.close(); continue; }
  await hasSolo.click();
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: path.join(shots, `${g.id}-play.png`) });
  const P = PLAYERS[g.id] || PLAYERS.default;
  let done = false;
  const deadline = Date.now() + P.timeout;
  while (!done && Date.now() < deadline) {
    // puzzle and turn-based stages expose window.__chezAuto (one sensible move); the rest get keypresses
    const auto = await page.evaluate(() => { if (typeof window.__chezAuto === 'function') { window.__chezAuto(); return true; } return false; });
    if (!auto) for (const k of P.keys) await page.keyboard.press(k);
    await new Promise((r) => setTimeout(r, P.every));
    done = !!(await page.$('.sheet .result-score, .sheet .vs, .sheet h2'));
  }
  const sheet = done ? await page.$eval('.sheet', (s) => s.innerText.replace(/\s+/g, ' ').slice(0, 120)) : '(no result sheet)';
  await page.screenshot({ path: path.join(shots, `${g.id}-result.png`) });
  const ok = done && !page.errors.length;
  if (!ok) failures++;
  log(`${ok ? '✓' : '✗'} ${g.id.padEnd(15)} ${((Date.now() - t0) / 1000).toFixed(1)}s  ${sheet}`);
  if (page.errors.length) log('  errors:', page.errors.slice(0, 5));
  await page.close();
}

// --- Today's set: every daily link (?mode=daily) must start a run without the intro card, and finish
if (!only.length || only.includes('daily')) {
  const ctxD = await browser.createBrowserContext();
  for (const g of cat.games.filter((x) => (x.modes || []).includes('daily'))) {
    const page = await ctxD.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(90000); page.setDefaultNavigationTimeout(90000);
    const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && /onPlay/.test(m.text())) errs.push(m.text()); });
    await page.goto(`${BASE}/daily`, { waitUntil: 'networkidle0' });
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click(`a[href="/g/${g.id}/?mode=daily"]`)]);
    const intro = !!(await page.$('.overlay.show [data-mode]'));
    const t0 = Date.now();
    let done = false;
    while (!done && Date.now() - t0 < 120000) {
      const auto = await page.evaluate(() => { if (typeof window.__chezAuto === 'function') { window.__chezAuto(); return true; } return false; });
      if (!auto) await page.keyboard.press('Space');
      await new Promise((r) => setTimeout(r, 180));
      done = !!(await page.$('.sheet .result-score, .sheet .vs, .sheet h2'));
    }
    const ok = done && !intro && !errs.length;
    if (!ok) failures++;
    log(`${ok ? '✓' : '✗'} Today → ${g.id.padEnd(15)} ${intro ? '(intro card shown instead of the daily run) ' : ''}${done ? 'reached the result sheet' : 'never finished'}${errs.length ? ' ' + errs.join('; ') : ''}`);
    await page.close();
  }
  await ctxD.close();
}

// --- the core loop through the UI: A challenges, B (a brand-new player in a fresh profile) accepts
async function playToSheet(page, timeout = 120000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const auto = await page.evaluate(() => { if (typeof window.__chezAuto === 'function') { window.__chezAuto(); return true; } return false; });
    if (!auto) await page.keyboard.press('Space');
    await new Promise((r) => setTimeout(r, 180));
    if (await page.$('.sheet .result-score, .sheet .vs, .sheet h2')) return true;
  }
  return false;
}
if (!only.length || only.includes('challenge')) {
  const ctxA = await browser.createBrowserContext(), ctxB = await browser.createBrowserContext();
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  for (const p of [A, B]) {
    await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    p.setDefaultTimeout(90000); p.setDefaultNavigationTimeout(90000);
    p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message));
    await p.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'share', { value: undefined }); });
  }
  const game = 'arrow-puzzle';
  await A.goto(`${BASE}/g/${game}/`, { waitUntil: 'networkidle0' });
  await A.evaluate(() => { document.querySelector('[data-variant=classic]')?.click(); document.querySelector('[data-mode=solo]').click(); });
  let ok = await playToSheet(A);
  await A.click('[data-a=challenge]');
  await A.waitForSelector('a[data-via=whatsapp]');
  const wa = await A.$eval('a[data-via=whatsapp]', (a) => decodeURIComponent(a.href));
  const link = (wa.match(/https?:\/\/\S+\/c\/[A-Za-z0-9]+/) || [])[0];
  log(`${link ? '✓' : '✗'} A's challenge share sheet: WhatsApp first, text "${wa.replace(/^.*text=/, '').slice(0, 70)}…"`);
  if (!link) failures++;
  if (link) {
    await B.goto(link, { waitUntil: 'networkidle0' });
    await B.waitForSelector('[data-accept]');
    const head = await B.$eval('#cTitle', (h) => h.textContent);
    log(`✓ B lands on ${new URL(B.url()).pathname}${new URL(B.url()).search}: "${head}"`);
    await B.click('[data-accept]');
    ok = await playToSheet(B);
    const vs = ok && (await B.$('.sheet .vs')) ? await B.$eval('.sheet', (s) => s.innerText.replace(/\s+/g, ' ').slice(0, 90)) : null;
    if (!vs) log('  B sheet:', ok, await B.evaluate(() => (document.querySelector('.sheet') || document.querySelector('.overlay.show') || {}).innerText));
    log(`${vs ? '✓' : '✗'} B's result shows the comparison: ${vs}`);
    if (!vs) failures++;
    const sendBack = await B.$('[data-a=sendback]');
    log(`${sendBack ? '✓' : '✗'} "Send it back" offered`);
    if (!sendBack) failures++;
  }
  for (const p of [A, B]) if (p.errors.length) { failures++; log('  errors:', p.errors); }
  await ctxA.close(); await ctxB.close();

  // pass the phone: two names, same seed, winner sheet
  const ctxP = await browser.createBrowserContext(), P = await ctxP.newPage();
  await P.setViewport({ width: 390, height: 844 }); P.setDefaultTimeout(90000); P.setDefaultNavigationTimeout(90000);
  P.errors = []; P.on('pageerror', (e) => P.errors.push(e.message));
  await P.goto(`${BASE}/g/cut-in-half/`, { waitUntil: 'networkidle0' });
  await P.evaluate(() => { document.querySelector('[data-variant=classic]')?.click(); document.querySelector('[data-mode=pass]').click(); });
  await P.waitForSelector('#pn1');
  await P.type('#pn1', 'Achieng'); await P.type('#pn2', 'Kamau');
  await P.click('[data-go]');
  for (let i = 0; i < 2; i++) {
    await P.waitForSelector('.overlay.show .btn');
    await P.click('.overlay.show .btn');
    const end = Date.now() + 60000;
    while (Date.now() < end && !(await P.$('.overlay.show .btn')) && !(await P.$('.sheet .rows'))) { await P.keyboard.press('Space'); await new Promise((r) => setTimeout(r, 200)); }
  }
  const passTxt = (await P.$('.sheet .rows')) ? await P.$eval('.sheet', (s) => s.innerText.replace(/\s+/g, ' ').slice(0, 90)) : null;
  log(`${passTxt ? '✓' : '✗'} pass the phone: ${passTxt}`);
  if (!passTxt || P.errors.length) { failures++; if (P.errors.length) log('  errors:', P.errors); }
  await ctxP.close();
}

await browser.close();
log(failures ? `\n${failures} problem(s). Screens in tests/screens/` : '\nAll browser checks passed. Screens in tests/screens/');
process.exit(failures ? 1 : 0);
