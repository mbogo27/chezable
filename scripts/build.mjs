// Build: catalog -> SDK bundle -> shell CSS/fonts -> games -> Vite (shell pages) -> service worker.
//   node scripts/build.mjs            full build into apps/web/dist
//   node scripts/build.mjs --no-vite  only refresh apps/web/public (for `vite apps/web` dev)
import { build as esbuild, transform } from 'esbuild';
import { readFile, writeFile, mkdir, readdir, cp, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = (...p) => path.resolve(root, ...p);
const pub = r('apps/web/public');
const noVite = process.argv.includes('--no-vite');

// Google Analytics (GA4) goes into the <head> of every page: the shell and each stage.
// GA4's enhanced measurement records the shell's client-side route changes as page views.
const GA_ID = 'G-W2MKV0XF9V';
const GA_TAG = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', '${GA_ID}');
</script>`;
const withGa = (html) => (html.includes(GA_ID) ? html : html.replace(/<head>/i, `<head>\n${GA_TAG}`));
const t0 = Date.now();

// ---------- 1. catalogue from each games/<slug>/stage.json ----------
const slugs = (await readdir(r('games'), { withFileTypes: true })).filter((d) => d.isDirectory() && existsSync(r('games', d.name, 'stage.json'))).map((d) => d.name);
const stages = [];
for (const s of slugs) stages.push(JSON.parse(await readFile(r('games', s, 'stage.json'), 'utf8')));
stages.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const shellCatalog = {
  games: stages.map((s) => pick(s, ['id', 'version', 'order', 'title', 'rule', 'howto', 'modes', 'score', 'duration', 'seeded', 'variants', 'assist', 'turnBased', 'card', 'share', 'passCustom'])),
};
const workerCatalog = {
  games: stages.map((s) => pick(s, ['id', 'title', 'rule', 'modes', 'score', 'duration', 'variants', 'assist', 'turnBased'])),
};
await writeFile(r('packages/chez-sdk/src/catalog.generated.json'), JSON.stringify(shellCatalog));
await writeFile(r('apps/worker/src/catalog.generated.json'), JSON.stringify(workerCatalog, null, 1));

/* ---------- 2. SDK ---------- */
await rm(r(pub, 'shell'), { recursive: true, force: true });
await rm(r(pub, 'g'), { recursive: true, force: true });
await mkdir(r(pub, 'shell/fonts'), { recursive: true });
const target = ['es2020', 'chrome80', 'safari13', 'firefox78'];
await esbuild({
  entryPoints: [r('packages/chez-sdk/src/index.js')],
  outfile: r(pub, 'shell/chez.js'),
  bundle: true, minify: true, format: 'iife', target, legalComments: 'none', logLevel: 'warning',
});

/* ---------- 3. shell CSS + fonts ---------- */
const css = (await readFile(r('packages/ui/tokens.css'), 'utf8')) + '\n' + (await readFile(r('packages/ui/ui.css'), 'utf8'));
await writeFile(r(pub, 'shell/ui.css'), (await transform(css, { loader: 'css', minify: true })).code);
await cp(r('packages/ui/fonts'), r(pub, 'shell/fonts'), { recursive: true });

/* ---------- 4. games ---------- */
for (const s of slugs) {
  const src = r('games', s), out = r(pub, 'g', s);
  await mkdir(out, { recursive: true });
  await esbuild({
    entryPoints: [path.join(src, 'game.js')], outfile: path.join(out, 'game.js'),
    bundle: true, minify: true, format: 'esm', target, legalComments: 'none', logLevel: 'warning',
  });
  let html = await readFile(path.join(src, 'index.html'), 'utf8');
  html = html.replace(/(\/g\/[a-z0-9-]+\/(?:game\.js|style\.css))/g, `$1?v=${hashOf(await readFile(path.join(out, 'game.js')))}`);
  await writeFile(path.join(out, 'index.html'), withGa(html));
  if (existsSync(path.join(src, 'style.css'))) {
    await writeFile(path.join(out, 'style.css'), (await transform(await readFile(path.join(src, 'style.css'), 'utf8'), { loader: 'css', minify: true })).code);
  }
  await writeFile(path.join(out, 'stage.json'), JSON.stringify(stages.find((x) => x.id === s)));
  for (const dir of ['skins', 'assets']) if (existsSync(path.join(src, dir))) await cp(path.join(src, dir), path.join(out, dir), { recursive: true });
}
function hashOf(buf) { return createHash('sha1').update(buf).digest('hex').slice(0, 8); }

/* ---------- 5. Vite ---------- */
if (!noVite) {
  const { build } = await import('vite');
  await build({ configFile: r('apps/web/vite.config.js'), logLevel: 'warn' });
  const shellHtml = r('apps/web/dist/index.html');
  await writeFile(shellHtml, withGa(await readFile(shellHtml, 'utf8')));

  /* ---------- 6. service worker ---------- */
  const dist = r('apps/web/dist');
  const files = [];
  async function walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p); else files.push('/' + path.relative(dist, p).split(path.sep).join('/'));
    }
  }
  await walk(dist);
  const precache = files.filter((f) => /^\/(index\.html|manifest\.webmanifest|shell\/|assets\/|icons\/(icon-192|favicon))/.test(f) && !f.endsWith('.map'));
  precache.push('/');
  const version = hashOf(Buffer.from(JSON.stringify(precache) + (await Promise.all(precache.filter((f) => f !== '/').map(async (f) => (await stat(path.join(dist, f))).size))).join(',')));
  let sw = await readFile(r('apps/web/sw.template.js'), 'utf8');
  sw = sw.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache));
  await writeFile(path.join(dist, 'sw.js'), (await transform(sw, { loader: 'js', minify: true })).code);
  console.log(`sw ${version}: ${precache.length} files precached`);
}
console.log(`built ${slugs.length} stages in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
