// Small shared helpers: seeded randomness, drawing, and the confetti/particle layer.
export const TAU = Math.PI * 2;
export const HP = Math.PI / 2;

// A repeatable random source, so a daily puzzle is the same for everyone on that day.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const pick = (R, n) => Math.floor(R() * n);
export const between = (R, lo, hi) => lo + R() * (hi - lo);
export function shuffle(a, R = Math.random) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

const CONFETTI = ['#ff5d5d', '#4d8dff', '#ffc53d', '#a26bf5', '#35c27a', '#ff7ab8'];
export class Fx {
  constructor() { this.p = []; }
  confetti(w) {
    for (let k = 0; k < 80; k++) this.p.push({ x: Math.random() * w, y: -10 - Math.random() * 80, vx: (Math.random() - 0.5) * 90, vy: 60 + Math.random() * 140,
      life: 0, max: 1.6 + Math.random(), color: CONFETTI[k % CONFETTI.length], size: 3 + Math.random() * 3, g: 170 });
  }
  step(dt) {
    for (const q of this.p) { q.life += dt; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
    this.p = this.p.filter(q => q.life < q.max);
  }
  draw(ctx) {
    for (const q of this.p) { ctx.globalAlpha = 1 - q.life / q.max; ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
}
