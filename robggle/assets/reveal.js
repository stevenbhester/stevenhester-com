// End-of-round show: every found word gets its moment, points fly into a racing scoreboard,
// words nobody else found get stamped x2, then a crown and confetti for the winner.
import { makeBoard } from './board.js';
import { sfx } from './sfx.js';
import { haptic } from './net.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const initial = n => esc((n || '?').trim().charAt(0).toUpperCase() || '?');
const CROWN = '<svg class="crown" viewBox="0 0 28 20"><path d="M2 18 L4 5 L10 11 L14 2 L18 11 L24 5 L26 18 Z" fill="#ffd23f" stroke="#b38f10" stroke-width="1.5" stroke-linejoin="round"/></svg>';

export function chipHTML(p, cls = '') {
  return `<span class="chip ${cls}" style="--c:${p.color}">${initial(p.name)}</span>`;
}

export function runReveal(R, opt) {
  const tv = opt.mode === 'tv';
  const root = document.createElement('div');
  root.className = `reveal ${tv ? 'tv' : 'phone'}`;
  const players = R.players.slice();
  const byId = Object.fromEntries(players.map(p => [p.id, p]));
  const alliances = Object.fromEntries((R.alliances || []).map(a => [a.id, a]));
  const me = opt.me;

  const stage = document.createElement('div'); stage.className = 'stage';
  const miniWrap = document.createElement('div'); miniWrap.className = 'mini';
  const mini = makeBoard(R.tiles, R.size);
  miniWrap.appendChild(mini.el);
  const scores = document.createElement('div'); scores.className = 'scores';
  const actions = document.createElement('div'); actions.className = 'reveal-actions';
  const skip = document.createElement('button'); skip.className = 'btn small ghost skip'; skip.textContent = 'Skip';

  if (tv) root.append(miniWrap, stage, scores, actions, skip);
  else {
    const scoreScroll = document.createElement('div');
    scoreScroll.style.cssText = 'overflow:auto;min-height:0';
    scoreScroll.appendChild(scores);
    root.append(stage, miniWrap, scoreScroll, actions, skip);
  }
  document.body.appendChild(root);

  // ---------- scoreboard ----------
  const rowH = tv ? Math.max(40, Math.min(72, (innerHeight * 0.8) / Math.max(players.length, 1))) : 48;
  scores.style.height = `${players.length * rowH}px`;
  scores.style.setProperty('--rh', `${rowH}px`);
  const running = Object.fromEntries(players.map(p => [p.id, 0]));
  const maxScore = Math.max(1, ...players.map(p => p.round));
  const rows = {};
  for (const p of players) {
    const r = document.createElement('div');
    r.className = 'srow';
    const a = p.alliance && alliances[p.alliance];
    r.innerHTML = `${CROWN}${chipHTML(p)}<div class="bar-wrap" ${a ? `style="outline:2px solid ${a.color};outline-offset:-2px"` : ''}><div class="bar" style="--c:${p.color}"></div><span class="label">${esc(p.name)}${p.id === me ? ' (you)' : ''}</span></div><span class="sc">0</span>`;
    scores.appendChild(r);
    rows[p.id] = r;
  }
  function rerank() {
    const order = players.slice().sort((a, b) => running[b.id] - running[a.id] || a.name.localeCompare(b.name));
    order.forEach((p, i) => { rows[p.id].style.transform = `translateY(${i * rowH}px)`; });
    return order;
  }
  rerank();
  function addPoints(id, n) {
    running[id] += n;
    const r = rows[id];
    r.querySelector('.bar').style.transform = `scaleX(${running[id] / maxScore})`;
    r.querySelector('.sc').textContent = running[id];
    r.classList.remove('hit'); void r.offsetWidth; r.classList.add('hit');
    rerank();
  }

  // ---------- word card ----------
  function showCard(wd, i) {
    if (i === 0) stage.innerHTML = '';
    stage.querySelectorAll('.wordcard, .stamp').forEach(x => x.remove());
    const card = document.createElement('div');
    card.className = 'wordcard' + (wd.solo ? ' solo' : '');
    const stageW = stage.clientWidth || 300;
    const ls = Math.min(tv ? 90 : 46, (stageW - 20) / wd.w.length - 5);
    card.style.setProperty('--ls', `${ls}px`);
    const letters = wd.w.toUpperCase().split('').map((c, k) => `<span style="--i:${k}">${c}</span>`).join('');
    const pts = wd.solo ? `+${wd.base} <span style="color:var(--sun)">×${R.soloMult}</span>` : `+${wd.pts}`;
    const finders = wd.finders.map((id, k) => byId[id] ? chipHTML(byId[id]).replace('class="chip ', `style="--i:${k}" class="chip `) : '').join('');
    card.innerHTML = `<div class="letters">${letters}</div><div class="pts">${pts}</div><div class="finders">${finders}</div>`;
    stage.appendChild(card);
    const color = wd.solo ? 'var(--sun)' : wd.finders.length === 1 && byId[wd.finders[0]] ? byId[wd.finders[0]].color : 'var(--mint)';
    if (wd.path) mini.light(wd.path, { color, step: Math.min(70, 300 / wd.path.length) });
    sfx.blip(i);
    return card;
  }

  function flyPoints(card, wd) {
    const from = card.querySelector('.pts').getBoundingClientRect();
    for (const id of wd.finders) {
      const row = rows[id];
      if (!row) continue;
      const to = row.querySelector('.sc').getBoundingClientRect();
      const f = document.createElement('div');
      f.className = 'flyer' + (wd.solo ? ' solo' : '');
      f.textContent = `+${wd.pts}`;
      f.style.left = `${from.left + from.width / 2 - 16}px`;
      f.style.top = `${from.top}px`;
      document.body.appendChild(f);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        f.style.transform = `translate(${to.left - from.left - from.width / 2 + 16}px, ${to.top - from.top}px) scale(0.7)`;
        f.style.opacity = '0.2';
      }));
      setTimeout(() => { f.remove(); if (!done) { addPoints(id, wd.pts); } }, 560);
    }
    setTimeout(() => sfx.coin(), 540);
  }

  function soloStamp(wd, dur) {
    const by = wd.soloBy || {};
    let who;
    if (by.alliance && alliances[by.alliance]) who = `Only ${esc(alliances[by.alliance].name)}!`;
    else if (wd.finders.length === 1 && wd.finders[0] === me) who = 'Only you!';
    else if (wd.finders.length === 1 && byId[wd.finders[0]]) who = `Only ${esc(byId[wd.finders[0]].name)}!`;
    else who = 'Solo!';
    const s = document.createElement('div');
    s.className = 'stamp';
    s.innerHTML = `${who}<small>×${R.soloMult} points</small>`;
    stage.appendChild(s);
    burst(stage, 26);
    root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake');
    sfx.solo();
    if (wd.finders.includes(me)) haptic('success');
    setTimeout(() => s.remove(), Math.min(1400, dur));
  }

  // ---------- sequence ----------
  let done = false;
  let resolveSkip;
  const skipped = new Promise(r => { resolveSkip = r; });
  skip.onclick = () => { if (!done) resolveSkip(); };
  const wait = ms => Promise.race([sleep(ms), skipped]);

  async function sequence() {
    stage.innerHTML = `<div class="title-stamp">TIME'S UP!</div>`;
    sfx.stamp();
    await wait(1100);
    const words = R.words;
    if (!words.length) {
      stage.innerHTML = `<div class="title-stamp" style="font-size:32px">Nobody found a single word?!</div>`;
      await wait(1600);
      return;
    }
    // Longer words and solos get more time; the whole show stays around 10-30s.
    const N = words.length;
    const weight = (wd, i) => 0.7 + 0.18 * (wd.w.length - 3) + (wd.solo ? 0.7 : 0) + (i >= N - 3 ? 0.9 : 0);
    const total = Math.min(30000, Math.max(7000, N * 650));
    const wsum = words.reduce((s, wd, i) => s + weight(wd, i), 0);
    for (let i = 0; i < N; i++) {
      const wd = words[i];
      const dur = Math.max(320, (total * weight(wd, i)) / wsum);
      const card = showCard(wd, i);
      await wait(Math.min(260, dur * 0.35));
      if (done) return;
      flyPoints(card, wd);
      if (wd.solo) soloStamp(wd, dur);
      await wait(dur - Math.min(260, dur * 0.35));
      if (done) return;
      card.classList.add('out');
    }
    await wait(600);
  }

  function finish() {
    if (done) return;
    done = true;
    skip.remove();
    mini.unlight();
    document.querySelectorAll('.flyer').forEach(f => f.remove());
    for (const p of players) {
      running[p.id] = p.round;
      const r = rows[p.id];
      r.querySelector('.bar').style.transform = `scaleX(${p.round / maxScore})`;
      r.querySelector('.sc').textContent = R.no > 1 ? `${p.round}` : p.round;
    }
    const order = rerank();
    const top = order[0];
    const tied = order.filter(p => p.round === top.round);
    if (top && top.round > 0) tied.forEach(p => rows[p.id].classList.add('winner'));

    const best = R.best && R.best.by.map(id => byId[id]).filter(Boolean);
    const soloKing = players.slice().sort((a, b) => b.solos - a.solos)[0];
    const facts = [];
    if (R.best) facts.push(`Best word: <b>${esc(R.best.w.toUpperCase())}</b> ${best.map(p => chipHTML(p, 'tiny')).join(' ')}`);
    if (soloKing && soloKing.solos) facts.push(`Most words only they found: <b>${esc(soloKing.name)}</b> (${soloKing.solos})`);
    facts.push(`Found <b>${R.words.length}</b> of <b>${R.possible}</b> possible words`);
    if (R.no > 1) facts.push(`Game totals: ${order.slice().sort((a, b) => b.total - a.total).map(p => `${esc(p.name)} <b>${p.total}</b>`).join(' · ')}`);
    const allianceTot = (R.alliances || []).length
      ? `<div class="alliance-tot">${R.alliances.map(a => `<span style="--ac:${a.color}"><b>${esc(a.name)}</b> ${a.round}</span>`).join('')}</div>` : '';
    const missed = R.missed.length
      ? `<h3 style="margin-top:6px">Words nobody found</h3><div class="missed">${R.missed.map((m, i) => `<span style="--i:${i}" data-w="${i}">${esc(m.w)}</span>`).join('')}</div>` : '';
    const title = !top || top.round === 0 ? 'Nobody scored!' : tied.length > 1 ? "It's a tie!" : `${esc(top.name)} wins!`;
    stage.innerHTML = `<div class="final"><div class="winner-name">${title}</div><div class="facts">${facts.map(f => `<div>${f}</div>`).join('')}</div>${allianceTot}${missed}</div>`;
    stage.querySelectorAll('.missed span').forEach(s => {
      s.onclick = () => { const m = R.missed[+s.dataset.w]; if (m.path) mini.light(m.path, { color: 'var(--pink)' }); };
    });
    sfx.fanfare();
    confetti(top ? (tied.length > 1 ? null : top.color) : null);
    if (tied.some(p => p.id === me)) haptic('success');
    renderActions();
  }

  function renderActions() {
    actions.innerHTML = '';
    if (opt.isHost()) {
      const again = document.createElement('button');
      again.className = 'btn'; again.textContent = 'Play again';
      again.onclick = () => opt.onAgain();
      const lobby = document.createElement('button');
      lobby.className = 'btn ghost'; lobby.textContent = 'Lobby';
      lobby.onclick = () => opt.onLobby();
      actions.append(again, lobby);
    } else {
      actions.innerHTML = `<div class="muted">Waiting for the host to start the next round…</div>`;
    }
  }

  sequence().then(finish, finish);
  skipped.then(finish);

  return {
    el: root,
    refreshActions() { if (done) renderActions(); },
    close() { done = true; mini.destroy(); root.remove(); document.querySelectorAll('.flyer, canvas.confetti').forEach(x => x.remove()); },
  };
}

function burst(host, n) {
  const b = document.createElement('div');
  b.className = 'burst';
  const colors = ['#ffd23f', '#ff8a3d', '#ff5c8a', '#3ee0b0', '#fff1d2'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 140;
    p.style.setProperty('--c', colors[i % colors.length]);
    p.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    p.style.setProperty('--dy', `${Math.sin(a) * d}px`);
    p.style.setProperty('--rot', `${Math.random() * 720}deg`);
    b.appendChild(p);
  }
  host.appendChild(b);
  setTimeout(() => b.remove(), 900);
}

export function confetti(color) {
  const c = document.createElement('canvas');
  c.className = 'confetti';
  document.body.appendChild(c);
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const colors = color ? [color, '#ffd23f', '#fff1d2', color] : ['#ffd23f', '#ff8a3d', '#ff5c8a', '#3ee0b0', '#5ab0ff'];
  const parts = Array.from({ length: 160 }, (_, i) => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 16 - 4,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
    w: 6 + Math.random() * 7, h: 4 + Math.random() * 5, c: colors[i % colors.length],
  }));
  const t0 = performance.now();
  (function frame(t) {
    const age = t - t0;
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r);
      g.globalAlpha = Math.max(0, 1 - age / 3200);
      g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      g.restore();
    }
    if (age < 3200 && c.isConnected) requestAnimationFrame(frame); else c.remove();
  })(t0);
}
