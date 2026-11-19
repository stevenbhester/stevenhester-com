// Family Chaos Mode, client side. The server planned every event; this draws them in sync
// (phones and the TV use the same server clock) and enforces the parts phones can check instantly.
import { sfx } from './sfx.js';
import { haptic } from './net.js';
import { UI } from './icons.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  seen(k) { try { return localStorage.getItem('rb:seen:' + k) === '1'; } catch { return false; } },
  mark(k) { try { localStorage.setItem('rb:seen:' + k, '1'); } catch {} },
};

export const INFO = {
  sam: {
    blurb: 'Race car donuts over the board',
    title: 'Sam Visit!', color: '#ff8a3d',
    short: "Sam brought the race car. Keep finding words through the smoke!",
    tut: "Sam is doing donuts on your board. The smoke and tire marks are only in the way of your eyes: you can still trace words underneath. It's over in a few seconds.",
  },
  sleepover: {
    blurb: 'Tiles doze off into Z\'s',
    title: 'James & Tara Sleepover', color: '#5ab0ff',
    short: 'Lines of tiles are dozing off. Sleeping tiles count as Z!',
    tut: 'Rows and columns fall asleep one tile at a time, then wake back up. While a tile shows Z it really is a Z, so ZOO, ZIP and FIZZ are suddenly on the table.',
  },
  robbert: {
    blurb: '3-letter words only',
    title: 'Robbert Mode!', color: '#ff5c8a',
    short: 'Only 3-letter words count right now!',
    tut: "Robbert rules: for the next few seconds, only words with exactly 3 letters count. Anything longer bounces. Short and sweet!",
  },
  set: {
    blurb: 'Clear card sets to see letters',
    title: 'Ready, Set, CJ!', color: '#3ee0b0',
    short: 'Your letters are under cards. Tap 3 that make a set to clear them!',
    tut: 'Tap 3 cards. They make a set when, for each of count, shape, color and fill, the three cards are all the same or all different. A set clears those 3 cards plus every card touching their sides. Letters you uncover work as normal.',
  },
  leak: {
    blurb: 'Your words may go to everyone',
    title: "Steven & Erin's Alliance Mode", color: '#b48cff',
    short: 'Careful: 1 in 4 words you find gets sent to everyone!',
    tut: 'Steven and Erin are sharing. For a little while, each word you find has a 1 in 4 chance of being handed to every other player too. Free points for them, and it ruins your "only you" bonus.',
  },
  banana: {
    blurb: 'Used letters fill your banana',
    title: "Nana's BaNanagrams", color: '#ffd23f',
    short: 'Letters you use leave the board and fill your banana!',
    tut: 'Every letter you use in a word pops off your board and into your banana. When time is up, the fullest banana wins the Banana Split badge: +10% on your score this round. The tiles come back afterward.',
  },
};

const BANANA_FULL = 30; // fallback; the server sizes it to the board

// ---------- seeded random so the TV and phones draw the same car ----------
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export class Chaos {
  constructor({ round, board, mode, host, hud, me, onSetCleared, onBananaChange }) {
    this.events = round.chaos || [];
    this.round = round;
    this.board = board;
    this.mode = mode;            // 'phone' | 'tv'
    this.host = host;            // element banners/tutorials attach to
    this.hud = hud;              // element for the "active" pill (phone)
    this.me = me;
    this.onSetCleared = onSetCleared;
    this.onBananaChange = onBananaChange;
    this.state = new Map();      // id -> 'warn' | 'active' | 'done'
    this.fx = {};
    this.bananaCount = round.banana ? round.banana.count : 0;
    if (round.banana && round.banana.removed) round.banana.removed.forEach(i => board.setHole(i, true));
  }

  activeOf(type, ms) {
    return this.events.find(e => e.type === type && ms >= e.at && ms < e.at + e.dur) || null;
  }

  // Instant checks phones can do before asking the server.
  rule(word, ms) {
    if (this.activeOf('robbert', ms) && word.length !== 3) return 'Robbert Mode: 3-letter words only!';
    return null;
  }

  tick(ms) {
    for (const e of this.events) {
      const st = this.state.get(e.id);
      if (st === 'done') continue; // finished events never restart, even if the clock nudges back
      if (ms >= e.at + e.dur) { this.end(e, st); continue; }
      if (ms >= e.at) { if (st !== 'active') this.begin(e, st); this.during(e, ms - e.at); continue; }
      if (ms >= e.warnAt && !st) this.warn(e);
    }
  }

  // ---------- phases ----------
  warn(e) {
    this.state.set(e.id, 'warn');
    const info = INFO[e.type];
    this.banner(info, e.type);
    sfx.alarm();
    haptic('warning');
    if (this.mode === 'phone' && !store.seen(e.type)) this.tutorial(e.type);
  }

  begin(e, st) {
    if (!st) this.banner(INFO[e.type], e.type);
    this.state.set(e.id, 'active');
    this.closeBanner(true);
    this.pill(e);
    const b = this.board;
    if (e.type === 'sam' && !this.fx.sam) this.fx.sam = new RaceCar(b, e.data.seed);
    if (e.type === 'robbert') b.el.classList.add('robbert');
    if (e.type === 'leak') b.el.classList.add('leaky');
    if (e.type === 'banana') { this.bananaFull = (e.data && e.data.full) || BANANA_FULL; b.el.classList.add('banana-mode'); if (this.mode === 'phone') this.showBanana(); sfx.bananaHello(); }
    if (e.type === 'set' && this.mode === 'phone') this.fx.set = new SetCards(b, ms => { this.onSetCleared && this.onSetCleared(ms); }, e.dur);
    if (e.type === 'sleepover') sfx.snore();
    if (e.type === 'sam') sfx.vroom();
  }

  during(e, rel) {
    if (e.type === 'sleepover') {
      for (const z of e.data.zs) {
        const on = rel >= z.from && rel < z.to;
        this.board.setLetter(z.tile, on ? 'z' : this.board.original[z.tile]);
      }
    }
    if (e.type === 'sam' && this.fx.sam) this.fx.sam.frame(rel);
    const pill = this.pillEl;
    if (pill && pill.dataset.id === e.id) {
      const left = Math.ceil((e.dur - rel) / 1000);
      if (pill._left !== left) { pill._left = left; pill.querySelector('b').textContent = `${left}s`; }
    }
  }

  end(e, st) {
    this.state.set(e.id, 'done');
    const b = this.board;
    if (st === 'warn') this.closeBanner();
    if (e.type === 'sleepover') e.data.zs.forEach(z => b.setLetter(z.tile, b.original[z.tile]));
    if (e.type === 'sam' && this.fx.sam) { this.fx.sam.stop(); this.fx.sam = null; }
    if (e.type === 'robbert') b.el.classList.remove('robbert');
    if (e.type === 'leak') b.el.classList.remove('leaky');
    if (e.type === 'banana') {
      b.el.classList.remove('banana-mode');
      // The tiles grow back, one after another.
      b.tileEls.forEach((t, i) => {
        if (!t.classList.contains('hole')) return;
        setTimeout(() => { b.setHole(i, false); t.classList.remove('regrow'); void t.offsetWidth; t.classList.add('regrow'); }, i * 35);
      });
      const st = this.hud && this.hud.querySelector('.banana-stage');
      if (st) { st.classList.add('done'); setTimeout(() => st.remove(), 4000); }
    }
    if (e.type === 'set' && this.fx.set) { this.fx.set.destroy(); this.fx.set = null; }
    if (this.pillEl && this.pillEl.dataset.id === e.id) { this.pillEl.remove(); this.pillEl = null; }
  }

  // Server confirmed a word during the banana: pull its tiles.
  // Each tile peels off the board and arcs into the banana, which gobbles it up.
  bananaWord(path) {
    const stage = this.hud && this.hud.querySelector('.banana-stage .banana-big');
    const target = stage ? stage.getBoundingClientRect() : null;
    path.forEach((i, k) => {
      const tile = this.board.tileEls[i];
      const r = tile.getBoundingClientRect();
      if (target && r.width) {
        const fly = document.createElement('div');
        fly.className = 'flying-tile';
        fly.textContent = this.board.letters()[i] === 'qu' ? 'Qu' : this.board.letters()[i].toUpperCase();
        Object.assign(fly.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, fontSize: `${r.width * 0.5}px` });
        document.body.appendChild(fly);
        const tx = target.left + target.width * (0.35 + Math.random() * 0.3) - r.left - r.width / 2;
        const ty = target.top + target.height * 0.5 - r.top - r.height / 2;
        const anim = fly.animate([
          { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 },
          { transform: `translate(${tx * 0.45}px, ${ty * 0.45 - 70}px) rotate(${(k % 2 ? -1 : 1) * 160}deg) scale(0.8)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${tx}px, ${ty}px) rotate(${(k % 2 ? -1 : 1) * 340}deg) scale(0.15)`, opacity: 0.4 },
        ], { duration: 620, delay: k * 70, easing: 'cubic-bezier(.4,.1,.5,1)', fill: 'backwards' });
        anim.onfinish = () => { fly.remove(); this.gobble(); };
        setTimeout(() => this.board.setHole(i, true), k * 70);
      } else {
        this.board.setHole(i, true);
        this.gobble();
      }
    });
  }

  gobble() {
    this.bananaCount += 1;
    this.updateBanana();
    sfx.nom(this.bananaCount);
    const st = this.hud && this.hud.querySelector('.banana-stage');
    if (st) { st.classList.remove('nom'); void st.offsetWidth; st.classList.add('nom'); }
  }

  bananaSplit(ids) {
    if (this.mode === 'phone' && ids.includes(this.me)) {
      this.hud && this.hud.querySelector('.banana-stage')?.classList.add('split');
      const tag = document.createElement('div');
      tag.className = 'split-badge pop-in';
      tag.textContent = 'Banana Split +10%';
      this.hud && this.hud.appendChild(tag);
      sfx.solo();
      haptic('success');
    }
  }

  destroy() {
    for (const e of this.events) if (this.state.get(e.id) === 'active') this.end(e, 'active');
    this.closeBanner();
    document.querySelectorAll('.chaos-tut').forEach(x => x.remove());
  }

  // ---------- UI bits ----------
  banner(info, type) {
    this.closeBanner();
    const b = document.createElement('div');
    b.className = `chaos-banner ${this.mode}`;
    b.style.setProperty('--c', info.color);
    b.innerHTML = `<div class="chaos-icon">${UI[type] || ''}</div><div class="chaos-kicker">Family Chaos</div><div class="chaos-title">${esc(info.title)}</div><div class="chaos-short">${esc(type === 'set' && this.mode === 'tv' ? "Everybody's letters are under cards. Watch them scramble!" : info.short)}</div>`;
    this.host.appendChild(b);
    this.bannerEl = b;
  }

  closeBanner(shrink) {
    const b = this.bannerEl;
    if (!b) return;
    this.bannerEl = null;
    b.classList.add(shrink ? 'shrink' : 'out');
    setTimeout(() => b.remove(), 450);
  }

  pill(e) {
    if (!this.hud) return;
    this.pillEl && this.pillEl.remove();
    const p = document.createElement('div');
    p.className = 'chaos-pill pop-in';
    p.dataset.id = e.id;
    p.style.setProperty('--c', INFO[e.type].color);
    p.innerHTML = `<span class="pill-ic">${UI[e.type] || ''}</span>${esc(INFO[e.type].title)} <b></b>`;
    this.hud.appendChild(p);
    this.pillEl = p;
  }

  tutorial(type) {
    const info = INFO[type];
    const t = document.createElement('div');
    t.className = 'chaos-tut';
    t.style.setProperty('--c', info.color);
    t.innerHTML = `<div class="chaos-tut-card pop-in"><div class="tut-head"><span class="chaos-icon small">${UI[type] || ''}</span><div><div class="chaos-kicker">New chaos!</div><h2>${esc(info.title)}</h2></div></div><p>${esc(info.tut)}</p>${type === 'set' ? `<div class="set-example">${[[1, 0, 0, 0], [2, 0, 1, 0], [3, 0, 2, 0]].map(c => cardSVG(c)).join('')}</div><p class="small muted">Same shape and fill, but different counts and colors: that's a set.</p>` : ''}<button class="btn wide">Got it</button></div>`;
    t.querySelector('button').onclick = () => { store.mark(type); t.remove(); };
    document.body.appendChild(t);
  }

  showBanana() {
    if (!this.hud) return;
    this.hud.querySelector('.banana-stage')?.remove();
    const w = document.createElement('div');
    w.className = 'banana-stage';
    w.innerHTML = `<div class="banana-big">${bananaSVG()}</div>
      <div class="banana-info"><b class="banana-n">0</b><small>/ ${this.bananaFull} letters</small><div class="banana-sub">Biggest banana gets +10%</div></div>`;
    this.hud.appendChild(w);
    this.updateBanana();
  }

  updateBanana() {
    const w = this.hud && this.hud.querySelector('.banana-stage');
    if (!w) return;
    setBananaFill(w, this.bananaCount, this.bananaFull);
    w.querySelector('.banana-n').textContent = this.bananaCount;
    const full = this.bananaCount >= (this.bananaFull || BANANA_FULL);
    if (full && !w.classList.contains('full')) { w.classList.add('full'); sfx.solo(); haptic('success'); w.querySelector('.banana-sub').textContent = 'Full banana! Keep going for the lead'; }
    this.onBananaChange && this.onBananaChange(this.bananaCount);
  }
}

// ---------- Nana's banana ----------
// An original banana with a little face and Nana's pink bow. It fills from the stem end as letters go in.
let bananaN = 0;
const BANANA_SHAPE = 'M10 40 C 26 70, 86 68, 108 24 C 110 18, 108 12, 104 10 C 98 30, 74 46, 44 46 C 30 46, 18 42, 10 36 C 6 35, 6 39, 10 40 Z';
export function bananaSVG() {
  const id = `bclip${bananaN++}`;
  return `<svg class="banana" viewBox="0 0 120 70"><defs>
      <clipPath id="${id}"><path d="${BANANA_SHAPE}"/></clipPath>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff07a"/><stop offset="1" stop-color="#f2b705"/></linearGradient>
    </defs>
    <path d="${BANANA_SHAPE}" fill="#f6edcf"/>
    <rect class="banana-fill" clip-path="url(#${id})" x="0" y="0" width="120" height="70" fill="url(#${id}g)" style="transform-origin:0 0;transform:scaleX(0)"/>
    <path d="${BANANA_SHAPE}" fill="none" stroke="#2b1650" stroke-width="3" stroke-linejoin="round"/>
    <path d="M104 10 L107 2 L112 3 L109 12 Z" fill="#7a5a2a" stroke="#2b1650" stroke-width="2" stroke-linejoin="round"/>
    <path d="M10 40 C 7 41, 5 40, 6 37" stroke="#2b1650" stroke-width="3" fill="none" stroke-linecap="round"/>
    <g class="banana-face">
      <circle cx="56" cy="53" r="3.4" fill="#2b1650"/><circle cx="57.2" cy="51.8" r="1.1" fill="#fff"/>
      <circle cx="72" cy="50" r="3.4" fill="#2b1650"/><circle cx="73.2" cy="48.8" r="1.1" fill="#fff"/>
      <ellipse cx="50" cy="58" rx="4" ry="2.4" fill="#ff8fab" opacity=".7"/><ellipse cx="79" cy="54" rx="4" ry="2.4" fill="#ff8fab" opacity=".7"/>
      <path class="banana-mouth" d="M60 58 Q 65 63, 70 56" stroke="#2b1650" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    </g>
    <g transform="translate(100 13) rotate(-20)"><path d="M0 0 L-9 -6 L-9 6 Z M0 0 L9 -6 L9 6 Z" fill="#ff5c8a" stroke="#2b1650" stroke-width="1.6" stroke-linejoin="round"/><circle r="2.6" fill="#ff5c8a" stroke="#2b1650" stroke-width="1.6"/></g>
  </svg>`;
}
export function setBananaFill(el, n, full = BANANA_FULL) {
  const f = el.querySelector('.banana-fill');
  if (f) f.style.transform = `scaleX(${Math.min(1, n / full)})`;
}

// ---------- Sam's race car ----------
class RaceCar {
  constructor(board, seed) {
    this.board = board;
    const r = rng(seed);
    this.p = { ax: 0.18 + r() * 0.12, ay: 0.16 + r() * 0.12, fx: 0.25 + r() * 0.2, fy: 0.3 + r() * 0.2, ph: r() * 6.28, spin: (r() < 0.5 ? -1 : 1) * (2.2 + r() * 0.8), rad: 0.15 + r() * 0.05 };
    this.tracks = document.createElement('canvas');
    this.tracks.className = 'fx-canvas tracks';
    this.smoke = document.createElement('canvas');
    this.smoke.className = 'fx-canvas smoke';
    board.fx.append(this.tracks, this.smoke);
    this.parts = [];
    this.last = null;
    this.resize();
    board.onResize = () => this.resize();
  }
  resize() {
    const w = this.board.el.clientWidth;
    const dpr = Math.min(2, devicePixelRatio || 1);
    for (const c of [this.tracks, this.smoke]) { c.width = w * dpr; c.height = w * dpr; c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0); }
    this.w = w;
  }
  pose(t) {
    const { ax, ay, fx, fy, ph, spin, rad } = this.p;
    const s = t / 1000;
    const cx = 0.5 + ax * Math.sin(s * fx * 2 + ph), cy = 0.5 + ay * Math.cos(s * fy * 2 + ph * 0.7);
    const a = s * spin;
    const x = cx + rad * Math.cos(a), y = cy + rad * Math.sin(a);
    const heading = a + (spin > 0 ? Math.PI / 2 : -Math.PI / 2) + (spin > 0 ? 0.55 : -0.55); // drifting
    return { x: x * this.w, y: y * this.w, h: heading };
  }
  frame(t) {
    const w = this.w;
    if (!w) return;
    const { x, y, h } = this.pose(t);
    const L = w * 0.2;
    const tg = this.tracks.getContext('2d');
    // Rear tires leave marks.
    const rear = [-1, 1].map(side => [x - Math.cos(h) * L * 0.32 + Math.cos(h + Math.PI / 2) * side * L * 0.2, y - Math.sin(h) * L * 0.32 + Math.sin(h + Math.PI / 2) * side * L * 0.2]);
    tg.fillStyle = 'rgba(20, 10, 30, 0.28)';
    for (const [rx, ry] of rear) { tg.beginPath(); tg.arc(rx, ry, L * 0.06, 0, 6.29); tg.fill(); }
    // Smoke puffs.
    for (const [rx, ry] of rear) if (Math.random() < 0.8) this.parts.push({ x: rx, y: ry, r: L * 0.08, vr: L * 0.012 + Math.random() * L * 0.01, a: 0.55, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6 });
    if (this.parts.length > 260) this.parts.splice(0, this.parts.length - 260);
    this.drawSmoke(true, x, y, h, L);
  }
  drawSmoke(withCar, x, y, h, L) {
    const g = this.smoke.getContext('2d');
    g.clearRect(0, 0, this.w, this.w);
    for (const p of this.parts) {
      p.r += p.vr; p.a *= 0.975; p.x += p.vx; p.y += p.vy;
      g.fillStyle = `rgba(225, 220, 235, ${p.a})`;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.29); g.fill();
    }
    this.parts = this.parts.filter(p => p.a > 0.02);
    if (withCar) drawCar(g, x, y, h, L);
  }
  stop() {
    this.board.onResize = null;
    // Timers, not animation frames, so the smoke always clears even if the page was in the background.
    const t0 = performance.now();
    const fade = () => {
      const k = (performance.now() - t0) / 2500;
      this.drawSmoke(false);
      this.tracks.style.opacity = this.smoke.style.opacity = String(Math.max(0, 1 - k));
      if (k < 1 && this.tracks.isConnected) setTimeout(fade, 33);
      else { this.tracks.remove(); this.smoke.remove(); }
    };
    fade();
  }
}

// An original top-down formula-style car, nose pointing along +x before rotation.
function drawCar(g, x, y, h, L) {
  g.save();
  g.translate(x, y);
  g.rotate(h);
  const W = L * 0.42;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.ellipse(4, 6, L * 0.52, W * 0.55, 0, 0, 6.29); g.fill();
  // tires
  g.fillStyle = '#1a1420';
  for (const [tx, ty] of [[L * 0.3, -W * 0.52], [L * 0.3, W * 0.52], [-L * 0.3, -W * 0.56], [-L * 0.3, W * 0.56]]) {
    g.beginPath(); g.roundRect(tx - L * 0.09, ty - W * 0.14, L * 0.18, W * 0.28, 3); g.fill();
  }
  // front and rear wings
  g.fillStyle = '#fff1d2';
  g.beginPath(); g.roundRect(L * 0.44, -W * 0.5, L * 0.08, W, 2); g.fill();
  g.fillStyle = '#c9561a';
  g.beginPath(); g.roundRect(-L * 0.52, -W * 0.46, L * 0.1, W * 0.92, 2); g.fill();
  // body
  g.fillStyle = '#ff8a3d';
  g.beginPath();
  g.moveTo(L * 0.5, 0);
  g.quadraticCurveTo(L * 0.25, -W * 0.14, -L * 0.05, -W * 0.3);
  g.lineTo(-L * 0.42, -W * 0.22);
  g.lineTo(-L * 0.42, W * 0.22);
  g.lineTo(-L * 0.05, W * 0.3);
  g.quadraticCurveTo(L * 0.25, W * 0.14, L * 0.5, 0);
  g.fill();
  // stripe, cockpit and helmet
  g.fillStyle = '#fff1d2';
  g.fillRect(-L * 0.4, -W * 0.04, L * 0.86, W * 0.08);
  g.fillStyle = '#2b1650';
  g.beginPath(); g.ellipse(-L * 0.04, 0, L * 0.12, W * 0.13, 0, 0, 6.29); g.fill();
  g.fillStyle = '#ffd23f';
  g.beginPath(); g.arc(-L * 0.04, 0, W * 0.1, 0, 6.29); g.fill();
  g.rotate(Math.PI / 2);
  g.fillStyle = '#2b1650';
  g.font = `bold ${W * 0.28}px Fredoka, sans-serif`;
  g.textAlign = 'center';
  g.fillText('S', 0, -L * 0.22);
  g.restore();
}

// ---------- CJ's cards ----------
const SET_COLORS = ['#ff5c8a', '#3ee0b0', '#5ab0ff'];
// card = [count 1-3, shape 0-2, color 0-2, fill 0-2]
function cardSVG([count, shape, color, fill]) {
  const c = SET_COLORS[color];
  const pid = `st${Math.random().toString(36).slice(2, 7)}`;
  const paint = fill === 0 ? c : fill === 1 ? `url(#${pid})` : 'none';
  const one = cy => {
    const a = `fill="${paint}" stroke="${c}" stroke-width="3"`;
    if (shape === 0) return `<circle cx="30" cy="${cy}" r="9" ${a}/>`;
    if (shape === 1) return `<path d="M30 ${cy - 10} L41 ${cy + 8} L19 ${cy + 8} Z" ${a} stroke-linejoin="round"/>`;
    return `<rect x="21" y="${cy - 8}" width="18" height="16" rx="2" ${a}/>`;
  };
  const ys = count === 1 ? [40] : count === 2 ? [28, 52] : [18, 40, 62];
  return `<svg class="set-card-art" viewBox="0 0 60 80"><defs><pattern id="${pid}" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="2" fill="${c}"/></pattern></defs><rect x="1.5" y="1.5" width="57" height="77" rx="8" fill="#fffaf0" stroke="#d9b97f" stroke-width="3"/>${ys.map(one).join('')}</svg>`;
}
const isSet = (a, b, c) => [0, 1, 2, 3].every(k => (a[k] === b[k] && b[k] === c[k]) || (a[k] !== b[k] && b[k] !== c[k] && a[k] !== c[k]));
function anySet(cards) {
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) for (let k = j + 1; k < cards.length; k++) if (isSet(cards[i], cards[j], cards[k])) return true;
  return false;
}

class SetCards {
  constructor(board, onCleared, dur) {
    this.board = board;
    this.onCleared = onCleared;
    this.t0 = performance.now();
    this.n = board.size;
    const tiles = board.tileEls.length;
    let deck;
    do {
      const all = [];
      for (let a = 1; a <= 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) for (let d = 0; d < 3; d++) all.push([a, b, c, d]);
      all.sort(() => Math.random() - 0.5);
      deck = all.slice(0, tiles);
    } while (!anySet(deck));
    this.cards = new Map(deck.map((c, i) => [i, c]));
    this.sel = [];
    this.layer = document.createElement('div');
    this.layer.className = 'set-layer';
    board.fx.appendChild(this.layer);
    this.els = new Map();
    for (const [i, c] of this.cards) {
      const b = document.createElement('button');
      b.className = 'set-card';
      b.innerHTML = cardSVG(c);
      b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); this.tap(i); });
      this.layer.appendChild(b);
      this.els.set(i, b);
    }
    board.blocked = i => this.cards.has(i);
    this.place();
    board.onResize = () => this.place();
  }
  place() {
    const br = this.board.el.getBoundingClientRect();
    for (const [i, b] of this.els) {
      const r = this.board.tileEls[i].getBoundingClientRect();
      Object.assign(b.style, { left: `${r.left - br.left}px`, top: `${r.top - br.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    }
  }
  tap(i) {
    if (!this.cards.has(i)) return;
    const at = this.sel.indexOf(i);
    if (at >= 0) { this.sel.splice(at, 1); this.els.get(i).classList.remove('on'); sfx.tick(0); return; }
    this.sel.push(i);
    this.els.get(i).classList.add('on');
    sfx.tick(this.sel.length);
    haptic('tick');
    if (this.sel.length < 3) return;
    const [a, b, c] = this.sel.map(k => this.cards.get(k));
    const chosen = this.sel.slice();
    this.sel = [];
    if (!isSet(a, b, c)) {
      chosen.forEach(k => { const el = this.els.get(k); el.classList.remove('on'); el.classList.add('nope'); setTimeout(() => el.classList.remove('nope'), 400); });
      sfx.bad(); haptic('error');
      return;
    }
    // Clear the set plus every card touching their sides.
    const n = this.n;
    const clear = new Set(chosen);
    for (const k of chosen) {
      const r = Math.floor(k / n), col = k % n;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr, cc = col + dc;
        if (rr >= 0 && cc >= 0 && rr < n && cc < n) clear.add(rr * n + cc);
      }
    }
    sfx.ok(5); haptic('success');
    this.remove([...clear].filter(k => this.cards.has(k)));
  }
  remove(list) {
    list.forEach((k, j) => {
      this.cards.delete(k);
      const el = this.els.get(k);
      this.els.delete(k);
      el.classList.add('gone');
      el.style.animationDelay = `${j * 40}ms`;
      setTimeout(() => el.remove(), 500 + j * 40);
    });
    if (!this.cards.size) { this.done(); return; }
    if (this.cards.size >= 3 && !anySet([...this.cards.values()])) setTimeout(() => this.reshuffle(), 450);
    else if (this.cards.size < 3) setTimeout(() => this.remove([...this.cards.keys()]), 450);
  }
  // No set left among the covered cards: deal them fresh faces (with at least one set) instead.
  reshuffle() {
    if (this.finished || !this.cards.size) return;
    const spots = [...this.cards.keys()];
    let faces;
    do {
      const all = [];
      for (let a = 1; a <= 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) for (let d = 0; d < 3; d++) all.push([a, b, c, d]);
      all.sort(() => Math.random() - 0.5);
      faces = all.slice(0, spots.length);
    } while (!anySet(faces));
    spots.forEach((k, j) => {
      this.cards.set(k, faces[j]);
      const el = this.els.get(k);
      el.classList.remove('on');
      el.innerHTML = cardSVG(faces[j]);
      el.animate([{ transform: 'rotateY(90deg)' }, { transform: 'none' }], { duration: 300, delay: j * 30, fill: 'backwards' });
    });
    this.sel = [];
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = 'No sets left: shuffling the cards!';
    document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
    sfx.whoosh();
  }
  done() {
    if (this.finished) return;
    this.finished = true;
    this.board.blocked = null;
    this.onCleared(Math.round(performance.now() - this.t0));
  }
  destroy() {
    this.board.blocked = null;
    this.board.onResize = null;
    this.layer.remove();
  }
}

export { cardSVG };
