// OVERLAP
// See-through shapes, each on or off. A number sits in some patches and says how many of the shapes covering that patch are on.
// The "on" shapes make the picture and the rest are decoys. Numbers are chosen so the picture can always be finished one sure
// step at a time: some number settles a shape outright, with no guessing.
import { TAU, HP, rr, Fx, shuffle, pick, between } from './util.js';
import { SCENES } from './overlap-scenes.js';

export const id = 'overlap';
export const title = 'Overlap';
export const blurb = 'Switch on the right shapes to make the picture.';
export const endlessName = 'Totems';
export const howto = [
  'Each number counts how many of the shapes covering that spot are switched on.',
  'Tap a shape to switch it on. Tap again to mark it off (dashed). Tap once more to clear it.',
  'A 0 means every shape over it is off. A number equal to the shapes over it means they are all on.',
  'Where shapes overlap, a tap goes to the smallest one.',
];
export const W = 360, H = 378;
const G = 3, GW = 120, GH = 126;
const PAPER = ['#ff8f70', '#ffd54d', '#74b9ff', '#7fdcae', '#c7a0ff', '#ff9fcd', '#5fd4d0', '#d9a878'];
const NIGHT = ['#ffe9a8', '#3a5cc0', '#2c9a94', '#6f55c8', '#2f6fd0', '#e0567a', '#ffd54d', '#e08a3c'];

export const levels = SCENES.map(s => ({ id: s.id, name: s.name }));

// Scene shapes are written compactly: kind, numbers, colour. A leading '-' on the kind marks a decoy.
function make(a) {
  const k = a[0].replace('-', ''), col = a[a.length - 1];
  const s = k === 'c' ? { k, x: a[1], y: a[2], r: a[3], area: Math.PI * a[3] * a[3] }
    : k === 'e' ? { k, x: a[1], y: a[2], w: a[3] * 2, h: a[4] * 2, a: a[5], area: Math.PI * a[3] * a[4] }
    : k === 'b' ? { k, x: a[1], y: a[2], w: a[3], h: a[4], a: a[5], area: a[3] * a[4] }
    : { k, pts: a[1], area: polyArea(a[1]) };
  s.col = col; return s;
}
const polyArea = pts => Math.abs(pts.reduce((t, p, i) => { const q = pts[(i + 1) % pts.length]; return t + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

export function inside(s, x, y) {
  if (s.k === 'c') return (x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) <= s.r * s.r;
  if (s.k === 'p') {
    let hit = false;
    for (let i = 0, j = s.pts.length - 1; i < s.pts.length; j = i++) { const [xi, yi] = s.pts[i], [xj, yj] = s.pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit; }
    return hit;
  }
  const dx = x - s.x, dy = y - s.y, c = Math.cos(-s.a), n = Math.sin(-s.a), u = (dx * c - dy * n) / (s.w / 2), v = (dx * n + dy * c) / (s.h / 2);
  return s.k === 'e' ? u * u + v * v <= 1 : Math.abs(u) <= 1 && Math.abs(v) <= 1;
}
function bounds(s) {
  if (s.k === 'c') return [s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r];
  if (s.k === 'p') return [Math.min(...s.pts.map(p => p[0])), Math.min(...s.pts.map(p => p[1])), Math.max(...s.pts.map(p => p[0])), Math.max(...s.pts.map(p => p[1]))];
  const ex = (Math.abs(Math.cos(s.a)) * s.w + Math.abs(Math.sin(s.a)) * s.h) / 2, ey = (Math.abs(Math.sin(s.a)) * s.w + Math.abs(Math.cos(s.a)) * s.h) / 2;
  return [s.x - ex, s.y - ey, s.x + ex, s.y + ey];
}

// Patches: connected areas covered by the same set of shapes. `d` is how far inside the patch its roomiest point is.
export function patches(shapes, maxDepth) {
  const n = GW * GH, mask = new Int32Array(n);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    let m = 0, depth = 0; const x = gx * G + 1.5, y = gy * G + 1.5;
    for (let s = 0; s < shapes.length; s++) if (inside(shapes[s], x, y)) { m |= 1 << s; depth++; }
    if (depth > maxDepth) return null;
    mask[gy * GW + gx] = m;
  }
  const d = new Int32Array(n);
  for (let i = 0; i < n; i++) { const gx = i % GW; d[i] = Math.min(gx > 0 && mask[i - 1] === mask[i] ? d[i - 1] + 1 : 1, i >= GW && mask[i - GW] === mask[i] ? d[i - GW] + 1 : 1); }
  for (let i = n - 1; i >= 0; i--) { const gx = i % GW; d[i] = Math.min(d[i], gx < GW - 1 && mask[i + 1] === mask[i] ? d[i + 1] + 1 : 1, i < n - GW && mask[i + GW] === mask[i] ? d[i + GW] + 1 : 1); }
  const seen = new Uint8Array(n), out = [];
  for (let s = 0; s < n; s++) {
    if (seen[s] || !mask[s]) continue;
    const st = [s]; seen[s] = 1; let best = s;
    while (st.length) {
      const i = st.pop(), gx = i % GW; if (d[i] > d[best]) best = i;
      for (const j of [gx > 0 ? i - 1 : -1, gx < GW - 1 ? i + 1 : -1, i - GW, i + GW]) if (j >= 0 && j < n && !seen[j] && mask[j] === mask[s]) { seen[j] = 1; st.push(j); }
    }
    out.push({ mask: mask[s], d: d[best], x: (best % GW) * G + 1.5, y: ((best / GW) | 0) * G + 1.5 });
  }
  return out;
}
const bits = m => { const o = []; for (let s = 0; m; s++, m >>>= 1) if (m & 1) o.push(s); return o; };

// A number that settles shapes right now: none left to switch on, or every undecided one is needed. st: 0 undecided, 1 on, 2 off.
export function force(clues, st) {
  for (let k = 0; k < clues.length; k++) {
    const c = clues[k]; let on = 0; const u = [];
    for (const s of c.over) { if (st[s] === 1) on++; else if (!st[s]) u.push(s); }
    if (u.length && (c.v === on || c.v === on + u.length)) return { k, shapes: u, v: c.v === on ? 2 : 1 };
  }
  return null;
}
function finishable(clues, n) {
  const st = new Array(n).fill(0); let f;
  while ((f = force(clues, st))) f.shapes.forEach(s => { st[s] = f.v; });
  return st.every(v => v);
}
// Start with a number in every roomy patch, then drop numbers while the picture can still be finished step by step.
// Lone-shape numbers go first, since they give the answer away. Null if even the full set is not enough.
function chooseClues(shapes, sol, big, R) {
  const n = shapes.length;
  let clues = big.map(p => { const over = bits(p.mask); return { x: p.x, y: p.y, d: p.d, over, v: over.filter(s => sol[s]).length }; });
  if (!finishable(clues, n)) return null;
  const order = shuffle(clues.filter(c => c.over.length === 1), R).concat(shuffle(clues.filter(c => c.over.length > 1), R)), cut = [];
  for (const c of order) { const rest = clues.filter(x => x !== c); if (finishable(rest, n)) { clues = rest; if (c.over.length > 1) cut.push(c); } }
  // A few spare numbers back in, so there is usually more than one place to make progress.
  return clues.concat(shuffle(cut, R).slice(0, Math.ceil(n / 3)));
}

export function art(i) { const S = SCENES[i]; return { shapes: S.s.map(make), sol: S.s.map(a => a[0][0] !== '-'), night: !!S.night }; }
export function makeLevel(i, R = Math.random) {
  const S = SCENES[i], shapes = S.s.map(make), sol = S.s.map(a => a[0][0] !== '-');
  return { shapes, sol, clues: chooseClues(shapes, sol, patches(shapes, 9).filter(p => p.d >= 4), R), name: S.name, night: !!S.night };
}

// Totems: endless symmetrical figures. A few shapes sit on the centre line and the rest come in mirrored pairs,
// so whatever is left switched on reads as a face, a creature or a mask rather than a scatter.
function randomUnit(R, centred) {
  const kind = ['c', 'c', 'e', 'b', 'p'][pick(R, 5)], y = between(R, 55, 325);
  const x = centred ? 180 : 180 - between(R, 45, 135);
  if (kind === 'c') return ['c', x, y, centred ? between(R, 30, 68) : between(R, 18, 46)];
  if (kind === 'e') return ['e', x, y, centred ? between(R, 34, 95) : between(R, 22, 52), centred ? between(R, 26, 70) : between(R, 16, 40), centred ? 0 : between(R, -0.9, 0.9)];
  if (kind === 'b') return centred ? ['b', x, y, between(R, 110, 300), between(R, 28, 44), R() < 0.6 ? 0 : HP] : ['b', x, y, between(R, 80, 170), between(R, 26, 34), between(R, -1.3, 1.3)];
  const b = centred ? between(R, 45, 85) : between(R, 28, 50), h = (centred ? between(R, 60, 120) : between(R, 45, 80)) * (R() < 0.5 ? 1 : -1);
  return ['p', [[x - b, y + h / 2], [x + b, y + h / 2], [x + (centred ? 0 : between(R, -b, b)), y - h / 2]]];
}
const mirror = a => {
  const b = a.slice();
  if (a[0] === 'p') b[1] = a[1].map(([x, y]) => [360 - x, y]).reverse(); else { b[1] = 360 - a[1]; if (a[0] !== 'c') b[5] = -a[5]; }
  return b;
};
export function makeEndless(R, size = 0) {
  const want = Math.min(7, 5 + size);
  for (let t = 0; t < 2400; t++) {
    // Ease off a little at a time if a figure this busy will not come together.
    const units = Math.max(4, want - Math.floor(t / 500)), crossings = t < 1200 ? 3 : 2;
    const night = R() < 0.3, pal = shuffle((night ? NIGHT : PAPER).slice(), R), centred = 2 + pick(R, 2), raw = [], sol = [];
    let off = 0;
    for (let u = 0; u < units; u++) {
      const a = randomUnit(R, u < centred), on = R() < 0.66; if (!on) off++;
      const col = pal[u % pal.length];
      for (const v of u < centred ? [a] : [a, mirror(a)]) { raw.push([...v, col]); sol.push(on); }
    }
    if (off < 1 || off > units / 2.5 || sol.filter(v => v).length < Math.min(6, units)) continue;
    const shapes = raw.map(make);
    if (shapes.some(s => { const b = bounds(s); return b[0] < 6 || b[1] < 6 || b[2] > W - 6 || b[3] > H - 6; })) continue;
    const P = patches(shapes, 3); if (!P) continue;
    const big = P.filter(p => p.d >= 4);
    if (shapes.some((s, i) => !big.some(p => p.mask >> i & 1))) continue;
    // The finished figure should hang together: enough places where two switched-on shapes cross.
    if (big.filter(p => bits(p.mask).filter(i => sol[i]).length > 1).length < crossings) continue;
    const clues = chooseClues(shapes, sol, big, R);
    if (!clues || clues.filter(c => c.over.length === 1).length > Math.ceil(shapes.length / 3) + 1) continue;
    return { shapes, sol, clues, name: null, night };
  }
  return makeLevel(0, R);
}

function path(ctx, s) {
  ctx.beginPath();
  if (s.k === 'c') { ctx.arc(s.x, s.y, s.r, 0, TAU); return; }
  if (s.k === 'e') { ctx.ellipse(s.x, s.y, s.w / 2, s.h / 2, s.a, 0, TAU); return; }
  if (s.k === 'p') { s.pts.forEach(([x, y], k) => { if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); return; }
  const c = Math.cos(s.a), n = Math.sin(s.a), hw = s.w / 2, hh = s.h / 2;
  [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].forEach(([u, v], k) => { const x = s.x + u * c - v * n, y = s.y + u * n + v * c; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.closePath();
}
const paperOf = p => (p.night ? '#17152b' : '#fbf6ea');

// A small still of the puzzle: the finished picture, or just its outlines if it has not been solved yet.
export function thumb(ctx, p, size, solved) {
  const k = size / H;
  ctx.save(); ctx.fillStyle = paperOf(p); ctx.fillRect(0, 0, size, size);
  ctx.translate((size - W * k) / 2, 0); ctx.scale(k, k);
  if (solved) {
    ctx.globalCompositeOperation = p.night ? 'screen' : 'multiply';
    p.shapes.forEach((s, i) => { if (p.sol[i]) { ctx.fillStyle = s.col; path(ctx, s); ctx.fill(); } });
  } else {
    ctx.lineWidth = 4; ctx.strokeStyle = p.night ? 'rgba(255,255,255,.55)' : 'rgba(59,51,70,.45)';
    p.shapes.forEach(s => { path(ctx, s); ctx.stroke(); });
  }
  ctx.restore();
}
export const sizeOf = () => ({ w: W, h: H });

export class Game {
  constructor(p, saved, sfx) {
    this.p = p; this.sfx = sfx;
    const n = p.shapes.length;
    this.st = saved && saved.st && saved.st.length === n ? saved.st.slice() : new Array(n).fill(0);
    this.hist = []; this.pop = new Array(n).fill(0);
    this.won = false; this.fade = 0; this.hintK = -1; this.hintT = 0; this.flash = -1; this.flashT = 0; this.t = 0; this.fx = new Fx();
  }
  get left() { return this.st.filter(v => !v).length; }
  save() { return { st: this.st }; }
  pickAt(x, y) {
    let best = -1;
    this.p.shapes.forEach((s, i) => { if (inside(s, x, y) && (best < 0 || s.area < this.p.shapes[best].area)) best = i; });
    return best;
  }
  solved() { return this.st.every((v, s) => (v === 1) === this.p.sol[s]); }
  tap(x, y) {
    if (this.won) return false;
    const i = this.pickAt(x, y); if (i < 0) return false;
    this.hist.push(this.st.slice());
    this.st[i] = (this.st[i] + 1) % 3; this.pop[i] = 1; this.hintK = -1;
    if (this.st[i] === 1) this.sfx.on(i); else this.sfx.off(this.st[i] === 2);
    this.check(); return true;
  }
  check() { if (!this.won && this.solved()) { this.won = true; this.st = this.st.map(v => v || 2); this.fx.confetti(W); this.sfx.win(); } }
  undo() { if (this.won || !this.hist.length) return false; this.st = this.hist.pop(); this.hintK = -1; return true; }
  clear() { if (this.won) return; this.hist.push(this.st.slice()); this.st.fill(0); this.hintK = -1; }
  // Returns a line of advice, or null when there is nothing to say.
  hint() {
    if (this.won) return null;
    const wrong = this.st.findIndex((v, s) => v && (v === 1) !== this.p.sol[s]);
    if (wrong >= 0) { this.hist.push(this.st.slice()); this.st[wrong] = 0; this.flash = wrong; this.flashT = 1; return 'That shape was wrong, so it is undecided again.'; }
    const f = force(this.p.clues, this.st); if (!f) return null;
    this.hintK = f.k; this.hintT = 0;
    return f.v === 1 ? 'This number needs every undecided shape on it.' : 'This number is already full, so the rest on it are off.';
  }
  frame(ctx, dt) {
    const o = this, p = this.p; o.t += dt; o.hintT += dt; o.flashT = Math.max(0, o.flashT - dt * 1.5);
    if (o.won) o.fade = Math.min(1, o.fade + dt * 1.2);
    o.fx.step(dt);
    const ink = p.night ? '255,255,255' : '59,51,70';
    ctx.clearRect(0, 0, W, H);
    ctx.save(); rr(ctx, 0, 0, W, H, 18); ctx.clip();
    ctx.fillStyle = paperOf(p); ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = p.night ? 'screen' : 'multiply';
    p.shapes.forEach((s, i) => { o.pop[i] = Math.max(0, o.pop[i] - dt * 4); if (o.st[i] === 1) { ctx.globalAlpha = 1 - o.pop[i] * 0.35; ctx.fillStyle = s.col; path(ctx, s); ctx.fill(); } });
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.lineJoin = 'round';
    p.shapes.forEach((s, i) => {
      const v = o.st[i], a = (v === 2 ? 0.28 : v === 1 ? 0.5 : 0.8) * (1 - o.fade), flashing = o.flash === i && o.flashT > 0;
      if (a <= 0.01 && !flashing) return;
      ctx.setLineDash(v === 2 ? [5, 6] : []); ctx.lineWidth = (v === 2 ? 1.5 : 2) + o.pop[i] * 3;
      ctx.strokeStyle = flashing ? `rgba(255,93,93,${Math.max(a, o.flashT)})` : `rgba(${ink},${a})`;
      path(ctx, s); ctx.stroke();
    });
    ctx.setLineDash([]); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (o.fade < 1) p.clues.forEach((c, k) => {
      let on = 0, un = 0; for (const s of c.over) { if (o.st[s] === 1) on++; else if (!o.st[s]) un++; }
      const done = !un && on === c.v, bad = on > c.v || on + un < c.v, hint = o.hintK === k, small = c.d < 5, r = (small ? 8.5 : 10) + (hint ? 2.5 + 2.5 * Math.sin(o.hintT * 8) : 0);
      ctx.globalAlpha = (1 - o.fade) * (done ? 0.75 : 1);
      if (hint) { ctx.fillStyle = 'rgba(255,122,89,.4)'; ctx.beginPath(); ctx.arc(c.x, c.y, r + 6, 0, TAU); ctx.fill(); }
      ctx.fillStyle = bad ? '#ff5d5d' : done ? '#35c27a' : '#fff'; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, TAU); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(59,51,70,.55)'; ctx.stroke();
      ctx.font = `700 ${small ? 11 : 13}px Fredoka, system-ui, sans-serif`; ctx.fillStyle = bad || done ? '#fff' : '#3b3346'; ctx.fillText(c.v, c.x, c.y + 0.5);
    });
    ctx.globalAlpha = 1; ctx.restore();
    o.fx.draw(ctx);
  }
}
