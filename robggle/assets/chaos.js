// Family Chaos Mode, client side. The server planned every event; this draws them in sync
// (phones and the TV use the same server clock) and enforces the parts phones can check instantly.
import { sfx } from './sfx.js?v=0dabfef-1795241502';
import { haptic } from './net.js?v=0dabfef-1795241502';
import { UI } from './icons.js?v=0dabfef-1795241502';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tutKey = t => (t === 'leak' || t === 'sleepover' ? t + '2' : t); // bump when a tutorial changes
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
    short: 'Three tiles are dozing off. Sleeping tiles count as Z!',
    tut: "Three tiles get sleepy, nod off and turn into Z's for a while, then wake back up. While a tile shows Z it really is a Z, so ZIP, ZOO and DOZE are suddenly on the table.",
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
    tut: 'Tap 3 cards. They make a set when, for each of count, shape, color and fill, the three cards are all the same or all different. A set clears those 3 cards plus every card touching their sides. The counter shows how many sets are left; at zero, every card clears.',
  },
  leak: {
    blurb: 'Found words get announced',
    title: "Steven & Erin's Alliance Mode", color: '#b48cff',
    short: "Psst! Words people find get announced up top. You still have to find them yourself!",
    tut: "Steven and Erin can't keep a secret. For a little while, each word anyone finds has a 1 in 2 chance of being announced at the top of everyone's screen, like \"Mia found TOAST!\" It's a tip, not a gift: trace it yourself to get the points. And if your word gets out, someone may steal your \"only you\" bonus.",
  },
  banana: {
    blurb: 'Used letters fill your banana',
    title: "Nana's BaNanagrams", color: '#ffd23f',
    short: 'Letters you use leave the board and fill your banana!',
    tut: 'Every letter you use in a word pops off your board and into your banana. When time is up, the fullest banana wins the Banana Split badge: +10% on your score this round. The tiles come back afterward.',
  },
  monster: {
    blurb: 'A monster scares the tiles',
    title: 'P-pa Monster!', color: '#7bd88f',
    short: 'One tile turned into a monster. The others are terrified!',
    tut: "P-pa Monster has taken over a tile, and the other tiles are scooting away from it and shaking. It's all for show: every tile still works, the monster's letter included. It hops to a new tile every few seconds.",
  },
  swap: {
    blurb: 'Tiles trade places',
    title: 'Violet & Orin Run Around Time', color: '#c9a0ff',
    short: 'Tiles are swapping places. New words everywhere!',
    tut: "Violet and Orin can't sit still. A few tiles swap places with a neighbour, stay there for a bit, then even more swap. The letters really move, so words that weren't possible a second ago are now. Everything runs back home when time is up.",
  },
  climb: {
    blurb: 'Used tiles grow taller',
    title: 'Charlie Climbing Count', color: '#ff8a3d',
    short: 'Every tile you use gets taller. Tallest tile wins a badge!',
    tvShort: "Everyone's tiles are growing taller with every word. Tallest tile wins a badge!",
    tut: 'Charlie climbs everything. Each time you use a tile in a word it grows taller, and tall tiles get in the way of the ones behind them. Whoever builds the tallest tile before time is up gets a special badge.',
  },
  launch: {
    blurb: 'Your favorite letter blasts off',
    title: "Jess's Launchpad", color: '#5ab0ff',
    short: 'Your most-used letter just blasted into space!',
    tvShort: "Everyone's most-used letter just blasted into space!",
    tut: "Jess is launching rockets. Whichever letter you've used the most this round blasts off into space, and you can't use it until it lands again. Everyone loses a different letter.",
  },
  wordle: {
    blurb: 'Find the hidden 5-letter word',
    title: "G-ma's Wordle Chat", color: '#6aaa64',
    short: 'A 5-letter word is hidden on this board. Every word you trace is a clue!',
    tvShort: 'G-ma hid a 5-letter word on this board. First to trace it wins!',
    tut: "G-ma hid a 5-letter word that's somewhere on this board. Every word you trace is a guess: a letter turns green if it's in the hidden word in that spot, yellow if it's in the word somewhere else, and gray if it isn't in it at all. Tiles on the board light up to match. The first person to trace the hidden word ends the chat for everyone.",
  },
};

// The caution tab slides in this long before an event's banner, counting down.
const APPROACH_MS = 5000;
const BANANA_FULL = 30; // fallback; the server sizes it to the board

// ---------- seeded random so the TV and phones draw the same car ----------
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export class Chaos {
  constructor({ round, board, mode, host, hud, me, member, has, onSetCleared, onBananaChange }) {
    this.events = round.chaos || [];
    this.round = round;
    this.board = board;
    this.mode = mode;            // 'phone' | 'tv'
    this.host = host;            // element banners/tutorials attach to
    this.hud = hud;              // element for the "active" pill (phone)
    this.me = me;
    this.member = member || (() => null); // id -> player
    this.has = has || (() => false);      // have I found this word?
    this.onSetCleared = onSetCleared;
    this.onBananaChange = onBananaChange;
    this.state = new Map();      // id -> 'warn' | 'active' | 'done'
    this.fx = {};
    this.bananaCount = round.banana ? round.banana.count : 0;
    this.bananaDone = !!(round.banana && round.banana.done);
    if (round.banana && round.banana.removed) round.banana.removed.forEach(i => board.setHole(i, true));
    this.heights = (round.climb || []).slice();          // Charlie: how tall each of my tiles is
    this.launchData = round.launch || null;               // Jess: { id, letter, tiles }
    this.wd = { slots: [null, null, null, null, null], status: {}, n: 0, last: null, over: !!(round.wordle && round.wordle.winner) };
    if (round.wordle) for (const g of round.wordle.guesses || []) this.wordleApply(g);
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
      if (ms >= e.warnAt && (!st || st === 'approach')) { this.warn(e); continue; }
      if (ms >= e.warnAt - APPROACH_MS && !st) this.approach(e);
      if (this.state.get(e.id) === 'approach') this.approachTick(e, ms);
    }
  }

  // ---------- phases ----------
  // A striped caution tab slides in from the edge with a countdown and a siren blip each second.
  approach(e) {
    this.state.set(e.id, 'approach');
    this.closeApproach();
    const t = document.createElement('div');
    t.className = `chaos-approach ${this.mode}`;
    t.innerHTML = `<div class="ca-stripes"></div><div class="ca-body"><span class="ca-ic">${UI.bolt}</span><div><div class="ca-kicker">Caution</div><div class="ca-title">Family Chaos incoming</div></div><b class="ca-count"></b></div>`;
    document.body.appendChild(t);
    this.approachEl = t;
  }

  approachTick(e, ms) {
    const t = this.approachEl;
    if (!t) return;
    const left = Math.max(1, Math.ceil((e.warnAt - ms) / 1000));
    if (t._left !== left) {
      t._left = left;
      const c = t.querySelector('.ca-count');
      c.textContent = left;
      c.classList.remove('tick'); void c.offsetWidth; c.classList.add('tick');
      sfx.siren(5 - left);
      if (this.mode === 'phone') haptic('tick');
    }
  }

  closeApproach() {
    const t = this.approachEl;
    if (!t) return;
    this.approachEl = null;
    t.classList.add('out');
    setTimeout(() => t.remove(), 400);
  }

  warn(e) {
    this.closeApproach();
    this.state.set(e.id, 'warn');
    const info = INFO[e.type];
    this.banner(info, e.type);
    sfx.alarm();
    haptic('warning');
    if (this.mode === 'phone' && !store.seen(tutKey(e.type))) this.tutorial(e.type);
  }

  begin(e, st) {
    if (!st || st === 'approach') { this.closeApproach(); this.banner(INFO[e.type], e.type); }
    this.state.set(e.id, 'active');
    this.closeBanner(true);
    this.pill(e);
    const b = this.board;
    if (e.type === 'sam' && !this.fx.sam) this.fx.sam = new RaceCar(b, e.data.seed);
    if (e.type === 'robbert') b.el.classList.add('robbert');
    if (e.type === 'leak') { b.el.classList.add('leaky'); this.openTips(e); }
    if (e.type === 'banana') { this.bananaFull = (e.data && e.data.full) || BANANA_FULL; this.bananaFirst = null; b.el.classList.add('banana-mode'); if (this.mode === 'phone' && !this.bananaDone) this.showBanana(); sfx.bananaHello(); }
    if (e.type === 'set' && this.mode === 'phone') this.fx.set = new SetCards(b, ms => { this.onSetCleared && this.onSetCleared(ms); }, e.dur);
    if (e.type === 'sleepover') sfx.snore();
    if (e.type === 'sam') sfx.vroom();
    if (e.type === 'monster') b.el.classList.add('monster-on');
    if (e.type === 'swap') this.swapAt = null;
    if (e.type === 'climb') {
      b.el.classList.add('climbing');
      b.el.style.setProperty('--climb-step', `${((b.el.clientWidth / b.size) * 0.32).toFixed(1)}px`);
      b.stacked = true;
      this.showHeights();
    }
    if (e.type === 'launch') { if (this.mode === 'phone' && this.launchData && this.launchData.id === e.id) this.blastOff(); else if (this.mode === 'tv') sfx.rocket(); }
    // (In Pass the Pen the team shares the clues, so the TV shows the blanks too.)
    if (e.type === 'wordle') { if ((this.mode === 'phone' || this.round.mode === 'coop') && !this.wd.over) this.showWordle(); }
  }

  during(e, rel) {
    if (e.type === 'sleepover') {
      const b = this.board;
      for (const z of e.data.zs) {
        const asleep = rel >= z.from && rel < z.to;
        const drowsy = z.drowsy !== undefined && rel >= z.drowsy && rel < z.from;
        if (asleep && b.letters()[z.tile] !== 'z') sfx.yawn();
        b.setLetter(z.tile, asleep ? 'z' : b.original[z.tile]);
        b.mood(z.tile, drowsy ? 'drowsy' : rel >= z.to && rel < z.to + 700 ? 'wake' : null);
      }
    }
    if (e.type === 'sam' && this.fx.sam) this.fx.sam.frame(rel);
    if (e.type === 'monster') {
      let k = 0;
      e.data.hops.forEach((h, i) => { if (rel >= h.at) k = i; });
      if (this.monsterAt !== `${e.id}:${k}`) { this.monsterAt = `${e.id}:${k}`; this.moveMonster(e.data.hops[k].tile); }
    }
    if (e.type === 'swap') {
      let k = -1;
      e.data.waves.forEach((w, i) => { if (rel >= w.at) k = i; });
      if (k >= 0 && this.swapAt !== `${e.id}:${k}`) this.runSwaps(e, k);
    }
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
    if (e.type === 'sleepover') e.data.zs.forEach(z => { b.setLetter(z.tile, b.original[z.tile]); b.mood(z.tile, null); });
    if (e.type === 'sam' && this.fx.sam) { this.fx.sam.stop(); this.fx.sam = null; }
    if (e.type === 'robbert') b.el.classList.remove('robbert');
    if (e.type === 'leak') { b.el.classList.remove('leaky'); this.closeTips(); }
    if (e.type === 'banana') {
      b.el.classList.remove('banana-mode');
      // The tiles grow back, one after another.
      b.tileEls.forEach((t, i) => {
        if (!t.classList.contains('hole')) return;
        setTimeout(() => { b.setHole(i, false); t.classList.remove('regrow'); void t.offsetWidth; t.classList.add('regrow'); }, i * 35);
      });
      const st = this.hud && this.hud.querySelector('.banana-stage');
      if (st && !this.bananaDone) { st.classList.add('done'); st.querySelector('.banana-sub').textContent = "Time's up for Nana's banana"; setTimeout(() => st.remove(), 3000); }
    }
    if (e.type === 'set' && this.fx.set) { this.fx.set.destroy(); this.fx.set = null; }
    if (e.type === 'monster') {
      b.el.classList.remove('monster-on');
      b.tileEls.forEach(t => { t.classList.remove('monster'); t.style.removeProperty('--fx'); t.style.removeProperty('--fy'); });
      if (this.fx.monster) { const f = this.fx.monster; this.fx.monster = null; f.classList.add('poof'); setTimeout(() => f.remove(), 350); }
    }
    if (e.type === 'swap') b.original.forEach((l, i) => b.setLetter(i, l, 'swapped')); // everyone runs back home
    if (e.type === 'climb') {
      b.el.classList.remove('climbing');
      b.stacked = false;
      this.heights = [];
      this.note('climb', null);
      b.tileEls.forEach(t => { t.classList.remove('tall', 'grew'); t.style.removeProperty('--lvl'); t.style.removeProperty('--z'); });
    }
    if (e.type === 'launch') this.touchDown(e);
    if (e.type === 'wordle') {
      this.wordleTiles(true);
      const st = this.hud && this.hud.querySelector('.wordle-stage');
      if (st && !st.classList.contains('result')) setTimeout(() => { if (!st.classList.contains('result')) st.remove(); }, 2500); // (the answer usually arrives first)
    }
    if (this.pillEl && this.pillEl.dataset.id === e.id) { this.pillEl.remove(); this.pillEl = null; }
  }

  isActive(type) { return this.events.find(e => e.type === type && this.state.get(e.id) === 'active') || null; }

  // ---------- P-pa Monster ----------
  // The monster's face sits over its tile; every other tile leans away, the nearest ones most, and trembles.
  moveMonster(tile) {
    const b = this.board, n = b.size;
    const el = b.tileEls[tile];
    const cell = b.el.clientWidth / n;
    const mr = Math.floor(tile / n), mc = tile % n;
    b.tileEls.forEach((t, i) => {
      t.classList.toggle('monster', i === tile);
      if (i === tile) { t.style.setProperty('--fx', '0px'); t.style.setProperty('--fy', '0px'); return; }
      const dr = Math.floor(i / n) - mr, dc = (i % n) - mc, d = Math.hypot(dr, dc);
      const push = (cell * 0.14) / Math.pow(d, 0.9);
      t.style.setProperty('--fx', `${((dc / d) * push).toFixed(1)}px`);
      t.style.setProperty('--fy', `${((dr / d) * push).toFixed(1)}px`);
      t.style.setProperty('--q', `${Math.max(0.4, 2.4 / d).toFixed(2)}deg`);
      t.style.setProperty('--qd', `${(i * 53) % 180}ms`);
    });
    let f = this.fx.monster;
    if (!f) {
      f = document.createElement('div');
      f.className = 'monster-face';
      f.innerHTML = MONSTER_FACE;
      b.fx.appendChild(f);
      this.fx.monster = f;
    }
    Object.assign(f.style, { left: `${el.offsetLeft}px`, top: `${el.offsetTop}px`, width: `${el.offsetWidth}px`, height: `${el.offsetHeight}px` });
    f.classList.remove('hop'); void f.offsetWidth; f.classList.add('hop');
    sfx.growl();
    if (this.mode === 'phone') haptic('warning');
  }

  // ---------- Violet & Orin ----------
  // Wave `k` of swaps has started. Coming straight from the wave before, the pairs slide past each other;
  // joining late, the letters are just put where they are by now.
  runSwaps(e, k) {
    const b = this.board, n = b.original.length;
    const at = Array.from({ length: n }, (_, i) => i);
    for (let w = 0; w <= k; w++) for (const [x, y] of e.data.waves[w].pairs) [at[x], at[y]] = [at[y], at[x]];
    const stepped = this.swapAt === `${e.id}:${k - 1}` || (k === 0 && this.swapAt == null);
    this.swapAt = `${e.id}:${k}`;
    if (stepped) {
      for (const [x, y] of e.data.waves[k].pairs) b.swapLetters(x, y, b.original[at[x]], b.original[at[y]]);
      sfx.zoom();
      if (this.mode === 'phone') haptic('tick');
    } else at.forEach((from, i) => b.setLetter(i, b.original[from], 'swapped'));
  }

  // ---------- Charlie Climbing Count ----------
  // A word of mine counted: while Charlie's climbing, every tile in it grows a level.
  wordUsed(path) {
    if (!path || this.mode !== 'phone' || !this.isActive('climb')) return;
    let top = 0;
    for (const i of path) { this.heights[i] = (this.heights[i] || 0) + 1; top = Math.max(top, this.heights[i]); }
    this.showHeights(path);
    sfx.step(top);
  }

  showHeights(grew) {
    const b = this.board, n = b.size;
    b.tileEls.forEach((t, i) => {
      const h = this.heights[i] || 0;
      t.style.setProperty('--lvl', h);
      t.style.setProperty('--z', Math.floor(i / n) * 2 + (h ? 1 : 0)); // nearer rows in front, like looking down a street
      t.classList.toggle('tall', h > 0);
      if (grew && grew.includes(i)) { t.classList.remove('grew'); void t.offsetWidth; t.classList.add('grew'); }
    });
    const best = Math.max(0, ...Array.from(this.heights, h => h || 0)); // (the list has gaps: tiles not used yet)
    const note = this.note('climb', best ? `Your tallest tile: <b>${best}</b> high` : 'Use a tile to make it grow');
    if (note) note.style.setProperty('--c', INFO.climb.color);
  }

  // A one-line note in the phone's chaos area (replaced each time, removed when its event ends).
  note(kind, html) {
    if (!this.hud || this.mode !== 'phone') return null;
    let el = this.hud.querySelector(`.chaos-note[data-kind="${kind}"]`);
    if (html == null) { el && el.remove(); return null; }
    if (!el) { el = document.createElement('div'); el.className = 'chaos-note pop-in'; el.dataset.kind = kind; this.hud.appendChild(el); }
    el.innerHTML = html;
    return el;
  }

  // ---------- Jess's Launchpad ----------
  // Server: here's the letter of yours that's going up.
  launch(m) {
    this.launchData = m;
    if (this.mode === 'phone' && this.events.some(e => e.id === m.id && this.state.get(e.id) === 'active')) this.blastOff();
  }

  blastOff() {
    const d = this.launchData;
    if (!d || d.gone) return;
    d.gone = true;
    const b = this.board;
    const L = d.letter === 'qu' ? 'Qu' : d.letter.toUpperCase();
    const note = this.note('launch', `${UI.launch}Your <b>${esc(L)}</b>${d.tiles.length === 1 ? ' is' : "'s are"} in space!`);
    if (note) note.style.setProperty('--c', INFO.launch.color);
    sfx.rocket();
    haptic('warning');
    d.tiles.forEach((i, k) => {
      const t = b.tileEls[i];
      t.classList.add('ignite');
      setTimeout(() => {
        if (!d.gone || d.landed) return;
        const r = t.getBoundingClientRect();
        t.classList.remove('ignite');
        b.setHole(i, true);
        t.classList.add('launched');
        if (!r.width) return;
        const fly = document.createElement('div');
        fly.className = 'flying-tile rocket';
        fly.innerHTML = `${esc(L)}<i class="flame"></i>`;
        Object.assign(fly.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, fontSize: `${r.width * 0.5}px` });
        document.body.appendChild(fly);
        const an = fly.animate([
          { transform: 'translate(0, 0) rotate(0)' },
          { transform: `translate(${k % 2 ? -8 : 8}px, -40px) rotate(${k % 2 ? -4 : 4}deg)`, offset: 0.25 },
          { transform: `translate(${k % 2 ? 30 : -30}px, -${r.top + r.height + 80}px) rotate(${k % 2 ? 14 : -14}deg)` },
        ], { duration: 1000, easing: 'cubic-bezier(.5,0,.9,.4)' });
        an.onfinish = () => fly.remove();
        setTimeout(() => fly.remove(), 1400);
      }, 550 + k * 130);
    });
  }

  touchDown(e) {
    const d = this.launchData;
    this.note('launch', null);
    if (!d || d.id !== e.id) return;
    d.landed = true;
    this.launchData = null;
    const b = this.board;
    d.tiles.forEach((i, k) => {
      const t = b.tileEls[i];
      t.classList.remove('ignite');
      setTimeout(() => {
        b.setHole(i, false);
        t.classList.remove('launched', 'landing'); void t.offsetWidth; t.classList.add('landing');
        if (this.mode === 'phone') sfx.thud();
      }, k * 110);
    });
  }

  // ---------- G-ma's Wordle Chat ----------
  showWordle() {
    if (!this.hud) return;
    this.hud.querySelector('.wordle-stage')?.remove();
    const w = document.createElement('div');
    w.className = 'wordle-stage';
    w.innerHTML = `<div class="wd-slots">${'<span class="wd-slot"></span>'.repeat(5)}</div><div class="wd-info"><b>${this.round.mode === 'coop' ? "G-ma's hidden word (team clues)" : "G-ma's hidden word"}</b><div class="wd-last"></div><small class="wd-sub"></small></div>`;
    this.hud.appendChild(w);
    this.drawWordle();
  }

  drawWordle() {
    const w = this.hud && this.hud.querySelector('.wordle-stage');
    if (w && !w.classList.contains('result')) {
      w.querySelectorAll('.wd-slot').forEach((el, i) => {
        const c = this.wd.slots[i];
        el.textContent = c ? c.toUpperCase() : '';
        el.classList.toggle('g', !!c);
      });
      const last = this.wd.last;
      w.querySelector('.wd-last').innerHTML = last ? [...last.w].map((c, i) => `<i class="${last.marks[i]}">${esc(c.toUpperCase())}</i>`).join('') : '';
      const yellow = Object.keys(this.wd.status).filter(c => this.wd.status[c] === 'y').sort();
      w.querySelector('.wd-sub').textContent = !this.wd.n ? (this.round.mode === 'coop' ? 'Every word the pen writes is a clue' : 'Trace any word for clues') : `${this.wd.n} guess${this.wd.n === 1 ? '' : 'es'}${yellow.length ? ` · somewhere: ${yellow.join(' ').toUpperCase()}` : ''}`;
    }
    this.wordleTiles();
  }

  // Tiles take the best that's known about their letter: green, yellow, or gray for "not in it".
  wordleTiles(clear) {
    const b = this.board;
    const rank = { g: 3, y: 2, x: 1 };
    b.tileEls.forEach((t, i) => {
      let best = null;
      if (!clear && !this.wd.over) for (const c of b.original[i]) { const s = this.wd.status[c]; if (s && (!best || rank[s] > rank[best])) best = s; }
      t.classList.toggle('wd-g', best === 'g');
      t.classList.toggle('wd-y', best === 'y');
      t.classList.toggle('wd-x', best === 'x');
    });
  }

  wordleApply(g) {
    const rank = { g: 3, y: 2, x: 1 };
    this.wd.n++;
    this.wd.last = g;
    [...g.w].forEach((c, i) => {
      const s = g.marks[i];
      if (s === 'g' && i < 5) this.wd.slots[i] = c;
      if (!this.wd.status[c] || rank[s] > rank[this.wd.status[c]]) this.wd.status[c] = s;
    });
  }

  // Server: the marks for the word I just traced.
  wordleMark(m) {
    if (this.wd.over) return;
    this.wordleApply(m);
    this.drawWordle();
    sfx.clue(m.marks.includes('g') ? 2 : m.marks.includes('y') ? 1 : 0);
    const w = this.hud && this.hud.querySelector('.wordle-stage');
    if (w) { w.classList.remove('nudge'); void w.offsetWidth; w.classList.add('nudge'); }
  }

  // Somebody traced it (or time ran out): the chat is over for everyone, and the answer shows where the blanks were.
  wordleOver(m) {
    this.wd.over = true;
    this.wordleTiles(true);
    const e = this.isActive('wordle');
    if (e && this.pillEl && this.pillEl.dataset.id === e.id) { this.pillEl.remove(); this.pillEl = null; }
    if (e) this.state.set(e.id, 'done');
    const st = this.hud && this.hud.querySelector('.wordle-stage');
    if (!st) return;
    const p = m.id ? this.member(m.id) : null;
    const word = `<div class="wd-slots">${[...m.word].map(c => `<span class="wd-slot g">${esc(c.toUpperCase())}</span>`).join('')}</div>`;
    st.classList.add('result');
    st.classList.toggle('won', !!m.id);
    st.innerHTML = `${word}<div class="wd-info"><b>${m.team ? `The team got the Wordle in ${m.n}!` : m.id ? `${m.id === this.me ? 'You' : esc(p ? p.name : 'Someone')} got the Wordle in ${m.n}!` : 'Nobody got the Wordle'}</b><small class="wd-sub">${m.id ? "G-ma's word was" : 'It was'} ${esc(m.word.toUpperCase())}</small></div>`;
    if (m.id === this.me || m.team) { sfx.fanfare(); haptic('success'); } else sfx.solo();
    setTimeout(() => st.remove(), 6000);
  }

  // Server confirmed a word during the banana: each tile peels off the board, arcs into the next spot in
  // the sketched banana, lands as a little tile, then smushes into banana. `done` means this word filled it.
  bananaWord(path, done) {
    if (this.bananaDone) return;
    // Reserve spots now, so a second word arriving before the first one's tiles land doesn't share them.
    if (this.bananaQueued == null) this.bananaQueued = this.bananaCount;
    const start = this.bananaQueued;
    this.bananaQueued += path.length;
    let landed = 0;
    path.forEach((i, k) => {
      const tile = this.board.tileEls[i];
      const r = tile.getBoundingClientRect();
      const letter = this.board.letters()[i];
      const slot = this.slotScreen(start + k);
      let didLand = false;
      const land = () => {
        if (didLand) return;
        didLand = true;
        this.landTile(start + k, letter);
        if (++landed === path.length && done) setTimeout(() => this.completeBanana(), 450);
      };
      if (slot && r.width) {
        const fly = document.createElement('div');
        fly.className = 'flying-tile';
        fly.textContent = letter === 'qu' ? 'Qu' : letter.toUpperCase();
        Object.assign(fly.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, fontSize: `${r.width * 0.5}px` });
        document.body.appendChild(fly);
        const tx = slot.x - r.left - r.width / 2, ty = slot.y - r.top - r.height / 2;
        const s = slot.size / r.width;
        const anim = fly.animate([
          { transform: 'translate(0,0) rotate(0) scale(1)' },
          { transform: `translate(${tx * 0.5}px, ${ty * 0.5 - 60}px) rotate(${(k % 2 ? -1 : 1) * 120}deg) scale(0.75)`, offset: 0.55 },
          { transform: `translate(${tx}px, ${ty}px) rotate(${slot.angle}deg) scale(${s})` },
        ], { duration: 650, delay: k * 90, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'backwards' });
        anim.onfinish = () => { fly.remove(); land(); };
        // If the animation stalls (app in the background), land it anyway.
        setTimeout(() => { if (!didLand) { fly.remove(); land(); } }, 650 + k * 90 + 600);
        setTimeout(() => this.board.setHole(i, true), k * 90);
      } else {
        if (!done) this.board.setHole(i, true);
        land();
      }
    });
  }

  // Where tile number `n` goes inside the sketch, in screen pixels (null if there's no banana on screen).
  slotScreen(n) {
    const svg = this.hud && this.hud.querySelector('.banana-sketch');
    if (!svg) return null;
    const s = bananaSlot(n, this.bananaFull);
    const box = svg.getBoundingClientRect();
    const k = box.width / 120;
    return { x: box.left + s.x * k, y: box.top + s.y * k, size: s.size * k, angle: s.angle };
  }

  landTile(n, letter) {
    const g = this.hud && this.hud.querySelector('.banana-sketch .blobs');
    this.bananaCount += 1;
    if (g) {
      const s = bananaSlot(n, this.bananaFull);
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      el.setAttribute('transform', `translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) rotate(${s.angle.toFixed(0)})`);
      el.innerHTML = `<g class="btile"><rect x="${-s.size / 2}" y="${-s.size / 2}" width="${s.size}" height="${s.size}" rx="${s.size * 0.18}"/><text y="${s.size * 0.22}" font-size="${s.size * 0.62}">${letter === 'qu' ? 'Qu' : letter.toUpperCase()}</text></g>`;
      g.appendChild(el);
      // A beat as a tile, then it squishes into the banana.
      setTimeout(() => el.firstChild.classList.add('smush'), 380);
    }
    this.updateBanana();
    sfx.nom(this.bananaCount);
    const st = this.hud && this.hud.querySelector('.banana-stage');
    if (st) { st.classList.remove('nom'); void st.offsetWidth; st.classList.add('nom'); }
  }

  // Filled: the sketch goes solid, Nana's face appears, it wiggles and flies off, and the tiles come home.
  completeBanana() {
    if (this.bananaDone) return;
    this.bananaDone = true;
    const st = this.hud && this.hud.querySelector('.banana-stage');
    sfx.fanfare();
    haptic('success');
    if (st) {
      st.classList.add('complete');
      st.querySelector('.banana-sub').textContent = this.bananaFirst === false ? 'Filled! Someone beat you to the badge.' : 'Filled!';
      setTimeout(() => st.classList.add('fly-away'), 1400);
      setTimeout(() => st.remove(), 2400);
    }
    this.board.tileEls.forEach((t, i) => {
      if (!t.classList.contains('hole')) return;
      setTimeout(() => { this.board.setHole(i, false); t.classList.remove('regrow'); void t.offsetWidth; t.classList.add('regrow'); }, 300 + i * 35);
    });
  }

  // Server: someone filled their banana. The first one gets the badge.
  bananaWin(m) {
    if (this.mode !== 'phone') return;
    if (m.id === this.me) {
      this.bananaFirst = m.first;
      if (m.first) {
        const tag = document.createElement('div');
        tag.className = 'split-badge pop-in';
        tag.textContent = 'Banana Split badge!';
        this.hud && this.hud.appendChild(tag);
        setTimeout(() => tag.remove(), 6000);
      }
    }
  }

  // ---------- Steven & Erin: "Mia found TOAST!" chips ----------
  // One row of like-button chips. New ones push the oldest out when the row is full; all of them
  // go when the event ends. Nobody gets the word for free: they still have to trace it.
  openTips(e) {
    const parent = this.mode === 'phone' ? this.hud : this.host && this.host.parentElement;
    if (!parent || this.tipRail) return;
    const rail = document.createElement('div');
    rail.className = `tip-rail ${this.mode}`;
    if (this.mode === 'phone') parent.appendChild(rail); else parent.insertBefore(rail, this.host.nextSibling);
    this.tipRail = rail;
    for (const t of this.round.tips || []) if (t.at >= e.at && t.at < e.at + e.dur) this.tip(t, true);
  }

  tip(m, quiet) {
    if (!this.tipRail) {
      // The announcement beat our own clock to the event start: keep it for when the row opens.
      (this.round.tips || (this.round.tips = [])).push(m);
      return;
    }
    const rail = this.tipRail;
    if (this.mode === 'phone' && m.from === this.me) return; // you already know you found it
    if ([...rail.children].some(c => c.dataset.w === m.w && !c.classList.contains('leaving'))) return;
    const p = this.member(m.from);
    const c = document.createElement('div');
    c.className = `tip${quiet ? '' : ' like'}`;
    c.dataset.w = m.w;
    c.style.setProperty('--pc', (p && p.color) || '#b48cff');
    c.innerHTML = `<span class="tip-heart">${UI.heart}<i class="burst">${'<b></b>'.repeat(6)}</i></span><span class="tip-text"><span class="tip-who">${esc(p ? p.name : 'Someone')} found</span> <b class="tip-word">${esc(m.w.toUpperCase())}!</b></span>`;
    rail.appendChild(c);
    if (this.mode === 'phone' && this.has(m.w)) this.tipFound(m.w);
    this.fitTips();
    if (!quiet) { sfx.like(); if (this.mode === 'phone') haptic('tick'); }
  }

  // You traced a word someone announced: the chip stays, marked as yours.
  tipFound(w) {
    const c = this.tipRail && [...this.tipRail.children].find(x => x.dataset.w === w && !x.classList.contains('got'));
    if (!c) return;
    c.classList.add('got');
    c.querySelector('.tip-who').insertAdjacentHTML('beforebegin', '<span class="tip-got">got it</span>');
  }

  // First in, first out: drop the oldest chips until the row fits again.
  fitTips() {
    const rail = this.tipRail;
    const chips = [...rail.children].filter(c => !c.classList.contains('leaving'));
    while (chips.length > 1 && rail.scrollWidth > rail.clientWidth + 1) {
      const old = chips.shift();
      old.style.left = `${old.offsetLeft}px`;
      old.classList.add('leaving'); // out of the row at once, then fades away
      setTimeout(() => old.remove(), 320);
    }
  }

  closeTips() {
    const rail = this.tipRail;
    if (!rail) return;
    this.tipRail = null;
    rail.classList.add('out');
    setTimeout(() => rail.remove(), 450);
  }

  destroy() {
    for (const e of this.events) if (this.state.get(e.id) === 'active') this.end(e, 'active');
    this.closeBanner();
    this.closeApproach();
    document.querySelectorAll('.chaos-tut, .flying-tile.rocket').forEach(x => x.remove());
    this.hud && this.hud.querySelectorAll('.chaos-note, .wordle-stage').forEach(x => x.remove());
  }

  // ---------- UI bits ----------
  banner(info, type) {
    this.closeBanner();
    const b = document.createElement('div');
    b.className = `chaos-banner ${this.mode}`;
    b.style.setProperty('--c', info.color);
    b.innerHTML = `<div class="chaos-icon">${UI[type] || ''}</div><div class="chaos-kicker">Family Chaos</div><div class="chaos-title">${esc(info.title)}</div><div class="chaos-short">${esc(this.mode === 'tv' && type === 'set' ? "Everybody's letters are under cards. Watch them scramble!" : (this.mode === 'tv' && info.tvShort) || info.short)}</div>`;
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
    t.querySelector('button').onclick = () => { store.mark(tutKey(type)); t.remove(); };
    document.body.appendChild(t);
  }

  showBanana() {
    if (!this.hud) return;
    this.hud.querySelector('.banana-stage')?.remove();
    this.bananaDone = false;
    this.bananaQueued = this.bananaCount;
    const w = document.createElement('div');
    w.className = 'banana-stage';
    w.innerHTML = `<div class="banana-big">${bananaSketchSVG()}</div>
      <div class="banana-info"><b class="banana-n">0</b><small>/ ${this.bananaFull} letters</small><div class="banana-sub">First to fill it wins the Banana Split</div></div>`;
    this.hud.appendChild(w);
    // Coming back mid-banana: what's already in there, already smushed.
    for (let n = 0; n < this.bananaCount; n++) {
      const g = w.querySelector('.blobs');
      const s = bananaSlot(n, this.bananaFull);
      g.insertAdjacentHTML('beforeend', `<g transform="translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) rotate(${s.angle.toFixed(0)})"><g class="btile smush"><rect x="${-s.size / 2}" y="${-s.size / 2}" width="${s.size}" height="${s.size}" rx="${s.size * 0.18}"/></g></g>`);
    }
    this.updateBanana();
  }

  updateBanana() {
    const w = this.hud && this.hud.querySelector('.banana-stage');
    if (!w) return;
    w.querySelector('.banana-n').textContent = Math.min(this.bananaCount, this.bananaFull);
    this.onBananaChange && this.onBananaChange(this.bananaCount);
  }
}

// ---------- P-pa Monster's face: horns, googly eyes, eyebrows and teeth, laid over the tile's letter ----------
const MONSTER_FACE = `<svg viewBox="0 0 100 100" overflow="visible">
  <path d="M10 6 L16 -20 L32 2 Z M90 6 L84 -20 L68 2 Z" fill="#fff3c4" stroke="#2f6b3c" stroke-width="4" stroke-linejoin="round"/>
  <g class="mon-arm l"><path d="M2 58 C -14 54, -18 40, -10 30" fill="none" stroke="#4fb86a" stroke-width="9" stroke-linecap="round"/><path d="M-10 30 l-6 -5 M-10 30 l1 -8 M-10 30 l7 -4" stroke="#2f6b3c" stroke-width="3.5" stroke-linecap="round"/></g>
  <g class="mon-arm r"><path d="M98 58 C 114 54, 118 40, 110 30" fill="none" stroke="#4fb86a" stroke-width="9" stroke-linecap="round"/><path d="M110 30 l6 -5 M110 30 l-1 -8 M110 30 l-7 -4" stroke="#2f6b3c" stroke-width="3.5" stroke-linecap="round"/></g>
  <circle cx="27" cy="20" r="13" fill="#fff" stroke="#2f6b3c" stroke-width="3.5"/><circle cx="73" cy="20" r="10" fill="#fff" stroke="#2f6b3c" stroke-width="3.5"/>
  <g class="mon-pupils"><circle cx="27" cy="21" r="5.5" fill="#1b1036"/><circle cx="73" cy="21" r="4.5" fill="#1b1036"/></g>
  <path d="M12 6 L38 12 M88 8 L64 13" stroke="#2f6b3c" stroke-width="5" stroke-linecap="round"/>
  <path d="M8 100 L8 88 L18 98 L28 86 L38 98 L50 86 L62 98 L72 86 L82 98 L92 88 L92 100 Z" fill="#fff" stroke="#2f6b3c" stroke-width="3" stroke-linejoin="round"/>
</svg>`;

// ---------- Nana's banana, as a sketch that fills with tiles ----------
// The outline's center line runs from the tip (left) to the stem; tile n sits n steps along it.
const BANANA_SPINE = [[14, 39], [26, 47], [40, 52], [55, 54], [70, 51], [84, 44], [95, 33], [102, 21]];
const spineLen = (() => { let l = 0; for (let i = 1; i < BANANA_SPINE.length; i++) l += Math.hypot(BANANA_SPINE[i][0] - BANANA_SPINE[i - 1][0], BANANA_SPINE[i][1] - BANANA_SPINE[i - 1][1]); return l; })();
export function bananaSlot(n, full) {
  const steps = Math.max(full, 1);
  // Tiles past the target pile on top of the last few spots.
  const u = Math.min(n, steps - 1) / Math.max(steps - 1, 1);
  let want = u * spineLen;
  for (let i = 1; i < BANANA_SPINE.length; i++) {
    const a = BANANA_SPINE[i - 1], b = BANANA_SPINE[i];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (want <= seg || i === BANANA_SPINE.length - 1) {
      const t = Math.min(1, want / seg);
      const middle = 1 - Math.abs(u - 0.5) * 1.3; // fatter in the middle, thinner at the ends
      const size = Math.min(15, (spineLen / steps) * 1.5) * (0.75 + 0.35 * middle);
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, size, angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI };
    }
    want -= seg;
  }
  return { x: 60, y: 50, size: 10, angle: 0 };
}
let sketchN = 0;
export function bananaSketchSVG() {
  const id = `bsk${sketchN++}`;
  // A few loose, slightly offset strokes so it reads as a pencil sketch.
  const strokes = [[0, 0, 1.6, 0.9], [0.8, -0.6, 1.1, 0.55], [-0.7, 0.7, 0.9, 0.45]].map(([dx, dy, w, o]) =>
    `<path d="${BANANA_SHAPE}" transform="translate(${dx} ${dy})" fill="none" stroke="#fff1d2" stroke-width="${w}" stroke-opacity="${o}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${9 + dx * 3} ${1.5 + o}"/>`).join('');
  return `<svg class="banana-sketch" viewBox="0 0 120 70"><defs><clipPath id="${id}"><path d="${BANANA_SHAPE}"/></clipPath></defs>
    <path class="sketch-fill" d="${BANANA_SHAPE}" fill="rgba(255,241,210,0.05)"/>
    <g class="blobs" clip-path="url(#${id})"></g>
    <path class="solid-line" d="${BANANA_SHAPE}" fill="none" stroke="#2b1650" stroke-width="3" stroke-linejoin="round"/>
    <g class="sketch-lines">${strokes}
      <path d="M104 10 L107 2 L112 3 L109 12" fill="none" stroke="#fff1d2" stroke-width="1.3" stroke-opacity=".8" stroke-linecap="round"/>
      <path d="M10 40 C 7 41, 5 40, 6 37" fill="none" stroke="#fff1d2" stroke-width="1.3" stroke-opacity=".8" stroke-linecap="round"/></g>
    <g class="banana-face">
      <circle cx="56" cy="53" r="3.4" fill="#2b1650"/><circle cx="57.2" cy="51.8" r="1.1" fill="#fff"/>
      <circle cx="72" cy="50" r="3.4" fill="#2b1650"/><circle cx="73.2" cy="48.8" r="1.1" fill="#fff"/>
      <ellipse cx="50" cy="58" rx="4" ry="2.4" fill="#ff8fab" opacity=".7"/><ellipse cx="79" cy="54" rx="4" ry="2.4" fill="#ff8fab" opacity=".7"/>
      <path d="M60 58 Q 65 63, 70 56" stroke="#2b1650" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <g transform="translate(100 13) rotate(-20)"><path d="M0 0 L-9 -6 L-9 6 Z M0 0 L9 -6 L9 6 Z" fill="#ff5c8a" stroke="#2b1650" stroke-width="1.6" stroke-linejoin="round"/><circle r="2.6" fill="#ff5c8a" stroke="#2b1650" stroke-width="1.6"/></g>
    </g>
  </svg>`;
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
    // One fill per puff: overlapping puffs have to stack up to make thick smoke (batching them flattened it).
    for (const p of this.parts) {
      p.r += p.vr; p.a *= 0.975; p.x += p.vx; p.y += p.vy;
      g.fillStyle = `rgba(225, 220, 235, ${p.a.toFixed(3)})`;
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
function countSets(cards) {
  let n = 0;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) for (let k = j + 1; k < cards.length; k++) if (isSet(cards[i], cards[j], cards[k])) n++;
  return n;
}
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
    this.counter = document.createElement('div');
    this.counter.className = 'set-count';
    board.fx.appendChild(this.counter);
    this.updateCount();
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
    this.updateCount();
  }
  // How many sets are still hiding among the covered cards. At zero, the rest of the cards clear.
  updateCount() {
    if (!this.cards.size) { this.counter.remove(); return; }
    const left = countSets([...this.cards.values()]);
    this.counter.innerHTML = left ? `<b>${left}</b> set${left === 1 ? '' : 's'} left` : 'No sets left!';
    this.counter.classList.remove('bump'); void this.counter.offsetWidth; this.counter.classList.add('bump');
    if (!left && !this.clearing) {
      this.clearing = true;
      sfx.whoosh();
      setTimeout(() => { this.clearing = false; this.remove([...this.cards.keys()]); }, 650);
    }
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
    this.counter.remove();
  }
}

export { cardSVG };
