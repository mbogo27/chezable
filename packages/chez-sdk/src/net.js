// Identity (spec §4.2), signed API client (§10.3), offline queue (§4.4) and telemetry (§11.1).
import * as store from './store.js';
import { prefs } from './prefs.js';

const API = '/api';
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const subtle = () => (globalThis.crypto && crypto.subtle) || null;

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = hex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export async function sha256Hex(text) {
  return hex(await subtle().digest('SHA-256', enc.encode(text)));
}

export class ApiError extends Error {
  constructor(status, code, data) { super(code || `HTTP ${status}`); this.status = status; this.code = code; this.data = data; }
}
export class OfflineError extends Error { constructor() { super('offline'); this.offline = true; } }

/* ---------------- identity ---------------- */
const listeners = new Map();
export function on(evt, fn) { if (!listeners.has(evt)) listeners.set(evt, new Set()); listeners.get(evt).add(fn); return () => listeners.get(evt).delete(fn); }
export function emit(evt, data) { for (const fn of listeners.get(evt) || []) { try { fn(data); } catch (e) { console.error(e); } } }

export function player() {
  let p = store.get('player');
  if (!p || !p.id || !p.secret) {
    p = {
      id: uuid(),
      secret: b64url(crypto.getRandomValues(new Uint8Array(32))),
      name: null,
      cohort: Math.random() < 0.2 ? 'native' : 'classic', // §11.2: 20% Native-default
      createdAt: Date.now(),
      registered: false,
      isNew: true,
    };
    store.set('player', p);
  }
  return p;
}
export function savePlayer(patch) {
  const p = { ...player(), ...patch };
  store.set('player', p);
  emit('player', p);
  return p;
}

let keyPromise = null;
function signingKey() {
  const p = player();
  if (!keyPromise || keyPromise.id !== p.id || keyPromise.secret !== p.secret) {
    const prom = (async () => {
      const k = await sha256Hex(p.secret);
      const bytes = new Uint8Array(k.match(/../g).map((h) => parseInt(h, 16)));
      return subtle().importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    })();
    keyPromise = Object.assign(prom, { id: p.id, secret: p.secret });
  }
  return keyPromise;
}
async function signHeaders(method, path, body) {
  const p = player();
  const ts = String(Date.now());
  const msg = `${method}\n${path}\n${ts}\n${await sha256Hex(body || '')}`;
  const sig = hex(await subtle().sign('HMAC', await signingKey(), enc.encode(msg)));
  return { 'X-Chez-Player': p.id, 'X-Chez-Ts': ts, 'X-Chez-Sig': sig };
}

let registering = null;
export function ensureRegistered() {
  const p = player();
  if (p.registered) return Promise.resolve(p);
  if (!registering) {
    registering = raw('POST', '/player', { id: p.id, secret: p.secret, cohort: p.cohort, lang: 'en' }, false)
      .then((res) => savePlayer({ registered: true, cohort: res.cohort || p.cohort, name: res.handle || p.name }))
      .finally(() => { registering = null; });
  }
  return registering;
}

async function raw(method, path, body, auth = true, opts = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OfflineError();
  const text = body == null ? '' : JSON.stringify(body);
  const headers = { 'Content-Type': 'application/json' };
  if (auth) Object.assign(headers, await signHeaders(method, API + path, text));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || 9000);
  let res;
  try {
    res = await fetch(API + path, { method, headers, body: method === 'GET' ? undefined : text, signal: ctrl.signal, keepalive: !!opts.keepalive, credentials: 'omit' });
  } catch (e) {
    throw new OfflineError();
  } finally { clearTimeout(timer); }
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new ApiError(res.status, data && data.error, data);
  return data;
}

/** Authenticated request. Registers the player first; re-registers once if the server forgot them. */
export async function api(method, path, body, opts = {}) {
  if (opts.auth === false) return raw(method, path, body, false, opts);
  await ensureRegistered();
  try {
    return await raw(method, path, body, true, opts);
  } catch (e) {
    if (e.status === 401 && e.code === 'unknown_player') {
      savePlayer({ registered: false });
      await ensureRegistered();
      return raw(method, path, body, true, opts);
    }
    throw e;
  }
}

/* ---------------- offline queue ---------------- */
// Items are { id, method, path, body, at }, sent in order. A result is written here *before* it is sent
// (sendQueued), so leaving the page mid-request, or going offline, never loses it: the next page load sends it.
export function enqueue(path, body, method = 'POST') {
  const q = store.get('queue', []);
  const item = { id: uuid().slice(0, 13), method, path, body, at: Date.now() };
  q.push(item);
  store.set('queue', q.slice(-200));
  return item.id;
}
const dequeue = (id) => store.set('queue', store.get('queue', []).filter((x) => x.id !== id));
const inFlight = new Set();

/** Persist, then send. Resolves with the reply; rejects (offline, 5xx) leaving the item queued; 4xx drops it. */
export async function sendQueued(method, path, body, opts = {}) {
  const id = enqueue(path, body, method);
  inFlight.add(id);
  try {
    const res = await api(method, path, body, opts);
    dequeue(id);
    return res;
  } catch (e) {
    if (!e.offline && e.status >= 400 && e.status < 500) dequeue(id);
    throw e;
  } finally { inFlight.delete(id); }
}

let flushing = null;
export function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    for (;;) {
      const q = store.get('queue', []);
      if (!q.length) break;
      const item = q[0];
      if (item.id && inFlight.has(item.id)) break; // this page is sending it right now; keep the order
      try {
        const res = await api(item.method || 'POST', item.path, item.body);
        if (item.path === '/run/finish' && res) emit('synced', res);
        sent++;
      } catch (e) {
        if (e.offline) break;
        if (!(e.status >= 400 && e.status < 500)) break; // server trouble: keep it for later
        // 4xx: the item is invalid (expired, duplicate, already sent); drop it
      }
      store.set('queue', store.get('queue', []).filter((x) => (item.id ? x.id !== item.id : !(x.at === item.at && x.path === item.path))));
    }
    if (sent) refreshMe().catch(() => {});
  })().finally(() => { flushing = null; });
  return flushing;
}

/* ---------------- profile cache ---------------- */
export function cachedMe() { return store.get('me', null); }
export async function refreshMe() {
  const me = await api('GET', '/me');
  store.set('me', me);
  if (me && me.handle !== undefined) savePlayer({ name: me.handle, cohort: me.cohort || player().cohort });
  emit('me', me);
  return me;
}
export function applyEarnings(res) {
  if (!res || res.xp == null) return;
  const me = { ...(cachedMe() || {}), xp: res.xp, coins: res.coins, level: res.level };
  store.set('me', me);
  emit('me', me);
}

/* ---------------- telemetry ---------------- */
function sessionId() {
  const day = new Date().toISOString().slice(0, 10);
  let s = null;
  try { s = JSON.parse(sessionStorage.getItem('chez:session') || 'null'); } catch (e) {}
  if (!s || s.day !== day) {
    s = { id: uuid().slice(0, 13), day };
    try { sessionStorage.setItem('chez:session', JSON.stringify(s)); } catch (e) {}
  }
  return s.id;
}
let buffer = [];
let timer = null;
export function track(name, props = {}, game = null) {
  buffer.push({ name, game, props, ts: Date.now(), session: sessionId() });
  // also to Google Analytics (GA4), so the events show in a dashboard straight away (spec v1 §A5).
  // GA event names can't contain dots; only flat values are sent, and never names, IDs or typed text.
  // GA does real work on every event: hand it over when the page is idle, never in the middle of drawing a screen
  try {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      const flat = {};
      for (const [k, v] of Object.entries(props || {})) if (v == null || ['string', 'number', 'boolean'].includes(typeof v)) flat[k] = v;
      if (game && flat.game == null) flat.game = game;
      const send = () => { try { window.gtag('event', name.replace(/[^a-zA-Z0-9_]/g, '_'), flat); } catch (e) {} };
      'requestIdleCallback' in window ? requestIdleCallback(send, { timeout: 3000 }) : setTimeout(send, 50);
    }
  } catch (e) {}
  if (buffer.length >= 20) flushEvents();
  else if (!timer) timer = setTimeout(flushEvents, 12000);
}
export function flushEvents(keepalive = false) {
  clearTimeout(timer); timer = null;
  if (!buffer.length) return;
  const events = buffer; buffer = [];
  api('POST', '/events', { events }, { keepalive }).catch((e) => {
    if (e.offline || !(e.status >= 400 && e.status < 500)) enqueue('/events', { events });
  });
}
/** Send buffered events now (before leaving the page). */
export const flushEventsNow = () => flushEvents(true);
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushEvents(true); });
  addEventListener('online', () => flush());
}
