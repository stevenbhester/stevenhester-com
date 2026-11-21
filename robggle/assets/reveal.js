// End-of-round show: every found word gets its moment, points fly into a racing scoreboard,
// words nobody else found get stamped x2. The host can change the speed live for everyone.
// Then bonuses, heat maps, loot-box badges, and good/bad sport speech bubbles.
import { makeBoard } from './board.js?v=dc68fa1-1795297650';
import { sfx } from './sfx.js?v=dc68fa1-1795297650';
import { haptic } from './net.js?v=dc68fa1-1795297650';
import { ICONS, UI } from './icons.js?v=dc68fa1-1795297650';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initial = n => esc((n || '?').trim().charAt(0).toUpperCase() || '?');
const CROWN = '<svg class="crown" viewBox="0 0 28 20"><path d="M2 18 L4 5 L10 11 L14 2 L18 11 L24 5 L26 18 Z" fill="#ffd23f" stroke="#b38f10" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const SPEEDS = [0.5, 1, 2, 4];
// Two words shown together each get a color, on their letters and on the little board.
const PAIR_A = '#3ee0b0', PAIR_B = '#5ab0ff';
const awardIcon = ic => ICONS[ic] || UI[ic] || ICONS.trophy;

export function chipHTML(p, cls = '') {
  // A player's tile: the emoji they picked, or their initial.
  return `<span class="chip ${cls}${p.emoji ? ' emo' : ''}" style="--c:${p.color}">${p.emoji ? esc(p.emoji) : initial(p.name)}</span>`;
}

export function runReveal(R, opt) {
  const tv = opt.mode === 'tv';
  const root = document.createElement('div');
  root.className = `reveal ${tv ? 'tv' : 'phone'}`;
  const players = R.players.slice();
  const byId = Object.fromEntries(players.map(p => [p.id, p]));
  const alliances = Object.fromEntries((R.alliances || []).map(a => [a.id, a]));
  const me = opt.me;
  const coop = R.mode === 'coop';
  let speed = 1;
  // 1x plays at what used to be half speed; the host's buttons scale from there.
  const BASE_PACE = 0.5;
  const pace = () => speed * BASE_PACE;
  let done = false;

  const stageCol = document.createElement('div'); stageCol.className = 'stage-col';
  const stage = document.createElement('div'); stage.className = 'stage';
  stageCol.append(stage);
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

  // ---------- scoreboard: a tower of letter tiles, seen edge-on, for each player ----------
  // Towers are scaled to whoever is ahead right now (at least 10 points' worth), so as someone pulls away
  // you watch the gap open up. Every word is its own piece, as thick as its points, with the word on its edge.
  const running = Object.fromEntries(players.map(p => [p.id, 0]));
  // A handicap as people read it: 12 means points added, −12 means points taken off.
  const hcpText = v => (v < 0 ? `−${Math.abs(v)}` : `${v}`);
  const signed = v => (v < 0 ? `−${Math.abs(v)}` : `+${v}`);
  const TOWER_H = tv ? Math.max(180, Math.min(620, innerHeight * 0.6)) : Math.max(110, Math.min(250, innerHeight - 596));
  const MIN_TOP = 10;
  scores.className = 'towers';
  scores.style.setProperty('--th', `${TOWER_H}px`);
  // (Scaled to the tallest stack, which is the top score unless a minus handicap crossed some of it out.)
  const rescale = () => scores.style.setProperty('--ppx', `${(TOWER_H / Math.max(MIN_TOP, ...Object.values(rows).map(c => c._cum || 0))).toFixed(3)}px`);
  const rows = {};
  rescale();
  const jitter = (id, i) => { const h = Math.sin(i * 12.9898 + id.charCodeAt(0) * 78.233) * 43758.5453; return h - Math.floor(h); };
  for (const p of players) {
    const col = document.createElement('div');
    col.className = 'tcol';
    const a = p.alliance && alliances[p.alliance];
    col.innerHTML = `<div class="tower" ${a ? `style="--ac:${a.color}"` : ''}>${CROWN}<div class="tiles"></div></div><div class="tsc">0</div>${chipHTML(p, 'tiny')}<div class="tname">${esc(p.name)}</div>${R.handicap && !coop ? `<div class="thcp ${p.hcp ? (p.hcp < 0 ? 'minus' : '') : 'none'}">HCP ${hcpText(p.hcp || 0)}</div>` : ''}`;
    col.onclick = () => openPlayer(p.id);
    col.title = p.name;
    scores.appendChild(col);
    rows[p.id] = col;
    col._tiles = col.querySelector('.tiles');
    col._sc = col.querySelector('.tsc');
    col._cum = 0;
  }
  // Every scoring item, in the order the show plays them, so a skip can lay in whatever hadn't landed yet.
  // Short words first; at each length the words several people found, then the ones only one person (or
  // alliance) found. So it goes shared threes, unique threes, shared fours, unique fours, and so on.
  const order = R.words.slice().sort((a, b) => a.w.length - b.w.length || (a.solo - b.solo) || b.finders.length - a.finders.length || a.w.localeCompare(b.w));
  const laid = new Set();
  function itemsFor(id) {
    const p = byId[id];
    const out = [];
    for (const wd of order) if (wd.finders.includes(id)) out.push({ key: `w:${wd.w}:${id}`, pts: wd.pts + ((wd.bonus || {})[id] || 0), label: wd.w, cls: wd.solo ? 'solo' : '' });
    if (p.bananaBonus) out.push({ key: `banana:${id}`, pts: p.bananaBonus, label: 'banana', cls: 'solo' });
    if (p.strokes) out.push({ key: `stroke:${id}`, pts: p.strokes, label: 'handicap', cls: p.strokes < 0 ? 'minus' : 'stroke' });
    (R.fun || []).forEach((a, k) => { if (a.winners.some(w => w.id === id)) out.push({ key: `fun:${k}:${id}`, pts: a.pts, label: a.title, cls: 'fun' }); });
    return out;
  }
  // Adds one piece to a tower and its points to the score.
  function score(id, pts, label, { instant = false, cls = '', key } = {}) {
    const col = rows[id];
    if (!col || !pts || (key && laid.has(key))) return;
    if (key) laid.add(key);
    if (pts < 0) {
      // Points taken off (a minus handicap): the top of the stack gets knocked off. The pieces on top turn
      // red and tumble away, the tower drops to what's left, and a red cut line marks how much went.
      const total = Math.min(-pts, running[id]);
      if (total <= 0) return;
      let take = total;
      const gone = [];
      const pieces = [...col._tiles.children].filter(x => !x.classList.contains('cut'));
      for (let k = pieces.length - 1; k >= 0 && take > 0; k--) {
        const x = pieces[k];
        const p = +x.style.getPropertyValue('--pts') || 0;
        if (p <= take) { take -= p; gone.push(x); }
        else { x.style.setProperty('--pts', p - take); take = 0; } // a piece cut part-way just gets thinner
      }
      col._cum -= total;
      running[id] -= total;
      const settle = () => {
        gone.forEach(x => x.remove());
        const cut = document.createElement('i');
        cut.className = 'cut';
        cut.style.cssText = `--cum:${col._cum};--pts:0`;
        cut.innerHTML = `<span>HCP −${total}</span>`;
        col._tiles.appendChild(cut);
        col.style.setProperty('--ct', col._cum);
        col.classList.add('docked');
        col._sc.textContent = running[id];
        rescale();
        col.classList.remove('hit'); void col.offsetWidth; col.classList.add('hit');
      };
      if (instant) return settle();
      gone.forEach((x, n) => {
        x.classList.remove('drop');
        x.style.setProperty('--dir', n % 2 ? 1 : -1);
        x.style.animationDelay = `${n * 70}ms`;
        x.classList.add('knocked');
      });
      col.classList.add('chopping');
      sfx.chop(gone.length);
      setTimeout(() => { col.classList.remove('chopping'); settle(); }, 480 + gone.length * 70);
      return;
    }
    const i = col._tiles.children.length;
    const t = document.createElement('i');
    t.style.cssText = `--cum:${col._cum};--pts:${pts};--jx:${((jitter(id, i) - 0.5) * 4).toFixed(1)}px;--rot:${((jitter(id, i + 99) - 0.5) * 3).toFixed(1)}deg`;
    t.className = `${cls}${instant ? '' : ' drop'}`;
    if (label) {
      // Long award names go on two lines (split at the space nearest the middle), then shrink to the piece's width.
      const text = String(label).toUpperCase();
      let lines = [text];
      if (text.length > 11 && text.includes(' ')) {
        const cuts = [...text].map((c, k) => (c === ' ' ? k : -1)).filter(k => k > 0);
        const cut = cuts.reduce((a, b) => (Math.abs(b - text.length / 2) < Math.abs(a - text.length / 2) ? b : a));
        lines = [text.slice(0, cut), text.slice(cut + 1)];
      }
      t.innerHTML = `<span style="--chars:${Math.max(...lines.map(x => x.length))};--lines:${lines.length}">${lines.map(esc).join('<br>')}</span>`;
    }
    col._tiles.appendChild(t);
    col._cum += pts;
    col.style.setProperty('--ct', col._cum);
    running[id] += pts;
    col._sc.textContent = running[id];
    rescale();
    col.classList.remove('hit'); void col.offsetWidth; col.classList.add('hit');
  }
  const ranked = () => players.slice().sort((a, b) => running[b.id] - running[a.id] || a.name.localeCompare(b.name));

  // ---------- timing that follows the host's speed ----------
  let resolveSkip;
  const skipped = new Promise(r => { resolveSkip = r; });
  const wait = ms => new Promise(res => {
    let left = ms, last = performance.now();
    const step = () => {
      if (done) return res();
      const now = performance.now();
      left -= (now - last) * pace(); last = now;
      if (left <= 0) res(); else setTimeout(step, 25);
    };
    step();
  });

  // ---------- word card ----------
  function showBeat(beat, i) {
    if (i === 0) stage.innerHTML = '';
    stage.querySelectorAll('.wordcard, .wordpair, .stamp').forEach(x => x.remove());
    if (beat.length === 1) return [showCard(beat[0], i, stage, 1)];
    const pair = document.createElement('div');
    pair.className = 'wordpair';
    stage.appendChild(pair);
    const cards = beat.map((wd, j) => {
      if (j) pair.insertAdjacentHTML('beforeend', '<div class="pair-div"></div>');
      const c = showCard(wd, i, pair, 2);
      c.classList.add(j ? 'pb' : 'pa');
      return c;
    });
    // Each word lights in its own color on the little board; shared tiles get stripes of both.
    mini.lightPair(beat[0].path || [], beat[1].path || [], { ca: PAIR_A, cb: PAIR_B, step: 40 / pace() });
    return cards;
  }

  // One tile size for the whole show, so every word sits at the same height. It's set once the words are
  // lined up: big enough for the longest word (up to eight letters) and for the widest pair shown side by
  // side. Only a word longer than that shrinks to fit.
  let tileSize = 0;
  const GAP = 5, PAIR_GAP = 31; // 14px either side of a 3px divider
  const fitRow = (letters, cards = 1) => ((stage.clientWidth || 300) - 12 - (cards - 1) * PAIR_GAP - (letters - cards) * GAP) / letters;
  function sizeTiles(beats) {
    const longest = Math.min(8, Math.max(3, ...beats.flat().map(wd => wd.w.length)));
    const widestPair = Math.max(0, ...beats.filter(b => b.length === 2).map(b => b[0].w.length + b[1].w.length));
    tileSize = Math.min(tv ? 84 : 44, fitRow(longest), widestPair ? fitRow(widestPair, 2) : Infinity);
  }
  const letterSize = len => Math.min(tileSize || fitRow(Math.max(len, 5)), fitRow(len));

  function showCard(wd, i, host, share) {
    const card = document.createElement('div');
    card.className = 'wordcard' + (wd.solo ? ' solo' : '');
    card.style.setProperty('--ls', `${letterSize(wd.w.length)}px`);
    const letters = wd.w.toUpperCase().split('').map((c, k) => `<span style="--i:${k}">${c}</span>`).join('');
    const pts = wd.solo ? `+${wd.base} <span style="color:var(--sun)">×${R.soloMult}</span>` : `+${wd.pts}`;
    const tags = [];
    const bonusIds = Object.keys(wd.bonus || {});
    if (bonusIds.length) tags.push(`<span class="wtag bridge">+${Math.max(...Object.values(wd.bonus))} bridge</span>`);
    const vias = Object.values(wd.via || {});
    if (vias.includes('challenge')) tags.push('<span class="wtag vote">voted in</span>');
    if (vias.includes('leak')) tags.push('<span class="wtag leak">leaked</span>');
    if (vias.includes('copy')) tags.push('<span class="wtag copy">ally copy</span>');
    if (wd.naughty) tags.push('<span class="wtag naughty">naughty!</span>');
    const finders = wd.finders.map((id, k) => byId[id] ? chipHTML(byId[id], wd.via && wd.via[id] === 'leak' ? 'leaked' : '').replace('style="--c:', `style="--i:${k};--c:`) : '').join('');
    // Every row is always there (tags may be empty) so the letters never move between words.
    card.innerHTML = `<div class="letters">${letters}</div><div class="pts-row"><div class="pts">${pts}</div></div><div class="wtags">${tags.join('')}</div><div class="finders">${finders}</div>`;
    host.appendChild(card);
    const color = wd.solo ? 'var(--sun)' : wd.finders.length === 1 && byId[wd.finders[0]] ? byId[wd.finders[0]].color : 'var(--mint)';
    if (wd.path && share === 1) mini.light(wd.path, { color, step: Math.min(70, 300 / wd.path.length) / pace() });
    if (!wd.solo) sfx.blip(i); // a word only one person found gets its own note when the stamp lands
    if (bonusIds.length) setTimeout(() => sfx.bridge(), 200);
    return card;
  }

  function fly(fromEl, id, amount, cls = '', label = '', key = '') {
    const row = rows[id];
    if (!row || !fromEl) return;
    const from = fromEl.getBoundingClientRect();
    const to = row._sc.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'flyer ' + cls;
    f.textContent = signed(amount);
    f.style.left = `${from.left + from.width / 2 - 16}px`;
    f.style.top = `${from.top}px`;
    document.body.appendChild(f);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      f.style.transitionDuration = `${0.55 / Math.min(pace(), 2)}s`;
      f.style.transform = `translate(${to.left - from.left - from.width / 2 + 16}px, ${to.top - from.top}px) scale(0.7)`;
      f.style.opacity = '0.2';
    }));
    setTimeout(() => { f.remove(); if (!done) score(id, amount, label, { cls, key }); }, 560 / Math.min(pace(), 2));
  }

  let uniques = 0;
  function soloStamp(wd, dur, card) {
    const by = wd.soloBy || {};
    let who;
    if (by.alliance && alliances[by.alliance]) who = `Only ${esc(alliances[by.alliance].name)}!`;
    else if (wd.finders.length === 1 && wd.finders[0] === me) who = 'Only you!';
    else if (wd.finders.length === 1 && byId[wd.finders[0]]) who = `Only ${esc(byId[wd.finders[0]].name)}!`;
    else who = 'Solo!';
    const s = document.createElement('div');
    s.className = 'stamp';
    s.innerHTML = `${who}<small>×${R.soloMult} points</small>`;
    // It lands beside the points, in a row that's always there, so it never covers the word.
    (card ? card.querySelector('.pts-row') : stage).appendChild(s);
    burst(stage, 26);
    sfx.unique(uniques++);
    if (wd.finders.includes(me)) haptic('success');
    setTimeout(() => s.remove(), Math.min(2800, dur / pace()));
  }

  let teamBar = null, teamFound = 0;
  async function sequence() {
    stage.innerHTML = `<div class="title-stamp">${R.mode === 'coop' ? 'PENS DOWN!' : "TIME'S UP!"}</div>`;
    if (R.mode === 'coop') {
      teamBar = document.createElement('div');
      teamBar.className = 'team-progress reveal-team';
      teamBar.innerHTML = `<div class="tp-bar"><i style="transform:scaleX(0)"></i></div><span><b>0</b> of ${R.coop.possible} words found together</span>`;
      stageCol.prepend(teamBar);
    }
    sfx.stamp();
    await Promise.race([wait(1100), skipped]);
    const words = order;
    if (!words.length) {
      stage.innerHTML = `<div class="title-stamp" style="font-size:32px">Nobody found a single word?!</div>`;
      await Promise.race([wait(1600), skipped]);
      return;
    }
    // Short words several people found go two at a time; long shared words and words only one person
    // found each get their own moment. Longer words and solos get more time; about 20-60s at 1x.
    const pairable = wd => wd.finders.length >= 2 && !wd.solo && wd.w.length <= 4;
    const beats = [];
    for (let i = 0; i < words.length; i++) {
      if (pairable(words[i]) && i + 1 < words.length && pairable(words[i + 1])) { beats.push([words[i], words[i + 1]]); i++; }
      else beats.push([words[i]]);
    }
    const N = beats.length;
    sizeTiles(beats);
    const weightOf = (b, i) => b.reduce((s, wd) => s + 0.7 + 0.18 * (wd.w.length - 3) + (wd.solo ? 0.7 : 0), 0) / (b.length === 2 ? 1.5 : 1) + (i >= N - 3 ? 0.9 : 0);
    const total = Math.min(30000, Math.max(7000, N * 650));
    const wsum = beats.reduce((s, b, i) => s + weightOf(b, i), 0);
    for (let i = 0; i < N; i++) {
      if (done) return;
      const beat = beats[i];
      const dur = Math.max(320, (total * weightOf(beat, i)) / wsum);
      const cards = showBeat(beat, i);
      const lead = Math.min(260, dur * 0.35);
      await Promise.race([wait(lead), skipped]);
      if (done) return;
      beat.forEach((wd, j) => {
        for (const id of wd.finders) fly(cards[j].querySelector('.pts'), id, wd.pts + ((wd.bonus || {})[id] || 0), wd.solo ? 'solo' : '', wd.w, `w:${wd.w}:${id}`);
        if (wd.solo) soloStamp(wd, dur, cards[j]);
      });
      await Promise.race([wait(dur - lead), skipped]);
      if (done) return;
      cards.forEach(c => c.classList.add('out'));
      if (teamBar) { teamFound += beat.length; teamBar.querySelector('i').style.transform = `scaleX(${teamFound / Math.max(1, R.coop.possible)})`; teamBar.querySelector('b').textContent = teamFound; }
    }
    await Promise.race([wait(500), skipped]);
    // Bonuses that land after the words.
    const banana = players.filter(p => p.bananaBonus);
    if (banana.length && !done) {
      stage.innerHTML = `<div class="bonus-card pop-in"><div class="bonus-title">Banana Split!</div><div class="muted">Fullest banana: +10% of the round</div><div class="finders">${banana.map(p => chipHTML(p)).join('')}</div></div>`;
      sfx.solo();
      await Promise.race([wait(500), skipped]);
      banana.forEach(p => fly(stage.querySelector('.bonus-card'), p.id, p.bananaBonus, 'solo', 'banana', `banana:${p.id}`));
      await Promise.race([wait(1500), skipped]);
    }
    const strokes = players.filter(p => p.strokes);
    if (strokes.length && !done) {
      stage.innerHTML = `<div class="bonus-card pop-in"><div class="bonus-title">Handicap strokes</div><div class="muted">${strokes.some(p => p.strokes < 0) ? 'Golf rules: points back if you usually trail, points off if you usually run away with it' : 'Golf rules: everyone gets their usual gap back'}</div><div class="stroke-list">${strokes.map(p => `<div class="row">${chipHTML(p, 'tiny')}<span class="grow">${esc(p.name)}</span><span class="muted small">HCP ${hcpText(p.hcp)}</span><b class="${p.strokes < 0 ? 'minus' : ''}">${signed(p.strokes)}</b></div>`).join('')}</div></div>`;
      sfx.coin();
      await Promise.race([wait(600), skipped]);
      strokes.forEach(p => fly(stage.querySelector('.bonus-card'), p.id, p.strokes, p.strokes < 0 ? 'minus' : 'stroke', 'handicap', `stroke:${p.id}`));
      await Promise.race([wait(1600), skipped]);
    }
    await funAwards();
  }

  // ---------- for-fun awards: each one is a box that shakes, then bursts open on the winner ----------
  async function funAwards() {
    const fun = R.fun || [];
    if (!fun.length || done) return;
    mini.unlight();
    stage.innerHTML = `<div class="title-stamp fun-stamp">BONUS AWARDS!</div>`;
    sfx.stamp();
    await Promise.race([wait(900), skipped]);
    for (let k = 0; k < fun.length; k++) {
      if (done) return;
      const a = fun[k];
      stage.innerHTML = `<div class="award-reveal">
        <div class="aw-count">Award ${k + 1} of ${fun.length}</div>
        <div class="aw-title"><span class="aw-ic">${awardIcon(a.icon)}</span>${esc(a.title)}</div>
        <div class="aw-blurb">${esc(a.blurb)}</div>
        <div class="aw-stage"><div class="loot-box aw-box shaking" style="--c:var(--hot)"><div class="lid"></div><div class="body"></div><div class="ribbon"></div></div><div class="aw-winners"></div></div>
      </div>`;
      const box = stage.querySelector('.aw-box');
      // Drumroll: ticks that climb while the box rattles harder.
      for (let t = 0; t < 7; t++) {
        if (done) return;
        sfx.tick(t + 2);
        if (t === 4) box.classList.add('frantic');
        await Promise.race([wait(t < 4 ? 150 : 100), skipped]);
      }
      if (done) return;
      box.classList.add('open');
      sfx.box();
      burst(stage.querySelector('.aw-stage'), 40);
      const host = stage.querySelector('.aw-winners');
      host.innerHTML = a.winners.map((wnr, j) => {
        const p = byId[wnr.id];
        return p ? `<div class="aw-winner" style="--c:${p.color};--i:${j}" data-id="${p.id}">${chipHTML(p, 'big')}<div><div class="aw-name">${esc(p.name)}${wnr.id === me ? ' (you!)' : ''}</div><div class="aw-detail">${esc(wnr.detail)}</div></div><div class="aw-pts">+${a.pts}</div></div>` : '';
      }).join('');
      if (a.winners.some(wnr => wnr.id === me)) haptic('success');
      setTimeout(() => box.remove(), 600);
      await Promise.race([wait(450), skipped]);
      if (done) return;
      host.querySelectorAll('.aw-winner').forEach(el => fly(el.querySelector('.aw-pts'), el.dataset.id, a.pts, 'fun', a.title, `fun:${k}:${el.dataset.id}`));
      sfx.coin();
      await Promise.race([wait(1300), skipped]);
    }
  }

  // ---------- collapsible sections (each player's open/closed choice is remembered) ----------
  const PREF = 'rb:sections';
  const prefs = () => { try { return JSON.parse(localStorage.getItem(PREF)) || {}; } catch { return {}; } };
  const savePref = (k, open) => { try { const p = prefs(); p[k] = open; localStorage.setItem(PREF, JSON.stringify(p)); } catch {} };
  function sectionHTML(key, title, ic, body, defOpen, badge = '') {
    const p = prefs();
    const open = key in p ? p[key] : defOpen;
    return `<section class="pg-sec ${open ? 'open' : ''}" data-sec="${key}">
      <button class="pg-head"><span class="pg-ic">${UI[ic] || ICONS[ic] || ''}</span><span class="grow">${title}</span>${badge}<span class="chev">${UI.chev}</span></button>
      <div class="pg-body">${body}</div></section>`;
  }
  function wireSections(scope) {
    scope.querySelectorAll('.pg-sec > .pg-head').forEach(h => {
      h.onclick = () => {
        const sec = h.parentElement;
        const open = !sec.classList.contains('open');
        sec.classList.toggle('open', open);
        savePref(sec.dataset.sec, open);
        if (open) sec.dispatchEvent(new CustomEvent('opened'));
        haptic('tick');
      };
    });
  }

  function heatBoards(host, id) {
    if (!host || host.dataset.built) return;
    host.dataset.built = '1';
    const all = R.heat ? R.heat.all : new Array(R.tiles.length).fill(0);
    const own = R.heat && R.heat.by && R.heat.by[id] ? R.heat.by[id] : new Array(R.tiles.length).fill(0);
    const b1 = makeBoard(R.tiles, R.size); b1.heat(own, 'mint');
    const b2 = makeBoard(R.tiles, R.size); b2.heat(all, 'hot');
    const who = byId[id];
    host.innerHTML = `<div class="heat-row"><div class="heat-box"><div data-h="1"></div><div class="mini-label">${id === me ? 'Your letters' : `${esc(who ? who.name : '')}'s letters`}</div></div><div class="heat-box"><div data-h="2"></div><div class="mini-label">Everyone's letters</div></div></div>`;
    host.querySelector('[data-h="1"]').appendChild(b1.el);
    host.querySelector('[data-h="2"]').appendChild(b2.el);
  }
  function wireHeat(scope, id) {
    const sec = scope.querySelector('[data-sec="heat"], [data-sec="p-heat"]');
    if (!sec) return;
    const build = () => heatBoards(sec.querySelector('.heat-host'), id);
    if (sec.classList.contains('open')) build();
    sec.addEventListener('opened', build);
  }

  function badgeCard(b, k) {
    return `<div class="badge-card ${b.tone}" style="--i:${k}"><div class="badge-icon">${ICONS[b.icon] || ICONS.ribbon}</div><div><div class="badge-title">${esc(b.title)}</div><div class="badge-desc">${esc(b.desc)}</div></div></div>`;
  }

  function marqueeHTML() {
    if (!R.missed || !R.missed.length) return '';
    const items = R.missed.map(m => `<span>${esc(m.w.toUpperCase())}</span>`).join('<i>·</i>');
    return `<div class="marquee"><span class="mq-label">${UI.eye}Nobody found</span><div class="mq-track"><div class="mq-inner">${items}<i>·</i>${items}<i>·</i></div></div></div>`;
  }

  function coopRating(pct) {
    if (pct >= 75) return 'Legendary word nerds!';
    if (pct >= 50) return 'Dictionary dream team!';
    if (pct >= 30) return 'Solid team effort!';
    if (pct >= 15) return 'Warming up!';
    return 'Room to grow!';
  }

  function finish() {
    if (done) return;
    done = true;
    renderCtl();
    mini.unlight();
    document.querySelectorAll('.flyer').forEach(f => f.remove());
    root.classList.add('final-state');
    if (teamBar) { teamBar.remove(); teamBar = null; }
    // Whatever didn't land yet (a skip), lay straight in.
    for (const p of players) {
      for (const it of itemsFor(p.id)) score(p.id, it.pts, it.label, { instant: true, cls: it.cls, key: it.key });
      if (running[p.id] < p.round) score(p.id, p.round - running[p.id], 'bonus', { instant: true });
    }
    const order = ranked();
    const top = order[0];
    const tied = order.filter(p => p.round === top.round);
    if (!coop && top && top.round > 0) tied.forEach(p => rows[p.id].classList.add('winner'));

    // Header: the result and a few fact chips.
    const facts = [];
    let title;
    if (coop) {
      const pct = Math.round((R.coop.found / Math.max(1, R.coop.possible)) * 100);
      title = coopRating(pct);
      facts.push(`${UI.users}<b>${R.coop.found}</b> of ${R.coop.possible} words (${pct}%)`);
      facts.push(`${UI.pencil}Pen passed ${R.coop.passes} time${R.coop.passes === 1 ? '' : 's'}`);
      facts.push(`${UI.star}<b>${R.coop.points}</b> team points`);
    } else {
      title = !top || top.round === 0 ? 'Nobody scored!' : tied.length > 1 ? "It's a tie!" : `${esc(top.name)} wins!`;
      facts.push(`${UI.list}<b>${R.words.length}</b> of ${R.possible} words found`);
    }
    if (R.best) facts.push(`${UI.star}Best: <b>${esc(R.best.w.toUpperCase())}</b>`);
    if (!coop && R.no > 1) facts.push(`${UI.crown}Totals: ${players.slice().sort((a, b) => b.total - a.total).slice(0, 3).map(p => `${esc(p.name)} <b>${p.total}</b>`).join(', ')}`);
    if ((R.fun || []).length) facts.push(`${ICONS.trophy}${R.fun.length} bonus awards`);
    (R.alliances || []).forEach(a => facts.push(`<span style="color:${a.color}">${UI.handshake}</span>${esc(a.name)} <b>${a.round}</b>`));
    const nextHcp = R.handicap && !coop
      ? `<div class="hcp-next"><div class="hcp-next-head">${UI.flag}Handicap next round</div><div class="hcp-next-list">${players.slice().sort((a, b) => (b.nextHcp || 0) - (a.nextHcp || 0) || a.name.localeCompare(b.name)).map(p => `<span class="hcp-next-item ${p.nextHcp ? (p.nextHcp < 0 ? 'minus' : '') : 'none'}">${chipHTML(p, 'tiny')}<span class="hn-name">${esc(p.name)}</span><b>${hcpText(p.nextHcp || 0)}</b></span>`).join('')}</div></div>`
      : '';
    stage.innerHTML = `<div class="pg-top"><div class="pg-title">${title}</div><div class="fact-chips">${facts.map(f => `<span class="fact">${f}</span>`).join('')}</div>${nextHcp}</div>`;
    sfx.fanfare();
    confetti(!coop && top && tied.length === 1 ? top.color : null);
    if (!coop && tied.some(p => p.id === me)) haptic('success');

    // The whole board's heat map stays on the TV; phones keep theirs in a section.
    mini.heat(R.heat ? R.heat.all : new Array(R.tiles.length).fill(0), 'hot');
    miniLabel.textContent = 'Letters everyone used';
    if (!tv) miniWrap.classList.add('hidden');
    scoreCol.insertAdjacentHTML('beforeend', `<div class="tap-hint">${UI.eye}Tap a player to see their round</div>`);

    if (tv) {
      extra.innerHTML = `${marqueeHTML()}${funListHTML('tv')}<div class="tv-badges">${players.map(p => `<div class="tv-badge-row">${chipHTML(p, 'tiny')}<b>${esc(p.name)}</b>${(R.badges[p.id] || []).map(b => `<span class="mini-badge ${b.tone}">${ICONS[b.icon] || ''}${esc(b.title)}</span>`).join('')}</div>`).join('')}</div>`;
    } else {
      const mine = byId[me];
      const sections = [];
      if (mine) sections.push(sectionHTML('badges', 'Your badges', 'ribbon', '<div class="loot-host"></div>', true, `<span class="count-pill">${(R.badges[me] || []).length}</span>`));
      if ((R.fun || []).length) sections.push(sectionHTML('fun', 'Bonus awards', 'trophy', funListHTML('phone'), true, `<span class="count-pill">${R.fun.length}</span>`));
      if (mine && !coop) sections.push(sectionHTML('react', 'Your reaction', 'chat', attitudeHTML(), true));
      sections.push(sectionHTML('talk', coop ? 'Team chatter' : 'Trash talk', 'chat', '<div class="banter-feed"><div class="empty-line">Nobody has said anything yet…</div></div>', true));
      const myWords = mine ? ownWords(me) : [];
      if (mine) sections.push(sectionHTML('mywords', 'Your words', 'list', myWords.length ? `<div class="hint-line">Tap a word to brag about it</div><div class="sheet-words brag-words">${myWords.map(w => `<button class="word ${w.solo ? 'solo' : ''}" data-brag="${esc(w.w)}">${esc(w.w)}<small>+${w.pts}</small></button>`).join('')}</div>` : '<div class="empty-line">No words this round.</div>', true, `<span class="count-pill">${myWords.length}</span>`));
      if (mine) sections.push(sectionHTML('heat', 'Your letters', 'grid', '<div class="heat-host"></div>', false));
      extra.innerHTML = marqueeHTML() + sections.join('');
      wireSections(extra);
      wireHeat(extra, me);
      wireAttitude();
      wireBrag();
      setTimeout(() => openLoot(extra.querySelector('.loot-host'), me), 900);
    }
    renderActions();
  }

  // A player's own words (not ones leaked to them), longest first.
  function ownWords(id) {
    return R.words.filter(w => w.finders.includes(id) && (!w.via || w.via[id] !== 'leak')).sort((a, b) => b.w.length - a.w.length || (b.solo - a.solo) || a.w.localeCompare(b.w));
  }
  function wireBrag() {
    extra.querySelectorAll('[data-brag]').forEach(b => {
      b.onclick = () => {
        if (b.classList.contains('bragged')) return;
        b.classList.add('bragged');
        opt.brag && opt.brag(b.dataset.brag);
        haptic('tick');
        // Bring the trash talk into view so you see it land.
        const talk = extra.querySelector('[data-sec="talk"]');
        if (talk && !talk.classList.contains('open')) talk.querySelector('.pg-head').click();
        talk && talk.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
    });
  }
  function funListHTML(where) {
    const fun = R.fun || [];
    if (!fun.length) return '';
    return `<div class="fun-list ${where}">${fun.map(a => `<div class="fun-row"><span class="aw-ic">${awardIcon(a.icon)}</span><div class="grow"><b>${esc(a.title)}</b><small>${a.winners.map(wnr => `${esc(byId[wnr.id] ? byId[wnr.id].name : '?')}: ${esc(wnr.detail)}`).join(' · ')}</small></div><span class="fun-who">${a.winners.map(wnr => (byId[wnr.id] ? chipHTML(byId[wnr.id], 'tiny') : '')).join('')}</span><b class="fun-pts">+${a.pts}</b></div>`).join('')}</div>`;
  }

  async function openLoot(host, id) {
    if (!host || !R.badges) return;
    const p = byId[id];
    const list = R.badges[id] || [];
    const box = document.createElement('div');
    box.className = 'loot';
    box.innerHTML = `<div class="loot-box" style="--c:${p ? p.color : 'var(--hot)'}"><div class="lid"></div><div class="body"></div><div class="ribbon"></div></div><div class="loot-cards"></div>`;
    host.appendChild(box);
    const lb = box.querySelector('.loot-box');
    const open = () => {
      if (lb.classList.contains('open')) return;
      lb.classList.add('open');
      sfx.box();
      burst(box, 30);
      haptic('success');
      box.querySelector('.loot-cards').innerHTML = list.map(badgeCard).join('');
      if (list.some(b => b.key === 'kitkat')) setTimeout(() => sfx.ice(), 450);
      setTimeout(() => lb.remove(), 600);
    };
    lb.classList.add('shaking');
    lb.onclick = open;
    await new Promise(r => setTimeout(r, 1000));
    open();
  }

  // ---------- another player's round ----------
  function openPlayer(id) {
    if (!done) return;
    const p = byId[id];
    if (!p) return;
    document.querySelector('.pg-sheet')?.remove();
    const rank = players.slice().sort((a, b) => b.round - a.round).findIndex(x => x.id === id) + 1;
    const theirs = R.words.filter(w => w.finders.includes(id) && (!w.via || w.via[id] !== 'leak')).sort((a, b) => b.w.length - a.w.length);
    const sheet = document.createElement('div');
    sheet.className = `pg-sheet ${tv ? 'tv' : ''}`;
    sheet.innerHTML = `<div class="pg-sheet-card">
      <div class="pg-sheet-head">${chipHTML(p, 'big')}<div class="grow"><div class="pg-sheet-name">${esc(p.name)}${id === me ? ' (you)' : ''}</div><div class="hint-line">${coop ? `${p.round} points written` : `#${rank} · ${p.round} points`} · ${p.words} word${p.words === 1 ? '' : 's'}${p.solos ? ` · ${p.solos} only they found` : ''}</div></div><button class="icon-btn" data-close>${UI.x}</button></div>
      <div class="pg-sheet-body">
        ${sectionHTML('p-badges', 'Badges', 'ribbon', `<div class="stack">${(R.badges[id] || []).map(badgeCard).join('')}</div>`, true)}
        ${sectionHTML('p-words', 'Words', 'list', theirs.length ? `<div class="sheet-words">${theirs.map(w => `<span class="word ${w.solo ? 'solo' : ''}">${esc(w.w)}</span>`).join('')}</div>` : '<div class="empty-line">No words this round.</div>', true, `<span class="count-pill">${theirs.length}</span>`)}
        ${sectionHTML('p-heat', 'Letters', 'grid', '<div class="heat-host"></div>', false)}
      </div></div>`;
    document.body.appendChild(sheet);
    wireSections(sheet);
    wireHeat(sheet, id);
    const close = () => sheet.remove();
    sheet.querySelector('[data-close]').onclick = close;
    sheet.onclick = e => { if (e.target === sheet) close(); };
    haptic('tick');
  }

  // ---------- good / bad sport ----------
  function attitudeHTML() {
    const mineP = byId[me];
    if (!mineP) return '';
    const ranked = players.slice().sort((a, b) => b.round - a.round);
    const won = mineP.round === ranked[0].round && mineP.round > 0;
    return `<div class="row attitude"><button class="btn small mint grow" data-att="good">${won ? 'Gracious winner' : 'Good sport'}</button><button class="btn small grow" data-att="bad">${won ? 'Sore winner' : 'Sore loser'}</button></div>`;
  }
  function wireAttitude() {
    extra.querySelectorAll('[data-att]').forEach(b => {
      b.onclick = () => { opt.attitude(b.dataset.att); haptic('tick'); b.classList.add('picked'); setTimeout(() => b.classList.remove('picked'), 2500); };
    });
  }
  // Phones get one-line entries in the Trash talk section; the TV pops a small bubble beside the row.
  function banter(m) {
    const p = byId[m.id];
    const kind = m.role === 'brag' ? 'brag' : m.role.startsWith('bad') ? 'bad' : 'good';
    // A brag shows the word it's about in bold.
    const W = m.word ? String(m.word).toUpperCase() : '';
    const textHTML = W ? esc(m.text).split(esc(W)).join(`<b>${esc(W)}</b>`) : esc(m.text);
    sfx.pop();
    const row = rows[m.id];
    if (row) { row.classList.remove('talking'); void row.offsetWidth; row.classList.add('talking'); }
    if (tv) {
      if (!row) return;
      row.querySelector('.bubble')?.remove();
      const b = document.createElement('div');
      b.className = `bubble above ${kind}`;
      b.innerHTML = textHTML;
      row.appendChild(b);
      // Keep the whole quote on screen: nudge it down over the tower or in from the edge if it would spill off.
      b.style.animation = 'none';
      const r = b.getBoundingClientRect(), pad = 10;
      b.style.animation = '';
      let dy = Math.max(0, pad - r.top);
      const dx = Math.min(0, innerWidth - pad - r.right) + Math.max(0, pad - r.left);
      // Someone else talking at the same moment: sit just below their bubble instead of on top of it.
      for (const other of document.querySelectorAll('.reveal .bubble:not(.out)')) {
        if (other === b) continue;
        const o = other.getBoundingClientRect();
        const top = r.top + dy, left = r.left + dx;
        if (left < o.right && left + r.width > o.left && top < o.bottom && top + r.height > o.top) dy += o.bottom + 8 - top;
      }
      if (dy || dx) b.style.transform = `translate(${dx}px, ${dy}px)`;
      setTimeout(() => b.classList.add('out'), 8000);
      setTimeout(() => b.remove(), 8600);
      return;
    }
    const feed = extra.querySelector('.banter-feed');
    if (!feed) return;
    feed.querySelector('.empty-line')?.remove();
    const line = document.createElement('div');
    line.className = `talk-line ${kind}`;
    line.innerHTML = `${p ? chipHTML(p, 'tiny') : ''}<span>${textHTML}</span>`;
    feed.prepend(line);
    [...feed.querySelectorAll('.talk-line')].slice(6).forEach(x => x.remove());
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
    done: () => done,
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
