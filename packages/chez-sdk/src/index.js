// chez.js — the shell SDK. Bundled to /shell/chez.js as an IIFE exposing window.Chez.
// Games call Chez.stage(...), Chez.onPlay(...), Chez.run.start(...) and run.finish(...);
// the shell pages use the same identity, API, prefs and i18n.
import * as store from './store.js';
import { prefs, apply as applyPrefs } from './prefs.js';
import { t, L, addStrings } from './i18n.js';
import * as net from './net.js';
import { audio, haptic } from './audio.js';
import { toast, announce, sheet, esc, h, relAge, closeAllSheets } from './ui.js';
import { share, shareNow, bindShareButton } from './share.js';
import * as catalog from './catalog.js';
import * as rules from './rules.js';
import * as names from './names.js';
import { rng, xmur3, mulberry32, shuffle, freshSeed } from '../../rng/rng.js';
import { stage, onPlay, onPause, onResume, onQuit, onForceEnd, pause, resume, isPaused, run, manifest, currentRun, createChallenge, showMenu } from './stage.js';
import * as header from './header.js';
import * as screens from './screens.js';
import * as threads from './threads.js';
import * as threadState from './thread-state.js';
import * as threadUi from './thread-ui.js';
import * as results from './results.js';
import * as codes from './codes.js';
import { claimForm, claimSheet } from './claim.js';
import { prefetchGame } from './prefetch.js';
import { logoMarkSvg } from './logo.js';

store.migrate();
applyPrefs();

const Chez = {
  version: '1.0.0',
  // stage contract
  stage, onPlay, onPause, onResume, onQuit, onForceEnd, pause, resume, isPaused, run, manifest, currentRun, createChallenge, showMenu,
  // services
  rng, xmur3, mulberry32, shuffle, freshSeed,
  prefs, t, L, addStrings, audio, haptic,
  ui: { toast, announce, sheet, esc, h, relAge, logoMarkSvg, closeAllSheets },
  share, shareNow, bindShareButton,
  header, screens, threads, threadState, threadUi, results, codes, claimForm, claimSheet, prefetchGame,
  store,
  catalog,
  rules,
  names,
  // identity + api (shell pages)
  player: net.player,
  savePlayer: net.savePlayer,
  api: net.api,
  me: net.refreshMe,
  cachedMe: net.cachedMe,
  track: net.track,
  sendQueued: net.sendQueued,
  applyEarnings: net.applyEarnings,
  flush: net.flush,
  on: net.on,
};

// session.start once per tab session
try {
  if (!sessionStorage.getItem('chez:started')) {
    sessionStorage.setItem('chez:started', '1');
    net.track('session.start', { returning: net.player().isNew ? 0 : 1 });
    if (net.player().isNew) net.savePlayer({ isNew: false });
  }
} catch (e) {}

// service worker (PWA, offline solo play)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

window.Chez = Chez;
export default Chez;
