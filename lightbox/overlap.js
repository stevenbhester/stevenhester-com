// OVERLAP
// See-through shapes, each on or off. A number sits in some patches and says how many of the shapes covering that patch are on.
// While it is being solved a puzzle looks like an abstract composition, and the numbers are the only way in. They are
// chosen so it can always be finished by sure steps, with no guessing.
// The numbered levels each hide a picture: its few big plain shapes are the ones that end up on, mixed in with abstract
// decoys and shown in unrelated colours. Solving it brings in the real colours and the details, and the picture appears.
// Those levels are made ahead of time by tools/build-overlap.mjs from overlap-pictures.js. Endless and daily puzzles are
// plain compositions, made on the spot.
import { TAU, HP, rr, Fx, shuffle, pick, between, finger } from './util.js';
import LEVELS from './overlap-levels.js';

export const id = 'overlap';
export const title = 'Overlap';
export const blurb = 'Switch on the right shapes. See what they were hiding.';
export const endlessName = 'Sketches', endlessOne = 'Sketch';
export const howto = [
  'A number counts the switched-on shapes under it.',
  'Tap: on. Tap again: off (dashed). Tap again: clear.',
  'Stuck? Imagine a shape on. If a number breaks, that shape is off.',
  'Where shapes overlap, a tap goes to the smallest one.',
];
export const W = 360, H = 378;
const G = 3, GW = 120, GH = 126;
const PAPER = ['#ff8f70', '#ffd54d', '#74b9ff', '#7fdcae', '#c7a0ff', '#ff9fcd', '#5fd4d0', '#d9a878'];
const NIGHT = ['#ffe9a8', '#3a5cc0', '#2c9a94', '#6f55c8', '#2f6fd0', '#e0567a', '#ffd54d', '#e08a3c'];

export const levels = LEVELS.map(s => ({ id: s.id, name: s.name }));

// Scene shapes are written compactly: kind, numbers, colour. A leading '-' on the kind marks a decoy.
export function make(a) {
  const k = a[0].replace('-', ''), col = a[a.length - 1];
  const s = k === 'c' ? { k, x: a[1], y: a[2], r: a[3], area: Math.PI * a[3] * a[3] }
    : k === 'e' ? { k, x: a[1], y: a[2], w: a[3] * 2, h: a[4] * 2, a: a[5], area: Math.PI * a[3] * a[4] }
    : k === 'b' ? { k, x: a[1], y: a[2], w: a[3], h: a[4], a: a[5], area: a[3] * a[4] }
    : k === 's' ? { k, pts: a[1], w: a[2], area: 0 }
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
export function bounds(s) {
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
    const st = [s]; seen[s] = 1; let best = s, size = 0;
    while (st.length) {
      const i = st.pop(), gx = i % GW; size++; if (d[i] > d[best]) best = i;
      for (const j of [gx > 0 ? i - 1 : -1, gx < GW - 1 ? i + 1 : -1, i - GW, i + GW]) if (j >= 0 && j < n && !seen[j] && mask[j] === mask[s]) { seen[j] = 1; st.push(j); }
    }
    out.push({ mask: mask[s], d: d[best], size: size * G * G, x: (best % GW) * G + 1.5, y: ((best / GW) | 0) * G + 1.5 });
  }
  return out;
}
export const bits = m => { const o = []; for (let s = 0; m; s++, m >>>= 1) if (m & 1) o.push(s); return o; };

// One sure step from where things stand, or null. st: 0 undecided, 1 on, 2 off.
// The plain step uses a single number: nothing left to switch on under it, or every undecided shape under it is needed.
// Two harder steps are used when `deep` is set:
//  - comparing two numbers that share shapes: if one needs more than the other by exactly as many as the shapes only it
//    covers, those are all on and the shapes only the other covers are all off;
//  - trying a shape: if switching it on (or off) makes some number impossible within a few plain steps, it is the other.
// A step is { ks: the number(s) used, on: shapes to switch on, off: shapes to mark off, tried: the shape tested, if any }.
export function force(clues, st, pairs) {
  const left = clues.map(c => { let need = c.v; const u = []; for (const s of c.over) { if (st[s] === 1) need--; else if (!st[s]) u.push(s); } return { need, u }; });
  for (let k = 0; k < clues.length; k++) {
    const { need, u } = left[k]; if (!u.length) continue;
    if (need === 0) return { ks: [k], on: [], off: u };
    if (need === u.length) return { ks: [k], on: u, off: [] };
  }
  if (pairs) for (let a = 0; a < clues.length; a++) {
    const A = left[a]; if (!A.u.length) continue;
    for (let b = 0; b < clues.length; b++) {
      const B = left[b]; if (a === b || !B.u.length) continue;
      const onlyA = A.u.filter(s => !B.u.includes(s)), onlyB = B.u.filter(s => !A.u.includes(s));
      if (onlyA.length === A.u.length || (!onlyA.length && !onlyB.length)) continue;
      if (A.need - B.need === onlyA.length) return { ks: [a, b], on: onlyA, off: onlyB };
    }
  }
  if (pairs) for (let s = 0; s < st.length; s++) {
    if (st[s]) continue;
    for (const v of [1, 2]) { const k = breaks(clues, st, s, v); if (k >= 0) return { ks: [k], on: v === 2 ? [s] : [], off: v === 1 ? [s] : [], tried: s }; }
  }
  return null;
}
// Suppose shape s had value v. Follow up to three plain steps; return a number that can no longer be met, or -1.
function breaks(clues, st0, s, v) {
  const st = st0.slice(); st[s] = v;
  for (let round = 0; round <= 3; round++) {
    let moved = false;
    for (let k = 0; k < clues.length; k++) {
      const c = clues[k]; let need = c.v, u = 0;
      for (const q of c.over) { if (st[q] === 1) need--; else if (!st[q]) u++; }
      if (need < 0 || need > u) return k;
      if (u && round < 3 && (need === 0 || need === u)) { for (const q of c.over) if (!st[q]) st[q] = need ? 1 : 2; moved = true; }
    }
    if (!moved) break;
  }
  return -1;
}
// Plays the sure steps through. `ok` says whether they finish the picture; `hard` counts the steps that needed a harder step.
export function playThrough(clues, n, pairs) {
  const st = new Array(n).fill(0); let f, hard = 0;
  while ((f = force(clues, st, pairs))) { f.on.forEach(s => { st[s] = 1; }); f.off.forEach(s => { st[s] = 2; }); if (f.ks.length > 1 || f.tried !== undefined) hard++; }
  return { ok: st.every(v => v), hard };
}
// Start with a number in every roomy patch, then drop numbers while the picture can still be finished by sure steps.
// Lone-shape numbers go first, since they give the answer away. Null if even the full set is not enough.
// opts.pairs: allow the two-number step, which lets more numbers go and makes the picture harder.
// opts.spares: how many dropped numbers to put back, so there is more than one place to make progress.
export function chooseClues(shapes, sol, big, R, opts = {}) {
  const n = shapes.length, pairs = !!opts.pairs;
  let clues = big.map(p => { const over = bits(p.mask); return { x: p.x, y: p.y, d: p.d, over, v: over.filter(s => sol[s]).length }; });
  if (!playThrough(clues, n, pairs).ok) return null;
  // Giveaway numbers go first: a 0, or a number equal to the shapes under it, settles those shapes at a glance.
  // With the harder steps allowed every giveaway is tried before any other number, which leaves the ones that need thought.
  const easy = c => (c.v === 0 || c.v === c.over.length ? (c.over.length === 1 ? 0 : 1) : 2);
  const order = shuffle(clues.slice(), R).sort((a, b) => (pairs ? easy(a) - easy(b) : (a.over.length > 1) - (b.over.length > 1))), cut = [];
  for (const c of order) { const rest = clues.filter(x => x !== c); if (playThrough(rest, n, pairs).ok) { clues = rest; if (c.over.length > 1) cut.push(c); } }
  return clues.concat(shuffle(cut, R).slice(0, opts.spares || 0));
}

// A level's hidden picture: the other switched-on shapes as a soft backdrop, the picture's own shapes in their true
// colours, then the details. `bg` is the sheet behind it all, if not paper.
export function art(i) {
  const L = LEVELS[i], shapes = L.shapes.map(make), sol = L.sol.map(Boolean);
  const mine = new Set(L.order), back = shapes.filter((s, k) => sol[k] && !mine.has(k));
  const picture = { bg: L.bg || null, back, parts: L.order.map(k => ({ ...shapes[k], col: L.cols[k] })), extras: L.extras.map(make) };
  return { shapes, sol, night: false, picture };
}
export function makeLevel(i) { const L = LEVELS[i]; return { ...art(i), clues: L.clues, name: L.name }; }

// COMPOSITIONS
// Every puzzle is an abstract composition: shapes laid out in one of a few styles, with which ones are on chosen at
// random. Nothing about the layout hints at the answer, so the numbers are the only way in.
const ANGLES = [0, 0, HP, HP, Math.PI / 6, -Math.PI / 6, Math.PI / 4, -Math.PI / 4, Math.PI / 3, -Math.PI / 3];
const circle = (R, lo, hi) => { const r = between(R, lo, hi); return ['c', between(R, r + 8, W - r - 8), between(R, r + 8, H - r - 8), r]; };
const strip = (R, a) => ['b', between(R, 30, W - 30), between(R, 30, H - 30), between(R, 130, 270), between(R, 30, 52), a];
const mirror = a => {
  const b = a.slice();
  if (a[0] === 'p') b[1] = a[1].map(([x, y]) => [360 - x, y]).reverse(); else { b[1] = 360 - a[1]; if (a[0] !== 'c') b[5] = -a[5]; }
  return b;
};
function totemUnit(R, centred) {
  const kind = ['c', 'c', 'e', 'b', 'p'][pick(R, 5)], y = between(R, 55, 325), x = centred ? 180 : 180 - between(R, 45, 135);
  if (kind === 'c') return ['c', x, y, centred ? between(R, 30, 68) : between(R, 18, 46)];
  if (kind === 'e') return ['e', x, y, centred ? between(R, 34, 95) : between(R, 22, 52), centred ? between(R, 26, 70) : between(R, 16, 40), centred ? 0 : between(R, -0.9, 0.9)];
  if (kind === 'b') return centred ? ['b', x, y, between(R, 110, 300), between(R, 28, 44), R() < 0.6 ? 0 : HP] : ['b', x, y, between(R, 80, 170), between(R, 26, 34), between(R, -1.3, 1.3)];
  const b = centred ? between(R, 45, 85) : between(R, 28, 50), h = (centred ? between(R, 60, 120) : between(R, 45, 80)) * (R() < 0.5 ? 1 : -1);
  return ['p', [[x - b, y + h / 2], [x + b, y + h / 2], [x + (centred ? 0 : between(R, -b, b)), y - h / 2]]];
}
// Each style returns groups of shapes. A group shares one colour and is on or off together (a mirrored pair, usually just one shape).
export const STYLES = {
  // Circles and long strips thrown down anywhere.
  scatter: (R, n) => Array.from({ length: n }, () => [R() < 0.55 ? circle(R, 34, 74) : strip(R, ANGLES[pick(R, 10)])]),
  // Glowing circles of very different sizes on a dark ground.
  circles: (R, n) => Array.from({ length: n }, (_, i) => [circle(R, i < 2 ? 56 : 22, i < 2 ? 84 : 58)]),
  // Discs inside discs, with a few loose ones.
  discs: (R, n) => {
    const out = [];
    while (out.length < n) {
      const big = circle(R, 56, 86); out.push([big]);
      for (let r = big[3] - between(R, 24, 34); out.length < n && r > 22 && R() < 0.8; r -= between(R, 24, 34)) out.push([['c', big[1] + between(R, -7, 7), big[2] + between(R, -7, 7), r]]);
      if (out.length < n && R() < 0.5) out.push([circle(R, 24, 44)]);
    }
    return out;
  },
  // Broad tilted slabs and strips around one big circle.
  planes: (R, n) => Array.from({ length: n }, (_, i) => [i === 0 ? circle(R, 52, 80)
    : R() < (n > 9 ? 0.25 : 0.5) ? ['b', between(R, 60, W - 60), between(R, 60, H - 60), between(R, 90, n > 9 ? 150 : 190), between(R, 60, n > 9 ? 95 : 118), between(R, -0.6, 0.6)] : strip(R, between(R, -1.4, 1.4))]),
  // Symmetrical figures: a few shapes on the centre line and the rest in mirrored pairs.
  totem: (R, n) => {
    const out = [], centred = 2 + pick(R, 2); let count = 0;
    for (let u = 0; count < n; u++) { const a = totemUnit(R, u < centred); out.push(u < centred ? [a] : [a, mirror(a)]); count += u < centred ? 1 : 2; }
    return out;
  },
};
const ORDER = ['scatter', 'discs', 'planes', 'circles', 'totem'];

// A loose abstract shape to hide a picture among: a circle, strip, ellipse or triangle, sometimes as a mirrored pair
// so that the picture's own symmetry does not stand out.
function decoy(R) {
  const r = R(), a = r < 0.42 ? circle(R, 30, 72) : r < 0.62 ? strip(R, ANGLES[pick(R, 10)])
    : r < 0.82 ? ['e', between(R, 60, W - 60), between(R, 60, H - 60), between(R, 30, 80), between(R, 24, 58), between(R, -1.5, 1.5)]
    : (() => { const x = between(R, 70, W - 70), y = between(R, 70, H - 70), t = R() * TAU; return ['p', [0, 2.1 + between(R, -0.4, 0.4), 4.2 + between(R, -0.4, 0.4)].map(d => { const q = between(R, 46, 80); return [x + Math.cos(t + d) * q, y + Math.sin(t + d) * q]; })]; })();
  return R() < 0.3 && bounds(make([...a, ''])) [2] < 168 ? [a, mirror(a)] : [a];
}

// One composition in the given style with about n shapes, or null if none came together.
// opts: { spares, pairs } as for chooseClues, plus tries, plus cores (the shapes of a hidden picture, which stay on).
export function compose(R, style, n, opts = {}) {
  const tries = opts.tries || 1500;
  for (let t = 0; t < tries; t++) {
    const night = style === 'circles' || (style === 'totem' && R() < 0.3), pal = shuffle((night ? NIGHT : PAPER).slice(), R);
    const cores = opts.cores || [], raw = [], sol = [], fixed = [];
    let groups, on, own = [];
    if (cores.length) {
      // A hidden picture: its shapes are on, and loose abstract shapes are added around them. Some of those are on
      // as well (they become the backdrop), so that about three groups in five are on and a 0 is not the usual answer.
      groups = cores.map(a => [a]); let count = cores.length;
      while (count < n) { const g = decoy(R); groups.push(g); count += g.length; }
      const extra = Math.max(0, Math.round(groups.length * 0.6) - cores.length), loose = shuffle(groups.map((g, i) => i).slice(cores.length), R).slice(0, extra);
      on = groups.map((g, i) => i < cores.length || loose.includes(i));
      // Shuffle the order so the picture's shapes are not always the first ones listed.
      const mix = shuffle(groups.map((g, i) => i), R); groups = mix.map(i => groups[i]); on = mix.map(i => on[i]); own = mix.map(i => i < cores.length);
    } else {
      groups = STYLES[style](R, n);
      // About three groups in five are on, picked at random.
      on = shuffle(groups.map((g, i) => i < Math.round(groups.length * 0.6)), R);
    }
    groups.forEach((g, i) => g.forEach(a => { raw.push([...a, pal[i % pal.length]]); sol.push(on[i]); fixed.push(!!own[i]); }));
    const shapes = raw.map(make);
    // The picture's own shapes are placed by hand and may run to the edge; everything else must sit inside the sheet.
    if (shapes.some((s, i) => { if (fixed[i]) return false; const b = bounds(s); return b[0] < 6 || b[1] < 6 || b[2] > W - 6 || b[3] > H - 6; })) continue;
    const P = patches(shapes, 3); if (!P) continue;
    const big = P.filter(p => p.d >= 5);
    if (shapes.some((s, i) => !big.some(p => p.mask >> i & 1))) continue;
    // Decoys should run through the picture, not sit beside it: most must cross one of its shapes.
    if (cores.length) { const off = shapes.map((s, i) => i).filter(i => !sol[i]); if (off.filter(i => big.some(p => p.mask >> i & 1 && bits(p.mask).some(k => sol[k]))).length < off.length * 0.7) continue; }
    // Enough places where shapes cross, so the numbers have something to say about each other.
    if (big.filter(p => p.mask & (p.mask - 1)).length < shapes.length - (t < tries / 2 ? 1 : 3)) continue;
    // A tap goes to the smallest shape under it, so every shape needs room where it is the smallest.
    const tap = shapes.map(() => 0);
    P.forEach(p => { const over = bits(p.mask); tap[over.reduce((a, b) => (shapes[b].area < shapes[a].area ? b : a))] += p.size; });
    if (Math.min(...tap) < 700) continue;
    const clues = chooseClues(shapes, sol, big, R, opts);
    if (!clues || clues.filter(c => c.over.length === 1).length > Math.ceil(shapes.length / 3) + 1) continue;
    if (opts.pairs && t < tries * 0.6 && !playThrough(clues, shapes.length, true).hard) continue;
    return { raw, sol, clues, night: cores.length ? false : night, style };
  }
  return null;
}
// Endless compositions: the styles take turns, and they grow and lose their spare numbers as the count goes up.
export function makeEndless(R, size = 0) {
  const n = Math.min(12, 6 + Math.floor(size / 2)), opts = size < 3 ? { spares: 1 } : size < 8 ? {} : { pairs: true };
  for (let k = 0; k < ORDER.length; k++) {
    const c = compose(R, ORDER[(size + k) % ORDER.length], n, { ...opts, tries: 700 });
    if (c) return { shapes: c.raw.map(make), sol: c.sol, clues: c.clues, name: null, night: c.night };
  }
  return makeLevel(0);
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
function paint(ctx, s) {
  if (s.k === 's') {
    const [a, b, c] = s.pts; ctx.strokeStyle = s.col; ctx.lineWidth = s.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // The stroke passes through its middle point, so a smile or a whisker bends where it was drawn.
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(2 * b[0] - (a[0] + c[0]) / 2, 2 * b[1] - (a[1] + c[1]) / 2, c[0], c[1]); ctx.stroke(); return;
  }
  ctx.fillStyle = s.col; path(ctx, s); ctx.fill();
}
const centreOf = s => (s.pts ? [s.pts.reduce((t, q) => t + q[0], 0) / s.pts.length, s.pts.reduce((t, q) => t + q[1], 0) / s.pts.length] : [s.x, s.y]);
// The hidden picture in flat colour. `t` is seconds since it was solved: the sheet and big shapes fade in, then the
// details pop in one after another. Leave `t` out for the finished picture.
function drawPicture(ctx, pic, t = 99) {
  const a = Math.max(0, Math.min(1, (t - 0.35) / 0.6)); if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = pic.bg || '#fbf6ea'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = a * 0.3; pic.back.forEach(s => paint(ctx, s)); ctx.globalAlpha = a;
  pic.parts.forEach(s => paint(ctx, s));
  pic.extras.forEach((s, i) => {
    const k = Math.max(0, Math.min(1, (t - 1.05 - i * 0.055) / 0.22)); if (k <= 0) return;
    const z = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2), [cx, cy] = centreOf(s);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy); paint(ctx, s); ctx.restore();
  });
  ctx.restore();
}

// A small still of the puzzle: the finished picture, or just its outlines if it has not been solved yet.
export function thumb(ctx, p, size, solved) {
  const k = size / H;
  ctx.save(); ctx.fillStyle = paperOf(p); ctx.fillRect(0, 0, size, size);
  ctx.translate((size - W * k) / 2, 0); ctx.scale(k, k);
  if (solved && p.picture) drawPicture(ctx, p.picture);
  else if (solved) {
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
    this.won = false; this.fade = 0; this.hintK = []; this.hintT = 0; this.flash = -1; this.flashT = 0; this.t = 0; this.fx = new Fx();
    this.coach = false; this.spots = []; this.wonT = 0;
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
    this.st[i] = (this.st[i] + 1) % 3; this.pop[i] = 1; this.hintK = [];
    if (this.st[i] === 1) this.sfx.on(i); else this.sfx.off(this.st[i] === 2);
    this.check(); return true;
  }
  check() { if (!this.won && this.solved()) { this.won = true; this.st = this.st.map(v => v || 2); this.fx.confetti(W); this.sfx.win(); } }
  undo() { if (this.won || !this.hist.length) return false; this.st = this.hist.pop(); this.hintK = []; return true; }
  clear() { if (this.won) return; this.hist.push(this.st.slice()); this.st.fill(0); this.hintK = []; }
  // Returns a line of advice, or null when there is nothing to say.
  hint() {
    if (this.won) return null;
    const wrong = this.st.findIndex((v, s) => v && (v === 1) !== this.p.sol[s]);
    if (wrong >= 0) { this.hist.push(this.st.slice()); this.st[wrong] = 0; this.flash = wrong; this.flashT = 1; return 'That shape was wrong, so it is undecided again.'; }
    const f = force(this.p.clues, this.st, true); if (!f) return null;
    this.hintK = f.ks; this.hintT = 0;
    if (f.tried !== undefined) { this.flash = f.tried; this.flashT = 1.6; return `Try the flashing shape ${f.on.length ? 'off' : 'on'}: this number stops working. So it must be ${f.on.length ? 'on' : 'off'}.`; }
    if (f.ks.length > 1) return 'Compare these two numbers. The shapes under only one of them are settled.';
    return f.on.length ? 'This number needs every undecided shape under it.' : 'This number is already full, so the rest under it are off.';
  }
  // The roomiest place where a tap reaches this shape.
  spot(s) {
    if (this.spots[s]) return this.spots[s];
    let best = null, bd = -99;
    for (let y = 3; y < H; y += 3) for (let x = 3; x < W; x += 3) {
      if (this.pickAt(x, y) !== s) continue;
      let d = 1; while (d < 14 && [[d, 0], [-d, 0], [0, d], [0, -d]].every(([a, b]) => this.pickAt(x + a * 3, y + b * 3) === s)) d++;
      // Keep clear of the numbers, so a pointing finger does not sit on top of one.
      if (this.p.clues.some(c => Math.hypot(c.x - x, c.y - y) < 30)) d -= 6;
      if (d > bd) { bd = d; best = { x, y }; }
    }
    return (this.spots[s] = best);
  }
  // The next sure move as a place to tap and how many taps it takes. Used by the pointing finger and the animated how-to.
  autoStep() {
    if (this.won) return null;
    let s = this.st.findIndex((v, i) => v && (v === 1) !== this.p.sol[i]), want;
    if (s >= 0) want = this.p.sol[s] ? 1 : 2;
    else { const f = force(this.p.clues, this.st, true); if (!f) return null; s = f.on.length ? f.on[0] : f.off[0]; want = f.on.length ? 1 : 2; }
    const at = this.spot(s); if (!at) return null;
    return { x: at.x, y: at.y, taps: (want - this.st[s] + 3) % 3 };
  }
  frame(ctx, dt) {
    const o = this, p = this.p; o.t += dt; o.hintT += dt; o.flashT = Math.max(0, o.flashT - dt * 1.5);
    if (o.won) { o.fade = Math.min(1, o.fade + dt * 1.2); o.wonT += dt; }
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
      const done = !un && on === c.v, bad = on > c.v || on + un < c.v, hint = o.hintK.includes(k), small = c.d < 5, r = (small ? 8.5 : 10) + (hint ? 2.5 + 2.5 * Math.sin(o.hintT * 8) : 0);
      ctx.globalAlpha = (1 - o.fade) * (done ? 0.75 : 1);
      if (hint) { ctx.fillStyle = 'rgba(255,122,89,.4)'; ctx.beginPath(); ctx.arc(c.x, c.y, r + 6, 0, TAU); ctx.fill(); }
      ctx.fillStyle = bad ? '#ff5d5d' : done ? '#35c27a' : '#fff'; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, TAU); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(59,51,70,.55)'; ctx.stroke();
      ctx.font = `700 ${small ? 11 : 13}px Fredoka, ui-rounded, system-ui, sans-serif`; ctx.fillStyle = bad || done ? '#fff' : '#3b3346'; ctx.fillText(c.v, c.x, c.y + 0.5);
    });
    ctx.globalAlpha = 1;
    if (o.won && p.picture) drawPicture(ctx, p.picture, o.wonT);
    ctx.restore();
    if (o.coach && !o.won) { const a = o.autoStep(); if (a) finger(ctx, a.x, a.y, o.t, a.taps); }
    o.fx.draw(ctx);
  }
}

// Tiny puzzles for the animated how-to. Each is played by the same sure steps the game checks for.
const tiny = (raw, sol, clues, caption) => ({ puzzle: { shapes: raw.map(make), sol, clues, night: false, name: null }, caption, view: { y: 100, h: 180 } });
export const demos = [
  tiny([['c', 180, 190, 64, '#ff8f70']], [true], [{ x: 180, y: 170, d: 9, over: [0], v: 1 }], '1 = on'),
  tiny([['c', 180, 190, 64, '#74b9ff']], [false], [{ x: 180, y: 170, d: 9, over: [0], v: 0 }], '0 = off'),
  tiny([['c', 135, 190, 66, '#ff8f70'], ['c', 225, 190, 66, '#ffd54d']], [true, true], [{ x: 180, y: 190, d: 9, over: [0, 1], v: 2 }], '2 = both on'),
  tiny([['c', 135, 190, 66, '#7fdcae'], ['c', 225, 190, 66, '#ff9fcd']], [false, true], [{ x: 180, y: 190, d: 9, over: [0, 1], v: 1 }, { x: 96, y: 190, d: 9, over: [0], v: 0 }], 'Count the shapes under each number'),
];

