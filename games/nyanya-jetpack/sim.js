// Nyanya Jetpack simulation: pure, seeded, fixed-step. Used by the game, the ghost and the tests.
// Units are normalised: y in [0,1] of the tunnel height, distance in metres.
import { rng } from '../../packages/rng/rng.js';

export const STEP = 1 / 120;
export const TIERS = [
  { m: 0, name: 'Bronze', c: '#d1a47a' }, { m: 120, name: 'Silver', c: '#bfc6ca' }, { m: 300, name: 'Gold', c: '#f0cf5a' },
  { m: 520, name: 'Platinum', c: '#a6d8cb' }, { m: 800, name: 'Diamond', c: '#92c8f0' }, { m: 1150, name: 'Champion', c: '#c9a7f0' },
  { m: 1600, name: 'Legend', c: '#f29270' },
];
export const tierIndex = (d) => { let i = 0; while (i < TIERS.length - 1 && d >= TIERS[i + 1].m) i++; return i; };

export function createCourse(seed, T) {
  const shape = rng(seed, 'course');
  const p1 = shape() * Math.PI * 2, p2 = shape() * Math.PI * 2;
  const mr = rng(seed, 'mines');
  const course = { T, mines: [], nextMine: T.mineFrom, p1, p2 };
  course.corr = (m) => {
    m = Math.max(0, m);
    const amp = Math.min(0.17, Math.max(0, m - 40) * 0.0011);
    let c = 0.5 + amp * (0.62 * Math.sin(m * 0.031 + p1) + 0.38 * Math.sin(m * 0.077 + 1.3 + p2));
    const gap = Math.max(T.gapMin, T.gapStart - Math.max(0, m - 30) * 0.00062);
    c = Math.min(0.91 - gap / 2, Math.max(0.09 + gap / 2, c));
    return { top: c - gap / 2, bot: c + gap / 2, mid: c };
  };
  // mines are generated in order, so the layout never depends on screen size or how far ahead we look
  course.genTo = (upTo) => {
    while (course.nextMine < upTo) {
      const m = course.nextMine, c = course.corr(m), r = 0.04, gap = c.bot - c.top;
      let y = c.mid;
      for (let i = 0; i < 6; i++) {
        y = c.top + r + 0.01 + mr() * (gap - 2 * r - 0.02);
        if (Math.max((y - r) - c.top, c.bot - (y + r)) >= 0.2) break;
        y = mr() < 0.5 ? c.top + r + 0.01 : c.bot - r - 0.01;
      }
      course.mines.push({ m, y, r, spin: mr() * 6 });
      course.nextMine += Math.max(13, 34 - (m - 290) * 0.012) + mr() * 14;
    }
  };
  return course;
}

export function createFlyer(start = {}) {
  return { dist: start.dist || 0, y: start.y ?? 0.5, vy: 0, holding: false, dead: false, ticks: 0, shield: start.shield || 0 };
}

/** One fixed step. h is STEP (times the assist factor). Returns true if the flyer crashed this step. */
export function stepFlyer(f, course, h) {
  const T = course.T, R = T.radius;
  f.vy += (T.gravity - (f.holding ? T.thrust : 0)) * h;
  f.vy = Math.max(-T.vmax, Math.min(T.vmax, f.vy));
  f.y += f.vy * h;
  f.dist += Math.min(11, 5 + f.dist * 0.012) * h;
  f.ticks++;
  course.genTo(f.dist + 40);
  if (f.shield > 0) { f.shield -= h; f.y = Math.max(course.corr(f.dist).top + R, Math.min(course.corr(f.dist).bot - R, f.y)); return false; }
  const c = course.corr(f.dist);
  if (f.y - R * 0.82 < c.top || f.y + R * 0.82 > c.bot) { f.dead = true; return true; }
  for (const mn of course.mines) {
    const dx = (mn.m - f.dist) * 0.1;
    if (dx < -0.2) continue;
    if (dx > 0.2) break;
    if (Math.hypot(dx, mn.y - f.y) < R * 0.85 + mn.r * 0.8) { f.dead = true; return true; }
  }
  return false;
}

/** Replays a toggle log (ticks where hold flips) on a fresh flyer; returns the final distance. */
export function replay(seed, T, toggles, h = STEP, maxTicks = 400000) {
  const course = createCourse(seed, T), f = createFlyer();
  let i = 0;
  while (!f.dead && f.ticks < maxTicks) {
    while (i < toggles.length && toggles[i] <= f.ticks) { f.holding = !f.holding; i++; }
    stepFlyer(f, course, h);
  }
  return f.dist;
}
