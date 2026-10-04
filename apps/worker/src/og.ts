// Per-challenge preview cards (spec v1 §B2) drawn inside the Worker on the free plan (10 ms CPU):
// the base card (palette indices) is inflated once per isolate with the native DecompressionStream and
// cached as PNG scanlines; each render copies it, stamps glyphs into the white panel from 16-step palette
// ramps, and writes the PNG with "stored" deflate blocks, so no compression work happens in JavaScript.
// Responses are also cached per challenge code at the edge.
import og from './og-data.generated.json';

type Glyphs = { lineH: number; table: Record<string, [number, number, number]>; data: string };
const data = og as unknown as {
  W: number; H: number; PANEL: { x: number; y: number; w: number; h: number; padX: number; nameY: number; scoreY: number };
  cards: Record<string, { pixels: string; palette: string; colors: number; white: number }>;
  glyphs: Record<string, Glyphs>; ramps: { ink: number[][]; blue: number[][] };
};

export const hasCard = (game: string) => !!data.cards[game];

/* ---------- decoding (once per isolate) ---------- */
const B64 = new Uint8Array(128);
'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('').forEach((c, i) => (B64[c.charCodeAt(0)] = i));
function b64(s: string): Uint8Array {
  const n = s.length, pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((n * 3) / 4 - pad);
  for (let i = 0, o = 0; i < n; i += 4) {
    const v = (B64[s.charCodeAt(i)] << 18) | (B64[s.charCodeAt(i + 1)] << 12) | (B64[s.charCodeAt(i + 2)] << 6) | B64[s.charCodeAt(i + 3)];
    if (o < out.length) out[o++] = v >> 16;
    if (o < out.length) out[o++] = (v >> 8) & 255;
    if (o < out.length) out[o++] = v & 255;
  }
  return out;
}
async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
}
const glyphCache: Record<string, Uint8Array> = {};
async function glyphData(key: string) {
  if (!glyphCache[key]) glyphCache[key] = await inflateRaw(b64(data.glyphs[key].data));
  return glyphCache[key];
}
type Base = { rows: Uint8Array; palette: Uint8Array; inkBase: number; blueBase: number };
const baseCache: Record<string, Base> = {};
async function base(game: string): Promise<Base> {
  if (baseCache[game]) return baseCache[game];
  const card = data.cards[game], { W, H } = data;
  const px = await inflateRaw(b64(card.pixels));
  const rows = new Uint8Array((W + 1) * H);           // PNG scanlines: filter byte 0 + indices
  for (let y = 0; y < H; y++) rows.set(px.subarray(y * W, (y + 1) * W), y * (W + 1) + 1);
  const palette = new Uint8Array((card.colors + 32) * 3);
  palette.set(b64(card.palette));
  const inkBase = card.colors, blueBase = card.colors + 16;
  data.ramps.ink.forEach((c, k) => palette.set(c, (inkBase + k) * 3));
  data.ramps.blue.forEach((c, k) => palette.set(c, (blueBase + k) * 3));
  return (baseCache[game] = { rows, palette, inkBase, blueBase });
}

/* ---------- checksums ---------- */
const T8 = (() => {
  const t = new Uint32Array(256 * 8);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  for (let n = 0; n < 256; n++) for (let k = 1; k < 8; k++) t[k * 256 + n] = (t[(k - 1) * 256 + n] >>> 8) ^ t[t[(k - 1) * 256 + n] & 255];
  return t;
})();
/** CRC-32 over buf[start, end), slice-by-8. */
function crc32(buf: Uint8Array, start: number, end: number) {
  let crc = 0xffffffff, i = start;
  for (; i + 8 <= end; i += 8) {
    const a = (buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16) | (buf[i + 3] << 24)) ^ crc;
    crc = T8[1792 + (a & 255)] ^ T8[1536 + ((a >>> 8) & 255)] ^ T8[1280 + ((a >>> 16) & 255)] ^ T8[1024 + (a >>> 24)]
      ^ T8[768 + buf[i + 4]] ^ T8[512 + buf[i + 5]] ^ T8[256 + buf[i + 6]] ^ T8[buf[i + 7]];
  }
  for (; i < end; i++) crc = T8[(crc ^ buf[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
/* ---------- PNG template: indexed colour, stored deflate blocks, small IDAT chunks ----------
 * The zlib stream is split across many 256-byte IDAT chunks (the format allows any split), so a render
 * only recomputes the CRCs of the chunks the text touched; Adler-32 is patched arithmetically. */
const CHUNK = 256;
type Tpl = { png: Uint8Array; rowsLen: number; zStart: number; chunkAt: (k: number) => number; nChunks: number; adlerA: number; adlerB: number; zLen: number };
const tplCache: Record<string, Tpl> = {};
function buildTemplate(W: number, H: number, palette: Uint8Array, rows: Uint8Array): Tpl {
  const blocks = Math.ceil(rows.length / 65535);
  const zLen = 2 + rows.length + blocks * 5 + 4;
  const z = new Uint8Array(zLen);
  z[0] = 0x78; z[1] = 0x01;
  let p = 2;
  for (let i = 0; i < blocks; i++) {
    const len = Math.min(65535, rows.length - i * 65535);
    z[p] = i === blocks - 1 ? 1 : 0; z[p + 1] = len & 255; z[p + 2] = len >> 8; z[p + 3] = ~len & 255; z[p + 4] = (~len >> 8) & 255;
    z.set(rows.subarray(i * 65535, i * 65535 + len), p + 5);
    p += 5 + len;
  }
  let a = 1, b = 0;
  for (let i = 0; i < rows.length;) { const end = Math.min(i + 5552, rows.length); for (; i < end; i++) { a += rows[i]; b += a; } a %= 65521; b %= 65521; }
  new DataView(z.buffer).setUint32(p, ((b << 16) | a) >>> 0);
  const nChunks = Math.ceil(zLen / CHUNK);
  const head = 8 + (12 + 13) + (12 + palette.length);
  const png = new Uint8Array(head + nChunks * 12 + zLen + 12), dv = new DataView(png.buffer);
  png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  let o = 8;
  const chunk = (type: string, body: Uint8Array) => {
    dv.setUint32(o, body.length);
    for (let i = 0; i < 4; i++) png[o + 4 + i] = type.charCodeAt(i);
    png.set(body, o + 8);
    dv.setUint32(o + 8 + body.length, crc32(png, o + 4, o + 8 + body.length));
    o += 12 + body.length;
  };
  const ihdr = new Uint8Array(13), hv = new DataView(ihdr.buffer);
  hv.setUint32(0, W); hv.setUint32(4, H); ihdr[8] = 8; ihdr[9] = 3;
  chunk('IHDR', ihdr);
  chunk('PLTE', palette);
  for (let k = 0; k < nChunks; k++) chunk('IDAT', z.subarray(k * CHUNK, Math.min(zLen, (k + 1) * CHUNK)));
  chunk('IEND', new Uint8Array(0));
  return { png, rowsLen: rows.length, zStart: head, chunkAt: (k) => head + k * (12 + CHUNK), nChunks, adlerA: a, adlerB: b, zLen };
}
/** Offset of rows[i] inside the zlib stream. */
const zOff = (i: number) => 2 + i + 5 * (Math.floor(i / 65535) + 1);

/* ---------- text ---------- */
function textWidth(g: Glyphs, s: string) { let w = 0; for (const ch of s) w += (g.table[ch] || g.table['?'])[0]; return w; }
function fit(s: string, keys: string[], maxW: number): { key: string; text: string } {
  for (const k of keys) if (textWidth(data.glyphs[k], s) <= maxW) return { key: k, text: s };
  const k = keys[keys.length - 1];
  let t = s;
  while (t.length > 1 && textWidth(data.glyphs[k], t + '...') > maxW) t = t.slice(0, -1);
  return { key: k, text: t + '...' };
}
/**
 * Stamp text straight into a copy of the PNG template: each glyph pixel is written at its place in the IDAT
 * data, Adler-32 is patched for the change, and the touched chunk is marked for a CRC recompute.
 */
type Ctx = { png: Uint8Array; tpl: Tpl; dirty: Uint8Array; a: number; b: number };
function stamp(ctx: Ctx, W: number, g: Glyphs, cov: Uint8Array, text: string, x0: number, y0: number, rampBase: number) {
  const { png, tpl, dirty } = ctx, stride = W + 1, len = tpl.rowsLen, head = tpl.zStart;
  let a = ctx.a, b = ctx.b, x = x0;
  for (const ch of text) {
    const [adv, w, off] = g.table[ch] || g.table['?'];
    for (let y = 0; y < g.lineH; y++) {
      const rowAt = (y0 + y) * stride + 1 + x - 2;
      for (let i = 0; i < w; i++) {
        const c = cov[off + y * w + i];
        if (c === 0) continue;
        const r = rowAt + i;
        const z = 2 + r + 5 * (((r / 65535) | 0) + 1);
        const k = z >> 8;                                  // CHUNK = 256
        const at = head + k * 268 + 8 + (z & 255);
        const cur = png[at];
        const nv = cur >= rampBase && cur < rampBase + 16 ? (cur > rampBase + c ? cur : rampBase + c) : rampBase + c;
        if (nv === cur) continue;
        png[at] = nv;
        const d = nv - cur;
        a += d; b += (len - r) * d;                        // Adler-32 deltas, reduced once at the end
        dirty[k] = 1;
      }
    }
    x += adv;
  }
  ctx.a = a; ctx.b = b;
}

/** Draw the card: "{name}" (brand blue) and "scored {score}" (ink) in the white panel. */
export async function renderCard(game: string, name: string, scoreText: string): Promise<Uint8Array> {
  const bse = await base(game);
  const { W, H, PANEL } = data;
  const tpl = tplCache[game] || (tplCache[game] = buildTemplate(W, H, bse.palette, bse.rows));
  const maxW = PANEL.w - PANEL.padX * 2;
  const n = fit(name, ['name', 'nameSm'], maxW);
  const sc = fit(`scored ${scoreText}`, ['score', 'scoreSm'], maxW);
  const [gn, gs] = await Promise.all([glyphData(n.key), glyphData(sc.key)]);
  const ctx: Ctx = { png: tpl.png.slice(), tpl, dirty: new Uint8Array(tpl.nChunks), a: tpl.adlerA, b: tpl.adlerB };
  stamp(ctx, W, data.glyphs[n.key], gn, n.text, PANEL.x + PANEL.padX, PANEL.nameY, bse.blueBase);
  stamp(ctx, W, data.glyphs[sc.key], gs, sc.text, PANEL.x + PANEL.padX, PANEL.scoreY, bse.inkBase);
  const png = ctx.png, dv = new DataView(png.buffer);
  const A = ((ctx.a % 65521) + 65521) % 65521, B = ((ctx.b % 65521) + 65521) % 65521;
  const adler = ((B << 16) | A) >>> 0;
  for (let j = 0; j < 4; j++) {
    const z = tpl.zLen - 4 + j, k = z >> 8;
    png[tpl.zStart + k * 268 + 8 + (z & 255)] = (adler >>> (24 - 8 * j)) & 255;
    ctx.dirty[k] = 1;
  }
  for (let k = 0; k < tpl.nChunks; k++) {
    if (!ctx.dirty[k]) continue;
    const at = tpl.zStart + k * 268, clen = Math.min(CHUNK, tpl.zLen - k * CHUNK);
    dv.setUint32(at + 8 + clen, crc32(png, at + 4, at + 8 + clen));
  }
  return png;
}
