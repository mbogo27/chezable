// One shared AudioContext with one mute switch (spec §4.1). Games build sounds on top of tone() and noise().
import { prefs } from './prefs.js';

let ac = null, master = null;

export function ensure() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = prefs.sound ? 0.9 : 0;
    master.connect(ac.destination);
  } catch (e) { ac = null; }
  return ac;
}
prefs.on((k, v) => { if (k === 'sound' && master) master.gain.setTargetAtTime(v ? 0.9 : 0, ac.currentTime, 0.02); });

export function tone(f0, f1, dur, type = 'sine', vol = 0.1, delay = 0) {
  if (!ac || !prefs.sound) return;
  const t = ac.currentTime + delay, o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}

export function noise(dur, freq = 2000, type = 'lowpass', vol = 0.2, curve = 2) {
  if (!ac || !prefs.sound) return;
  const len = Math.max(1, Math.floor(ac.sampleRate * dur)), b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, curve); // cosmetic randomness only
  const s = ac.createBufferSource(); s.buffer = b;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = ac.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); s.start();
}

export function chord(freqs, step = 0.09, dur = 0.22, type = 'triangle', vol = 0.15) {
  freqs.forEach((f, i) => tone(f, f, dur, type, vol, i * step));
}

export const audio = {
  ensure,
  tone,
  noise,
  chord,
  get ctx() { return ac; },
  get master() { return master; },
  get muted() { return !prefs.sound; },
  setMuted(m) { prefs.set('sound', !m); },
  toggle() { ensure(); prefs.set('sound', !prefs.sound); return prefs.sound; },
};

export function haptic(ms = 20) {
  if (!prefs.haptics) return;
  try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {}
}
