// Accessibility audit with axe-core (the engine behind Lighthouse's accessibility score), WCAG 2.2 AA rules, on every
// shell page and every featured game's screens: start, playing, end screen; plus the thread intro, turn card and receipt.
// Light theme only (spec 2 §2.1).
//   node scripts/a11y.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const axeSrc = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--mute-audio'] });
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
let total = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function audit(page, label) {
  await page.addScriptTag({ content: axeSrc });
  const res = await page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  }, TAGS);
  total += res.length;
  console.log(`${res.length ? '✗' : '✓'} ${label}`);
  for (const v of res) console.log(`    [${v.impact}] ${v.id}: ${v.help}\n      ${v.nodes.join('\n      ')}`);
}

const page = await browser.newPage();
page.setDefaultTimeout(90000); page.setDefaultNavigationTimeout(90000);
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
for (const p of ['/', '/standings', '/t/today', '/daily', '/challenges', '/me', '/top/arrow-puzzle', '/about', '/privacy']) {
  await page.goto(BASE + p, { waitUntil: 'networkidle0' });
  await audit(page, p);
}
await page.click('[data-menu]'); await sleep(300);
await audit(page, 'menu sheet');

const cat = await (await fetch(BASE + '/api/catalog')).json();
for (const g of cat.games.filter((x) => x.featured)) {
  await page.goto(`${BASE}/g/${g.id}/`, { waitUntil: 'networkidle0' });
  await audit(page, `${g.id} start screen`);
  await page.click('[data-mode=solo]');
  await sleep(1500);
  await audit(page, `${g.id} playing`);
  await page.evaluate(() => window.__chezForceEnd());
  await page.waitForSelector('.endscreen', { timeout: 15000 });
  await sleep(400);
  await audit(page, `${g.id} end screen`);
}
// thread: the turn card after a failed turn, then the receipt for a finished thread
await page.goto(`${BASE}/t/new`, { waitUntil: 'networkidle0' });
await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('[data-start]')]);
await sleep(1200);
await page.evaluate(() => window.__chezForceEnd());
await page.waitForSelector('.turn-card', { timeout: 15000 });
await audit(page, 'thread turn card (failed turn)');
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
await page.evaluate(() => {
  const id = window.Chez.threadState.todayId(), def = window.Chez.threads.threadDef(id);
  localStorage.setItem('chez:v1:thread:' + id, JSON.stringify({ id, attempt: 'a11y-attempt-1', startedAt: Date.now(), runs: def.games.map((game, turn) => ({ turn, game, stars: 2, scoreLabel: '1', strip: [true, false] })), status: 'complete', result: null }));
});
await page.goto(`${BASE}/t/today`, { waitUntil: 'networkidle0' });
await sleep(500);
await audit(page, 'thread receipt');
await browser.close();
console.log(total ? `\n${total} violation group(s)` : '\nNo axe violations.');
process.exit(total ? 1 : 0);
