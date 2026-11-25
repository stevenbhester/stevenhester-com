// TaraTube awards: every logged entry earns exactly one award, worked out from the log itself so
// every phone agrees. Special achievements win when one qualifies; one-time achievements that lose
// out wait in line for the next entry. With nothing special, the entry pulls a sticker for the
// sticker book, gacha style (rarity rolled from the entry's id, unseen stickers first).
//
// TTA.compute(events)   -> [{ id, def, detail, at, eventId, n, sticker? }] one per event, oldest first
// TTA.reveal(award, { capsule, onClose })   the lootbox animation; tap skips, tap again closes
// TTA.unlock()          call inside a tap before any await, so iPhone lets sound play later
const TTA = (() => {
  const HOUR = 3600e3, DAY = 24 * HOUR;
  const RAR = {
    common:    { n: 1, label: 'Common',    stars: 1, c1: '#ffb38a', c2: '#ff7aa2' },
    uncommon:  { n: 2, label: 'Uncommon',  stars: 2, c1: '#5fd3b0', c2: '#3aa8d8' },
    rare:      { n: 3, label: 'Rare',      stars: 3, c1: '#6fa8ff', c2: '#9a7cf0' },
    epic:      { n: 4, label: 'Epic',      stars: 4, c1: '#c06cff', c2: '#ff5fb7' },
    legendary: { n: 5, label: 'Legendary', stars: 5, c1: '#ffd166', c2: '#ff9a3c' },
  };
  const D = (ms) => TT.dur(ms, { short: true });
  const hm = d => d.getHours() * 60 + d.getMinutes();
  const dayKey = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };

  // ----- achievement catalog -----
  // check(c) returns a detail string when earned at this entry. once: earned one time ever.
  // yearly: once per calendar year. Otherwise it's a record that can be beaten again and again.
  // secret: shows as ??? in the cabinet until earned.
  const count = (key, n, id, name, icon, rarity, what) =>
    ({ id, name, icon, rarity, once: true, hint: `Log ${n} ${what}`, check: c => (c[key] === n ? `${n} ${what} logged` : null) });
  const holiday = (id, name, icon, rarity, hint, test) =>
    ({ id, name, icon, rarity, yearly: true, secret: true, hint, check: c => (test(c.at) ? `${hint} ${c.at.getFullYear()}` : null) });

  const ACH = [
    { id: 'first', name: 'Day One', icon: '🌟', rarity: 'legendary', once: true, hint: 'Log the very first tube',
      check: c => (c.i === 0 ? 'The very first TaraTube entry' : null) },
    { id: 'fresh', name: 'Fresh Start', icon: '✨', rarity: 'uncommon', once: true, hint: 'Log a new tube',
      check: c => (c.e.kind === 'new' ? 'First brand-new tube logged' : null) },
    { id: 'redrop', name: 'Back in Business', icon: '🔁', rarity: 'uncommon', once: true, hint: 'Log a re-drop',
      check: c => (c.e.kind === 'same' ? 'First re-drop of the same tube' : null) },
    { id: 'lefty', name: 'Lefty', icon: '👈', rarity: 'common', once: true, hint: 'Place a tube on the left',
      check: c => (c.e.side === 'L' ? 'First tube on the left side' : null) },
    { id: 'righty', name: 'Righty', icon: '👉', rarity: 'common', once: true, hint: 'Place a tube on the right',
      check: c => (c.e.side === 'R' ? 'First tube on the right side' : null) },
    { id: 'switch', name: 'Switcheroo', icon: '🔀', rarity: 'common', once: true, hint: 'Switch sides',
      check: c => (c.prev && c.prev.side !== c.e.side ? `Swapped from ${TT.sideName(c.prev.side).toLowerCase()} to ${TT.sideName(c.e.side).toLowerCase()}` : null) },
    { id: 'pingpong', name: 'Ping Pong', icon: '🏓', rarity: 'rare', once: true, hint: 'Alternate sides 4 times in a row',
      check: c => (c.alt >= 4 ? 'L, R, L, R… four switches in a row' : null) },
    { id: 'measure', name: 'Measure Twice', icon: '📏', rarity: 'common', once: true, hint: 'Log a length',
      check: c => (c.e.length_cm != null ? `First length logged: ${TT.cm(c.e.length_cm)}` : null) },
    { id: 'steady', name: 'Steady Hands', icon: '🎯', rarity: 'rare', once: true, hint: 'Same length 5 times in a row',
      check: c => (c.sameLen >= 5 ? `${TT.cm(c.e.length_cm)} five times running` : null) },

    { id: 'early', name: 'Early Bird', icon: '🐣', rarity: 'uncommon', once: true, hint: 'Log one between 5 and 8am',
      check: c => (c.mins >= 300 && c.mins < 480 ? `First early-morning tube, ${TT.time(c.at)}` : null) },
    { id: 'day', name: 'Sunshine Shift', icon: '☀️', rarity: 'uncommon', once: true, hint: 'Log one between 8am and 5pm',
      check: c => (c.mins >= 480 && c.mins < 1020 ? `First daytime tube, ${TT.time(c.at)}` : null) },
    { id: 'evening', name: 'Golden Hour', icon: '🌇', rarity: 'uncommon', once: true, hint: 'Log one between 5 and 10pm',
      check: c => (c.mins >= 1020 && c.mins < 1320 ? `First evening tube, ${TT.time(c.at)}` : null) },
    { id: 'night', name: 'Night Owl', icon: '🦉', rarity: 'rare', once: true, hint: 'Log one between 10pm and 5am',
      check: c => (c.mins >= 1320 || c.mins < 300 ? `First nighttime tube, ${TT.time(c.at)}` : null) },
    { id: 'three', name: '3AM Club', icon: '🌙', rarity: 'rare', once: true, secret: true, hint: 'Log one in the 3 o\'clock hour of the night',
      check: c => (c.at.getHours() === 3 ? `Up at ${TT.time(c.at)}. Legend.` : null) },
    { id: 'nightpro', name: 'Night Shift Pro', icon: '🌌', rarity: 'epic', once: true, hint: 'Log 10 nighttime tubes',
      check: c => (c.nights === 10 ? '10 tubes between 10pm and 5am' : null) },
    { id: 'wish', name: 'Make a Wish', icon: '🌠', rarity: 'epic', once: true, secret: true, hint: 'Log one at 11:11',
      check: c => (c.at.getMinutes() === 11 && c.at.getHours() % 12 === 11 ? `Logged at exactly ${TT.time(c.at)}` : null) },
    { id: 'lucky', name: 'Lucky Numbers', icon: '🍀', rarity: 'rare', once: true, secret: true, hint: 'Log one at a time like 2:22',
      check: c => { const h = c.at.getHours() % 12 || 12, m = c.at.getMinutes(); return (h < 10 && m === h * 11) || (h >= 10 && m === h) ? `Logged at ${TT.time(c.at)}` : null; } },
    { id: 'weekend', name: 'Weekend Warrior', icon: '🎉', rarity: 'uncommon', once: true, hint: 'Log one on a weekend',
      check: c => (c.at.getDay() % 6 === 0 ? `First ${c.at.toLocaleDateString([], { weekday: 'long' })} tube` : null) },

    { id: 'double', name: 'Double Header', icon: '✌️', rarity: 'uncommon', once: true, hint: 'Two in one day',
      check: c => (c.today === 2 ? 'Two tubes in one day' : null) },
    { id: 'hattrick', name: 'Hat Trick', icon: '🎩', rarity: 'rare', once: true, hint: 'Three in one day',
      check: c => (c.today === 3 ? 'Three tubes in one day. Hang in there.' : null) },
    { id: 'gap24', name: 'Full Day', icon: '🌤️', rarity: 'uncommon', once: true, hint: '24 hours without a drop',
      check: c => (c.gap >= DAY ? `${D(c.gap)} without a drop` : null) },
    { id: 'gap48', name: 'Two Day Glow', icon: '🌈', rarity: 'rare', once: true, hint: '2 days without a drop',
      check: c => (c.gap >= 2 * DAY ? `${D(c.gap)} without a drop` : null) },
    { id: 'gap72', name: 'Three Day Unicorn', icon: '🦄', rarity: 'epic', once: true, hint: '3 days without a drop',
      check: c => (c.gap >= 3 * DAY ? `${D(c.gap)} without a drop` : null) },
    { id: 'gap7', name: 'A Whole Week!', icon: '👑', rarity: 'legendary', once: true, hint: 'A week without a drop',
      check: c => (c.gap >= 7 * DAY ? `${D(c.gap)} without a drop` : null) },

    count('total', 5, 'n5', 'High Five', '✋', 'common', 'entries'),
    count('total', 10, 'n10', 'Double Digits', '🔟', 'uncommon', 'entries'),
    count('total', 25, 'n25', 'Quarter Century', '🥉', 'rare', 'entries'),
    count('total', 50, 'n50', 'Half Hundred', '🥈', 'epic', 'entries'),
    count('total', 100, 'n100', 'Century Club', '💯', 'legendary', 'entries'),
    count('total', 250, 'n250', 'Tube Titan', '🏛️', 'legendary', 'entries'),
    count('news', 5, 't5', 'Tube Collector', '🧺', 'uncommon', 'new tubes'),
    count('news', 10, 't10', 'Tube Connoisseur', '🍷', 'rare', 'new tubes'),
    count('news', 25, 't25', 'Tube Sommelier', '🎩', 'epic', 'new tubes'),
    count('news', 50, 't50', 'Tube Tycoon', '💎', 'legendary', 'new tubes'),
    count('sames', 10, 'r10', 'Re-Drop Regular', '🔂', 'uncommon', 're-drops'),
    count('sames', 25, 'r25', 'Re-Drop Royalty', '🫅', 'rare', 're-drops'),
    count('sames', 50, 'r50', 'Re-Drop Deity', '⛩️', 'epic', 're-drops'),

    { id: 'week', name: 'One Week In', icon: '📅', rarity: 'rare', once: true, hint: 'Keep logging for a week',
      check: c => (c.age >= 7 * DAY ? 'A week of TaraTube' : null) },
    { id: 'month', name: 'One Month Strong', icon: '🗓️', rarity: 'epic', once: true, hint: 'Keep logging for a month',
      check: c => (c.age >= 30 * DAY ? 'A month of TaraTube' : null) },
    { id: 'hundred', name: '100 Days', icon: '🎖️', rarity: 'legendary', once: true, hint: 'Keep logging for 100 days',
      check: c => (c.age >= 100 * DAY ? '100 days of TaraTube' : null) },

    // Records: can be won again every time they're beaten.
    { id: 'longest', name: 'Personal Best', icon: '🏆', rarity: 'epic', hint: 'Beat the longest stretch between drops',
      check: c => (c.gaps >= 4 && c.gap > c.maxGap ? `New record: ${D(c.gap)} between drops (was ${D(c.maxGap)})` : null) },
    { id: 'quickest', name: 'Speedrun', icon: '⚡', rarity: 'uncommon', hint: 'Beat the quickest re-drop',
      check: c => (c.gaps >= 4 && c.gap < c.minGap ? `Quickest turnaround yet: ${D(c.gap)}. Any%.` : null) },
    { id: 'irontube', name: 'Iron Tube', icon: '🛡️', rarity: 'epic', hint: 'A tube that outlasts every other',
      check: c => (c.tubeLife != null && c.lives >= 2 && c.tubeLife > c.maxLife ? `Last tube lasted ${D(c.tubeLife)}, longest ever` : null) },
    { id: 'leftlane', name: 'Left Lane Legend', icon: '⬅️', rarity: 'rare', hint: 'Longest run on the left',
      check: c => (c.endedRun && c.endedRun.side === 'L' && c.bestRun.L && c.endedRun.ms > c.bestRun.L ? `${D(c.endedRun.ms)} straight on the left` : null) },
    { id: 'rightside', name: 'Right Side Royalty', icon: '➡️', rarity: 'rare', hint: 'Longest run on the right',
      check: c => (c.endedRun && c.endedRun.side === 'R' && c.bestRun.R && c.endedRun.ms > c.bestRun.R ? `${D(c.endedRun.ms)} straight on the right` : null) },
    { id: 'daily', name: 'Daily Grind', icon: '☕', rarity: 'uncommon', hint: 'Most days in a row with a tube',
      check: c => ([3, 5, 7, 10, 14, 21, 30, 45, 60, 90].includes(c.streak) && c.streak > c.bestStreak ? `A tube change ${c.streak} days in a row` : null) },

    holiday('thanksgiving', 'Turkey Tube', '🦃', 'epic', 'Thanksgiving',
      d => d.getMonth() === 10 && d.getDay() === 4 && d.getDate() >= 22 && d.getDate() <= 28),
    holiday('christmas', 'Merry Tubemas', '🎄', 'epic', 'Christmas', d => d.getMonth() === 11 && (d.getDate() === 24 || d.getDate() === 25)),
    holiday('newyear', 'Happy New Tube', '🎆', 'epic', 'New Year\'s', d => (d.getMonth() === 11 && d.getDate() === 31) || (d.getMonth() === 0 && d.getDate() === 1)),
    holiday('halloween', 'Spooky Tube', '🎃', 'epic', 'Halloween', d => d.getMonth() === 9 && d.getDate() === 31),
    holiday('valentine', 'Tube Love', '💘', 'epic', 'Valentine\'s Day', d => d.getMonth() === 1 && d.getDate() === 14),
    holiday('july4', 'Tube-ependence Day', '🎇', 'epic', 'the Fourth of July', d => d.getMonth() === 6 && d.getDate() === 4),
    holiday('birthday', 'Birthday Girl', '🎂', 'legendary', 'Tara\'s birthday', d => d.getMonth() === 4 && d.getDate() === 6),
  ];
  const BY = Object.fromEntries(ACH.map(a => [a.id, a]));

  // ----- stickers (the "nothing special" pull) -----
  const STICKERS = [
    ['Little Star', '⭐', 'common'], ['Sleepy Moon', '🌙', 'common'], ['Fluffy Cloud', '☁️', 'common'], ['Bunny', '🐰', 'common'],
    ['Teddy', '🧸', 'common'], ['Duckling', '🐥', 'common'], ['Strawberry', '🍓', 'common'], ['Daisy', '🌼', 'common'],
    ['Bubbles', '🫧', 'common'], ['Ladybug', '🐞', 'common'], ['Pacifier', '🍼', 'common'], ['Balloon', '🎈', 'common'],
    ['Kitty', '🐱', 'common'], ['Puppy', '🐶', 'common'], ['Snail', '🐌', 'common'], ['Cherry Blossom', '🌸', 'common'],
    ['Fox', '🦊', 'uncommon'], ['Koala', '🐨', 'uncommon'], ['Panda', '🐼', 'uncommon'], ['Butterfly', '🦋', 'uncommon'],
    ['Rainbow', '🌈', 'uncommon'], ['Cupcake', '🧁', 'uncommon'], ['Penguin', '🐧', 'uncommon'], ['Hedgehog', '🦔', 'uncommon'],
    ['Otter', '🦦', 'rare'], ['Sloth', '🦥', 'rare'], ['Jellyfish', '🪼', 'rare'], ['Hot Air Balloon', '🪂', 'rare'],
    ['Narwhal', '🐳', 'rare'], ['Shooting Star', '🌠', 'epic'], ['Crystal Ball', '🔮', 'epic'], ['Tiny Crown', '👑', 'legendary'],
  ].map(([name, icon, rarity], k) => ({ id: 's' + k, name, icon, rarity, sticker: true }));

  // Small stable hash, so the same entry always pulls the same sticker on every phone.
  const hash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  function pull(eventId, got) {
    const roll = hash('r' + eventId) % 1000;
    const tier = roll < 600 ? 'common' : roll < 860 ? 'uncommon' : roll < 970 ? 'rare' : roll < 996 ? 'epic' : 'legendary';
    const pool = STICKERS.filter(s => s.rarity === tier);
    const fresh = pool.filter(s => !got.has(s.id));
    const from = fresh.length ? fresh : pool;
    return from[hash('p' + eventId) % from.length];
  }

  // ----- compute -----
  function compute(evs) {
    const out = [];
    const granted = new Map();    // key -> times
    const pending = new Map();    // one-time key -> { def, detail } waiting for a free entry
    const stickers = new Map();   // sticker id -> times
    const perDay = new Map();
    const c = { total: 0, news: 0, sames: 0, nights: 0, maxGap: 0, minGap: Infinity, gaps: 0, maxLife: 0, lives: 0,
      bestRun: { L: 0, R: 0 }, streak: 0, bestStreak: 0, alt: 0, sameLen: 0 };
    let tubeStart = null, run = null, lastDay = null;
    evs.forEach((e, i) => {
      const prev = evs[i - 1];
      Object.assign(c, { e, i, prev, at: e.at, mins: hm(e.at), age: e.at - evs[0].at });
      c.total++; e.kind === 'new' ? c.news++ : c.sames++;
      if (c.mins >= 1320 || c.mins < 300) c.nights++;
      c.gap = prev ? e.at - prev.at : null;
      const dk = dayKey(e.at);
      c.today = (perDay.get(dk) || 0) + 1; perDay.set(dk, c.today);
      if (lastDay !== dk) { c.streak = lastDay != null && dk - lastDay <= DAY + 2 * HOUR ? c.streak + 1 : 1; }
      c.alt = prev && prev.side !== e.side ? c.alt + 1 : 0;
      c.sameLen = e.length_cm != null && prev && prev.length_cm === e.length_cm ? c.sameLen + 1 : (e.length_cm != null ? 1 : 0);
      c.tubeLife = e.kind === 'new' && tubeStart ? e.at - tubeStart : null;
      c.endedRun = run && run.side !== e.side ? { side: run.side, ms: e.at - run.start } : null;

      // Candidates: records and yearly awards earned right now, plus one-timers earned now or waiting.
      const now = [];
      for (const a of ACH) {
        const key = a.yearly ? `${a.id}-${e.at.getFullYear()}` : a.id;
        if ((a.once || a.yearly) && (granted.has(key) || pending.has(key))) continue;
        const detail = a.check(c);
        if (!detail) continue;
        if (a.once || a.yearly) pending.set(key, { def: a, detail, key });
        else now.push({ def: a, detail, key, fresh: true });
      }
      const cands = [...now, ...pending.values()].sort((x, y) =>
        RAR[y.def.rarity].n - RAR[x.def.rarity].n || (y.fresh ? 1 : 0) - (x.fresh ? 1 : 0));
      let award;
      if (cands.length) {
        const w = cands[0];
        pending.delete(w.key);
        const n = (granted.get(w.def.id) || 0) + 1;
        granted.set(w.key, 1); granted.set(w.def.id, n);
        award = { id: w.def.id, def: w.def, detail: w.detail, n };
      } else {
        const s = pull(e.id, stickers);
        const n = (stickers.get(s.id) || 0) + 1;
        stickers.set(s.id, n);
        award = { id: s.id, def: s, detail: n === 1 ? `New sticker! ${stickers.size} of ${STICKERS.length} collected` : `Duplicate · you have ${n}`, n, sticker: true };
      }
      out.push({ ...award, at: e.at, eventId: e.id });

      // Update running records after judging this entry.
      if (c.gap != null) { c.maxGap = Math.max(c.maxGap, c.gap); c.minGap = Math.min(c.minGap, c.gap); c.gaps++; }
      if (c.tubeLife != null) { c.maxLife = Math.max(c.maxLife, c.tubeLife); c.lives++; }
      if (e.kind === 'new') tubeStart = e.at;
      if (c.endedRun) c.bestRun[c.endedRun.side] = Math.max(c.bestRun[c.endedRun.side], c.endedRun.ms);
      if (!run || run.side !== e.side) run = { side: e.side, start: e.at };
      if (lastDay !== dk) { c.bestStreak = Math.max(c.bestStreak, c.streak); lastDay = dk; }
    });
    return out;
  }
  // The trophy in a run of entries for a given event.
  const forEvent = (awards, id) => awards.find(a => a.eventId === id);

  // ----- sound (all synthesized, no files) -----
  let ac = null, master = null;
  const muted = () => TT.store.get('tt.mute') === '1';
  function unlock() {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      // A silent blip in the tap, which is what iOS wants before it allows sound later.
      const o = ac.createOscillator(), g = ac.createGain(); g.gain.value = 0; o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.01);
    } catch {}
  }
  function bus() {
    if (!ac || muted()) return null;
    if (master) { try { master.disconnect(); } catch {} }
    master = ac.createGain(); master.gain.value = 0.5;
    const comp = ac.createDynamicsCompressor(); master.connect(comp).connect(ac.destination);
    return master;
  }
  function hush() { if (master && ac) { try { master.gain.setTargetAtTime(0, ac.currentTime, 0.02); } catch {} } master = null; }
  function tone(out, t, f, dur, { type = 'sine', vol = 0.3, f2, attack = 0.005 } = {}) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(out, t, dur, { vol = 0.3, from = 800, to = 6000, type = 'bandpass', q = 1 } = {}) {
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let k = 0; k < len; k++) d[k] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = buf; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + dur + 0.05);
  }
  const NOTE = n => 523.25 * Math.pow(2, n / 12); // semitones from C5
  const SFX = {
    // Capsule lands, wobbles three times (each one higher), charges up and pops.
    buildup(rank) {
      const out = bus(); if (!out) return;
      const t = ac.currentTime;
      tone(out, t + 0.05, 160, 0.25, { f2: 55, vol: 0.6 });            // thud
      noise(out, t + 0.05, 0.12, { from: 300, to: 120, vol: 0.25, type: 'lowpass' });
      [0.55, 0.95, 1.3].forEach((dt, k) => {                            // rattles
        tone(out, t + dt, 700 * Math.pow(1.26, k), 0.07, { type: 'square', vol: 0.07 });
        tone(out, t + dt + 0.06, 900 * Math.pow(1.26, k), 0.06, { type: 'square', vol: 0.05 });
        noise(out, t + dt, 0.06, { from: 3000, to: 5000, vol: 0.08 });
      });
      noise(out, t + 1.45, 0.45, { from: 400, to: 9000, vol: 0.22 });  // charge whoosh
      tone(out, t + 1.45, 300, 0.45, { type: 'sawtooth', f2: 300 * Math.pow(2, 1 + rank / 3), vol: 0.06 });
    },
    pop(rank) {
      const out = bus(); if (!out) return;
      const t = ac.currentTime;
      noise(out, t, 0.25, { from: 8000, to: 1500, vol: 0.45, type: 'highpass', q: 0.5 });
      tone(out, t, 1200, 0.18, { f2: 2400, vol: 0.25, type: 'triangle' });
      for (let k = 0; k < 6 + rank * 3; k++) tone(out, t + 0.05 + k * 0.045, 2000 + Math.random() * 2500, 0.18, { vol: 0.07 });
      this.fanfare(rank, out, t + 0.12);
    },
    fanfare(rank, out = bus(), t = ac && ac.currentTime) {
      if (!out) return;
      const steps = [[0, 4, 7], [0, 4, 7, 12], [0, 4, 7, 12, 16], [0, 4, 7, 11, 12, 16, 19], [0, 4, 7, 12, 16, 19, 24, 28]][rank - 1];
      const gap = rank >= 4 ? 0.075 : 0.09;
      steps.forEach((s, k) => {
        tone(out, t + k * gap, NOTE(s), 0.35, { type: 'triangle', vol: 0.22 });
        tone(out, t + k * gap, NOTE(s + 12), 0.25, { vol: 0.06 });
      });
      const end = t + steps.length * gap;
      const chord = rank >= 4 ? [0, 4, 7, 12, 16] : rank >= 3 ? [0, 4, 7, 12] : [0, 7, 12];
      chord.forEach(s => tone(out, end, NOTE(s), rank >= 4 ? 1.6 : 0.9, { type: 'triangle', vol: 0.1, attack: 0.02 }));
      if (rank >= 4) {
        tone(out, end, NOTE(-24), 1.4, { vol: 0.25, attack: 0.02 });   // bass bloom
        for (let k = 0; k < 14; k++) tone(out, end + 0.1 + k * 0.09, NOTE(24 + [0, 4, 7, 12][k % 4]), 0.25, { vol: 0.05 }); // shimmer
      }
      if (rank === 5) noise(out, end, 1.2, { from: 6000, to: 12000, vol: 0.06, type: 'highpass' });
    },
    tap() { const out = bus(); if (out) tone(out, ac.currentTime, 900, 0.06, { type: 'triangle', vol: 0.12 }); },
  };

  // ----- reveal animation -----
  const CSS = `
  .aw { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; overflow: hidden;
    background: radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--c1) 45%, #2a1035) 0%, #1a0b24 70%);
    color: #fff; font-family: var(--body); -webkit-user-select: none; user-select: none; touch-action: manipulation;
    animation: awIn .25s ease-out; }
  .aw.out { animation: awOut .22s ease-in forwards; }
  @keyframes awIn { from { opacity: 0; } } @keyframes awOut { to { opacity: 0; transform: scale(1.04); } }
  .aw-rays { position: absolute; width: 180vmax; height: 180vmax; left: 50%; top: 45%; margin: -90vmax 0 0 -90vmax;
    background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--c1) 30%, transparent) 0 8deg, transparent 8deg 20deg);
    animation: awSpin 14s linear infinite; opacity: .0; transition: opacity .6s; mask: radial-gradient(circle, #000 10%, transparent 60%); -webkit-mask: radial-gradient(circle, #000 10%, transparent 60%); }
  .aw.charging .aw-rays { opacity: .5; } .aw.open .aw-rays { opacity: 1; }
  @keyframes awSpin { to { transform: rotate(360deg); } }
  .aw-cap { position: absolute; top: 45%; left: 50%; width: 130px; height: 168px; margin: -84px 0 0 -65px; animation: awDrop .55s cubic-bezier(.3,1.6,.5,1) both; }
  .aw-cap .half { position: absolute; left: 0; width: 130px; }
  /* Clear dome with a glowing mystery star inside */
  .aw-cap .top { top: 0; height: 88px; border-radius: 65px 65px 10px 10px / 80px 80px 10px 10px;
    background: radial-gradient(circle at 50% 70%, color-mix(in srgb, var(--c1) 55%, transparent), rgba(255,255,255,.18) 70%);
    border: 3px solid rgba(255,255,255,.75); box-shadow: inset 0 0 18px rgba(255,255,255,.45); backdrop-filter: blur(2px); }
  .aw-cap .top::before { content: "✦"; position: absolute; left: 0; right: 0; top: 22px; text-align: center; font-size: 44px; color: #fff; text-shadow: 0 0 14px var(--c1), 0 0 26px var(--c2); }
  .aw-cap .top::after { content: ""; position: absolute; left: 18px; top: 12px; width: 16px; height: 36px; border-radius: 50%; background: rgba(255,255,255,.65); transform: rotate(18deg); }
  /* Colored base, egg-shaped, with a stitched seam and a little heart */
  .aw-cap .bot { bottom: 0; height: 84px; border-radius: 10px 10px 65px 65px / 10px 10px 74px 74px;
    background: linear-gradient(160deg, var(--c1), var(--c2)); box-shadow: inset 0 -8px 0 rgba(0,0,0,.12), inset 0 6px 0 rgba(255,255,255,.3); }
  .aw-cap .bot::after { content: "♥"; position: absolute; left: 0; right: 0; top: 22px; text-align: center; color: rgba(255,255,255,.9); font-size: 26px; }
  .aw-cap .band { position: absolute; left: 6px; right: 6px; top: 81px; height: 6px; border-radius: 3px; background: repeating-linear-gradient(90deg, rgba(255,255,255,.95) 0 8px, transparent 8px 13px); }
  .aw-cap .btn { display: none; }
  .aw.charging .aw-cap { filter: drop-shadow(0 0 22px var(--c1)) drop-shadow(0 0 40px var(--c2)); }
  .aw.r5.charging .aw-cap .top { animation: awRainbow .5s linear infinite; }
  @keyframes awRainbow { to { filter: hue-rotate(360deg); } }
  @keyframes awDrop { from { transform: translateY(-70vh) rotate(-30deg); } }
  .aw-cap.w1 { animation: awWob .32s ease-in-out; } .aw-cap.w2 { animation: awWob2 .32s ease-in-out; } .aw-cap.w3 { animation: awWob3 .3s ease-in-out; }
  @keyframes awWob { 30% { transform: rotate(-9deg); } 70% { transform: rotate(7deg); } }
  @keyframes awWob2 { 30% { transform: rotate(13deg) translateY(-6px); } 70% { transform: rotate(-11deg); } }
  @keyframes awWob3 { 25% { transform: rotate(-17deg) translateY(-12px) scale(1.05); } 60% { transform: rotate(15deg) scale(1.08); } }
  .aw.charging .aw-cap { animation: awShake .07s linear infinite; }
  @keyframes awShake { 0%,100% { transform: translate(0,0) scale(1.08); } 25% { transform: translate(-3px,2px) scale(1.1); } 75% { transform: translate(3px,-2px) scale(1.1); } }
  .aw.open .aw-cap .top { animation: awLid .6s cubic-bezier(.2,.8,.4,1) forwards; }
  .aw.open .aw-cap .bot, .aw.open .aw-cap .band, .aw.open .aw-cap .btn { animation: awFall .5s ease-in forwards; }
  @keyframes awLid { to { transform: translate(60px,-60vh) rotate(160deg); } }
  @keyframes awFall { to { transform: translateY(60vh) rotate(-20deg); opacity: 0; } }
  .aw-flash { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
  .aw.open .aw-flash { animation: awFlash .5s ease-out; }
  @keyframes awFlash { 0% { opacity: .95; } 100% { opacity: 0; } }
  .aw-bits { position: absolute; left: 50%; top: 45%; width: 0; height: 0; }
  .aw-bits i { position: absolute; font-style: normal; left: 0; top: 0; animation: awBit var(--t) cubic-bezier(.1,.7,.3,1) forwards; opacity: 0; }
  @keyframes awBit { 0% { opacity: 1; transform: translate(-50%,-50%) scale(.3); } 75% { opacity: 1; } 100% { opacity: 0; transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) rotate(var(--r)) scale(1); } }
  .aw-card { position: relative; width: min(320px, 84vw); padding: 26px 22px 22px; border-radius: 30px; text-align: center; color: #3b2140;
    background: linear-gradient(#fff, #fff) padding-box, linear-gradient(135deg, var(--c1), var(--c2)) border-box; border: 5px solid transparent;
    box-shadow: 0 0 60px color-mix(in srgb, var(--c1) 60%, transparent), 0 20px 50px rgba(0,0,0,.4);
    transform: scale(.2) rotateY(90deg); opacity: 0; pointer-events: none; }
  .aw.open .aw-card { animation: awCard .7s .18s cubic-bezier(.2,1.5,.4,1) forwards; pointer-events: auto; }
  .aw.r5 .aw-card { background: linear-gradient(#fff, #fff) padding-box, linear-gradient(90deg, #ff7aa2, #ffd166, #5fd3b0, #6fa8ff, #c06cff, #ff7aa2) border-box; background-size: 100% 100%, 300% 100%; }
  .aw.r5.open .aw-card { animation: awCard .7s .18s cubic-bezier(.2,1.5,.4,1) forwards, awSlide 2s linear infinite; }
  @keyframes awSlide { to { background-position: 0 0, 300% 0; } }
  @keyframes awCard { to { transform: none; opacity: 1; } }
  .aw-rar { display: inline-flex; gap: 6px; align-items: center; font: 800 12px/1 var(--body); letter-spacing: .14em; text-transform: uppercase;
    background: linear-gradient(135deg, var(--c1), var(--c2)); color: #fff; padding: 6px 12px; border-radius: 999px; text-shadow: 0 1px 1px rgba(0,0,0,.2); }
  .aw-medal { width: 124px; height: 124px; margin: 16px auto 12px; border-radius: 50%; display: grid; place-items: center; font-size: 66px; line-height: 1;
    background: radial-gradient(circle at 35% 30%, #fff, color-mix(in srgb, var(--c1) 35%, #fff) 60%, var(--c1));
    box-shadow: inset 0 -8px 0 color-mix(in srgb, var(--c2) 45%, transparent), 0 0 0 6px color-mix(in srgb, var(--c2) 25%, #fff); }
  .aw.open .aw-medal { animation: awBounce .9s .55s ease-out; }
  @keyframes awBounce { 30% { transform: scale(1.18) rotate(-6deg); } 55% { transform: scale(.95) rotate(4deg); } 80% { transform: scale(1.03); } }
  .aw-card h3 { font: 600 28px/1.05 var(--display); margin: 0 0 6px; }
  .aw-card p { margin: 0; font-weight: 700; color: #6d5170; font-size: 15px; }
  .aw-card .when { margin-top: 12px; font-size: 13px; color: #9a83a0; font-weight: 700; }
  .aw-new { position: absolute; top: -12px; right: -10px; background: #ffd166; color: #3b2a00; font: 800 13px/1 var(--display); padding: 7px 11px; border-radius: 999px; transform: rotate(10deg); box-shadow: 0 3px 8px rgba(0,0,0,.2); }
  .aw-hint { position: absolute; bottom: calc(26px + env(safe-area-inset-bottom)); left: 0; right: 0; text-align: center; font-weight: 800; font-size: 14px; opacity: .75; letter-spacing: .04em; }
  .aw-tools { position: absolute; top: calc(14px + env(safe-area-inset-top)); left: 14px; right: 14px; display: flex; justify-content: space-between; }
  .aw-tools button, .aw-tools a { border: 0; background: rgba(255,255,255,.16); color: #fff; border-radius: 999px; min-height: 44px; padding: 0 16px; font: 700 15px/44px var(--body); text-decoration: none; }
  .aw-list { margin: 12px 0 0; padding: 0; list-style: none; font-size: 13px; font-weight: 700; color: #6d5170; max-height: 120px; overflow: auto; text-align: left; border-top: 1px solid #f3dbe3; padding-top: 10px; }
  .aw-list li { padding: 3px 0; }
  @media (prefers-reduced-motion: reduce) { .aw *, .aw { animation-duration: .01s !important; animation-delay: 0s !important; } .aw-rays { animation: none; } }`;

  let styled = false;
  function style() { if (styled) return; styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

  function burst(host, rank) {
    const bits = host.querySelector('.aw-bits');
    const glyphs = ['✦', '★', '✧', '♥', '●', '✿'];
    const colors = ['#ffd166', '#ff7aa2', '#9a7cf0', '#5fd3b0', '#6fa8ff', '#fff'];
    const n = 26 + rank * 10;
    let h = '';
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, r = 120 + Math.random() * (180 + rank * 40);
      h += `<i style="--x:${Math.cos(a) * r}px;--y:${Math.sin(a) * r + 60}px;--r:${Math.random() * 540 - 270}deg;--t:${0.8 + Math.random() * 0.9}s;color:${colors[k % colors.length]};font-size:${10 + Math.random() * 18}px">${glyphs[k % glyphs.length]}</i>`;
    }
    bits.innerHTML = h;
  }

  const when = d => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + TT.time(d);

  // capsule: play the lootbox build-up first (true after a fresh log, false when replaying from the cabinet).
  // history: optional list of dates this trophy was earned, shown under the card.
  function reveal(aw, { capsule = true, onClose, history } = {}) {
    style();
    const r = RAR[aw.def.rarity], rank = r.n;
    const el = document.createElement('div');
    el.className = `aw r${rank}`;
    el.style.setProperty('--c1', r.c1); el.style.setProperty('--c2', r.c2);
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', `${r.label} award: ${aw.def.name}`);
    const isNew = aw.n === 1;
    el.innerHTML = `<div class="aw-rays"></div><div class="aw-bits"></div>
      <div class="aw-cap"><div class="half top"></div><div class="half bot"></div><div class="band"></div><div class="btn"></div></div>
      <div class="aw-card">${capsule && isNew ? `<span class="aw-new">${aw.sticker ? 'NEW!' : 'UNLOCKED!'}</span>` : ''}
        <span class="aw-rar">${'★'.repeat(r.stars)} ${r.label}${aw.sticker ? ' sticker' : ''}</span>
        <div class="aw-medal">${aw.def.icon}</div>
        <h3>${TT.esc(aw.def.name)}${aw.n > 1 && !aw.sticker ? ` <span style="color:#9a83a0;font-size:.7em">×${aw.n}</span>` : ''}</h3>
        <p>${TT.esc(aw.detail)}</p>
        <p class="when">Earned ${TT.esc(when(aw.at))}</p>
        ${history && history.length > 1 ? `<ul class="aw-list">${history.map(h => `<li>✦ ${TT.esc(when(h.at))}${h.detail ? ' — ' + TT.esc(h.detail) : ''}</li>`).join('')}</ul>` : ''}
      </div>
      <div class="aw-flash"></div>
      <div class="aw-tools"><button type="button" class="aw-snd" aria-label="Sound">${muted() ? '🔇 Sound off' : '🔊 Sound on'}</button>
        ${location.pathname.includes('/trophies') ? '' : '<a class="aw-cab" href="' + (location.pathname.includes('/stats') ? '../' : '') + 'trophies/">🏆 Cabinet</a>'}</div>
      <div class="aw-hint">${capsule ? 'Tap to open' : 'Tap to close'}</div>`;
    document.body.appendChild(el);
    const cap = el.querySelector('.aw-cap');
    const timers = [];
    let stage = capsule ? 0 : 2, closed = false;
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));

    function open(skipped) {
      if (stage >= 2) return;
      stage = 2;
      timers.forEach(clearTimeout);
      el.classList.remove('charging'); el.classList.add('open');
      burst(el, rank);
      if (skipped) { hush(); }
      if (ac && !muted()) SFX.pop(rank);
      el.querySelector('.aw-hint').textContent = 'Tap to close';
    }
    function close() {
      if (closed) return; closed = true;
      timers.forEach(clearTimeout); hush();
      el.classList.add('out');
      setTimeout(() => { el.remove(); if (onClose) onClose(); }, 230);
    }

    if (capsule) {
      if (ac && !muted()) SFX.buildup(rank);
      later(500, () => cap.classList.add('w1'));
      later(900, () => { cap.classList.remove('w1'); cap.classList.add('w2'); });
      later(1250, () => { cap.classList.remove('w2'); cap.classList.add('w3'); });
      later(1450, () => { cap.classList.remove('w3'); el.classList.add('charging'); stage = 1; });
      later(1900, () => open(false));
    } else {
      cap.style.display = 'none';
      el.classList.add('open'); burst(el, rank);
      if (ac && !muted()) SFX.fanfare(rank);
    }

    el.addEventListener('click', ev => {
      if (ev.target.closest('.aw-snd')) {
        const m = !muted(); TT.store.set('tt.mute', m ? '1' : '0');
        ev.target.closest('.aw-snd').textContent = m ? '🔇 Sound off' : '🔊 Sound on';
        if (m) hush(); else { unlock(); SFX.tap(); }
        return;
      }
      if (ev.target.closest('.aw-cab')) return;
      if (stage < 2) open(true); else close();
    });
    return { close };
  }

  // Awards earned, grouped per trophy, for the cabinet.
  function shelf(awards) {
    const map = new Map();
    for (const a of awards) { if (!map.has(a.id)) map.set(a.id, []); map.get(a.id).push(a); }
    return map;
  }

  return { compute, forEvent, reveal, unlock, shelf, ACH, STICKERS, RAR, BY, muted };
})();
