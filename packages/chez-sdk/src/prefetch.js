// Preload a game while the player looks at the end screen, turn card or thread intro (spec 2 §1.1 step 6, §5.4,
// §5.5), so the next tap starts it at once: its page, then the script and stylesheet the page names. The service
// worker keeps what's fetched under /g/, so it's there offline too. Best effort, low priority, once per game.
const done = new Set();

export function prefetchGame(slug) {
  if (!slug || done.has(slug) || typeof fetch !== 'function') return;
  if (navigator.connection && navigator.connection.saveData) return;
  done.add(slug);
  const base = `/g/${slug}/`;
  const go = () => fetch(base, { credentials: 'omit', priority: 'low' }).then((r) => (r.ok ? r.text() : '')).then((html) => {
    const urls = [...html.matchAll(/(?:src|href)="(\/g\/[a-z0-9-]+\/[^"]+\.(?:js|css)[^"]*)"/g)].map((m) => m[1]);
    for (const u of new Set(urls)) fetch(u, { credentials: 'omit', priority: 'low' }).catch(() => {});
    const gameIcon = html.match(/\/icons\/games\/[a-z0-9-]+\.svg/);
    if (gameIcon) fetch(gameIcon[0]).catch(() => {});
  }).catch(() => {});
  ('requestIdleCallback' in window) ? requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 300);
}
