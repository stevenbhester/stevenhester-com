// TaraTube shared helpers: API with the family passcode, time formatting, stats math.
const TT = (() => {
  const API = 'https://music-grid-io-42616e204fd3.herokuapp.com/tt';
  const STAR = '<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1.8c.5 0 .9.3 1.1.8l2.4 5.6 6 .6c.5 0 1 .4 1.1.9.2.5 0 1-.4 1.3l-4.6 4 1.4 5.9c.1.5-.1 1-.5 1.3-.4.3-.9.3-1.4.1L12 19.2l-5.1 3.1c-.4.3-1 .2-1.4-.1-.4-.3-.6-.8-.5-1.3l1.4-5.9-4.6-4c-.4-.3-.5-.8-.4-1.3.2-.5.6-.9 1.1-.9l6-.6 2.4-5.6c.2-.5.6-.8 1.1-.8z"/></svg>';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  let key = store.get('tt.key');
  let gatePromise = null;

  // The "magic word" screen. Resolves with a passcode the server accepted.
  function askKey(wrong) {
    if (gatePromise) return gatePromise;
    gatePromise = new Promise(resolve => {
      const el = document.createElement('div');
      el.className = 'gate';
      el.innerHTML = `<form autocomplete="off">${STAR}<h2>Hi, it's TaraTube</h2>
        <p>What's the family passcode?</p>
        <input type="password" name="k" autocomplete="current-password" aria-label="Passcode" required>
        <button class="big-btn" type="submit">Let me in</button>
        <p class="oops" role="alert">${wrong ? 'That passcode stopped working. Try again?' : ''}</p></form>`;
      document.body.appendChild(el);
      const form = el.querySelector('form'), input = el.querySelector('input'), oops = el.querySelector('.oops');
      setTimeout(() => input.focus(), 50);
      form.onsubmit = async e => {
        e.preventDefault();
        oops.textContent = 'Checking…';
        try {
          const r = await fetch(API + '/check', { headers: { 'x-tt-key': input.value } });
          if (r.ok) {
            key = input.value; store.set('tt.key', key); el.remove(); gatePromise = null; resolve(key);
          } else {
            const j = await r.json().catch(() => ({}));
            oops.textContent = r.status === 401 ? 'Nope! Try again.' : (j.error || 'Something went wrong');
            input.select();
          }
        } catch { oops.textContent = "Can't reach the server. Are you online?"; }
      };
    });
    return gatePromise;
  }

  async function api(path, { method = 'GET', body } = {}) {
    if (!key) await askKey();
    const r = await fetch(API + path, {
      method, body: body ? JSON.stringify(body) : undefined,
      headers: { 'content-type': 'application/json', 'x-tt-key': key },
    });
    if (r.status === 401) { store.del('tt.key'); key = null; await askKey(true); return api(path, { method, body }); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
    return j;
  }

  const parse = e => ({ ...e, at: new Date(e.at) });
  const cached = () => { try { return (JSON.parse(store.get('tt.events')) || []).map(parse); } catch { return []; } };
  const remember = evs => store.set('tt.events', JSON.stringify(evs));
  async function events() {
    const { events } = await api('/events');
    remember(events);
    return events.map(parse).sort((a, b) => a.at - b.at || a.id - b.id);
  }

  // ----- formatting -----
  const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
  function dur(ms, { short = false } = {}) {
    if (ms < MIN) return short ? '<1m' : 'just now';
    const d = Math.floor(ms / DAY), h = Math.floor(ms % DAY / HOUR), m = Math.floor(ms % HOUR / MIN);
    if (d) return `${d}d ${h}h${short ? '' : ` ${m}m`}`;
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
  }
  // Same thing split into parts, for the big timers.
  function durParts(ms) {
    const d = Math.floor(ms / DAY), h = Math.floor(ms % DAY / HOUR), m = Math.floor(ms % HOUR / MIN);
    return d ? [[d, 'd'], [h, 'h'], [m, 'm']] : h ? [[h, 'h'], [m, 'm']] : [[m, 'm']];
  }
  const dayStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const time = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  function dayName(d, now = new Date()) {
    const diff = Math.round((dayStart(now) - dayStart(d)) / DAY);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff > 1 && diff < 7) return d.toLocaleDateString([], { weekday: 'long' });
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }
  const when = d => `${dayName(d)}, ${time(d)}`;
  const shortDate = d => d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const pad = n => String(n).padStart(2, '0');
  const toInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sideName = s => (s === 'L' ? 'Left' : 'Right');
  const kindName = k => (k === 'new' ? 'New tube' : 'Same tube');
  const cm = v => (v == null ? '' : `${String(v).replace(/\.0$/, '')} cm`);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(msg, { action, onAction, err = false, ms = 6000 } = {}) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.className = 'toast' + (err ? ' err' : '');
    el.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action)}</button>` : '');
    if (!action) el.style.paddingRight = '18px'; else el.style.paddingRight = '';
    if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); onAction(); };
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), ms);
  }

  function sky() {
    const s = document.createElement('div');
    s.className = 'sky';
    const spots = [[6, 8], [88, 5], [72, 18], [14, 30], [94, 38], [4, 62], [90, 72], [22, 88], [64, 92], [48, 3]];
    s.innerHTML = spots.map(([x, y], i) => `<i style="left:${x}%;top:${y}%;--s:${8 + (i * 7) % 12}px;--d:${3 + (i % 4)}s">✦</i>`).join('');
    document.body.prepend(s);
  }

  // ----- stats -----
  function stats(evs, now = new Date()) {
    const out = { total: evs.length, news: 0, sames: 0, L: 0, R: 0 };
    const gaps = [];      // time between consecutive placements
    const tubes = [];     // { start, end, redrops, open }
    let tube = null;
    evs.forEach((e, i) => {
      out[e.kind === 'new' ? 'news' : 'sames']++;
      out[e.side]++;
      if (i) gaps.push({ ms: e.at - evs[i - 1].at, from: evs[i - 1].at, to: e.at });
      if (e.kind === 'new') {
        if (tube) { tube.end = e.at; tube.open = false; }
        tube = { start: e.at, end: now, redrops: 0, open: true };
        tubes.push(tube);
      } else if (tube) tube.redrops++;
    });
    const last = evs[evs.length - 1];
    const lastNew = [...evs].reverse().find(e => e.kind === 'new');
    out.last = last; out.lastNew = lastNew;
    out.sinceLast = last ? now - last.at : null;
    out.sinceNew = lastNew ? now - lastNew.at : null;
    out.gaps = gaps;
    const avg = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
    out.avgGap = avg(gaps.map(g => g.ms));
    out.longestGap = gaps.reduce((b, g) => (!b || g.ms > b.ms ? g : b), null);
    out.shortestGap = gaps.reduce((b, g) => (!b || g.ms < b.ms ? g : b), null);
    const closed = tubes.filter(t => !t.open);
    out.tubes = tubes;
    out.avgTubeLife = avg(closed.map(t => t.end - t.start));
    out.longestTube = tubes.reduce((b, t) => (!b || t.end - t.start > b.end - b.start ? t : b), null);
    out.avgRedrops = avg(closed.map(t => t.redrops));
    out.mostRedrops = tubes.reduce((b, t) => (!b || t.redrops > b.redrops ? t : b), null);
    const lens = evs.filter(e => e.length_cm != null).map(e => e.length_cm);
    out.avgLength = avg(lens);
    out.lengthRange = lens.length ? [Math.min(...lens), Math.max(...lens)] : null;
    // Per calendar day
    const byDay = new Map();
    for (const e of evs) { const k = dayStart(e.at).getTime(); byDay.set(k, (byDay.get(k) || 0) + 1); }
    out.byDay = byDay;
    out.busiestDay = [...byDay].reduce((b, [k, n]) => (!b || n > b.n ? { day: new Date(k), n } : b), null);
    // Drop-free days in a row, ending today, and the record
    if (evs.length) {
      let best = 0, run = 0, bestEnd = null;
      for (let d = dayStart(evs[0].at).getTime() + DAY; d <= dayStart(now).getTime(); d += DAY) {
        if (byDay.has(d)) run = 0; else { run++; if (run > best) { best = run; bestEnd = new Date(d); } }
      }
      out.cleanDays = run; out.bestCleanDays = best; out.bestCleanEnd = bestEnd;
    }
    const week = now - 7 * DAY, prev = now - 14 * DAY;
    out.last7 = evs.filter(e => e.at >= week).length;
    out.prev7 = evs.filter(e => e.at >= prev && e.at < week).length;
    out.hours = Array.from({ length: 8 }, () => 0);
    for (const e of evs) out.hours[Math.floor(e.at.getHours() / 3)]++;
    // Is the current stretch a record?
    out.onRecord = out.longestGap && out.sinceLast != null && out.sinceLast > out.longestGap.ms;
    return out;
  }

  return { api, events, cached, remember, parse, askKey, stats, dur, durParts, dayStart, dayName, time, when, shortDate, toInput, sideName, kindName, cm, esc, toast, sky, STAR, MIN, HOUR, DAY, store };
})();
