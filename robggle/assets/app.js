// Robggle client. One file drives three pages: /robggle/ (home), /robggle/game/ (screen), /robggle/join/ (controller).
import { Conn, fnv, fetchLobbies, haptic, native, IN_APP, SERVER } from './net.js';
import { makeBoard, tileText } from './board.js';
import { sfx, unlock } from './sfx.js';
import { runReveal, chipHTML } from './reveal.js';

const MODE = document.body.dataset.mode; // home | screen | join
const $root = document.getElementById('root');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
if (IN_APP) document.body.classList.add('app');

const LOGO = `<div class="logo">${'ROBGGLE'.split('').map((c, i) => `<span class="${i === 3 || i === 4 ? 'hot' : ''}" style="--i:${i};--r:${[-6, 4, -3, 5, -4, 3, -5][i]}deg">${c}</span>`).join('')}</div>`;
const SIZE_OPTS = [[4, '4×4'], [5, '5×5'], [6, '6×6']];
const MIN_OPTS = [[3, '3'], [4, '4'], [5, '5'], [6, '6']];
const TIME_OPTS = [[60, '1:00'], [90, '1:30'], [120, '2:00'], [180, '3:00'], [240, '4:00'], [300, '5:00']];
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, '0')}`;

function joinURL(code) {
  const local = /^(localhost|127\.|\d+\.\d+\.\d+\.\d+)/.test(location.hostname);
  const base = local ? `${location.origin}` : 'https://www.stevenhester.com';
  return `${base}/robggle/join/?c=${code}`;
}

function toast(msg, ms = 2200) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ---------------- shared game state ----------------
const S = {
  conn: null,
  you: null,        // {id, token, role}
  code: null,
  st: null,         // last lobby state
  round: null,      // current round message
  mine: new Set(),
  ally: new Map(),  // word -> {by, path}
  score: 0,
  reveal: null,
  view: null,
  play: null,       // play view handles
  wantRole: MODE === 'screen' ? 'screen' : 'player',
};
const member = id => S.st && S.st.members.find(m => m.id === id);
const isHost = () => S.st && S.you && S.st.hostId === S.you.id;
const players = () => (S.st ? S.st.members.filter(m => m.role === 'player') : []);

function connect(hello) {
  if (!S.conn) S.conn = new Conn(onMsg, onStatus);
  S.conn.hello = hello;
  S.conn.open();
  if (S.conn.ws && S.conn.ws.readyState === 1) S.conn.ws.send(JSON.stringify(hello));
}

let statusTimer;
function onStatus(s) {
  clearTimeout(statusTimer);
  const bar = document.getElementById('netbar');
  if (s === 'open') { bar && bar.remove(); return; }
  if (!S.code) return;
  statusTimer = setTimeout(() => {
    if (document.getElementById('netbar')) return;
    const b = document.createElement('div');
    b.id = 'netbar'; b.className = 'toast'; b.textContent = 'Reconnecting…';
    document.body.appendChild(b);
  }, 1200);
}

function onMsg(m) {
  switch (m.t) {
    case 'joined': {
      const firstJoin = !S.you || S.code !== m.code;
      S.you = m.you; S.code = m.code;
      S.conn.hello = { t: 'join', code: m.code, token: m.you.token };
      store.set(MODE === 'screen' ? 'rb:screen' : 'rb:last', { code: m.code, token: m.you.token, at: Date.now() });
      if (MODE === 'join' && params.get('c') !== m.code) history.replaceState(null, '', `?c=${m.code}${IN_APP ? '&app=1' : ''}`);
      if (firstJoin) sfx.join();
      native({ inLobby: m.code });
      break;
    }
    case 'state': {
      const prev = S.st;
      S.st = m;
      if (prev && MODE === 'screen') {
        const before = new Set(prev.members.map(x => x.id));
        if (m.members.some(x => !before.has(x.id) && x.role === 'player')) sfx.join();
      }
      if (m.phase === 'lobby') { closeReveal(); renderLobby(); }
      else if (S.view === 'play') updatePlaySide();
      if (S.reveal) S.reveal.refreshActions();
      break;
    }
    case 'round': startRound(m); break;
    case 'counts': if (S.st) { S.st.counts = m.counts; updatePlaySide(true); } break;
    case 'wordResult': wordResult(m); break;
    case 'ally': allyWord(m); break;
    case 'results': showResults(m); break;
    case 'error':
      if (m.code === 'nolobby') {
        if (MODE === 'screen') { store.del('rb:screen'); S.conn.hello = null; connect({ t: 'create', role: 'screen' }); return; }
        store.del('rb:last');
        S.code = null; S.conn.hello = null;
        toast(m.msg);
        renderHome();
      } else toast(m.msg);
      break;
  }
}

// ---------------- HOME (/robggle/) ----------------
function renderLanding() {
  $root.innerHTML = `<div class="wrap stack center" style="padding-top:8vh">
    ${LOGO}
    <p class="muted">A word-hunt for the whole family, wherever they are.</p>
    <a class="btn" href="game/">Show the game on this screen</a>
    <a class="btn ghost" href="join/">Play on this device</a>
    <p class="muted small">Screens show the board and scores. Phones are the controllers.</p>
  </div>`;
  $root.querySelectorAll('a.btn').forEach(a => { a.style.textDecoration = 'none'; });
}

// ---------------- JOIN home (no lobby yet) ----------------
let lobbyPoll;
function renderHome() {
  S.view = 'home';
  closeReveal();
  const name = store.get('rb:name', '');
  const last = store.get('rb:last');
  const recent = last && Date.now() - last.at < 3 * 3600e3 ? last : null;
  $root.innerHTML = `<div class="wrap stack">
    <div class="center" style="margin:8px 0 4px">${LOGO}</div>
    <div class="card stack">
      <h3>Your name</h3>
      <input id="name" class="field" maxlength="14" placeholder="Name" value="${esc(name)}" autocomplete="nickname">
    </div>
    ${recent ? `<button class="btn mint" id="rejoin">Rejoin ${esc(recent.code)}</button>` : ''}
    <div class="card stack">
      <h3>Join with a code</h3>
      <div class="row"><input id="code" class="field code-field grow" maxlength="4" placeholder="ABCD" autocapitalize="characters" autocomplete="off"><button class="btn" id="go">Join</button></div>
    </div>
    <div class="card stack">
      <div class="row"><h3 class="grow">Open games</h3><button class="btn small ghost" id="refresh">Refresh</button></div>
      <div id="lobbies" class="stack"><div class="muted small">Looking…</div></div>
    </div>
    <button class="btn ghost" id="create">Start a game (no screen needed)</button>
  </div>`;
  const nameEl = $root.querySelector('#name');
  const getName = () => {
    const n = nameEl.value.trim();
    if (!n) { nameEl.focus(); toast('Pick a name first'); return null; }
    store.set('rb:name', n);
    return n;
  };
  nameEl.addEventListener('change', () => store.set('rb:name', nameEl.value.trim()));
  const codeEl = $root.querySelector('#code');
  codeEl.addEventListener('input', () => { codeEl.value = codeEl.value.toUpperCase().replace(/[^A-Z]/g, ''); });
  const join = code => { const n = getName(); if (!n) return; unlock(); connect({ t: 'join', code, role: 'player', name: n }); };
  $root.querySelector('#go').onclick = () => { if (codeEl.value.length === 4) join(codeEl.value); else toast('Codes are 4 letters'); };
  codeEl.addEventListener('keydown', e => { if (e.key === 'Enter') $root.querySelector('#go').click(); });
  $root.querySelector('#create').onclick = () => { const n = getName(); if (!n) return; unlock(); connect({ t: 'create', role: 'player', name: n }); };
  const rj = $root.querySelector('#rejoin');
  if (rj) rj.onclick = () => { unlock(); connect({ t: 'join', code: recent.code, token: recent.token, name: nameEl.value.trim() }); };
  const list = $root.querySelector('#lobbies');
  const load = async () => {
    if (S.view !== 'home') return clearInterval(lobbyPoll);
    try {
      const ls = await fetchLobbies();
      list.innerHTML = ls.length ? '' : `<div class="muted small">No open games right now. Start one!</div>`;
      for (const l of ls) {
        const b = document.createElement('button');
        b.className = 'lobby-item';
        const status = l.phase === 'lobby' ? 'In the lobby' : 'Playing now';
        b.innerHTML = `<span class="lobby-code">${esc(l.code)}</span><span class="grow"><b>${l.screen && l.host === 'Screen' ? 'Game on a screen' : `${esc(l.host)}'s game`}</b><br><span class="muted small">${l.players} player${l.players === 1 ? '' : 's'} · ${status} · ${l.settings.size}×${l.settings.size}</span></span>`;
        b.onclick = () => join(l.code);
        list.appendChild(b);
      }
    } catch { list.innerHTML = `<div class="muted small">Can't reach the game server.</div>`; }
  };
  $root.querySelector('#refresh').onclick = load;
  load();
  clearInterval(lobbyPoll);
  lobbyPoll = setInterval(load, 4000);
}

// ---------------- LOBBY ----------------
function settingsHTML() {
  const s = S.st.settings;
  const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${s[key] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  if (!isHost()) {
    return `<div class="muted">${s.size}×${s.size} board · words of ${s.minLen}+ letters · ${fmtTime(s.time)}</div>`;
  }
  return `<div class="stack">
    <div class="setting"><label>Board</label>${seg('size', SIZE_OPTS)}</div>
    <div class="setting"><label>Min letters</label>${seg('minLen', MIN_OPTS)}</div>
    <div class="setting"><label>Time</label>${seg('time', TIME_OPTS)}</div>
  </div>`;
}
function wireSettings(scope) {
  scope.querySelectorAll('.seg').forEach(seg => {
    seg.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        const next = { ...S.st.settings, [seg.dataset.key]: +b.dataset.v };
        S.conn.send({ t: 'settings', ...next });
      };
    });
  });
}

function playersHTML({ big } = {}) {
  const ps = players();
  if (!ps.length) return `<div class="muted">Waiting for players to join…</div>`;
  const row = p => `<div class="player-row pop-in" data-id="${p.id}">${chipHTML(p, p.connected ? '' : 'off')}<span class="name grow" style="${big ? 'font-size:24px' : ''}">${esc(p.name)}</span>${p.id === S.st.hostId ? '<span class="tag">host</span>' : ''}${S.you && p.id === S.you.id ? '<span class="tag">you</span>' : ''}${S.st.roundNo && p.total ? `<span class="tag">${p.total} pts</span>` : ''}</div>`;
  let html = '';
  for (const a of S.st.alliances) {
    const mem = ps.filter(p => p.alliance === a.id);
    if (!mem.length) continue;
    html += `<div class="alliance-box" style="--ac:${a.color}"><div class="aname">${esc(a.name)}</div>${mem.map(row).join('')}</div>`;
  }
  html += ps.filter(p => !p.alliance).map(row).join('');
  return `<div class="stack" style="gap:8px">${html}</div>`;
}

function allianceHTML() {
  const me = member(S.you.id);
  if (!me || me.role !== 'player') return '';
  const mine = me.alliance && S.st.alliances.find(a => a.id === me.alliance);
  if (mine) {
    return `<div class="card stack"><div class="row"><span class="grow">You're in <b style="color:${mine.color}">${esc(mine.name)}</b>. Words your allies find show up on your list to copy.</span></div>
      <button class="btn small ghost" data-ally="">Leave alliance</button></div>`;
  }
  const others = S.st.alliances.filter(a => players().some(p => p.alliance === a.id));
  return `<div class="card stack"><h3>Team up</h3>
    <div class="muted small">Allies see each other's words and can copy them. Teams can be any size.</div>
    ${others.map(a => `<button class="btn small" style="background:${a.color};color:#1b1036" data-ally="${a.id}">Join ${esc(a.name)}</button>`).join('')}
    <button class="btn small ghost" data-ally="new">Start an alliance</button></div>`;
}

function renderLobby() {
  if (!S.st || !S.you) return;
  S.view = 'lobby';
  S.play && S.play.board.destroy();
  S.play = null;
  if (MODE === 'screen') return renderScreenLobby();
  const me = member(S.you.id);
  $root.innerHTML = `<div class="wrap stack">
    <div class="row"><div class="grow" style="font-size:26px">${LOGO.replace('class="logo"', 'class="logo" style="font-size:26px"')}</div>
      <button class="lobby-code" id="share" style="border:0">${esc(S.code)}</button></div>
    <div class="card row">${me ? chipHTML(me, 'big') : ''}<div class="grow"><div style="font-size:22px;font-weight:700">${esc(me ? me.name : '')}</div><div class="muted small">Tap the code to invite people</div></div><button class="btn small ghost" id="rename">Rename</button></div>
    ${allianceHTML()}
    <div class="card stack"><h3>Players</h3>${playersHTML()}</div>
    <div class="card stack"><h3>Game</h3>${settingsHTML()}</div>
    ${isHost() ? `<button class="btn" id="start">Start game</button>${S.st.roundNo ? '<button class="btn small ghost" id="reset">Reset scores</button>' : ''}` : `<div class="center muted">Waiting for the host to start…</div>`}
    <button class="btn small ghost" id="leave">Leave game</button>
  </div>`;
  wireSettings($root);
  $root.querySelectorAll('[data-ally]').forEach(b => { b.onclick = () => { S.conn.send({ t: 'alliance', id: b.dataset.ally || null }); haptic('tick'); }; });
  const st = $root.querySelector('#start');
  if (st) st.onclick = () => { unlock(); S.conn.send({ t: 'start' }); };
  const rs = $root.querySelector('#reset');
  if (rs) rs.onclick = () => S.conn.send({ t: 'resetScores' });
  $root.querySelector('#leave').onclick = () => {
    S.conn.send({ t: 'leave' });
    store.del('rb:last');
    S.code = null; S.you = null; S.st = null; S.conn.hello = null;
    native({ inLobby: null });
    history.replaceState(null, '', IN_APP ? '?app=1' : location.pathname);
    renderHome();
  };
  $root.querySelector('#rename').onclick = () => {
    const n = prompt('Your name', me ? me.name : '');
    if (n && n.trim()) { store.set('rb:name', n.trim()); S.conn.send({ t: 'rename', name: n.trim() }); }
  };
  $root.querySelector('#share').onclick = async () => {
    const url = joinURL(S.code);
    if (IN_APP) return native({ share: url });
    try { if (navigator.share) return await navigator.share({ title: 'Play Robggle', url }); } catch { return; }
    try { await navigator.clipboard.writeText(url); toast('Invite link copied'); } catch { toast(url, 4000); }
  };
}

function qrSVG(text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text); qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

function renderScreenLobby() {
  const url = joinURL(S.code);
  const shown = url.replace(/^https?:\/\//, '').replace(/\?c=.*/, '');
  $root.innerHTML = `<div class="screen">
    <div class="left">
      ${LOGO}
      <div class="join-card">
        <div class="qr">${qrSVG(url)}</div>
        <div>
          <div class="muted" style="font-size:2.6vmin">Scan to join, or enter the code</div>
          <div class="big-code">${S.code.split('').map(c => `<span>${c}</span>`).join('')}</div>
          <div class="join-url">at <b>${esc(shown)}</b></div>
        </div>
      </div>
    </div>
    <div class="side">
      <div class="card stack"><h3>Players (${players().length})</h3>${playersHTML({ big: true })}</div>
      <div class="card stack"><h3>Game</h3>${settingsHTML()}</div>
      ${isHost() ? `<button class="btn" id="start" ${players().length ? '' : 'disabled'}>Start game</button>${S.st.roundNo ? '<button class="btn small ghost" id="reset">Reset scores</button>' : ''}` : `<div class="muted center">The host starts the game from their phone.</div>`}
      <button class="btn small ghost" id="newlobby">New lobby</button>
    </div>
  </div>`;
  wireSettings($root);
  const st = $root.querySelector('#start');
  if (st) st.onclick = () => { unlock(); S.conn.send({ t: 'start' }); };
  const rs = $root.querySelector('#reset');
  if (rs) rs.onclick = () => S.conn.send({ t: 'resetScores' });
  $root.querySelector('#newlobby').onclick = () => {
    if (!confirm('Start a brand new lobby? Everyone will need the new code.')) return;
    S.conn.send({ t: 'leave' });
    store.del('rb:screen');
    location.reload();
  };
}

// ---------------- PLAY ----------------
function startRound(r) {
  // A reconnect mid-round re-sends the round: keep what we already have.
  if (S.round && S.round.no === r.no && S.play && S.view === 'play') {
    for (const w of r.mine) S.mine.add(w);
    for (const a of r.allyWords) if (!S.ally.has(a.w)) S.ally.set(a.w, a);
    S.round = { ...r };
    S.score = [...S.mine].reduce((s, w) => s + pointsFor(w), 0);
    renderWords(); updateScore(); tickClock();
    return;
  }
  closeReveal();
  S.round = r;
  S.mine = new Set(r.mine);
  S.ally = new Map(r.allyWords.map(a => [a.w, a]));
  S.hashes = new Set(r.hashes);
  S.score = 0;
  for (const w of S.mine) S.score += pointsFor(w);
  S.ended = false;
  S.view = 'play';
  if (MODE === 'screen') renderScreenPlay(); else renderPlay();
  scheduleCountdown();
  tickClock();
}

function pointsFor(w) { const L = w.length; return L <= 4 ? 1 : L === 5 ? 2 : L === 6 ? 3 : L === 7 ? 5 : 11; }

function scheduleCountdown() {
  const r = S.round;
  const left = r.startAt - S.conn.now();
  if (left <= 0) { S.play.board.enabled = MODE !== 'screen'; return; }
  const box = document.createElement('div');
  box.className = 'countdown';
  document.body.appendChild(box);
  const show = n => { box.innerHTML = `<b>${n}</b>`; sfx.beep(n === 'GO'); if (n !== 'GO') haptic('tick'); };
  for (let n = 3; n >= 1; n--) {
    const at = left - n * 1000;
    if (at >= -200) setTimeout(() => show(n), Math.max(0, at));
  }
  setTimeout(() => {
    show('GO');
    S.play.board.reveal();
    S.play.board.enabled = MODE !== 'screen';
    haptic('success');
    setTimeout(() => box.remove(), 700);
  }, left);
}

let clockRAF;
function tickClock() {
  cancelAnimationFrame(clockRAF);
  const r = S.round;
  const total = r.endsAt - r.startAt;
  const step = () => {
    if (S.view !== 'play' || S.round !== r || !S.play) return;
    const now = S.conn.now();
    const left = Math.max(0, r.endsAt - Math.max(now, r.startAt));
    const sec = Math.ceil(left / 1000);
    const p = S.play;
    p.bar.style.transform = `scaleX(${left / total})`;
    if (p.lastSec !== sec) {
      p.lastSec = sec;
      p.clock.textContent = fmtTime(sec);
      const low = sec <= 10 && left > 0;
      p.clock.classList.toggle('low', low);
      p.timer.classList.toggle('low', low);
      if (low && now > r.startAt && sec <= 5) sfx.beep(false);
    }
    if (left <= 0 && now >= r.startAt && !S.ended) endLocal();
    clockRAF = requestAnimationFrame(step);
  };
  step();
}

function endLocal() {
  S.ended = true;
  sfx.buzzer();
  haptic('error');
  if (!S.play) return;
  S.play.board.enabled = false;
  S.play.board.clear();
  S.play.board.el.classList.add('frozen');
  if (S.play.cur) S.play.cur.innerHTML = '<span style="color:var(--sun)">Time!</span>';
}

function renderPlay() {
  const r = S.round;
  $root.innerHTML = `<div class="play">
    <div class="hud"><span class="score-pill" id="score">0 pts</span><div class="timer" id="timer"><i id="bar"></i></div><span class="clock" id="clock"></span></div>
    <div class="current" id="cur"></div>
    <div id="boardHost"></div>
    <div class="row"><span class="feedback grow" id="fb">${r.size}×${r.size} · ${r.minLen}+ letters</span><span class="muted small" id="count"></span></div>
    <div class="words" id="words"></div>
  </div>`;
  const cur = $root.querySelector('#cur');
  const board = makeBoard(r.tiles, r.size, {
    interactive: true,
    blank: r.startAt > S.conn.now(),
    onChange: w => { cur.textContent = w.toUpperCase(); },
    onWord: (w, path) => submit(w, path),
  });
  board.enabled = false;
  $root.querySelector('#boardHost').appendChild(board.el);
  S.play = {
    board, cur,
    bar: $root.querySelector('#bar'), clock: $root.querySelector('#clock'), timer: $root.querySelector('#timer'),
    words: $root.querySelector('#words'), fb: $root.querySelector('#fb'), scoreEl: $root.querySelector('#score'), count: $root.querySelector('#count'),
  };
  renderWords();
  updateScore();
}

function submit(w, path) {
  const r = S.round;
  const fb = S.play.fb;
  if (w.length < 2) return S.play.board.clear();
  if (w.length < r.minLen) { S.play.board.result('no'); fb.textContent = `Too short (${r.minLen}+ letters)`; sfx.bad(); haptic('error'); return; }
  if (S.mine.has(w)) { S.play.board.result('dupe'); fb.textContent = 'Already got that one'; sfx.dupe(); haptic('warning'); return; }
  if (!S.hashes.has(fnv(r.salt + w))) { S.play.board.result('no'); fb.textContent = `${w.toUpperCase()} isn't in our dictionary`; sfx.bad(); haptic('error'); return; }
  // Looks good locally: celebrate now, let the server confirm.
  S.mine.add(w);
  S.score += pointsFor(w);
  S.play.board.result('ok');
  sfx.ok(w.length);
  haptic('success');
  const ally = S.ally.get(w);
  fb.textContent = ally ? `Copied from ${member(ally.by)?.name || 'your ally'}` : pointsFor(w) >= 3 ? 'Nice one!' : '';
  const f = document.createElement('span');
  f.className = 'float'; f.textContent = `+${pointsFor(w)}`;
  S.play.cur.appendChild(f);
  setTimeout(() => f.remove(), 900);
  S.play.lastNew = w;
  renderWords();
  updateScore();
  S.conn.send({ t: 'word', w });
}

function wordResult(m) {
  if (!S.play) return;
  if (m.ok) { if (!S.mine.has(m.w)) { S.mine.add(m.w); S.score += pointsFor(m.w); renderWords(); updateScore(); } return; }
  if (m.reason === 'dupe') return; // already counted (e.g. resent after a reconnect)
  if (S.mine.has(m.w)) {
    S.mine.delete(m.w);
    S.score -= pointsFor(m.w);
    renderWords(); updateScore();
    S.play.fb.textContent = m.reason === 'time' ? `${m.w.toUpperCase()} came in after the buzzer` : `${m.w.toUpperCase()} didn't count`;
  }
}

function allyWord(m) {
  if (!S.round) return;
  if (!S.ally.has(m.w)) {
    S.ally.set(m.w, m);
    if (!S.mine.has(m.w) && S.view === 'play' && !S.ended) { sfx.ally(); haptic('tick'); }
    renderWords();
  }
}

function renderWords() {
  if (!S.play) return;
  const box = S.play.words;
  const mine = [...S.mine].reverse();
  const ghosts = [...S.ally.values()].filter(a => !S.mine.has(a.w)).reverse();
  let html = mine.map(w => {
    const a = S.ally.get(w);
    const p = a && member(a.by);
    return a ? `<span class="word ally got${w === S.play.lastNew ? ' new' : ''}" style="--c:${p ? p.color : '#fff'}">${esc(w)}</span>` : `<span class="word${w === S.play.lastNew ? ' new' : ''}">${esc(w)}</span>`;
  }).join('');
  if (ghosts.length) {
    html += `<div class="muted small" style="width:100%;margin-top:6px">From your allies (tap to see where, trace to copy)</div>`;
    html += ghosts.map(a => {
      const p = member(a.by);
      return `<button class="word ally" style="--c:${p ? p.color : '#fff'}" data-w="${esc(a.w)}">${p ? chipHTML(p, 'tiny') : ''}${esc(a.w)}</button>`;
    }).join('');
  }
  box.innerHTML = html;
  box.querySelectorAll('.word.ally[data-w]').forEach(b => {
    b.onclick = () => {
      const a = S.ally.get(b.dataset.w);
      const p = member(a.by);
      if (a && a.path) S.play.board.hint(a.path, p ? p.color : 'var(--mint)');
    };
  });
  S.play.count.textContent = `${S.mine.size} word${S.mine.size === 1 ? '' : 's'}`;
}

function updateScore() { if (S.play) S.play.scoreEl.textContent = `${S.score} pt${S.score === 1 ? '' : 's'}`; }

function renderScreenPlay() {
  const r = S.round;
  $root.innerHTML = `<div class="screen">
    <div class="left">
      <div class="row" style="width:min(80vmin,100%)"><div class="timer grow" id="timer"><i id="bar"></i></div><span class="clock" id="clock"></span></div>
      <div class="board-wrap" id="boardHost"></div>
      <div class="muted" style="font-size:2.4vmin">${r.size}×${r.size} · words of ${r.minLen}+ letters · join late at ${esc(joinURL(S.code).replace(/^https?:\/\//, '').replace('?c=', '?c='))}</div>
    </div>
    <div class="side"><div class="card stack"><h3>Words found</h3><div id="counts" class="stack"></div></div></div>
  </div>`;
  const board = makeBoard(r.tiles, r.size, { blank: r.startAt > S.conn.now() });
  $root.querySelector('#boardHost').appendChild(board.el);
  S.play = { board, bar: $root.querySelector('#bar'), clock: $root.querySelector('#clock'), timer: $root.querySelector('#timer'), countsEl: $root.querySelector('#counts'), shown: {} };
  updatePlaySide();
  if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
}

function updatePlaySide(bump) {
  if (!S.play || !S.st) return;
  if (MODE !== 'screen') { renderWords(); return; }
  const counts = S.st.counts || {};
  const ps = players().slice().sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || a.name.localeCompare(b.name));
  const el = S.play.countsEl;
  el.innerHTML = ps.map(p => {
    const a = p.alliance && S.st.alliances.find(x => x.id === p.alliance);
    const n = counts[p.id] || 0;
    const changed = bump && S.play.shown[p.id] !== undefined && S.play.shown[p.id] !== n;
    return `<div class="screen-player" ${a ? `style="box-shadow:inset 4px 0 0 ${a.color}"` : ''}>${chipHTML(p, p.connected ? '' : 'off')}<span class="name">${esc(p.name)}${a ? `<br><span class="muted small" style="color:${a.color}">${esc(a.name)}</span>` : ''}</span><span class="count ${changed ? 'bump' : ''}">${n}</span></div>`;
  }).join('');
  if (bump) ps.forEach(p => { if (S.play.shown[p.id] !== (counts[p.id] || 0) && S.play.shown[p.id] !== undefined) sfx.blip(Math.min(11, counts[p.id] || 0)); });
  ps.forEach(p => { S.play.shown[p.id] = counts[p.id] || 0; });
}

// ---------------- RESULTS ----------------
function showResults(R) {
  if (S.reveal && S.reveal.no === R.no) return;
  closeReveal();
  cancelAnimationFrame(clockRAF);
  document.querySelectorAll('.countdown').forEach(x => x.remove());
  S.view = 'results';
  const rv = runReveal(R, {
    mode: MODE === 'screen' ? 'tv' : 'phone',
    me: S.you && S.you.id,
    isHost,
    onAgain: () => S.conn.send({ t: 'start' }),
    onLobby: () => S.conn.send({ t: 'lobby' }),
  });
  rv.no = R.no;
  S.reveal = rv;
}

function closeReveal() {
  if (S.reveal) { S.reveal.close(); S.reveal = null; }
}

// ---------------- boot ----------------
window.addEventListener('robggle:open', e => {
  // The iOS app hands us a join link it was opened with.
  const code = String(e.detail || '').toUpperCase();
  if (!/^[A-Z]{4}$/.test(code) || code === S.code) return;
  if (S.code) { S.conn.send({ t: 'leave' }); S.code = null; S.you = null; S.st = null; }
  const name = store.get('rb:name', '');
  if (!name) { renderHome(); $root.querySelector('#code').value = code; toast('Pick a name, then tap Join'); return; }
  connect({ t: 'join', code, role: 'player', name });
});

if (MODE === 'home') renderLanding();
else if (MODE === 'screen') {
  $root.innerHTML = `<div class="wrap center" style="padding-top:20vh">${LOGO}<p class="muted">Opening a lobby…</p></div>`;
  const saved = store.get('rb:screen');
  if (saved && Date.now() - saved.at < 8 * 3600e3) connect({ t: 'join', code: saved.code, token: saved.token, role: 'screen' });
  else connect({ t: 'create', role: 'screen' });
} else {
  const code = (params.get('c') || '').toUpperCase();
  const name = store.get('rb:name', '');
  const last = store.get('rb:last');
  if (/^[A-Z]{4}$/.test(code) && name) {
    $root.innerHTML = `<div class="wrap center" style="padding-top:20vh">${LOGO}<p class="muted">Joining ${esc(code)}…</p></div>`;
    const token = last && last.code === code ? last.token : undefined;
    connect({ t: 'join', code, role: 'player', name, token });
  } else {
    renderHome();
    if (code) { $root.querySelector('#code').value = code; toast('Pick a name, then tap Join'); }
  }
}
console.log('Robggle server:', SERVER);
