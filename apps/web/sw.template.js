// Chezable service worker (spec §9.5): precaches the shell; caches each game on first open so solo
// and pass-the-phone play work offline. The API is never cached.
const VERSION = '__VERSION__';
const SHELL = 'chez-shell-' + VERSION;
const GAMES = 'chez-games-v1';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('chez-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: false });
  const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || new Response('Offline', { status: 503 });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  // games: every file under /g/<slug>/ (the page and its game.js) is cached the first time it's opened
  if (url.pathname.startsWith('/g/')) {
    const key = req.mode === 'navigate' ? new Request(url.origin + url.pathname) : req;
    e.respondWith(staleWhileRevalidate(key, GAMES));
    return;
  }
  if (url.pathname.startsWith('/shell/') || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
      return res;
    })));
    return;
  }
  if (req.mode === 'navigate') {
    // shell pages: network first (fresh challenge previews), fall back to the cached app shell
    e.respondWith(fetch(req).catch(async () => (await caches.match('/index.html')) || (await caches.match('/')) || new Response('Offline', { status: 503 })));
  }
});
