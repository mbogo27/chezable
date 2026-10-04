// Shared helpers for stages: logical-resolution canvas, fixed-timestep loop, outlined text.
// Bundled into each game by esbuild, so games stay single self-contained folders at runtime.

/**
 * Fit a canvas to its container at a fixed logical size (spec §9.2 rule 2). Draw in logical units after
 * calling begin(); letterbox areas stay transparent so the stage background shows through.
 */
export function fitCanvas(canvas, LW, LH) {
  const ctx = canvas.getContext('2d');
  const v = { ctx, LW, LH, W: 0, H: 0, dpr: 1, s: 1, ox: 0, oy: 0 };
  v.resize = () => {
    const r = canvas.getBoundingClientRect();
    v.W = r.width; v.H = r.height; v.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(v.W * v.dpr)); canvas.height = Math.max(1, Math.round(v.H * v.dpr));
    v.s = Math.min(v.W / LW, v.H / LH); v.ox = (v.W - LW * v.s) / 2; v.oy = (v.H - LH * v.s) / 2;
  };
  /** Clear and set the transform so 1 unit = 1 logical pixel. */
  v.begin = () => {
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.clearRect(0, 0, v.W, v.H);
    ctx.setTransform(v.dpr * v.s, 0, 0, v.dpr * v.s, v.dpr * v.ox, v.dpr * v.oy);
  };
  /** Client coordinates -> logical coordinates. */
  v.toLogical = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left - v.ox) / v.s, y: (clientY - r.top - v.oy) / v.s };
  };
  new ResizeObserver(() => v.resize()).observe(canvas);
  v.resize();
  return v;
}

/**
 * Fixed-timestep loop (spec §4.1 determinism rule): step(dt) always receives STEP, whatever the frame rate.
 * render(now, alpha) runs once per animation frame.
 */
export function fixedLoop({ step, render, STEP = 1 / 120, maxSteps = 60 }) {
  let acc = 0, last = 0, running = false, stepping = false, raf = 0;
  const L = {
    STEP,
    tick: 0,
    start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    play() { stepping = true; acc = 0; last = performance.now(); },
    halt() { stepping = false; acc = 0; },
    get stepping() { return stepping; },
    resetTick() { L.tick = 0; acc = 0; },
  };
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (stepping) {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < maxSteps && stepping) { step(STEP, L.tick); L.tick++; acc -= STEP; n++; }
      if (n >= maxSteps) acc = 0;
    }
    render(now, stepping ? acc / STEP : 0, dt);
    raf = requestAnimationFrame(frame);
  }
  return L;
}

export function outlined(ctx, text, x, y, size, fill = '#fff', align = 'center', stroke = '#1B1D1E') {
  ctx.font = `${size}px "Archivo Black", Impact, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.2);
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const angDiff = (a, b) => { let d = ((a - b) % TAU + TAU) % TAU; return d > Math.PI ? TAU - d : d; };
export const reduced = () => !!(window.Chez && Chez.prefs.reducedMotion);

/** Simple HUD writer: updates text only when it changes. */
export function hud(el) {
  let last = '';
  return (html) => { if (html !== last) { el.innerHTML = html; last = html; } };
}

/** Ignore pointer events that started on buttons, links or inputs. */
export const onControl = (e) => !!(e.target && e.target.closest && e.target.closest('button,a,input,select,textarea,summary,.sheet-wrap,.overlay'));
