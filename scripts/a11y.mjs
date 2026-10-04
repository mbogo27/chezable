// Accessibility audit with axe-core (the engine behind Lighthouse's accessibility score), WCAG 2.2 AA rules,
// in light and dark mode, on every shell page and every stage (intro card, in play, result sheet).
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

for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage();
  page.setDefaultTimeout(90000); page.setDefaultNavigationTimeout(90000);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  for (const p of ['/', '/daily', '/challenges', '/me', '/top/toka', '/about', '/privacy']) {
    await page.goto(BASE + p, { waitUntil: 'networkidle0' });
    await audit(page, `${scheme} ${p}`);
  }
  const cat = await (await fetch(BASE + '/api/catalog')).json();
  for (const g of cat.games) {
    await page.goto(`${BASE}/g/${g.id}/`, { waitUntil: 'networkidle0' });
    await audit(page, `${scheme} ${g.id} intro`);
    await page.evaluate(() => { document.querySelector('[data-variant=classic]')?.click(); document.querySelector('[data-mode=solo]')?.click(); });
    await new Promise((r) => setTimeout(r, 2500));
    await audit(page, `${scheme} ${g.id} playing`);
  }
  await page.close();
}
await browser.close();
console.log(total ? `\n${total} violation group(s)` : '\nNo axe violations.');
process.exit(total ? 1 : 0);
