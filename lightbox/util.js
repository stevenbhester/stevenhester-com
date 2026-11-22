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

// A pointing finger for the how-to: a ring that pulses once per tap, with the taps counted beside it when there are two.
// `press` (0 to 1) drives the pulse by hand; left out, it pulses on its own.
export function finger(ctx, x, y, t, taps = 1, press = -1) {
  const beat = press >= 0 ? press : (t * 1.6) % 1, pulse = Math.max(0, 1 - beat * 2.2);
  ctx.save();
  ctx.fillStyle = `rgba(255,122,89,${0.22 + pulse * 0.3})`; ctx.beginPath(); ctx.arc(x, y, 17 + pulse * 5, 0, TAU); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = `rgba(255,122,89,${0.9 - beat * 0.7})`; ctx.beginPath(); ctx.arc(x, y, 12 + beat * 16, 0, TAU); ctx.stroke();
  ctx.font = '30px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#000';
  ctx.fillText('\u{1F446}', x + 2, y + 6 - pulse * 5);
  if (taps > 1) {
    ctx.font = '700 14px Fredoka, ui-rounded, system-ui, sans-serif'; ctx.textBaseline = 'middle';
    const w = 34; rr(ctx, x + 20, y - 26, w, 22, 11); ctx.fillStyle = '#ff7a59'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText('\u00d7' + taps, x + 20 + w / 2, y - 14.5);
  }
  ctx.restore();
}

// A speech bubble with wrapped text, pointing at (x, y). `above` puts it over the point, otherwise under it.
// It is kept inside a sheet w wide and h tall.
export function bubble(ctx, x, y, text, above, w, h) {
  ctx.save();
  ctx.font = '600 14px Fredoka, ui-rounded, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const max = 178, lines = []; let line = '';
  for (const word of text.split(' ')) { const next = line ? line + ' ' + word : word; if (line && ctx.measureText(next).width > max) { lines.push(line); line = word; } else line = next; }
  lines.push(line);
  const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 22, bh = lines.length * 18 + 16, gap = 24;
  if (above && y - gap - bh < 6) above = false; else if (!above && y + gap + bh > h - 6) above = true;
  const bx = Math.max(6, Math.min(w - bw - 6, x - bw / 2)), by = above ? y - gap - bh : y + gap, px = Math.max(bx + 14, Math.min(bx + bw - 14, x));
  ctx.shadowColor = 'rgba(40,30,55,.3)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#3b3346'; rr(ctx, bx, by, bw, bh, 11); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.beginPath(); ctx.moveTo(px - 8, above ? by + bh - 1 : by + 1); ctx.lineTo(px + 8, above ? by + bh - 1 : by + 1); ctx.lineTo(px, above ? by + bh + 9 : by - 9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; lines.forEach((l, i) => ctx.fillText(l, bx + 11, by + 8 + 9 + i * 18));
  ctx.restore();
}
