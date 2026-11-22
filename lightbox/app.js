// LIGHTBOX: two picture-logic games in one app.
// This file is the shell around the two game modules: screens, saved progress, daily puzzles, hints and sound.
// Screens follow the address after the '#', so the phone's back button works:
//   #/                      home
//   #/overlap               level list for a mode
//   #/overlap/level/3       a drawn picture (counted from 0)
//   #/glass/endless/5       an endless puzzle (always the same puzzle for the same number)
//   #/overlap/daily         today's puzzle
import * as overlap from './overlap.js';
import * as glass from './glass.js';
import { seeded, hash, finger } from './util.js';

const MODES = { overlap, glass };
const BUILD = 2;
const START_HINTS = 5, REFILL = 3, AHEAD = 3;   // AHEAD: how many unsolved pictures are open at once
const root = document.getElementById('root'), modal = document.getElementById('modal');

/* ── saved progress ── */
const KEY = 'lightbox:v1';
const fresh = () => ({ solved: { overlap: {}, glass: {} }, saves: {}, hints: START_HINTS, sound: true, daily: {}, endless: { overlap: 0, glass: 0 }, seenHelp: {} });
function load() { try { const j = JSON.parse(localStorage.getItem(KEY)); return j ? Object.assign(fresh(), j) : fresh(); } catch (e) { return fresh(); } }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode: play on without saving */ } }
let S = load();

/* ── sound: a tiny synth, so there are no audio files to load ── */
let AC = null;
function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no sound */ } } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
function blip(freq, dur = 0.08, type = 'triangle', vol = 0.12) {
  if (!S.sound) return; const ac = audio(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur + 0.02);
}
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const note = (i, dur = 0.12, vol = 0.1) => blip(262 * Math.pow(2, SCALE[i % SCALE.length] / 12), dur, 'triangle', vol);
// Inside the iPhone app, taps are felt through the phone's own haptics. In a browser, vibration is used where it exists.
const native = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.lightbox;
const buzz = (ms, kind = 'tick') => { if (native) native.postMessage({ haptic: kind }); else if (navigator.vibrate) navigator.vibrate(ms); };
const sfx = {
  on: i => { note(2 + (i % 7)); buzz(8); },
  off: dark => { blip(dark ? 240 : 320, 0.05); buzz(6); },
  win: () => { buzz(30, 'success'); [0, 2, 4, 5, 7, 9].forEach((k, j) => setTimeout(() => note(k + 1, 0.2), j * 90)); },
  tick: () => blip(520, 0.04),
};

/* ── which puzzle ── */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const keyOf = r => `${r.mode}:${r.kind}:${r.kind === 'level' ? MODES[r.mode].levels[r.i].id : r.kind === 'daily' ? r.date : r.i}`;
function makePuzzle(r) {
  const M = MODES[r.mode];
  if (r.kind === 'level') return M.makeLevel(r.i);
  if (r.kind === 'daily') return M.makeEndless(seeded(hash(`daily:${r.mode}:${r.date}`)), 3);
  return M.makeEndless(seeded(hash(`endless:${r.mode}:${r.i}`)), r.i);
}
const solvedCount = m => MODES[m].levels.filter(l => S.solved[m][l.id]).length;
const isOpen = (m, i) => i < solvedCount(m) + AHEAD || S.solved[m][MODES[m].levels[i].id];
const single = m => MODES[m].endlessName.replace(/s$/, '');
function streak() {
  let n = 0; const d = new Date();
  if (!S.daily[today()]) d.setDate(d.getDate() - 1);
  for (;;) { const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; if (!S.daily[k]) break; n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ── screens ── */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let play = null, raf = 0, demoRaf = 0;

function route() {
  cancelAnimationFrame(raf); play = null; closeModal();
  const [m, kind, n] = location.hash.replace(/^#\/?/, '').split('/');
  if (!MODES[m]) return home();
  if (!kind) return levelList(m);
  const M = MODES[m];
  if (kind === 'level' && M.levels[+n]) return playScreen({ mode: m, kind, i: +n });
  if (kind === 'endless' && +n >= 0) return playScreen({ mode: m, kind, i: +n });
  if (kind === 'daily') return playScreen({ mode: m, kind, date: today() });
  location.hash = '#/' + m;
}
const go = h => { if (location.hash === h) route(); else location.hash = h; };

function drawThumbs() {
  root.querySelectorAll('canvas[data-mode]').forEach(cv => {
    const M = MODES[cv.dataset.mode], px = Math.round(cv.clientWidth * Math.min(window.devicePixelRatio || 1, 3)) || 200;
    cv.width = cv.height = px;
    M.thumb(cv.getContext('2d'), M.art(+cv.dataset.i), px, cv.dataset.solved === '1');
  });
}

function home() {
  const t = today(), done = S.daily[t] || {}, st = streak();
  const card = m => {
    const M = MODES[m], n = solvedCount(m), total = M.levels.length;
    // Show the newest finished picture, or the outlines of the next one to do.
    let last = -1; M.levels.forEach((l, i) => { if (S.solved[m][l.id]) last = i; });
    const show = last >= 0 ? last : 0;
    return `<button class="mode card" data-go="#/${m}">
      <canvas data-mode="${m}" data-i="${show}" data-solved="${last >= 0 ? 1 : 0}"></canvas>
      <div style="flex:1"><h2>${esc(M.title)}</h2><p>${esc(M.blurb)}</p>
      <div class="meter"><i style="width:${(100 * n / total).toFixed(1)}%"></i></div><span class="count">${n} of ${total} pictures</span></div></button>`;
  };
  root.innerHTML = `<main class="screen">
    <header class="brand"><img src="icon.svg" alt=""><div><h1>Lightbox</h1><p>Picture puzzles made of paper and glass.</p></div></header>
    <section class="daily card">
      <div class="daily-head"><h2>Today</h2><span>${st ? `${st}-day streak` : 'A new pair every day'}</span></div>
      <div class="daily-row">${Object.keys(MODES).map(m => `<button class="pill${done[m] ? ' done' : ''}" data-go="#/${m}/daily">${done[m] ? '✓ ' : ''}${esc(single(m))}</button>`).join('')}</div>
    </section>
    ${card('overlap')}${card('glass')}
    <div class="foot"><button data-act="sound">Sound: ${S.sound ? 'on' : 'off'}</button><span>Build ${BUILD}</span></div>
  </main>`;
  drawThumbs();
}

function levelList(m) {
  const M = MODES[m];
  const tiles = M.levels.map((l, i) => {
    const solved = !!S.solved[m][l.id];
    if (solved) return `<button class="tile" data-go="#/${m}/level/${i}"><canvas data-mode="${m}" data-i="${i}" data-solved="1"></canvas><small>${esc(l.name.replace(/^an? /, ''))}</small></button>`;
    if (!isOpen(m, i)) return `<div class="tile locked">${i + 1}</div>`;
    return `<button class="tile${S.saves[`${m}:level:${l.id}`] ? ' started' : ''}" data-go="#/${m}/level/${i}">${i + 1}</button>`;
  }).join('');
  root.innerHTML = `<main class="screen">
    <header class="bar"><button class="round" data-go="#/" aria-label="Home">‹</button><h2>${esc(M.title)}</h2><button class="round" data-act="help" data-mode="${m}" aria-label="How to play">?</button></header>
    <div class="grid">${tiles}</div>
    <button class="wide card" data-go="#/${m}/endless/${S.endless[m]}"><div><h3>${esc(M.endlessName)}</h3><p>Endless, a new one every time. ${S.endless[m]} finished.</p></div><b>›</b></button>
  </main>`;
  drawThumbs();
}

function playScreen(r) {
  const M = MODES[r.mode], key = keyOf(r), puzzle = makePuzzle(r), game = new M.Game(puzzle, S.saves[key], sfx), size = M.sizeOf(puzzle);
  const title = r.kind === 'level' ? `${M.title} ${r.i + 1}` : r.kind === 'daily' ? `Today’s ${single(r.mode).toLowerCase()}` : `${single(r.mode)} ${r.i + 1}`;
  root.innerHTML = `<main class="screen play">
    <header class="bar"><button class="round" data-go="${r.kind === 'daily' ? '#/' : '#/' + r.mode}" aria-label="Back">‹</button><h2>${esc(title)}</h2><button class="round" data-act="help" data-mode="${r.mode}" aria-label="How to play">?</button></header>
    <div class="hud"><span>Undecided <strong id="left"></strong></span><span>Hints <strong id="hints"></strong></span></div>
    <div class="stage card"><canvas id="cv"></canvas></div>
    <p class="msg" id="msg"></p>
    <div class="tools" id="tools"><button class="btn" data-act="undo">Undo</button><button class="btn go" data-act="hint">Hint</button><button class="btn" data-act="clear">Clear</button></div>
    <div class="won" id="won" hidden><button class="btn" data-go="${r.kind === 'daily' ? '#/' : '#/' + r.mode}">${r.kind === 'daily' ? 'Home' : 'All pictures'}</button><button class="btn go" data-act="next">Next</button></div>
  </main>`;
  const cv = document.getElementById('cv'), dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.width = size.w * dpr; cv.height = size.h * dpr; cv.style.aspectRatio = `${size.w} / ${size.h}`;
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  play = { r, key, game, cv, ctx, size, puzzle };
  // The very first picture points at each move, so the rules can be picked up without reading.
  game.coach = r.kind === 'level' && r.i === 0 && !S.solved[r.mode][M.levels[0].id];
  cv.addEventListener('pointerdown', e => {
    audio();
    const b = cv.getBoundingClientRect(), k = size.w / b.width;
    if (game.tap((e.clientX - b.left) * k, (e.clientY - b.top) * k)) { say(''); afterMove(); }
  });
  say(game.won || !game.coach ? '' : 'Follow the finger.');
  refresh();
  let last = 0;
  raf = requestAnimationFrame(function loop(t) {
    const dt = Math.min(0.033, (t - last) / 1000 || 0); last = t;
    game.frame(ctx, dt);
    if (play && play.game === game) raf = requestAnimationFrame(loop);
  });
  if (!S.seenHelp[r.mode]) { S.seenHelp[r.mode] = true; persist(); help(r.mode); }
}
const say = t => { const el = document.getElementById('msg'); if (el) el.textContent = t; };
function refresh() {
  if (!play) return;
  document.getElementById('left').textContent = play.game.left;
  document.getElementById('hints').textContent = S.hints;
}
function afterMove() {
  const { game, key, r } = play;
  if (game.won) {
    delete S.saves[key];
    if (r.kind === 'level') S.solved[r.mode][MODES[r.mode].levels[r.i].id] = true;
    if (r.kind === 'endless') S.endless[r.mode] = Math.max(S.endless[r.mode], r.i + 1);
    if (r.kind === 'daily') (S.daily[r.date] = S.daily[r.date] || {})[r.mode] = true;
    const name = play.puzzle.name;
    say(name ? `It’s ${name}!` : r.kind === 'daily' ? `Today’s ${single(r.mode).toLowerCase()}, done.` : `${single(r.mode)} No. ${r.i + 1}, done.`);
    document.getElementById('tools').hidden = true; document.getElementById('won').hidden = false;
  } else S.saves[key] = game.save();
  persist(); refresh();
}
function next() {
  const { r } = play, M = MODES[r.mode];
  if (r.kind === 'level') go(r.i + 1 < M.levels.length ? `#/${r.mode}/level/${r.i + 1}` : `#/${r.mode}`);
  else if (r.kind === 'endless') go(`#/${r.mode}/endless/${r.i + 1}`);
  else { const other = Object.keys(MODES).find(m => m !== r.mode); go((S.daily[r.date] || {})[other] ? '#/' : `#/${other}/daily`); }
}
function hint() {
  if (!play || play.game.won) return;
  if (S.hints <= 0) return openModal(`<div class="sheet"><h3>Out of hints</h3><p>In the finished app, watching a short ad would give you ${REFILL} more. For now they are free.</p><button class="btn go" data-act="refill">Get ${REFILL} hints</button></div>`);
  const t = play.game.hint();
  if (!t) return say('Nothing to point at right now.');
  S.hints--; sfx.tick(); say(t); S.saves[play.key] = play.game.save(); persist(); refresh();
}

/* ── pop-ups ── */
function openModal(html) { modal.innerHTML = html; modal.hidden = false; }
function closeModal() { cancelAnimationFrame(demoRaf); modal.hidden = true; modal.innerHTML = ''; }
function help(m) {
  const M = MODES[m];
  openModal(`<div class="sheet"><h3>${esc(M.title)}</h3>
    ${M.demos ? '<canvas id="demo"></canvas><p class="cap" id="cap"></p>' : ''}
    <ol class="${M.demos ? 'fine' : ''}">${M.howto.map(t => `<li>${esc(t)}</li>`).join('')}</ol><button class="btn go" data-act="close">Got it</button></div>`);
  if (M.demos) runDemo(M, document.getElementById('demo'), document.getElementById('cap'));
}
// The animated how-to: tiny puzzles that play themselves, one after another, with a finger showing each tap.
function runDemo(M, cv, cap) {
  const quiet = { on() {}, off() {}, win() {} }, dpr = Math.min(window.devicePixelRatio || 1, 3);
  let n = -1, g, view, at = null, to = null, move = 0, wait = 0, taps = 0, press = 1, hold = 0, last = 0, t = 0;
  const ctx = cv.getContext('2d');
  const next = () => {
    n = (n + 1) % M.demos.length; const d = M.demos[n];
    g = new M.Game(d.puzzle, null, quiet); g.fx.confetti = () => {};
    view = d.view || { y: 0, h: M.sizeOf(d.puzzle).h };
    cv.width = M.W * dpr; cv.height = view.h * dpr; cv.style.aspectRatio = `${M.W} / ${view.h}`;
    cap.textContent = d.caption; to = null; hold = 0; wait = 0.5;
    if (!at) at = { x: M.W / 2, y: view.y + view.h + 30 };
  };
  next();
  demoRaf = requestAnimationFrame(function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000 || 0); last = now; t += dt; press = Math.min(1, press + dt * 2.4);
    if (wait > 0) wait -= dt;
    else if (!to) {
      const a = g.autoStep();
      if (a) { to = a; taps = a.taps; move = 0; to.from = { ...at }; }
      else if ((hold += dt) > 1.5) next();
    } else if (move < 1) {
      move = Math.min(1, move + dt / 0.55); const e = 1 - Math.pow(1 - move, 3);
      at = { x: to.from.x + (to.x - to.from.x) * e, y: to.from.y + (to.y - to.from.y) * e };
      if (move >= 1) wait = 0.25;
    } else { g.tap(to.x, to.y); press = 0; taps--; wait = 0.55; if (taps <= 0) to = null; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, -view.y * dpr);
    g.frame(ctx, dt);
    finger(ctx, at.x, at.y, t, 1, press);
    demoRaf = requestAnimationFrame(loop);
  });
}

/* ── one listener for every button ── */
document.addEventListener('click', e => {
  if (e.target === modal) return closeModal();
  const b = e.target.closest('[data-go], [data-act]'); if (!b) return;
  audio();
  if (b.dataset.go) { sfx.tick(); return go(b.dataset.go); }
  const a = b.dataset.act;
  if (a === 'sound') { S.sound = !S.sound; persist(); sfx.tick(); home(); }
  else if (a === 'help') help(b.dataset.mode);
  else if (a === 'close') closeModal();
  else if (a === 'refill') { S.hints += REFILL; persist(); refresh(); closeModal(); }
  else if (a === 'hint') hint();
  else if (a === 'next') next();
  else if (play && a === 'undo') { if (play.game.undo()) { sfx.tick(); say(''); afterMove(); } }
  else if (play && a === 'clear') { play.game.clear(); sfx.tick(); say(''); afterMove(); }
});

/* ── no double-tap zoom ──
   Safari can still zoom on a fast second tap even with touch-action set. A touch that starts soon after a tap, close
   to where that tap was, is cancelled outright, which is what stops the zoom. Cancelling a touch also cancels its click,
   so the click is sent by hand. The game board listens for pointerdown and is unaffected. */
(function () {
  let lastEnd = 0, lastTap = false, lx = 0, ly = 0, sx = 0, sy = 0, held = false;
  document.addEventListener('touchstart', e => {
    if (e.touches.length > 1) { if (e.cancelable) e.preventDefault(); return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    held = lastTap && Date.now() - lastEnd < 600 && Math.hypot(sx - lx, sy - ly) < 90 && e.cancelable;
    if (held) e.preventDefault();
  }, { passive: false, capture: true });
  document.addEventListener('touchend', e => {
    const t = e.changedTouches[0], tap = !!t && Math.hypot(t.clientX - sx, t.clientY - sy) < 12;
    lastEnd = Date.now(); lastTap = tap; lx = sx; ly = sy;
    if (!held) return; held = false;
    if (e.cancelable) e.preventDefault();
    if (tap && e.target.click) e.target.click();
  }, { passive: false, capture: true });
  ['gesturestart', 'gesturechange', 'gestureend', 'dblclick'].forEach(n => document.addEventListener(n, e => e.preventDefault(), { passive: false, capture: true }));
})();

window.addEventListener('hashchange', route);
route();

// Handy when testing from the browser console.
window.lightbox = { get state() { return S; }, get play() { return play; }, reset() { S = fresh(); persist(); go('#/'); } };
