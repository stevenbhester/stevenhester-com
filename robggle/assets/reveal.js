// End-of-round show: every found word gets its moment, points fly into a racing scoreboard,
// words nobody else found get stamped x2. The host can change the speed live for everyone.
// Then bonuses, heat maps, loot-box badges, and good/bad sport speech bubbles.
import { makeBoard } from './board.js';
import { sfx } from './sfx.js';
import { haptic } from './net.js';
import { ICONS } from './icons.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initial = n => esc((n || '?').trim().charAt(0).toUpperCase() || '?');
const CROWN = '<svg class="crown" viewBox="0 0 28 20"><path d="M2 18 L4 5 L10 11 L14 2 L18 11 L24 5 L26 18 Z" fill="#ffd23f" stroke="#b38f10" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const SPEEDS = [0.5, 1, 2, 4];

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
  let speed = 1;
  let done = false;

  const stageCol = document.createElement('div'); stageCol.className = 'stage-col';
  const stage = document.createElement('div'); stage.className = 'stage';
  const ticker = document.createElement('div'); ticker.className = 'ticker';
  stageCol.append(stage, ticker);
  const miniWrap = document.createElement('div'); miniWrap.className = 'mini';
  const mini = makeBoard(R.tiles, R.size);
  const miniLabel = document.createElement('div'); miniLabel.className = 'mini-label';
  miniWrap.append(mini.el, miniLabel);
  const scores = document.createElement('div'); scores.className = 'scores';
  const scoreCol = document.createElement('div'); scoreCol.className = 'score-col';
  scoreCol.appendChild(scores);
  const extra = document.createElement('div'); extra.className = 'extra';
  const actions = document.createElement('div'); actions.className = 'reveal-actions';
  const ctl = document.createElement('div'); ctl.className = 'speed-ctl';

  if (tv) root.append(miniWrap, stageCol, scoreCol, actions, ctl);
  else root.append(ctl, stageCol, miniWrap, scoreCol, extra, actions);
  if (tv) stageCol.appendChild(extra);
  document.body.appendChild(root);

  // ---------- speed control (host drives it for everyone) ----------
  function renderCtl() {
    if (done) { ctl.innerHTML = ''; return; }
    if (opt.isHost()) {
      ctl.innerHTML = `${SPEEDS.map(s => `<button class="btn small ${s === speed ? '' : 'ghost'}" data-s="${s}">${s === 0.5 ? '½' : s}×</button>`).join('')}<button class="btn small ghost" data-skip="1">Skip</button>`;
      ctl.querySelectorAll('[data-s]').forEach(b => { b.onclick = () => opt.control({ speed: +b.dataset.s }); });
      ctl.querySelector('[data-skip]').onclick = () => opt.control({ skip: true });
    } else ctl.innerHTML = speed !== 1 ? `<span class="speed-tag">${speed === 0.5 ? '½' : speed}× speed</span>` : '';
  }
  renderCtl();

  // ---------- scoreboard ----------
  const rowH = tv ? Math.max(40, Math.min(72, (innerHeight * 0.62) / Math.max(players.length, 1))) : 48;
  scores.style.height = `${players.length * rowH}px`;
  scores.style.setProperty('--rh', `${rowH}px`);
  const running = Object.fromEntries(players.map(p => [p.id, 0]));
  const maxScore = Math.max(1, ...players.map(p => p.round));
  const rows = {};
  for (const p of players) {
    const r = document.createElement('div');
    r.className = 'srow';
    const a = p.alliance && alliances[p.alliance];
    r.innerHTML = `${CROWN}${chipHTML(p)}<div class="bar-wrap" ${a ? `style="outline:2px solid ${a.color};outline-offset:-2px"` : ''}><div class="bar" style="--c:${p.color}"></div><span class="label">${esc(p.name)}${p.id === me ? ' (you)' : ''}${R.handicap && p.hcp ? ` <span class="hcp-tag">HCP ${p.hcp}</span>` : ''}</span></div><span class="sc">0</span>`;
    scores.appendChild(r);
    rows[p.id] = r;
  }
  function rerank() {
    const order = players.slice().sort((a, b) => running[b.id] - running[a.id] || a.name.localeCompare(b.name));
    order.forEach((p, i) => { rows[p.id].style.transform = `translateY(${i * rowH}px)`; });
    return order;
  }
  rerank();
  function setScore(id, v) {
    running[id] = v;
    const r = rows[id];
    r.querySelector('.bar').style.transform = `scaleX(${Math.min(1, v / maxScore)})`;
    r.querySelector('.sc').textContent = v;
    r.classList.remove('hit'); void r.offsetWidth; r.classList.add('hit');
    rerank();
  }

  // ---------- timing that follows the host's speed ----------
  let resolveSkip;
  const skipped = new Promise(r => { resolveSkip = r; });
  const wait = ms => new Promise(res => {
    let left = ms, last = performance.now();
    const step = () => {
      if (done) return res();
      const now = performance.now();
      left -= (now - last) * speed; last = now;
      if (left <= 0) res(); else setTimeout(step, 25);
    };
    step();
  });

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
    const tags = [];
    const bonusIds = Object.keys(wd.bonus || {});
    if (bonusIds.length) tags.push(`<span class="wtag bridge">+${Math.max(...Object.values(wd.bonus))} bridge</span>`);
    const vias = Object.values(wd.via || {});
    if (vias.includes('challenge')) tags.push('<span class="wtag vote">voted in</span>');
    if (vias.includes('leak')) tags.push('<span class="wtag leak">leaked</span>');
    if (vias.includes('copy')) tags.push('<span class="wtag copy">ally copy</span>');
    const finders = wd.finders.map((id, k) => byId[id] ? chipHTML(byId[id], wd.via && wd.via[id] === 'leak' ? 'leaked' : '').replace('class="chip ', `style="--i:${k}" class="chip `) : '').join('');
    card.innerHTML = `<div class="letters">${letters}</div><div class="pts">${pts}</div>${tags.length ? `<div class="wtags">${tags.join('')}</div>` : ''}<div class="finders">${finders}</div>`;
    stage.appendChild(card);
    const color = wd.solo ? 'var(--sun)' : wd.finders.length === 1 && byId[wd.finders[0]] ? byId[wd.finders[0]].color : 'var(--mint)';
    if (wd.path) mini.light(wd.path, { color, step: Math.min(70, 300 / wd.path.length) / speed });
    sfx.blip(i);
    if (bonusIds.length) setTimeout(() => sfx.bridge(), 200);
    return card;
  }

  function pushTicker(wd) {
    const item = document.createElement('div');
    item.className = 'tick-item' + (wd.solo ? ' solo' : '');
    item.innerHTML = `<b>${esc(wd.w.toUpperCase())}</b><span class="tick-chips">${wd.finders.map(id => byId[id] ? chipHTML(byId[id], 'tiny') : '').join('')}</span><span class="tick-pts">+${wd.pts}</span>`;
    ticker.prepend(item);
    const items = [...ticker.children];
    items.forEach((el, k) => { el.style.setProperty('--k', k); el.classList.toggle('fading', k >= 3); });
    items.slice(5).forEach(el => el.remove());
  }

  function fly(fromEl, id, amount, cls = '') {
    const row = rows[id];
    if (!row || !fromEl) return;
    const from = fromEl.getBoundingClientRect();
    const to = row.querySelector('.sc').getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'flyer ' + cls;
    f.textContent = `+${amount}`;
    f.style.left = `${from.left + from.width / 2 - 16}px`;
    f.style.top = `${from.top}px`;
    document.body.appendChild(f);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      f.style.transitionDuration = `${0.55 / Math.min(speed, 2)}s`;
      f.style.transform = `translate(${to.left - from.left - from.width / 2 + 16}px, ${to.top - from.top}px) scale(0.7)`;
      f.style.opacity = '0.2';
    }));
    setTimeout(() => { f.remove(); if (!done) setScore(id, running[id] + amount); }, 560 / Math.min(speed, 2));
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
    setTimeout(() => s.remove(), Math.min(1400, dur / speed));
  }

  async function sequence() {
    stage.innerHTML = `<div class="title-stamp">TIME'S UP!</div>`;
    sfx.stamp();
    await Promise.race([wait(1100), skipped]);
    const words = R.words;
    if (!words.length) {
      stage.innerHTML = `<div class="title-stamp" style="font-size:32px">Nobody found a single word?!</div>`;
      await Promise.race([wait(1600), skipped]);
      return;
    }
    // Longer words and solos get more time; the whole show stays around 10-30s at 1x.
    const N = words.length;
    const weight = (wd, i) => 0.7 + 0.18 * (wd.w.length - 3) + (wd.solo ? 0.7 : 0) + (i >= N - 3 ? 0.9 : 0);
    const total = Math.min(30000, Math.max(7000, N * 650));
    const wsum = words.reduce((s, wd, i) => s + weight(wd, i), 0);
    for (let i = 0; i < N; i++) {
      if (done) return;
      const wd = words[i];
      const dur = Math.max(320, (total * weight(wd, i)) / wsum);
      const card = showCard(wd, i);
      const lead = Math.min(260, dur * 0.35);
      await Promise.race([wait(lead), skipped]);
      if (done) return;
      for (const id of wd.finders) fly(card.querySelector('.pts'), id, wd.pts + ((wd.bonus || {})[id] || 0), wd.solo ? 'solo' : '');
      if (wd.solo) soloStamp(wd, dur);
      await Promise.race([wait(dur - lead), skipped]);
      if (done) return;
      card.classList.add('out');
      pushTicker(wd);
    }
    await Promise.race([wait(500), skipped]);
    // Bonuses that land after the words.
    const banana = players.filter(p => p.bananaBonus);
    if (banana.length && !done) {
      stage.innerHTML = `<div class="bonus-card pop-in"><div class="bonus-title">Banana Split!</div><div class="muted">Fullest banana: +10% of the round</div><div class="finders">${banana.map(p => chipHTML(p)).join('')}</div></div>`;
      sfx.solo();
      await Promise.race([wait(500), skipped]);
      banana.forEach(p => fly(stage.querySelector('.bonus-card'), p.id, p.bananaBonus, 'solo'));
      await Promise.race([wait(1500), skipped]);
    }
    const strokes = players.filter(p => p.strokes);
    if (strokes.length && !done) {
      stage.innerHTML = `<div class="bonus-card pop-in"><div class="bonus-title">Handicap strokes</div><div class="muted">Golf rules: everyone gets their usual gap back</div><div class="stroke-list">${strokes.map(p => `<div class="row">${chipHTML(p, 'tiny')}<span class="grow">${esc(p.name)}</span><span class="muted small">HCP ${p.hcp}</span><b>+${p.strokes}</b></div>`).join('')}</div></div>`;
      sfx.coin();
      await Promise.race([wait(600), skipped]);
      strokes.forEach(p => fly(stage.querySelector('.bonus-card'), p.id, p.strokes));
      await Promise.race([wait(1600), skipped]);
    }
  }

  function finish() {
    if (done) return;
    done = true;
    renderCtl();
    mini.unlight();
    document.querySelectorAll('.flyer').forEach(f => f.remove());
    ticker.innerHTML = '';
    for (const p of players) setScore(p.id, p.round);
    const order = rerank();
    const top = order[0];
    const tied = order.filter(p => p.round === top.round);
    if (top && top.round > 0) tied.forEach(p => rows[p.id].classList.add('winner'));
    root.classList.add('final-state');

    const best = R.best && R.best.by.map(id => byId[id]).filter(Boolean);
    const facts = [];
    if (R.best) facts.push(`Best word: <b>${esc(R.best.w.toUpperCase())}</b> ${best.map(p => chipHTML(p, 'tiny')).join(' ')}`);
    facts.push(`Found <b>${R.words.length}</b> of <b>${R.possible}</b> possible words`);
    if (R.no > 1) facts.push(`Game totals: ${players.slice().sort((a, b) => b.total - a.total).map(p => `${esc(p.name)} <b>${p.total}</b>`).join(' · ')}`);
    if (R.handicap) {
      const next = players.filter(p => p.nextHcp !== p.hcp);
      if (next.length) facts.push(`Next round's handicaps: ${players.map(p => `${esc(p.name)} <b>${p.nextHcp || 0}</b>`).join(' · ')}`);
    }
    const allianceTot = (R.alliances || []).length
      ? `<div class="alliance-tot">${R.alliances.map(a => `<span style="--ac:${a.color}"><b>${esc(a.name)}</b> ${a.round}</span>`).join('')}</div>` : '';
    const title = !top || top.round === 0 ? 'Nobody scored!' : tied.length > 1 ? "It's a tie!" : `${esc(top.name)} wins!`;
    stage.innerHTML = `<div class="final"><div class="winner-name">${title}</div><div class="facts">${facts.map(f => `<div>${f}</div>`).join('')}</div>${allianceTot}</div>`;
    sfx.fanfare();
    confetti(top && tied.length === 1 ? top.color : null);
    if (tied.some(p => p.id === me)) haptic('success');

    // Heat maps: the mini board becomes everyone's; phones also get their own.
    mini.heat(R.heat ? R.heat.all : new Array(R.tiles.length).fill(0), 'hot');
    miniLabel.textContent = 'Letters everyone used';
    let heatHTML = '';
    if (!tv && me && R.heat && R.heat.by) {
      heatHTML = `<div class="heat-row"><div class="heat-box"><div class="heat-host" data-h="me"></div><div class="mini-label">Your letters</div></div><div class="heat-box"><div class="heat-host" data-h="all"></div><div class="mini-label">Everyone's letters</div></div></div>`;
      miniWrap.classList.add('hidden');
    }
    const missed = R.missed.length
      ? `<div class="section"><h3>Words nobody found</h3><div class="missed">${R.missed.map((m, i) => `<span style="--i:${i}" data-w="${i}">${esc(m.w)}</span>`).join('')}</div></div>` : '';
    extra.innerHTML = `${heatHTML}<div class="section badges-section"><h3>${tv ? 'Badges' : 'Your badges'}</h3><div class="loot-host"></div></div>${!tv ? attitudeHTML() : ''}${missed}`;
    if (heatHTML) {
      const meCounts = R.heat.by[me] || new Array(R.tiles.length).fill(0);
      const b1 = makeBoard(R.tiles, R.size); b1.heat(meCounts, 'mint');
      const b2 = makeBoard(R.tiles, R.size); b2.heat(R.heat.all, 'hot');
      extra.querySelector('[data-h="me"]').appendChild(b1.el);
      extra.querySelector('[data-h="all"]').appendChild(b2.el);
    }
    extra.querySelectorAll('.missed span').forEach(s => {
      s.onclick = () => { const m = R.missed[+s.dataset.w]; if (m.path) { mini.light(m.path, { color: 'var(--pink)' }); miniWrap.classList.remove('hidden'); } };
    });
    wireAttitude();
    setTimeout(() => openLoot(extra.querySelector('.loot-host')), 1400);
    renderActions();
  }

  // ---------- badges ----------
  function badgeCard(b, k) {
    return `<div class="badge-card ${b.tone}" style="--i:${k}"><div class="badge-icon">${ICONS[b.icon] || ICONS.ribbon}</div><div><div class="badge-title">${esc(b.title)}</div><div class="badge-desc">${esc(b.desc)}</div></div></div>`;
  }
  async function openLoot(host) {
    if (!host || !R.badges) return;
    const who = tv ? players : players.filter(p => p.id === me);
    const others = tv ? [] : players.filter(p => p.id !== me);
    for (const p of who) {
      const list = R.badges[p.id] || [];
      const box = document.createElement('div');
      box.className = 'loot';
      box.innerHTML = `<div class="loot-owner">${chipHTML(p, 'tiny')} ${esc(p.name)}</div><div class="loot-box" style="--c:${p.color}"><div class="lid"></div><div class="body"></div><div class="ribbon"></div></div><div class="loot-cards"></div>`;
      host.appendChild(box);
      const lb = box.querySelector('.loot-box');
      const open = () => {
        if (lb.classList.contains('open')) return;
        lb.classList.add('open');
        sfx.box();
        burst(box, 30);
        if (p.id === me) haptic('success');
        box.querySelector('.loot-cards').innerHTML = list.map(badgeCard).join('');
      };
      lb.classList.add('shaking');
      lb.onclick = open;
      await new Promise(r => setTimeout(r, tv ? 900 : 1100));
      open();
      await new Promise(r => setTimeout(r, tv ? 700 : 300));
    }
    if (others.length) {
      const o = document.createElement('div');
      o.className = 'others-badges';
      o.innerHTML = `<h3>Everyone else</h3>${others.map(p => `<div class="other-badges">${chipHTML(p, 'tiny')}<b>${esc(p.name)}</b> ${(R.badges[p.id] || []).map(b => `<span class="mini-badge ${b.tone}" title="${esc(b.desc)}">${esc(b.title)}</span>`).join('')}</div>`).join('')}`;
      host.appendChild(o);
    }
  }

  // ---------- good / bad sport ----------
  function attitudeHTML() {
    const mineP = byId[me];
    if (!mineP) return '';
    const ranked = players.slice().sort((a, b) => b.round - a.round);
    const won = mineP.round === ranked[0].round && mineP.round > 0;
    return `<div class="section attitude"><h3>${won ? 'You won! How are you taking it?' : 'How are you taking it?'}</h3>
      <div class="row"><button class="btn mint grow" data-att="good">${won ? 'Gracious winner' : 'Good sport'}</button><button class="btn grow" data-att="bad">${won ? 'Sore winner' : 'Sore loser'}</button></div></div>`;
  }
  function wireAttitude() {
    extra.querySelectorAll('[data-att]').forEach(b => {
      b.onclick = () => { opt.attitude(b.dataset.att); haptic('tick'); b.classList.add('picked'); setTimeout(() => b.classList.remove('picked'), 2500); };
    });
  }
  // Phones get a running feed under the scores; the TV pops bubbles beside each player's row.
  function banter(m) {
    const p = byId[m.id];
    const kind = m.role.startsWith('bad') ? 'bad' : 'good';
    sfx.pop();
    const row = rows[m.id];
    if (row) { row.classList.remove('talking'); void row.offsetWidth; row.classList.add('talking'); }
    if (tv) {
      if (!row) return;
      row.querySelector('.bubble')?.remove();
      const b = document.createElement('div');
      b.className = `bubble side ${kind}`;
      b.textContent = m.text;
      row.appendChild(b);
      setTimeout(() => b.classList.add('out'), 8000);
      setTimeout(() => b.remove(), 8600);
      return;
    }
    let feed = scoreCol.querySelector('.banter-feed');
    if (!feed) {
      feed = document.createElement('div');
      feed.className = 'banter-feed';
      feed.innerHTML = '<h3>Trash talk</h3>';
      scoreCol.appendChild(feed);
    }
    const b = document.createElement('div');
    b.className = `feed-line ${kind}`;
    b.innerHTML = `${p ? chipHTML(p, 'tiny') : ''}<div class="bubble inline ${kind}">${esc(m.text)}</div>`;
    feed.querySelector('h3').after(b);
    [...feed.querySelectorAll('.feed-line')].slice(5).forEach(x => x.remove());
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
    refreshActions() { if (done) renderActions(); else renderCtl(); },
    control(m) {
      if (m.speed) { speed = m.speed; renderCtl(); }
      if (m.skip && !done) resolveSkip();
    },
    banter,
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
