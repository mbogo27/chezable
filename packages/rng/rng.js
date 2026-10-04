// The one shared seeded RNG: xmur3 string hash + mulberry32.
// Used by the shell, every seeded stage, and the Worker (for P1 replays).
// Same seed string -> same sequence on every device and runtime.

export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** rng(seed) -> () => float in [0,1). `stream` gives an independent sequence from the same seed. */
export function rng(seed, stream) {
  const s = stream == null ? String(seed) : `${seed}|${stream}`;
  return mulberry32(xmur3(s)());
}

/** Helpers that take an rng function. */
export const int = (r, n) => Math.floor(r() * n);
export const range = (r, a, b) => a + r() * (b - a);
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
export function shuffle(arr, r) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** A short random seed string (uses crypto where available; never used inside gameplay). */
export function freshSeed() {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = new Uint8Array(10);
  (globalThis.crypto || {}).getRandomValues ? crypto.getRandomValues(bytes) : bytes.forEach((_, i) => (bytes[i] = Math.random() * 256));
  for (const b of bytes) out += abc[b % abc.length];
  return out;
}
