// Robggle client. One file drives three pages: /robggle/ (home), /robggle/game/ (screen), /robggle/join/ (controller).
import { Conn, fnv, fetchLobbies, haptic, native, IN_APP, SERVER } from './net.js';
import { makeBoard, tileText } from './board.js';
import { sfx, unlock } from './sfx.js';
import { runReveal, chipHTML } from './reveal.js';
import { Chaos, INFO, bananaSVG, setBananaFill } from './chaos.js';
import { icon } from './icons.js';

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
      if (m.phase === 'lobby') { closeReveal(); closeVote(); renderLobby(); }
      else if (S.view === 'play') updatePlaySide();
      if (S.reveal) S.reveal.refreshActions();
      break;
    }
    case 'round': startRound(m); break;
    case 'counts': if (S.st) { S.st.counts = m.counts; if (m.banana) S.bananaCounts = m.banana; updatePlaySide(true); } break;
    case 'wordResult': wordResult(m); break;
    case 'ally': allyWord(m); break;
    case 'leaked': leakedWord(m); break;
    case 'bridge': screenBridge(m); break;
    case 'challengeAck': if (S.play && S.play.fb) S.play.fb.textContent = `Challenge filed: ${m.w.toUpperCase()} goes to a vote after the round`; break;
    case 'bananaSplit':
      S.bananaSplit = m.ids; S.bananaCounts = m.counts || S.bananaCounts;
      S.chaos && S.chaos.bananaSplit(m.ids);
      if (MODE === 'screen') updatePlaySide();
      break;
    case 'vote': showVote(m); break;
    case 'voteTally': voteTally(m); break;
    case 'voteResult': voteResult(m); break;
    case 'revealCtl': S.reveal && S.reveal.control(m); break;
    case 'banter': S.reveal && S.reveal.banter(m); break;
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
  $root.innerHTML = `<div class="wrap stack center landing">
    ${LOGO}
    <p class="tagline">A word hunt for the whole family, wherever they are.</p>
    <a class="big-choice" href="game/"><span class="choice-ic">${icon('tv')}</span><span><b>Show the game on this screen</b><small>The board, the timer and everyone's scores</small></span></a>
    <a class="big-choice alt" href="join/"><span class="choice-ic">${icon('phone')}</span><span><b>Play on this device</b><small>Trace words on your phone</small></span></a>
  </div>`;
}

// ---------------- JOIN home (no lobby yet) ----------------
let lobbyPoll;
function renderHome() {
  S.view = 'home';
  closeReveal();
  const name = store.get('rb:name', '');
  const last = store.get('rb:last');
  const recent = last && Date.now() - last.at < 3 * 3600e3 ? last : null;
  $root.innerHTML = `<div class="wrap stack roomy">
    <div class="center hero">${LOGO}</div>
    <section class="panel">
      <div class="panel-head">${icon('pencil')}<h3>Your name</h3></div>
      <input id="name" class="field" maxlength="14" placeholder="What should we call you?" value="${esc(name)}" autocomplete="nickname">
    </section>
    ${recent ? `<button class="btn mint wide with-ic" id="rejoin">${icon('refresh')}Rejoin game ${esc(recent.code)}</button>` : ''}
    <section class="panel">
      <div class="panel-head">${icon('key')}<h3>Have a code?</h3></div>
      <div class="row"><input id="code" class="field code-field grow" maxlength="4" placeholder="ABCD" autocapitalize="characters" autocomplete="off"><button class="btn" id="go">Join</button></div>
    </section>
    <section class="panel">
      <div class="panel-head">${icon('list')}<h3>Open games</h3><button class="icon-btn" id="refresh" aria-label="Refresh">${icon('refresh')}</button></div>
      <div id="lobbies" class="stack"><div class="empty-note">Looking for games…</div></div>
    </section>
    <button class="btn ghost wide with-ic" id="create">${icon('plus')}Start a game (no screen needed)</button>
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
      list.innerHTML = ls.length ? '' : `<div class="empty-note">${icon('sparkle')}No open games right now. Start one!</div>`;
      for (const l of ls) {
        const b = document.createElement('button');
        b.className = 'lobby-item';
        const playing = l.phase !== 'lobby';
        b.innerHTML = `<span class="lobby-code">${esc(l.code)}</span><span class="grow"><b>${l.screen && l.host === 'Screen' ? 'Game on a screen' : `${esc(l.host)}'s game`}</b><span class="lobby-meta">${icon('users', 'sm')}${l.players} · ${icon('grid', 'sm')}${l.settings.size}×${l.settings.size}${l.screen ? ` · ${icon('tv', 'sm')}` : ''}</span></span><span class="status-dot ${playing ? 'busy' : ''}">${playing ? 'Playing' : 'Open'}</span>`;
        b.onclick = () => join(l.code);
        list.appendChild(b);
      }
    } catch { list.innerHTML = `<div class="empty-note">Can't reach the game server.</div>`; }
  };
  $root.querySelector('#refresh').onclick = load;
  load();
  clearInterval(lobbyPoll);
  lobbyPoll = setInterval(load, 4000);
}

// ---------------- LOBBY ----------------
const CHAOS_LIST = ['sam', 'sleepover', 'robbert', 'set', 'leak', 'banana'];
const BOT_LEVELS = [
  { key: 'tara', name: 'Tara', label: 'Very easy', pips: 1, color: '#3ee0b0' },
  { key: 'max', name: 'Max', label: 'Easy', pips: 2, color: '#5ab0ff' },
  { key: 'maya', name: 'Maya', label: 'Medium', pips: 3, color: '#ffd23f' },
  { key: 'valentina', name: 'Valentina', label: 'Hard', pips: 4, color: '#ff5c8a' },
];
const botLevel = key => BOT_LEVELS.find(b => b.key === key);
const pipsHTML = n => `<span class="pips">${[1, 2, 3, 4].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;

function botsHTML() {
  if (!isHost()) return '';
  const count = players().filter(p => p.bot).length;
  return `<section class="panel">
    <div class="panel-head">${icon('bot')}<h3>Computer players</h3>${count ? `<span class="count-pill">${count}</span>` : ''}</div>
    <div class="hint-line">Add a bot to practice or fill out the table. Tap again for another.</div>
    <div class="bot-grid">${BOT_LEVELS.map(b => `<button class="bot-pick" data-bot="${b.key}" style="--c:${b.color}">
      <span class="bot-face">${icon('bot')}</span><b>${b.name}</b><small>${b.label}</small>${pipsHTML(b.pips)}<span class="bot-add">${icon('plus', 'sm')}</span></button>`).join('')}</div>
  </section>`;
}
function wireBots(scope) {
  scope.querySelectorAll('[data-bot]').forEach(b => { b.onclick = () => { S.conn.send({ t: 'addBot', level: b.dataset.bot }); haptic('tick'); sfx.join(); }; });
  scope.querySelectorAll('[data-unbot]').forEach(b => { b.onclick = e => { e.stopPropagation(); S.conn.send({ t: 'removeBot', id: b.dataset.unbot }); haptic('tick'); }; });
}

function toggleHTML(key, on, label, desc, ic) {
  return `<button class="toggle-row ${on ? 'on' : ''}" data-toggle="${key}" aria-pressed="${on}">
    <span class="setting-ic">${icon(ic)}</span>
    <span class="grow"><b>${label}</b><small>${desc}</small></span>
    <span class="switch"><i></i></span>
  </button>`;
}

function settingsHTML() {
  const s = S.st.settings;
  const types = s.chaosTypes || CHAOS_LIST;
  if (!isHost()) {
    const chips = [
      `<span class="info-chip">${icon('grid', 'sm')}${s.size}×${s.size}</span>`,
      `<span class="info-chip">${icon('letters', 'sm')}${s.minLen}+ letters</span>`,
      `<span class="info-chip">${icon('clock', 'sm')}${fmtTime(s.time)}</span>`,
      s.handicap ? `<span class="info-chip mint">${icon('flag', 'sm')}Handicap</span>` : '',
      s.chaos ? `<span class="info-chip hot">${icon('bolt', 'sm')}Family Chaos</span>` : '',
    ].join('');
    const chaosList = s.chaos ? `<div class="chaos-chips">${types.map(t => `<span class="chaos-chip" style="--c:${INFO[t].color}">${icon(t, 'sm')}${esc(INFO[t].title)}</span>`).join('')}</div>` : '';
    return `<div class="info-chips">${chips}</div>${chaosList}`;
  }
  const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${+s[key] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const chaosGrid = s.chaos ? `<div class="chaos-grid">${CHAOS_LIST.map(t => {
    const on = types.includes(t);
    return `<button class="chaos-pick ${on ? 'on' : ''}" data-chaos="${t}" style="--c:${INFO[t].color}" aria-pressed="${on}">
      <span class="chaos-pick-ic">${icon(t)}</span><b>${esc(INFO[t].title)}</b><small>${esc(INFO[t].blurb)}</small><span class="tick">${icon(on ? 'check' : 'x', 'sm')}</span></button>`;
  }).join('')}</div><div class="hint-line">Tap to switch each one on or off. At least one stays on.</div>` : '';
  return `<div class="settings">
    <div class="setting-block"><div class="setting-label">${icon('grid')}Board size</div>${seg('size', SIZE_OPTS)}</div>
    <div class="setting-block"><div class="setting-label">${icon('letters')}Shortest word</div>${seg('minLen', MIN_OPTS)}</div>
    <div class="setting-block"><div class="setting-label">${icon('clock')}Round length</div>${seg('time', TIME_OPTS)}</div>
    <div class="divider"></div>
    ${toggleHTML('handicap', !!s.handicap, 'Handicap', 'Golf-style: after a couple of rounds, whoever usually trails gets bonus strokes.', 'flag')}
    ${toggleHTML('chaos', !!s.chaos, 'Family Chaos', 'Surprise events from the family drop in mid-round.', 'bolt')}
    ${chaosGrid}
  </div>`;
}

function wireSettings(scope) {
  const send = patch => S.conn.send({ t: 'settings', ...S.st.settings, ...patch });
  scope.querySelectorAll('.seg').forEach(seg => {
    seg.querySelectorAll('button').forEach(b => { b.onclick = () => { send({ [seg.dataset.key]: +b.dataset.v }); haptic('tick'); }; });
  });
  scope.querySelectorAll('[data-toggle]').forEach(b => {
    b.onclick = () => { send({ [b.dataset.toggle]: !S.st.settings[b.dataset.toggle] }); haptic('tick'); };
  });
  scope.querySelectorAll('[data-chaos]').forEach(b => {
    b.onclick = () => {
      const cur = S.st.settings.chaosTypes || CHAOS_LIST;
      const t = b.dataset.chaos;
      const next = cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t];
      if (!next.length) { toast('Keep at least one, or turn Family Chaos off'); return; }
      send({ chaosTypes: next });
      haptic('tick');
    };
  });
}

function playersHTML({ big } = {}) {
  const ps = players();
  if (!ps.length) return `<div class="empty-note">${icon('users')}Waiting for players to join…</div>`;
  const row = p => `<div class="player-row pop-in ${p.bot ? 'is-bot' : ''}" data-id="${p.id}">${chipHTML(p, p.connected ? '' : 'off')}<span class="name grow" style="${big ? 'font-size:24px' : ''}">${esc(p.name)}</span>${p.bot ? `<span class="tag bot" style="--c:${botLevel(p.bot).color}">${icon('bot', 'sm')}${botLevel(p.bot).label}</span>${isHost() ? `<button class="icon-btn tiny" data-unbot="${p.id}" aria-label="Remove bot">${icon('x', 'sm')}</button>` : ''}` : ''}${p.id === S.st.hostId ? `<span class="tag host">${icon('crown', 'sm')}host</span>` : ''}${S.you && p.id === S.you.id ? '<span class="tag">you</span>' : ''}${S.st.settings.handicap && p.hcp ? `<span class="tag hcp">${icon('flag', 'sm')}${p.hcp}</span>` : ''}${S.st.roundNo && p.total ? `<span class="tag">${p.total} pts</span>` : ''}</div>`;
  let html = '';
  for (const a of S.st.alliances) {
    const mem = ps.filter(p => p.alliance === a.id);
    if (!mem.length) continue;
    html += `<div class="alliance-box" style="--ac:${a.color}"><div class="aname">${icon('handshake', 'sm')}${esc(a.name)}</div>${mem.map(row).join('')}</div>`;
  }
  html += ps.filter(p => !p.alliance).map(row).join('');
  return `<div class="stack" style="gap:8px">${html}</div>`;
}

function allianceHTML() {
  const me = member(S.you.id);
  if (!me || me.role !== 'player') return '';
  const mine = me.alliance && S.st.alliances.find(a => a.id === me.alliance);
  if (mine) {
    return `<section class="panel" style="--ac:${mine.color}">
      <div class="panel-head">${icon('handshake')}<h3>Your alliance</h3></div>
      <div class="alliance-banner" style="--ac:${mine.color}"><b>${esc(mine.name)}</b><small>Your allies' words show up on your list to copy.</small></div>
      <button class="btn small ghost with-ic" data-ally="">${icon('door', 'sm')}Leave alliance</button></section>`;
  }
  const others = S.st.alliances.filter(a => players().some(p => p.alliance === a.id));
  return `<section class="panel">
    <div class="panel-head">${icon('handshake')}<h3>Team up</h3></div>
    <div class="hint-line">Allies see each other's words and can copy them. Teams can be any size.</div>
    <div class="ally-buttons">${others.map(a => `<button class="btn small" style="background:${a.color};color:#1b1036;box-shadow:0 3px 0 rgba(0,0,0,.3)" data-ally="${a.id}">Join ${esc(a.name)}</button>`).join('')}
    <button class="btn small ghost with-ic" data-ally="new">${icon('plus', 'sm')}Start an alliance</button></div></section>`;
}

function renderLobby() {
  if (!S.st || !S.you) return;
  S.view = 'lobby';
  S.play && S.play.board.destroy();
  S.play = null;
  if (MODE === 'screen') return renderScreenLobby();
  const me = member(S.you.id);
  const keepScroll = document.scrollingElement.scrollTop;
  $root.innerHTML = `<div class="wrap stack roomy">
    <header class="lobby-top">
      ${LOGO.replace('class="logo"', 'class="logo small"')}
      <button class="code-badge" id="share">${icon('share', 'sm')}<span>${esc(S.code)}</span></button>
    </header>
    <section class="panel me-card">
      ${me ? chipHTML(me, 'big') : ''}
      <div class="grow"><div class="me-name">${esc(me ? me.name : '')}</div><div class="hint-line">Tap the code above to invite people</div></div>
      <button class="icon-btn" id="rename" aria-label="Rename">${icon('pencil')}</button>
    </section>
    ${allianceHTML()}
    <section class="panel"><div class="panel-head">${icon('users')}<h3>Players</h3><span class="count-pill">${players().length}</span></div>${playersHTML()}</section>
    ${botsHTML()}
    <section class="panel"><div class="panel-head">${icon('sparkle')}<h3>${isHost() ? 'Game settings' : 'This game'}</h3></div>${settingsHTML()}</section>
    <div class="sticky-start">
      ${isHost() ? `<button class="btn wide big-btn with-ic" id="start">${icon('play')}Start game</button>` : `<div class="waiting-pill">${icon('clock', 'sm')}Waiting for the host to start…</div>`}
    </div>
    <div class="lobby-foot">
      ${isHost() && S.st.roundNo ? `<button class="link-btn" id="reset">Reset scores</button>` : ''}
      <button class="link-btn" id="leave">${icon('door', 'sm')}Leave game</button>
    </div>
  </div>`;
  document.scrollingElement.scrollTop = keepScroll;
  wireSettings($root);
  wireBots($root);
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
  const s = S.st.settings;
  $root.innerHTML = `<div class="screen">
    <div class="left">
      ${LOGO}
      <div class="join-card">
        <div class="qr">${qrSVG(url)}</div>
        <div class="join-steps">
          <div class="step">${icon('phone')}<span>Scan with your phone camera</span></div>
          <div class="step-or">or go to <b>${esc(shown)}</b> and enter</div>
          <div class="big-code">${S.code.split('').map(c => `<span>${c}</span>`).join('')}</div>
        </div>
      </div>
      ${!isHost() ? `<div class="info-chips tv">${settingsHTML()}</div>` : ''}
    </div>
    <div class="side">
      <section class="panel"><div class="panel-head">${icon('users')}<h3>Players</h3><span class="count-pill">${players().length}</span></div>${playersHTML({ big: true })}</section>
      ${isHost() ? `${botsHTML()}<section class="panel"><div class="panel-head">${icon('sparkle')}<h3>Game settings</h3></div>${settingsHTML()}</section>
        <button class="btn wide big-btn with-ic" id="start" ${players().length ? '' : 'disabled'}>${icon('play')}Start game</button>` : `<div class="waiting-pill">${icon('crown', 'sm')}The host starts the game from their phone</div>`}
      <div class="lobby-foot">
        ${isHost() && S.st.roundNo ? '<button class="link-btn" id="reset">Reset scores</button>' : ''}
        <button class="link-btn" id="newlobby">${icon('refresh', 'sm')}New lobby</button>
      </div>
    </div>
  </div>`;
  void s;
  wireSettings($root);
  wireBots($root);
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
const msIntoRound = () => S.conn.now() - S.round.startAt;
function bridgeLocal(path, n) {
  const rows = new Set(path.map(i => Math.floor(i / n))), cols = new Set(path.map(i => i % n));
  const v = rows.has(0) && rows.has(n - 1), h = cols.has(0) && cols.has(n - 1);
  return v && h ? 5 : v || h ? 2 : 0;
}
const scoreOf = () => [...S.mine.values()].reduce((s, x) => s + x.pts, 0);

function startRound(r) {
  // A reconnect mid-round re-sends the round: keep what we already have.
  if (S.round && S.round.no === r.no && S.play && S.view === 'play') {
    for (const x of r.mine) if (!S.mine.has(x.w)) S.mine.set(x.w, { pts: x.pts, via: x.via, from: x.from });
    for (const a of r.allyWords) if (!S.ally.has(a.w)) S.ally.set(a.w, a);
    S.round = { ...r, chaos: S.round.chaos };
    renderWords(); updateScore(); tickClock();
    return;
  }
  closeReveal();
  closeVote();
  S.chaos && S.chaos.destroy();
  S.chaos = null;
  S.round = r;
  S.mine = new Map(r.mine.map(x => [x.w, { pts: x.pts, via: x.via, from: x.from }]));
  S.ally = new Map(r.allyWords.map(a => [a.w, a]));
  S.rejected = new Map((r.rejected || []).map(x => [x.w, { challenged: x.challenged, challengeable: true }]));
  S.pending = new Map();
  S.hashes = new Set([...r.hashes, ...(r.custom || [])]);
  S.bananaCounts = r.bananaCounts || {};
  S.bananaSplit = r.bananaSplit || [];
  S.ended = false;
  S.view = 'play';
  if (MODE === 'screen') renderScreenPlay(); else renderPlay();
  S.chaos = new Chaos({
    round: r, board: S.play.board, mode: MODE === 'screen' ? 'tv' : 'phone',
    host: S.play.boardHost, hud: S.play.chaosHud, me: S.you && S.you.id,
    onSetCleared: ms => { S.conn.send({ t: 'setCleared', ms }); toast('All cards cleared!'); },
  });
  if (MODE === 'screen' && S.bananaSplit.length) updatePlaySide();
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
    if (S.view !== 'play' || S.round.no !== r.no || !S.play) return;
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
    if (S.chaos && now >= r.startAt && !S.ended) S.chaos.tick(now - r.startAt);
    if (left <= 0 && now >= r.startAt && !S.ended) endLocal();
    clockRAF = requestAnimationFrame(step);
  };
  step();
}

function endLocal() {
  S.ended = true;
  sfx.buzzer();
  haptic('error');
  S.chaos && S.chaos.destroy();
  if (!S.play) return;
  S.play.board.enabled = false;
  S.play.board.clear();
  S.play.board.el.classList.add('frozen');
  if (S.play.cur) S.play.cur.innerHTML = '<span style="color:var(--sun)">Time!</span>';
  if (S.play.fb && [...S.rejected.values()].some(x => x.challenged)) S.play.fb.textContent = 'Challenges go to a family vote next…';
}

function renderPlay() {
  const r = S.round;
  $root.innerHTML = `<div class="play">
    <div class="hud"><span class="score-pill">${icon('star', 'sm')}<span id="score">0 pts</span></span><div class="timer" id="timer"><i id="bar"></i></div><span class="clock-wrap">${icon('clock', 'sm')}<span class="clock" id="clock"></span></span></div>
    <div class="chaos-hud" id="chaosHud"></div>
    <div class="current" id="cur"></div>
    <div id="boardHost" class="board-host"></div>
    <div class="feedback-row"><span class="feedback grow" id="fb">${r.size}×${r.size} board · ${r.minLen}+ letters</span><span class="count-pill" id="count"></span></div>
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
  const host = $root.querySelector('#boardHost');
  host.appendChild(board.el);
  S.play = {
    board, cur, boardHost: host, chaosHud: $root.querySelector('#chaosHud'),
    bar: $root.querySelector('#bar'), clock: $root.querySelector('#clock'), timer: $root.querySelector('#timer'),
    words: $root.querySelector('#words'), fb: $root.querySelector('#fb'), scoreEl: $root.querySelector('#score'), count: $root.querySelector('#count'),
  };
  renderWords();
  updateScore();
}

function floatText(text, cls = '') {
  const f = document.createElement('span');
  f.className = 'float ' + cls; f.textContent = text;
  S.play.cur.appendChild(f);
  setTimeout(() => f.remove(), 1000);
}

function bridgeReaction(bonus) {
  if (!S.play) return;
  S.play.board.sweep(bonus === 5 ? 'var(--pink)' : 'var(--sun)');
  const b = document.createElement('div');
  b.className = 'bridge-stamp';
  b.innerHTML = `${bonus === 5 ? 'MEGA BRIDGE' : 'BRIDGE'}<small>+${bonus} for crossing the board</small>`;
  S.play.board.fx.appendChild(b);
  setTimeout(() => b.remove(), 1500);
  sfx.bridge();
  haptic('success');
}

function submit(w, path) {
  const r = S.round;
  const fb = S.play.fb;
  const board = S.play.board;
  if (w.length < 2) return board.clear();
  const rule = S.chaos && S.chaos.rule(w, msIntoRound());
  if (rule) { board.result('no'); fb.textContent = rule; sfx.bad(); haptic('error'); S.conn.send({ t: 'word', w, path }); return; }
  if (w.length < r.minLen) { board.result('no'); fb.textContent = `Too short (${r.minLen}+ letters)`; sfx.bad(); haptic('error'); return; }
  if (S.mine.has(w) || S.pending.has(w)) { board.result('dupe'); fb.textContent = 'Already got that one'; sfx.dupe(); haptic('warning'); return; }
  const letters = board.letters();
  const changed = path.some(i => letters[i] !== r.tiles[i]);
  const known = S.hashes.has(fnv(r.salt + w));
  S.conn.send({ t: 'word', w, path });
  if (known && !changed) {
    // Looks good locally: celebrate now, let the server confirm.
    const bonus = bridgeLocal(path, r.size);
    S.mine.set(w, { pts: pointsFor(w) + bonus, via: S.ally.has(w) ? 'copy' : null, celebrated: true });
    board.result('ok');
    sfx.ok(w.length);
    haptic('success');
    const ally = S.ally.get(w);
    fb.textContent = ally ? `Copied from ${member(ally.by)?.name || 'your ally'}` : pointsFor(w) >= 3 ? 'Nice one!' : '';
    floatText(`+${pointsFor(w)}`);
    if (bonus) bridgeReaction(bonus);
    S.play.lastNew = w;
    renderWords();
    updateScore();
    return;
  }
  if (changed) {
    // A Z word: only the server knows the whole dictionary, so wait for it.
    S.pending.set(w, { path });
    board.result('wait');
    fb.textContent = `Checking ${w.toUpperCase()}…`;
    return;
  }
  board.result('no');
  sfx.bad();
  haptic('error');
  fb.textContent = `${w.toUpperCase()} isn't in our dictionary`;
  if (!S.rejected.has(w)) S.rejected.set(w, { challenged: false, challengeable: true });
  renderWords();
}

function wordResult(m) {
  if (!S.play) return;
  const board = S.play.board;
  const pend = S.pending.get(m.w);
  S.pending.delete(m.w);
  if (m.ok) {
    const had = S.mine.get(m.w);
    S.mine.set(m.w, { pts: m.pts, via: had ? had.via : null, celebrated: true });
    if (!had) {
      board.result('ok');
      sfx.ok(m.w.length);
      haptic('success');
      S.play.fb.textContent = pend ? `${m.w.toUpperCase()} counts. Sweet dreams!` : '';
      floatText(`+${m.pts - (m.bonus || 0)}`);
      if (m.bonus) bridgeReaction(m.bonus);
      S.play.lastNew = m.w;
    }
    if (m.leaked) { S.play.fb.textContent = `${m.w.toUpperCase()} leaked to everyone!`; floatText('LEAKED', 'leak'); sfx.dupe(); }
    if (m.path && S.chaos) S.chaos.bananaWord(m.path);
    renderWords(); updateScore();
    return;
  }
  if (m.reason === 'dupe') return; // already counted (e.g. resent after a reconnect)
  const msgs = {
    time: 'came in after the buzzer', robbert: "isn't 3 letters (Robbert Mode!)", banana: 'used a tile that went to your banana',
    path: "didn't match the board", short: 'is too short', bad: "isn't in our dictionary",
  };
  if (m.reason === 'bad') {
    const x = S.rejected.get(m.w) || { challenged: false };
    x.challengeable = !!m.challengeable;
    S.rejected.set(m.w, x);
  }
  if (S.mine.has(m.w)) { S.mine.delete(m.w); }
  if (pend) { board.result('no'); sfx.bad(); }
  if (pend || m.reason !== 'robbert') S.play.fb.textContent = `${m.w.toUpperCase()} ${msgs[m.reason] || "didn't count"}`;
  renderWords(); updateScore();
}

function allyWord(m) {
  if (!S.round) return;
  if (!S.ally.has(m.w)) {
    S.ally.set(m.w, m);
    if (!S.mine.has(m.w) && S.view === 'play' && !S.ended) { sfx.ally(); haptic('tick'); }
    renderWords();
  }
}

function leakedWord(m) {
  if (!S.round || S.mine.has(m.w)) return;
  S.mine.set(m.w, { pts: m.pts, via: 'leak', from: m.from });
  const p = member(m.from);
  if (S.play && S.play.fb) S.play.fb.textContent = `${p ? p.name : 'Someone'} leaked ${m.w.toUpperCase()} to you!`;
  sfx.ally();
  S.play && (S.play.lastNew = m.w);
  renderWords(); updateScore();
}

function challenge(w) {
  const x = S.rejected.get(w);
  if (!x || x.challenged) return;
  const used = [...S.rejected.values()].filter(y => y.challenged).length;
  if (used >= 3) return toast('Only 3 challenges per round');
  x.challenged = true;
  S.conn.send({ t: 'challenge', w });
  sfx.gavel();
  haptic('success');
  renderWords();
}

function renderWords() {
  if (!S.play || MODE === 'screen') return;
  const box = S.play.words;
  const mine = [...S.mine.keys()].reverse();
  const ghosts = [...S.ally.values()].filter(a => !S.mine.has(a.w)).reverse();
  let html = mine.length ? `<div class="list-head">${icon('list', 'sm')}Your words</div>` : `<div class="empty-note">${icon('sparkle')}Drag across touching letters to make words</div>`;
  html += mine.map(w => {
    const x = S.mine.get(w);
    const isNew = w === S.play.lastNew ? ' new' : '';
    if (x.via === 'leak') { const p = member(x.from); return `<span class="word leak${isNew}" style="--c:${p ? p.color : '#b48cff'}">${esc(w)}</span>`; }
    const a = S.ally.get(w);
    const p = a && member(a.by);
    return a ? `<span class="word ally got${isNew}" style="--c:${p ? p.color : '#fff'}">${esc(w)}</span>` : `<span class="word${isNew}">${esc(w)}</span>`;
  }).join('');
  if (ghosts.length) {
    html += `<div class="list-head">${icon('handshake', 'sm')}From your allies <small>tap to see where, then trace it</small></div>`;
    html += ghosts.map(a => {
      const p = member(a.by);
      return `<button class="word ally" style="--c:${p ? p.color : '#fff'}" data-w="${esc(a.w)}">${p ? chipHTML(p, 'tiny') : ''}${esc(a.w)}</button>`;
    }).join('');
  }
  const rej = [...S.rejected].filter(([w]) => !S.mine.has(w)).reverse().slice(0, 6);
  if (rej.length) {
    const left = 3 - [...S.rejected.values()].filter(y => y.challenged).length;
    html += `<div class="list-head">${icon('gavel', 'sm')}Not in our dictionary <small>challenge it (${left} left) and the family votes after the round</small></div>`;
    html += rej.map(([w, x]) => `<span class="word rejected">${esc(w)}${x.challenged ? '<em>challenged</em>' : x.challengeable && left > 0 ? `<button class="challenge-btn" data-c="${esc(w)}">Challenge</button>` : ''}</span>`).join('');
  }
  box.innerHTML = html;
  box.querySelectorAll('.word.ally[data-w]').forEach(b => {
    b.onclick = () => {
      const a = S.ally.get(b.dataset.w);
      const p = member(a.by);
      if (a && a.path) S.play.board.hint(a.path, p ? p.color : 'var(--mint)');
    };
  });
  box.querySelectorAll('[data-c]').forEach(b => { b.onclick = () => challenge(b.dataset.c); });
  S.play.count.textContent = `${S.mine.size} word${S.mine.size === 1 ? '' : 's'}`;
}

function updateScore() { if (S.play && S.play.scoreEl) { const n = scoreOf(); S.play.scoreEl.textContent = `${n} pt${n === 1 ? '' : 's'}`; } }

function renderScreenPlay() {
  const r = S.round;
  $root.innerHTML = `<div class="screen">
    <div class="left">
      <div class="row" style="width:min(80vmin,100%)"><div class="timer grow" id="timer"><i id="bar"></i></div><span class="clock" id="clock"></span></div>
      <div class="board-wrap board-host" id="boardHost"></div>
      <div class="muted" style="font-size:2.4vmin">${r.size}×${r.size} · words of ${r.minLen}+ letters · join late at ${esc(joinURL(S.code).replace(/^https?:\/\//, ''))}</div>
    </div>
    <div class="side"><div class="card stack"><h3>Words found</h3><div id="counts" class="stack"></div></div><div id="bananaPanel"></div></div>
  </div>`;
  const board = makeBoard(r.tiles, r.size, { blank: r.startAt > S.conn.now() });
  const host = $root.querySelector('#boardHost');
  host.appendChild(board.el);
  S.play = { board, boardHost: host, chaosHud: null, bar: $root.querySelector('#bar'), clock: $root.querySelector('#clock'), timer: $root.querySelector('#timer'), countsEl: $root.querySelector('#counts'), bananaEl: $root.querySelector('#bananaPanel'), shown: {} };
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
    const split = (S.bananaSplit || []).includes(p.id) ? '<span class="split-badge small">Banana Split</span>' : '';
    return `<div class="screen-player" data-id="${p.id}" ${a ? `style="box-shadow:inset 4px 0 0 ${a.color}"` : ''}>${chipHTML(p, p.connected ? '' : 'off')}<span class="name">${esc(p.name)}${a ? `<br><span class="muted small" style="color:${a.color}">${esc(a.name)}</span>` : ''}${split}</span><span class="count ${changed ? 'bump' : ''}">${n}</span></div>`;
  }).join('');
  if (bump) ps.forEach(p => { if (S.play.shown[p.id] !== (counts[p.id] || 0) && S.play.shown[p.id] !== undefined) sfx.blip(Math.min(11, counts[p.id] || 0)); });
  ps.forEach(p => { S.play.shown[p.id] = counts[p.id] || 0; });
  renderBananaPanel();
}

// Everyone's bananas on the big screen while Nana's BaNanagrams is on.
function renderBananaPanel() {
  const el = S.play && S.play.bananaEl;
  if (!el) return;
  const ms = S.round ? S.conn.now() - S.round.startAt : 0;
  const on = S.chaos && S.chaos.activeOf('banana', ms);
  if (!on) { el.innerHTML = ''; return; }
  const counts = S.bananaCounts || {};
  el.innerHTML = `<div class="card stack banana-panel"><h3>Banana race</h3>${players().map(p => `<div class="row banana-row">${chipHTML(p, 'tiny')}<span class="grow">${esc(p.name)}</span><span class="banana-mini" data-n="${counts[p.id] || 0}">${bananaSVG()}</span><b>${counts[p.id] || 0}</b></div>`).join('')}</div>`;
  el.querySelectorAll('.banana-mini').forEach(b => setBananaFill(b, +b.dataset.n));
}

function screenBridge(m) {
  if (MODE !== 'screen' || !S.play || S.view !== 'play') return;
  const p = member(m.id);
  S.play.board.sweep(m.kind === 'both' ? 'var(--pink)' : 'var(--sun)');
  sfx.bridge();
  const t = document.createElement('div');
  t.className = 'tv-callout pop-in';
  t.style.setProperty('--c', p ? p.color : 'var(--sun)');
  t.innerHTML = `${p ? chipHTML(p) : ''}<span><b>${esc(p ? p.name : 'Someone')}</b> ${m.kind === 'both' ? 'crossed the board both ways' : 'bridged the board'}! <em>+${m.bonus}</em></span>`;
  S.play.boardHost.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------------- CHALLENGE VOTES ----------------
let voteEl = null, voteTimer = null;
function showVote(v) {
  closeVote();
  S.chaos && S.chaos.destroy();
  cancelAnimationFrame(clockRAF);
  document.querySelectorAll('.chaos-tut').forEach(x => x.remove());
  S.view = 'vote';
  const me = S.you && S.you.id;
  const canVote = v.eligible.includes(me);
  const mine = v.by.includes(me);
  const names = v.by.map(id => member(id)).filter(Boolean);
  voteEl = document.createElement('div');
  voteEl.className = `vote-overlay ${MODE === 'screen' ? 'tv' : 'phone'}`;
  voteEl.innerHTML = `<div class="vote-card pop-in">
    <div class="chaos-kicker">Challenge ${v.index + 1} of ${v.total}</div>
    <div class="vote-who">${names.map(p => chipHTML(p)).join('')}<span>${esc(names.map(p => p.name).join(' & '))} say${names.length === 1 ? 's' : ''}</span></div>
    <div class="vote-word">${v.w.toUpperCase().split('').map(c => `<span>${c}</span>`).join('')}</div>
    <div class="muted">is a real word. Should it count?</div>
    <div class="vote-board"></div>
    <div class="vote-bar"><i></i></div>
    <div class="vote-tally"><span class="yes">Yes <b>${v.yes}</b></span><span class="no">No <b>${v.no}</b></span></div>
    ${canVote ? `<div class="row vote-btns"><button class="btn mint grow" data-v="1">It counts</button><button class="btn grow" style="background:var(--bad);box-shadow:0 5px 0 #a3203a" data-v="0">Nope</button></div>` : `<div class="muted center">${mine ? 'Your challenge. Waiting for the family…' : 'Waiting for votes…'}</div>`}
  </div>`;
  document.body.appendChild(voteEl);
  const b = makeBoard(v.tiles, v.size);
  voteEl.querySelector('.vote-board').appendChild(b.el);
  setTimeout(() => b.light(v.path, { color: 'var(--sun)', step: 120 }), 300);
  voteEl.querySelectorAll('[data-v]').forEach(btn => {
    btn.onclick = () => {
      S.conn.send({ t: 'castVote', id: v.id, yes: btn.dataset.v === '1' });
      voteEl.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('picked', x === btn));
      haptic('tick');
    };
  });
  const bar = voteEl.querySelector('.vote-bar i');
  const total = v.endsAt - S.conn.now();
  const tick = () => {
    if (!voteEl) return;
    const left = Math.max(0, v.endsAt - S.conn.now());
    bar.style.transform = `scaleX(${left / Math.max(1, total)})`;
    if (left > 0) voteTimer = requestAnimationFrame(tick);
  };
  tick();
  voteEl.dataset.id = v.id;
  sfx.gavel();
}
function voteTally(m) {
  if (!voteEl || voteEl.dataset.id !== m.id) return;
  voteEl.querySelector('.yes b').textContent = m.yes;
  voteEl.querySelector('.no b').textContent = m.no;
  sfx.tick(m.yes + m.no);
}
function voteResult(m) {
  if (!voteEl || voteEl.dataset.id !== m.id) return;
  const s = document.createElement('div');
  s.className = `vote-stamp ${m.accepted ? 'ok' : 'no'}`;
  s.textContent = m.accepted ? (m.auto ? 'Counts! (no one to object)' : 'It counts!') : 'Overruled';
  voteEl.querySelector('.vote-card').appendChild(s);
  voteEl.querySelectorAll('[data-v]').forEach(x => { x.disabled = true; });
  sfx.gavel();
  if (m.accepted) sfx.ok(5); else sfx.bad();
}
function closeVote() {
  cancelAnimationFrame(voteTimer);
  if (voteEl) { voteEl.remove(); voteEl = null; }
}

// ---------------- RESULTS ----------------
function showResults(R) {
  if (S.reveal && S.reveal.no === R.no) return;
  closeReveal();
  closeVote();
  S.chaos && S.chaos.destroy();
  cancelAnimationFrame(clockRAF);
  document.querySelectorAll('.countdown, .chaos-tut, .chaos-banner').forEach(x => x.remove());
  S.view = 'results';
  const rv = runReveal(R, {
    mode: MODE === 'screen' ? 'tv' : 'phone',
    me: S.you && S.you.id,
    isHost,
    onAgain: () => S.conn.send({ t: 'start' }),
    onLobby: () => S.conn.send({ t: 'lobby' }),
    control: msg => S.conn.send({ t: 'revealCtl', ...msg }),
    attitude: kind => S.conn.send({ t: 'attitude', kind }),
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

// The Door Bowl studio card: once a launch in the app, once a visit on the TV screen (or ?intro=1).
(() => {
  let seen = false;
  try { seen = sessionStorage.getItem('rb:intro') === '1'; } catch {}
  const want = params.has('intro') || (!seen && (IN_APP || MODE === 'screen'));
  if (!want) return;
  try { sessionStorage.setItem('rb:intro', '1'); } catch {}
  const freezeAt = location.hostname === 'localhost' && params.has('introAt') ? +params.get('introAt') : undefined;
  import('./intro.js').then(m => m.playIntro({ freezeAt })).catch(() => {});
})();

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
if (location.hostname === 'localhost') window.__rb = S; // local testing only
