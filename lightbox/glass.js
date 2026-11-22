// STAINED GLASS
// A window cut into panes. Each row and column number is how many squares in that line are lit. A pane is lit or dark as a whole.
// Windows are cut so they can always be finished one line at a time: some row or column settles a pane outright, with no guessing.
import { rr, Fx, pick, shuffle } from './util.js';
import LEVELS from './glass-levels.js';

export const id = 'glass';
export const title = 'Stained Glass';
export const blurb = 'Light the right panes to reveal the window.';
export const endlessName = 'Masks';
export const howto = [
  'Each number is how many squares in that row or column are lit.',
  'Tap a pane to light all of it. Tap again to mark it dark. Tap once more to clear it.',
  'If a pane has more squares in a line than the line’s number, it must be dark.',
  'A number turns green when its line is finished, and red when it cannot work.',
];
export const W = 360;
const GUT = 30;
export const PAL = { r: '#ff5d5d', p: '#ffb3c1', y: '#ffc53d', o: '#ff8a3d', w: '#fff7ea', t: '#e8c08a', n: '#a8683a', b: '#4d8dff', m: '#7a4a22', g: '#35c27a', v: '#a26bf5', c: '#5fd4d0', k: '#3b3f6b' };

export const levels = LEVELS.map(l => ({ id: l.id, name: l.label }));

// Each line: the panes that cross it, how many squares each has in it, and how many squares must be lit.
function lines(N, pane, sol) {
  const out = [];
  for (let k = 0; k < 2 * N; k++) {
    const m = new Map(); let target = 0;
    for (let j = 0; j < N; j++) { const i = k < N ? k * N + j : j * N + (k - N); m.set(pane[i], (m.get(pane[i]) || 0) + 1); if (sol[pane[i]]) target++; }
    out.push({ panes: [...m.keys()], cnt: [...m.values()], target });
  }
  return out;
}
// A pane one line settles on its own: lit in every way of reaching the line's number, or in none. st: 0 undecided, 1 lit, 2 dark.
export function deduce(L, st) {
  for (let k = 0; k < L.length; k++) {
    const ln = L[k]; let need = ln.target; const u = [];
    ln.panes.forEach((p, j) => { if (st[p] === 1) need -= ln.cnt[j]; else if (!st[p]) u.push(j); });
    if (!u.length) continue; let can1 = 0, can0 = 0;
    for (let m = 0; m < 1 << u.length; m++) { let s = 0; for (let j = 0; j < u.length; j++) if (m >> j & 1) s += ln.cnt[u[j]]; if (s === need) { can1 |= m; can0 |= ~m; } }
    for (let j = 0; j < u.length; j++) { if (!(can1 >> j & 1)) return { p: ln.panes[u[j]], v: 2, k }; if (!(can0 >> j & 1)) return { p: ln.panes[u[j]], v: 1, k }; }
  }
  return null;
}
// Cut a picture into panes at random: each pane grows through neighbouring squares of the same colour.
function cut(pic, maxSize, R) {
  const N = pic.length, pane = new Array(N * N).fill(-1); let n = 0;
  for (const s of shuffle([...pane.keys()], R)) {
    if (pane[s] >= 0) continue;
    const want = 1 + pick(R, maxSize), cells = [s]; pane[s] = n;
    while (cells.length < want) {
      const f = [];
      for (const c of cells) { const r = (c / N) | 0, q = c % N; for (const [dr, dq] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const r2 = r + dr, q2 = q + dq; if (r2 < 0 || q2 < 0 || r2 >= N || q2 >= N) continue; const j = r2 * N + q2; if (pane[j] < 0 && pic[r2][q2] === pic[r][q]) f.push(j); } }
      if (!f.length) break; const j = f[pick(R, f.length)]; pane[j] = n; cells.push(j);
    }
    n++;
  }
  return { pane, n };
}
// Try many cuts and keep the chunkiest one that can be finished line by line. Null if none can.
export function bestCut(pic, tries, R = Math.random) {
  const N = pic.length, flat = pic.join(''); let best = null;
  for (let t = 0; t < tries; t++) {
    const { pane, n } = cut(pic, N > 8 ? 6 : 5, R), sol = new Array(n).fill(false);
    pane.forEach((p, i) => { if (flat[i] !== '.') sol[p] = true; });
    const L = lines(N, pane, sol), st = new Array(n).fill(0); let d;
    while ((d = deduce(L, st))) st[d.p] = d.v;
    if (st.every(v => v) && (!best || n < best.n)) best = { pane, n };
  }
  return best && best.pane;
}
function build(pic, pane, label) {
  const N = pic.length, flat = pic.join(''), count = Math.max(...pane) + 1, sol = new Array(count).fill(false), col = new Array(count);
  const inks = [...new Set(flat.replace(/\./g, '').split(''))];
  pane.forEach((p, i) => { if (flat[i] !== '.') { sol[p] = true; col[p] = PAL[flat[i]]; } });
  // Panes that belong dark still get a colour, so lighting one by mistake does not give itself away.
  for (let p = 0; p < count; p++) if (!col[p]) col[p] = PAL[inks[(p * 7 + N) % inks.length]];
  return { N, pane, sol, col, flat, lines: lines(N, pane, sol), name: label };
}
export const art = i => makeLevel(i);
export function makeLevel(i) { const l = LEVELS[i]; return build(l.pic, l.panes, l.label); }

// Masks: endless symmetrical faces. Half a grid is filled at random, denser toward the middle, then mirrored,
// with a band of a second colour and a pair of eyes.
export function makeEndless(R, size = 0) {
  const N = size < 2 ? 7 : size < 5 ? 8 : 9, half = Math.ceil(N / 2);
  for (let t = 0; t < 400; t++) {
    const inks = shuffle(['r', 'o', 'y', 'b', 'v', 'g', 'c', 'p'], R), g = Array.from({ length: N }, () => new Array(N).fill('.'));
    for (let r = 0; r < N; r++) for (let c = 0; c < half; c++) {
      const dx = (half - 1 - c) / half, dy = Math.abs(r - (N - 1) / 2) / (N / 2);
      if (R() < 0.98 - 0.6 * dx - 0.4 * dy * dy) g[r][c] = inks[0];
    }
    for (let r = 0; r < N; r++) for (let c = 0; c < half; c++) {
      if (g[r][c] === '.') continue;
      const near = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => a >= 0 && a < N && b >= 0 && g[a][Math.min(b, N - 1 - b)] !== '.').length;
      if (!near) g[r][c] = '.';
    }
    const band = 1 + pick(R, N - 2), thick = 1 + pick(R, 2);
    for (let r = band; r < Math.min(N, band + thick); r++) for (let c = 0; c < half; c++) if (g[r][c] !== '.' && R() < 0.85) g[r][c] = inks[1];
    const er = 1 + pick(R, Math.max(1, half - 2)), ec = pick(R, half - 1);
    if (g[er][ec] === '.') continue;
    g[er][ec] = R() < 0.5 ? 'w' : 'k';
    if (R() < 0.5 && g[er + 1] && g[er + 1][ec] !== '.') g[er + 1][ec] = inks[2];
    for (let r = 0; r < N; r++) for (let c = 0; c < half; c++) g[r][N - 1 - c] = g[r][c];
    const pic = g.map(row => row.join('')), lit = pic.join('').replace(/\./g, '').length / (N * N);
    if (lit < 0.42 || lit > 0.74) continue;
    const pane = bestCut(pic, 40, R); if (!pane) continue;
    return build(pic, pane, null);
  }
  return makeLevel(0);
}

export const sizeOf = p => { const cell = Math.floor((W - GUT - 6) / p.N); return { w: W, h: GUT + p.N * cell + 6 }; };

// A small still of the puzzle: the finished window, or just its lead lines if it has not been solved yet.
export function thumb(ctx, p, size, solved) {
  const N = p.N, pad = Math.round(size * 0.08), c = (size - pad * 2) / N;
  ctx.save(); ctx.fillStyle = '#514a63'; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < N * N; i++) {
    const x = pad + (i % N) * c, y = pad + ((i / N) | 0) * c;
    ctx.fillStyle = solved ? (p.sol[p.pane[i]] ? p.col[p.pane[i]] : '#514a63') : '#d3dae1'; ctx.fillRect(x, y, c + 0.6, c + 0.6);
  }
  if (!solved) {
    ctx.strokeStyle = '#2b2535'; ctx.lineWidth = Math.max(1.5, size / 60); ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < N * N; i++) {
      const q = i % N, r = (i / N) | 0, x = pad + q * c, y = pad + r * c;
      if (q < N - 1 && p.pane[i] !== p.pane[i + 1]) { ctx.moveTo(x + c, y); ctx.lineTo(x + c, y + c); }
      if (r < N - 1 && p.pane[i] !== p.pane[i + N]) { ctx.moveTo(x, y + c); ctx.lineTo(x + c, y + c); }
    }
    ctx.stroke();
  }
  ctx.restore();
}

export class Game {
  constructor(p, saved, sfx) {
    this.p = p; this.sfx = sfx;
    const n = p.sol.length, sz = sizeOf(p);
    this.H = sz.h; this.cell = Math.floor((W - GUT - 6) / p.N);
    this.st = saved && saved.st && saved.st.length === n ? saved.st.slice() : new Array(n).fill(0);
    this.hist = []; this.pop = new Array(n).fill(0);
    this.won = false; this.hintK = -1; this.hintP = -1; this.flash = -1; this.flashT = 0; this.t = 0; this.fx = new Fx();
  }
  get left() { return this.st.filter(v => !v).length; }
  save() { return { st: this.st }; }
  solved() { return this.st.every((v, q) => (v === 1) === this.p.sol[q]); }
  tap(x, y) {
    if (this.won) return false;
    const c = Math.floor((x - GUT) / this.cell), r = Math.floor((y - GUT) / this.cell), N = this.p.N;
    if (c < 0 || r < 0 || c >= N || r >= N) return false;
    const p = this.p.pane[r * N + c];
    this.hist.push(this.st.slice());
    this.st[p] = (this.st[p] + 1) % 3; this.pop[p] = 1; this.hintK = this.hintP = -1;
    if (this.st[p] === 1) this.sfx.on(p); else this.sfx.off(this.st[p] === 2);
    this.check(); return true;
  }
  check() { if (!this.won && this.solved()) { this.won = true; this.st = this.st.map(v => v || 2); this.fx.confetti(W); this.sfx.win(); } }
  undo() { if (this.won || !this.hist.length) return false; this.st = this.hist.pop(); this.hintK = this.hintP = -1; return true; }
  clear() { if (this.won) return; this.hist.push(this.st.slice()); this.st.fill(0); this.hintK = this.hintP = -1; }
  hint() {
    if (this.won) return null;
    const wrong = this.st.findIndex((v, p) => v && (v === 1) !== this.p.sol[p]);
    if (wrong >= 0) { this.hist.push(this.st.slice()); this.st[wrong] = 0; this.flash = wrong; this.flashT = 1; return 'That pane was wrong, so it is undecided again.'; }
    const d = deduce(this.p.lines, this.st); if (!d) return null;
    this.hintK = d.k; this.hintP = d.p;
    return `This ${d.k < this.p.N ? 'row' : 'column'} settles the flashing pane.`;
  }
  // The next sure move as a place to tap and how many taps it takes. Used by the animated how-to.
  autoStep() {
    if (this.won) return null;
    let q = this.st.findIndex((v, i) => v && (v === 1) !== this.p.sol[i]), want;
    if (q >= 0) want = this.p.sol[q] ? 1 : 2;
    else { const d = deduce(this.p.lines, this.st); if (!d) return null; q = d.p; want = d.v; }
    const i = this.p.pane.indexOf(q), N = this.p.N;
    return { x: GUT + (i % N + 0.5) * this.cell, y: GUT + (((i / N) | 0) + 0.5) * this.cell, taps: (want - this.st[q] + 3) % 3 };
  }
  frame(ctx, dt) {
    const g = this, p = this.p, N = p.N, C = this.cell, X = GUT, Y = GUT; g.t += dt; g.flashT = Math.max(0, g.flashT - dt * 1.5);
    g.fx.step(dt);
    ctx.clearRect(0, 0, W, g.H);
    for (let q = 0; q < g.pop.length; q++) g.pop[q] = Math.max(0, g.pop[q] - dt * 4);
    for (let i = 0; i < N * N; i++) {
      const q = p.pane[i], x = X + (i % N) * C, y = Y + ((i / N) | 0) * C, v = g.st[q];
      ctx.fillStyle = v === 1 ? p.col[q] : v === 2 ? '#514a63' : '#d3dae1'; ctx.fillRect(x, y, C + 0.5, C + 0.5);
      if (g.pop[q] > 0) { ctx.fillStyle = `rgba(255,255,255,${g.pop[q] * 0.45})`; ctx.fillRect(x, y, C + 0.5, C + 0.5); }
      if (!v && g.hintP === q) { ctx.fillStyle = `rgba(255,122,89,${0.35 + 0.3 * Math.sin(g.t * 8)})`; ctx.fillRect(x, y, C + 0.5, C + 0.5); }
      if (g.flash === q && g.flashT > 0) { ctx.fillStyle = `rgba(255,93,93,${g.flashT * 0.7})`; ctx.fillRect(x, y, C + 0.5, C + 0.5); }
    }
    // lead: heavy lines between panes, hairlines inside one
    ctx.lineCap = 'round';
    for (let i = 0; i < N * N; i++) {
      const c = i % N, r = (i / N) | 0, x = X + c * C, y = Y + r * C;
      if (c < N - 1) { const edge = p.pane[i] !== p.pane[i + 1]; ctx.strokeStyle = edge ? '#2b2535' : 'rgba(43,37,53,.1)'; ctx.lineWidth = edge ? 3.5 : 1; ctx.beginPath(); ctx.moveTo(x + C, y); ctx.lineTo(x + C, y + C); ctx.stroke(); }
      if (r < N - 1) { const edge = p.pane[i] !== p.pane[i + N]; ctx.strokeStyle = edge ? '#2b2535' : 'rgba(43,37,53,.1)'; ctx.lineWidth = edge ? 3.5 : 1; ctx.beginPath(); ctx.moveTo(x, y + C); ctx.lineTo(x + C, y + C); ctx.stroke(); }
    }
    ctx.strokeStyle = '#2b2535'; ctx.lineWidth = 4.5; rr(ctx, X, Y, N * C, N * C, 5); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    p.lines.forEach((ln, k) => {
      let lit = 0, un = 0; ln.panes.forEach((q, j) => { if (g.st[q] === 1) lit += ln.cnt[j]; else if (!g.st[q]) un += ln.cnt[j]; });
      const done = !un && lit === ln.target, bad = lit > ln.target || lit + un < ln.target, hint = g.hintK === k;
      const x = k < N ? X / 2 - 1 : X + (k - N + 0.5) * C, y = k < N ? Y + (k + 0.5) * C : Y / 2 - 1;
      if (hint) { ctx.fillStyle = `rgba(255,122,89,${0.5 + 0.3 * Math.sin(g.t * 8)})`; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill(); }
      ctx.font = `700 ${done ? 15 : 17}px Fredoka, ui-rounded, system-ui, sans-serif`;
      ctx.fillStyle = bad ? '#ff5d5d' : done ? 'rgba(53,160,105,.75)' : '#3b3346'; ctx.fillText(ln.target, x, y);
    });
    g.fx.draw(ctx);
  }
}

// A tiny window for the animated how-to, played by the same sure steps the game checks for.
export const demos = [
  { puzzle: build(['yy.', 'yy.', 'bbb'], [0, 0, 1, 0, 0, 1, 2, 2, 3], null), caption: 'Numbers count the lit squares in each line' },
];
