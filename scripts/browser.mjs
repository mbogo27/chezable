// Headless browser test (spec 2 acceptance): the shared header everywhere; every featured game from its start
// screen to the end screen; the end screen under Slow 4G and offline; Share challenge on the first tap, offline;
// a challenge link on another "device" playing the same seed; Today's Thread end to end with turn cards, lives,
// resume and the receipt; the name claim. Needs the local Worker running (npm run dev).
//   node scripts/browser.mjs [baseUrl] [section...]   sections: pages games offline challenge thread lives claim daily
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const BASE = args[0] && args[0].startsWith('http') ? args.shift() : 'http://127.0.0.1:8787';
const only = args;
const want = (s) => !only.length || only.includes(s);
const shots = path.join(root, 'tests', 'screens');
mkdirSync(shots, { recursive: true });
const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && existsSync(p));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
let failures = 0;
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (ok, msg) => { if (!ok) failures++; log(`${ok ? '✓' : '✗'} ${msg}`); return ok; };

async function newPage(ctx = browser) {
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  page.setDefaultNavigationTimeout(90000);
  page.setDefaultTimeout(90000);
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|Failed to load resource|ERR_INTERNET_DISCONNECTED|googletagmanager|fonts\.g/.test(m.text())) page.errors.push(m.text()); });
  // a stand-in share sheet, so "Share" can be tapped headless: records what would be shared
  await page.evaluateOnNewDocument(() => {
    window.__shared = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: (d) => { window.__shared.push(d); return Promise.resolve(); } });
  });
  return page;
}
/** Analytics events, read from GA's dataLayer (every Chez.track() goes there too). */
const events = async (page, name, atLeast = 1) => {
  // events reach GA's dataLayer when the page is idle (up to 3 s), so wait for them
  const read = () => page.evaluate((n) => (window.dataLayer || []).filter((a) => a && a[0] === 'event' && a[1] === n).map((a) => a[2]), name);
  for (let i = 0; i < 40; i++) { const e = await read(); if (e.length >= atLeast) return e; await sleep(100); }
  return read();
};

/** Play until `sel` appears: puzzle stages expose __chezAuto; Nyanya and the saw have test autopilots too. */
async function playUntil(page, sel, { timeout = 90000, forceAfter = 0 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.$(sel)) return true;
    await page.evaluate(() => { if (typeof window.__chezAuto === 'function') window.__chezAuto(); });
    if (forceAfter && Date.now() - t0 > forceAfter) await page.evaluate(() => window.__chezForceEnd && window.__chezForceEnd());
    await sleep(150);
  }
  return !!(await page.$(sel));
}
const slug = (page) => page.url().match(/\/g\/([a-z0-9-]+)\//)?.[1];
const forceFor = (g) => (g === 'nyanya-jetpack' ? 6000 : 0); // fly a few seconds past the pass line, then time's up

const cat = await (await fetch(BASE + '/api/catalog')).json();
const featured = cat.games.filter((g) => g.featured);

// ---------- the shared header on every page (spec 2 §2.3) ----------
if (want('pages')) {
  const page = await newPage();
  for (const p of ['/', '/standings', '/t/today', '/daily', '/challenges', '/me', '/top/cap-drop', '/about', '/privacy', '/terms']) {
    await page.goto(BASE + p, { waitUntil: 'networkidle0' });
    const info = await page.evaluate(() => ({ headers: document.querySelectorAll('header').length, shared: !!document.querySelector('header.chez-header .hdr-logo'),
      overflow: document.documentElement.scrollWidth > innerWidth + 1, text: (document.querySelector('main') || document.body).innerText.slice(0, 50).replace(/\s+/g, ' ') }));
    check(info.headers === 1 && info.shared && !info.overflow, `${p.padEnd(14)} one shared header${info.overflow ? ', HORIZONTAL SCROLL' : ''} · ${info.text}`);
  }
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(shots, 'home.png'), fullPage: true });
  check(!page.errors.length, `shell pages: no errors ${page.errors.length ? JSON.stringify(page.errors.slice(0, 3)) : ''}`);
  // the old challenge-link text is gone from everything served (spec 2 §1.2)
  const dist = path.join(root, 'apps/web/dist');
  const files = []; const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(js|html|json)$/.test(f) && files.push(p); } }; walk(dist);
  check(!files.some((f) => /making your challenge link/i.test(readFileSync(f, 'utf8'))), '"making your challenge link" exists nowhere in the build');
  await page.close();
}

// ---------- every featured game: start screen → play → end screen within 150 ms (spec 2 §1.1, §3.2, §3.3) ----------
if (want('games')) {
  for (const g of featured) {
    const page = await newPage();
    await page.goto(`${BASE}/g/${g.id}/`, { waitUntil: 'networkidle0' });
    const start = await page.evaluate(() => ({ header: !!document.querySelector('header.chez-header'), pills: [...document.querySelectorAll('.mode-pills [data-mode]')].map((b) => b.dataset.mode), bar: !!document.querySelector('.thread-bar') }));
    await page.screenshot({ path: path.join(shots, `${g.id}-start.png`) });
    await page.click('[data-mode=solo]');
    await sleep(300);
    const slim = await page.evaluate(() => document.body.classList.contains('hdr-slim') && !!document.querySelector('header.chez-header'));
    const done = await playUntil(page, '.endscreen', { forceAfter: forceFor(g.id) });
    await sleep(300);
    const es = done ? await page.evaluate(() => {
      const e = document.querySelector('.endscreen');
      return { label: e.querySelector('.result-label').textContent, stars: e.querySelectorAll('.stars svg').length, strip: e.querySelectorAll('.strip i').length,
        share: e.querySelector('[data-act=share]').textContent, again: e.querySelector('[data-act=again]').textContent, next: !!e.querySelector('.next-card'),
        links: [...e.querySelectorAll('.text-links a')].map((a) => a.textContent).join('/'), tiles: e.querySelectorAll('.tiles .g-tile').length };
    }) : null;
    const ms = (await events(page, 'end_screen_render_ms'))[0];
    await page.screenshot({ path: path.join(shots, `${g.id}-end.png`), fullPage: true });
    const ok = start.header && start.bar && start.pills.includes('solo') && slim && es && es.stars === 3 && es.strip > 0 && es.next && es.tiles === 3 && ms && ms.build < 50 && !page.errors.length;
    check(ok, `${g.id.padEnd(15)} start [${start.pills.join(', ')}] · slim header in play · end: "${es && es.label}", ${es && es.share} / ${es && es.again}, ${es && es.links} · built in ${ms ? ms.build : '?'} ms, painted at ${ms ? ms.ms : '?'} ms`);
    if (page.errors.length) log('  errors:', page.errors.slice(0, 4));
    await page.close();
  }
}

// ---------- offline and Slow 4G: the end screen still shows at once; Share works on the first tap (spec 2 §1.1, §1.2) ----------
if (want('offline')) {
  const page = await newPage();
  await page.goto(`${BASE}/g/cut-in-half/`, { waitUntil: 'networkidle0' });
  await page.click('[data-mode=solo]');
  await sleep(500);
  const cdp = await page.createCDPSession();
  // Slow 4G (Chrome DevTools preset): 562.5 ms latency, ~1.4 Mbps down
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375 });
  let done = await playUntil(page, '.endscreen');
  let ms = (await events(page, 'end_screen_render_ms'))[0];
  check(done && ms && ms.build < 50, `Slow 4G: end screen built in ${ms ? ms.build : '?'} ms (painted at ${ms ? ms.ms : '?'} ms), before the server replied`);
  await page.evaluate(() => document.querySelector('[data-act=again]').click());
  await sleep(400);
  await page.setOfflineMode(true);
  done = await playUntil(page, '.endscreen');
  const es = await page.evaluate(() => { const e = document.querySelector('.endscreen'); return { stars: e.querySelectorAll('.stars svg').length, share: !!e.querySelector('[data-act=share]'), again: !!e.querySelector('[data-act=again]') }; });
  const msAll = await events(page, 'end_screen_render_ms', 2);
  check(done && es.stars === 3 && es.share && es.again && msAll[1] && msAll[1].build < 50, `offline: end screen built in ${msAll[1] ? msAll[1].build : '?'} ms with result, stars and buttons`);
  await sleep(5600);
  check(!(await page.$('.endscreen [data-rank]')), 'offline: the rank line hides after 5 s; everything else stays');
  // Share challenge, offline, first tap; five taps share the same link
  const btn = await page.$('.endscreen [data-act=share]');
  for (let i = 0; i < 5; i++) await btn.click();
  const shared = await page.evaluate(() => window.__shared);
  const label = await page.$eval('.endscreen [data-act=share]', (b) => b.textContent);
  const urls = new Set(shared.map((s) => s.url));
  check(shared.length === 5 && urls.size === 1 && /\/c\/cut-in-half-.+-[0-9a-z]{6}$/.test(shared[0].url) && /^I did Cut It in Half in .+\. Can you beat me\?$/.test(shared[0].text) && label === 'Shared',
    `offline Share challenge: share sheet on the first tap, same link every tap (${[...urls][0]}), button says "${label}"`);
  const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('chez:v1:queue') || '[]').map((q) => `${q.method || 'POST'} ${q.path}`));
  check(queued.includes('POST /run/finish') && queued.some((q) => q.startsWith('PUT /challenges/')), `offline: result and challenge queued (${queued.length} items)`);
  // back online: the queue sends the result, then registers the code, once
  await page.setOfflineMode(false);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await page.evaluate(() => window.Chez.flush());
  await sleep(1500);
  const code = [...urls][0].split('/c/')[1];
  const reg = await (await fetch(`${BASE}/api/challenge/${code}`)).json();
  check(reg.id === code && reg.creatorScore != null, `back online: the challenge registered once (${code})`);
  if (page.errors.length) log('  errors:', page.errors.slice(0, 4));
  await page.close();
}

// ---------- a challenge link opened on another device: the same game, the same seed, the score to beat ----------
if (want('challenge')) {
  const ctxA = await browser.createBrowserContext(), ctxB = await browser.createBrowserContext();
  const A = await newPage(ctxA), B = await newPage(ctxB);
  await A.goto(`${BASE}/g/cut-in-half/`, { waitUntil: 'networkidle0' });
  await A.click('[data-mode=solo]');
  await sleep(300);
  const seedA = await A.evaluate(() => window.Chez.currentRun().seed);
  await playUntil(A, '.endscreen');
  await A.click('.endscreen [data-act=share]');
  const url = (await A.evaluate(() => window.__shared[0].url)).replace(/^https?:\/\/[^/]+/, BASE);
  await B.goto(url, { waitUntil: 'networkidle0' });
  await B.waitForSelector('[data-accept]', { timeout: 15000 });
  const landing = await B.evaluate(() => ({ url: location.pathname + location.search, title: document.querySelector('#cTitle').textContent, buttons: document.querySelectorAll('.mode-pills button').length }));
  await B.click('[data-accept]');
  await sleep(500);
  const seedB = await B.evaluate(() => window.Chez.currentRun().seed);
  check(landing.url.startsWith('/g/cut-in-half/?c=') && /scored .+ Beat it\?/.test(landing.title) && seedB === seedA,
    `challenge on another device: "${landing.title}", same seed (${seedB === seedA ? 'yes' : `no: ${seedA} vs ${seedB}`})`);
  const done = await playUntil(B, '.endscreen');
  const vs = done ? await B.$eval('.endscreen .vs-line', (e) => e.textContent).catch(() => '') : '';
  check(done && /beat|wins|Tied/.test(vs), `B's end screen compares: "${vs}"`);
  check(!A.errors.length && !B.errors.length, 'challenge flow: no errors');
  await ctxA.close(); await ctxB.close();
}

// ---------- Today's Thread end to end: hero → 3 turns → turn cards → receipt; resume (spec 2 §5) ----------
if (want('thread')) {
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  const hero = await page.$eval('.thread-hero', (e) => e.innerText.replace(/\s+/g, ' '));
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('[data-thread]')]);
  const games = [];
  for (let turn = 0; turn < 3; turn++) {
    const g = slug(page); games.push(g);
    const hud = await page.$eval('[data-hud]', (e) => e.innerText.replace(/\s+/g, ' ').trim());
    const sel = turn < 2 ? '.turn-card' : '.receipt-screen';
    const done = await playUntil(page, sel, { forceAfter: forceFor(g) });
    if (!done) { check(false, `turn ${turn + 1} (${g}) never finished`); break; }
    if (turn < 2) {
      const card = await page.evaluate(() => ({ hud: document.querySelector('[data-hud]').innerText.replace(/\s+/g, ' ').trim(), head: document.querySelector('#tcHead').textContent, primary: document.querySelector('[data-primary]').textContent, hearts: document.querySelectorAll('.hud-hearts svg path[fill="var(--heart)"]').length }));
      check(/^Turn \d of 3/.test(hud) && card.hud.startsWith(`Turn ${turn + 1} of 3 done`) && /^Next: /.test(card.primary), `turn ${turn + 1}: ${g} · playing "${hud.slice(0, 12)}" · card "${card.head}" · ${card.primary} · ${card.hearts} lives`);
      if (turn === 0) {
        // resume: leave mid-thread; Home and the start screen offer "Continue"
        await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
        const cont = await page.$eval('[data-thread]', (b) => b.textContent);
        await page.goto(`${BASE}/g/${games[0]}/`, { waitUntil: 'networkidle0' });
        const bar = await page.$eval('.thread-bar b', (b) => b.textContent);
        check(/turn 2 of 3/.test(cont) && /Continue today's thread \(turn 2 of 3\)/.test(bar), `resume: Home "${cont}", start screen "${bar}"`);
        await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('.thread-bar')]);
      } else {
        await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('[data-primary]')]);
      }
    }
  }
  await page.waitForSelector('.receipt-screen [data-rank]', { timeout: 5000 }).catch(() => {});
  await sleep(2500);
  const r = await page.evaluate(() => ({ hud: document.querySelector('[data-hud]').innerText.replace(/\s+/g, ' ').trim(), head: document.querySelector('.receipt h1').textContent,
    rows: document.querySelectorAll('.rrow').length, total: document.querySelector('.rtotal').textContent, rank: (document.querySelector('[data-rank]') || {}).textContent || '',
    share: document.querySelector('[data-share]').textContent, challenge: (document.querySelector('[data-challenge]') || {}).textContent || '' }));
  await page.screenshot({ path: path.join(shots, 'thread-receipt.png'), fullPage: true });
  check(r.hud.startsWith('Thread complete') && r.head === 'Thread complete' && r.rows === 3 && /^#\d+ today$/.test(r.rank),
    `receipt: ${games.join(' → ')} · "${r.total}" · ${r.rank} · ${r.share} / ${r.challenge}`);
  await page.click('[data-share]');
  const text = await page.evaluate(() => window.__shared.at(-1).text + '\n' + window.__shared.at(-1).url);
  check(/^Chezable · Today's Thread · \d+ \w+\n/.test(text) && /\d\/9 stars|\d of 9 stars/.test(text) && /\/t\/\d{4}-\d{2}-\d{2}$/.test(text), 'Share result: the text receipt with stars and the /t/<date> link');
  await page.click('[data-challenge]');
  const curl = await page.evaluate(() => window.__shared.at(-1).url);
  check(/\/t\/\d{4}-\d{2}-\d{2}\?from=\ds[0-9a-z]{6}$/.test(curl), `Challenge a friend: ${curl.replace(/^https?:\/\/[^/]+/, '')}`);
  // the friend's view of that link
  const ctx2 = await browser.createBrowserContext();
  const F = await newPage(ctx2);
  await F.goto(curl.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'networkidle0' });
  await sleep(800);
  const beat = await F.$eval('[data-beat]', (e) => e.textContent).catch(() => '');
  check(/^Beat .+'s \d\/9 stars$/.test(beat), `the friend sees "${beat}" on the thread intro`);
  await ctx2.close();
  // Home after: done
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  const after = await page.$eval('.thread-hero', (e) => e.innerText.replace(/\s+/g, ' '));
  check(/Today's Thread done: \d\/9 stars/.test(after) && /See your result/.test(after) && /Play an anytime thread/.test(after), `Home after the thread: "${after.slice(0, 60)}"`);
  const stand = await (await page.goto(BASE + '/standings', { waitUntil: 'networkidle0' }), page.$eval('[data-rows]', (e) => e.innerText.replace(/\s+/g, ' ')));
  check(/#1/.test(stand), `Daily thread standings: ${stand.slice(0, 60)}`);
  check(!page.errors.length, `thread: no errors ${page.errors.length ? JSON.stringify(page.errors.slice(0, 3)) : ''}`);
  log(`  (Home hero before: "${hero.slice(0, 70)}")`);
  await ctx.close();
}

// ---------- lives: a failed turn costs a life and replays the same seed (spec 2 §5.3) ----------
if (want('lives')) {
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  await page.goto(BASE + '/t/new', { waitUntil: 'networkidle0' });
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('[data-start]')]);
  await sleep(800);
  const seed1 = await page.evaluate(() => window.Chez.currentRun().seed);
  await page.evaluate(() => window.__chezForceEnd());
  await page.waitForSelector('.turn-card', { timeout: 15000 });
  const fail = await page.evaluate(() => ({ kicker: (document.querySelector('.turn-card .kicker') || {}).textContent, primary: document.querySelector('[data-primary]').textContent,
    hearts: document.querySelectorAll('.hud-hearts svg path[fill="var(--heart)"]').length, next: !!document.querySelector('.turn-card [data-next]') }));
  await page.click('[data-primary]');
  await sleep(800);
  const seed2 = await page.evaluate(() => window.Chez.currentRun().seed);
  check(fail.kicker === 'Out of stars, 1 life lost' && fail.primary === 'Try again' && fail.hearts === 2 && !fail.next && seed1 === seed2,
    `failed turn: "${fail.kicker}", ${fail.hearts} lives left, "${fail.primary}" replays the same seed`);
  const g = slug(page);
  const passed = await playUntil(page, '.turn-card', { forceAfter: forceFor(g) });
  const retry = passed ? await page.$('[data-retry]') : null;
  const stars = passed ? await page.$$eval('.turn-card .stars path[fill="#FFD84A"]', (x) => x.length) : 0;
  check(passed && (stars === 3 ? !retry : !!retry), `passed on the replay: ${stars} stars; "Retry for more stars" ${retry ? 'offered' : 'hidden'}`);
  // two more fails on the next turn: out of lives, the receipt
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('[data-primary]')]);
  await sleep(800);
  await page.evaluate(() => window.__chezForceEnd());
  await page.waitForSelector('.turn-card');
  await page.click('[data-primary]');
  await sleep(800);
  await page.evaluate(() => window.__chezForceEnd());
  await page.waitForSelector('.receipt-screen', { timeout: 15000 });
  const out = await page.evaluate(() => ({ hud: document.querySelector('[data-hud]').innerText.replace(/\s+/g, ' ').trim(), head: document.querySelector('.receipt h1').textContent, primary: document.querySelector('.receipt-screen .actions .btn').textContent }));
  check(out.hud.startsWith('Out of lives') && out.head === 'Out of lives' && out.primary === 'Try again', `out of lives: "${out.head}", primary "${out.primary}"`);
  check(!page.errors.length, `lives: no errors ${page.errors.length ? JSON.stringify(page.errors.slice(0, 3)) : ''}`);
  await ctx.close();
}

// ---------- name claim on the end screen (spec 2 §3.4) ----------
if (want('claim')) {
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  await page.goto(`${BASE}/g/arrow-puzzle/`, { waitUntil: 'networkidle0' });
  await page.click('[data-mode=solo]');
  await playUntil(page, '.endscreen');
  // a name that's taken (any case): the debounced check says so as you type
  let someone = null;
  for (const g of featured) { const tb = await (await fetch(`${BASE}/api/top/${g.id}?board=all&limit=50`)).json(); someone = someone || (tb.rows.find((r) => r.name) || {}).name; }
  check(!!someone, 'a claimed name to try: ' + someone);
  if (someone) {
    await page.type('.endscreen [data-claimform] input', someone.toUpperCase(), { delay: 20 });
    await sleep(1500);
    const msg = await page.$eval('.endscreen .claim-msg', (e) => e.textContent);
    check(msg === 'Taken, try another', `typing "${someone.toUpperCase()}": "${msg}"`);
    await page.$eval('.endscreen [data-claimform] input', (i) => { i.value = ''; });
  }
  const mine = 'Tester_' + Date.now().toString(36).slice(-5);
  await page.type('.endscreen [data-claimform] input', mine, { delay: 10 });
  await page.click('.endscreen [data-claimform] [type=submit]');
  await sleep(1500);
  const nice = await page.$eval('.endscreen .nice', (e) => e.textContent).catch(() => '');
  check(nice === `Nice one, ${mine}` && !(await page.$('.endscreen [data-claimform]')), `claimed "${mine}": "${nice}", the banner is gone`);
  await ctx.close();
}

// ---------- daily links (?mode=daily) start straight away ----------
if (want('daily')) {
  const page = await newPage();
  await page.goto(`${BASE}/daily`, { waitUntil: 'networkidle0' });
  const ids = await page.$$eval('a[href*="?mode=daily"]', (links) => links.map((a) => a.getAttribute('href').split('/')[2]));
  for (const id of ids) {
    await page.goto(`${BASE}/g/${id}/?mode=daily`, { waitUntil: 'networkidle0' });
    const startShown = !!(await page.$('.start-screen'));
    const done = await playUntil(page, '.endscreen', { forceAfter: forceFor(id) });
    check(done && !startShown, `daily → ${id}: plays straight away and finishes`);
  }
  check(!page.errors.length, `daily: no errors ${page.errors.length ? JSON.stringify(page.errors.slice(0, 3)) : ''}`);
  await page.close();
}

// ---------- archived games (not listed, still reachable by link): the new shell still starts them ----------
if (want('archived')) {
  for (const g of cat.games.filter((x) => !x.featured)) {
    const page = await newPage();
    await page.goto(`${BASE}/g/${g.id}/`, { waitUntil: 'networkidle0' });
    const start = await page.waitForSelector('[data-mode=solo]', { timeout: 15000 }).catch(() => null);
    if (start) await start.click();
    await sleep(2500);
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Space'); await sleep(200); }
    check(!!start && !page.errors.length, `archived ${g.id.padEnd(14)} starts on the new shell${page.errors.length ? ' · ' + page.errors.slice(0, 2).join('; ') : ''}`);
    await page.close();
  }
}

await browser.close();
log(failures ?`\n${failures} browser check(s) FAILED` : '\nAll browser checks passed. Screens in tests/screens/');
process.exit(failures ? 1 : 0);
