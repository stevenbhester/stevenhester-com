// The Door Bowl studio card, ported from Last Mile's scripts/studio_card.gd (itself from Frontiers Celestia).
// A ceramic bowl with a tiny door: something kicks it open from inside, soup gushes at the camera band after band,
// DOOR BOWL bobs up in it, the juice pulls itself into "a" and "game", and the camera dives through the door into
// the game. Drawn on a canvas in a 1280x720 frame, scaled to fit. Any tap, click or key skips it.

const FRAME = [1280, 720];
const MIDDLE = [640, 360];
const rgb = (r, g, b, a = 1) => [r, g, b, a];
const BACKDROP = rgb(0.075, 0.05, 0.11);
const SPOT = rgb(0.125, 0.08, 0.185);
const SPOT_CORE = rgb(0.165, 0.105, 0.24);
const INK = rgb(0.09, 0.055, 0.13);
const CERAMIC = rgb(0.8, 0.76, 0.7);
const CERAMIC_SHADE = rgb(0.62, 0.57, 0.58);
const GLAZE = rgb(0.27, 0.36, 0.6);
const DOOR = rgb(0.66, 0.29, 0.28);
const DOOR_BACK = rgb(0.42, 0.17, 0.2);
const DOOR_FRAME = rgb(0.55, 0.36, 0.22);
const DOORWAY = rgb(0.17, 0.06, 0.13);
const KNOB = rgb(0.82, 0.68, 0.32);
const PASTA = rgb(0.82, 0.76, 0.56);
const LETTER = rgb(0.93, 0.9, 0.82);
const PEA = rgb(0.44, 0.64, 0.38);
const CARROT = rgb(0.76, 0.5, 0.26);
const WHITE = rgb(1, 1, 1);
const SOUP = [rgb(0.45, 0.2, 0.32), rgb(0.15, 0.34, 0.36), rgb(0.48, 0.38, 0.17), rgb(0.28, 0.21, 0.44), rgb(0.5, 0.28, 0.17)];
const JUICE = [rgb(0.68, 0.24, 0.47), rgb(0.14, 0.53, 0.55), rgb(0.76, 0.58, 0.2), rgb(0.43, 0.31, 0.72), rgb(0.77, 0.38, 0.2)];

const RIM = [640, 300];
const RIM_RADII = [212, 40];
const DEPTH = 168;
const FOOT = [640, 486];
const DOOR_RECT = { x: 613, y: 382, w: 54, h: 74 };
const BOWL_SCALE = 1.25;
const BOWL_PIVOT = [640, 380];
const MOUTH = [640, 440];

const FADE_IN = 0.3;
const KICKS = [0.5, 1.05, 1.6];
const KICK_POWER = [0.6, 0.85, 1.3];
const AJAR = 22;
const OPEN_SECONDS = 0.24;
const SHAKE = 9;
const DOOR_CRACKS = [[[26, 8], [22, 19], [29, 27], [24, 36]], [[24, 36], [33, 44], [27, 54], [35, 63], [31, 72]], [[29, 27], [41, 31], [48, 25]]];
const GUSH_AT = 1.66;
const BAND_EVERY = 0.16;
const GROWTH = 3.3;
const MOUTH_RADIUS = 11;
const SAG = 1.4;
const WOBBLE = 0.205;
const EDGE_POINTS = 120;
const RIDERS = 4;
const WORDS = ['DOOR', 'BOWL'];
const LETTERS_AT = 2.76;
const LETTER_EVERY = 0.085;
const LETTER_SIZE = 212;
const POP_SECONDS = 0.42;
const DRAIN_AT = 4.41;
const DRAIN_RUSH = 1.9;
const LOCKUP_AT = DRAIN_AT + 0.1;
const LOCKUP_SECONDS = 0.6;
const LOCKUP_EVERY = 0.015;
const LOCKUP_SCALE = 0.72;
const LOCKUP = [892, 352];
const SETTLED_SCALE = 0.76;
const SETTLED_AT = [370, 372];
const MOUTH_MOVES = [1.35, 2.0];
const UPRIGHT_ROOM = [720, 1280];
const UPRIGHT_SETTLED_AT = [640, 26];
const UPRIGHT_LOCKUP = [640, 556];
const GOO_AT = DRAIN_AT + 0.55;
const GOO_SECONDS = 0.95;
const GOO_WORDS = [{ text: 'a', at: [668, 110], height: 64 }, { text: 'game', at: [754, 530], height: 64 }];
const GOO_STROKES = {
  a: [[[0.94, 0.24], [0.66, 0.02], [0.28, 0.08], [0.04, 0.48], [0.24, 0.9], [0.62, 0.98], [0.92, 0.7]],
    [[0.95, 0.03], [0.94, 0.5], [0.97, 0.88], [1.14, 1.0]]],
  g: [[[0.94, 0.24], [0.66, 0.02], [0.28, 0.08], [0.04, 0.48], [0.24, 0.9], [0.62, 0.98], [0.92, 0.7]],
    [[0.95, 0.03], [0.94, 0.7], [0.92, 1.2], [0.68, 1.5], [0.32, 1.52], [0.08, 1.34]]],
  m: [[[0.06, 0.03], [0.06, 0.5], [0.06, 1.0]],
    [[0.06, 0.38], [0.24, 0.06], [0.46, 0.04], [0.62, 0.26], [0.64, 1.0]],
    [[0.64, 0.38], [0.82, 0.06], [1.04, 0.04], [1.2, 0.26], [1.22, 0.76], [1.34, 1.0]]],
  e: [[[0.06, 0.52], [0.5, 0.5], [0.94, 0.46], [0.8, 0.12], [0.46, 0.0], [0.12, 0.2], [0.02, 0.56], [0.18, 0.9], [0.52, 1.0], [0.88, 0.84]]],
};
const GOO_ADVANCE = { a: 1.46, g: 1.42, m: 1.76, e: 1.2 };
const GOO_FATNESS = 0.15;
const GOO_INK = 4.5;
const GOO_STEP = 3;
const GOO_DRIPS = [[0, 0.72, 18, 5.5, 0.62], [1, 0.92, 26, 6, 0.8], [3, 0.8, 26, 5.5, 0.9], [4, 0.74, 52, 7, 0.58], [7, 1.0, 34, 6, 0.74], [9, 0.84, 40, 6, 0.68]];
const ZOOM_AT = GOO_AT + GOO_SECONDS + 1.05;
const ZOOM_SECONDS = 1.15;
const DOOR_LINING = 3;
const SKIP_FADE = 0.28;
const CUES = [[KICKS[0], 'kick', 1.08, -8], [KICKS[1], 'kick', 1.0, -5], [KICKS[1] + 0.13, 'creak', 1.0, -6], [KICKS[2], 'kick', 0.9, -1],
  [GUSH_AT - 0.05, 'gush', 1.0, -1], [DRAIN_AT, 'refill', 0.55, -5], [GOO_AT, 'goo', 1.0, -3], [ZOOM_AT, 'zoom', 1.0, -3]];
const SMEAR = 120;
const SMEAR_FAT = 1.9;

// ---------- small math ----------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const lerpV = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const len = a => Math.hypot(a[0], a[1]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const ortho = a => [a[1], -a[0]];
const fromAngle = a => [Math.cos(a), Math.sin(a)];
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const fposmod = (a, b) => ((a % b) + b) % b;
const hash = n => fposmod(Math.sin(n * 127.1 + 311.7) * 43758.5453, 1);
const lighten = (c, a) => [c[0] + (1 - c[0]) * a, c[1] + (1 - c[1]) * a, c[2] + (1 - c[2]) * a, c[3]];
const darken = (c, a) => [c[0] * (1 - a), c[1] * (1 - a), c[2] * (1 - a), c[3]];
const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
const css = (c, alpha = c[3]) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${alpha})`;
const grow = (r, g) => ({ x: r.x - g, y: r.y - g, w: r.w + 2 * g, h: r.h + 2 * g });
const center = r => [r.x + r.w / 2, r.y + r.h / 2];
const M = () => new DOMMatrix();
const apply = (m, p) => { const q = m.transformPoint(new DOMPoint(p[0], p[1])); return [q.x, q.y]; };
function cubic(p1, p2, p0, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [0, 1].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
}
const spring = u => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - Math.exp(-u * 6) * Math.cos(u * 11) * (1 - u));
const pop = u => 1 + 3.4 * Math.pow(u - 1, 3) + 2.4 * Math.pow(u - 1, 2);

// ---------- sounds ----------
const SOUND_URL = name => new URL(`./audio/studio_${name}.m4a`, import.meta.url).href;
function playSound(name, pitch, db) {
  try {
    const a = new Audio(SOUND_URL(name));
    a.preservesPitch = false; a.mozPreservesPitch = false; a.webkitPreservesPitch = false;
    a.playbackRate = pitch;
    a.volume = clamp(Math.pow(10, db / 20), 0, 1);
    a.play().catch(() => {});
  } catch {}
}

// ---------- the card ----------
export function playIntro({ onDraining, freezeAt } = {}) {
  return new Promise(resolve => {
    const canvas = document.createElement('canvas');
    canvas.className = 'studio-card';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    };
    resize();
    window.addEventListener('resize', resize);
    // Preload the sounds so the first kick lands on time.
    for (const c of ['kick', 'creak', 'gush', 'refill', 'goo', 'zoom']) { try { const a = new Audio(SOUND_URL(c)); a.preload = 'auto'; } catch {} }

    let time = 0, last = null, closing = false, toldDraining = false;
    let goo = [], gooUpright = null;
    const upright = () => H > W;
    const settledAt = () => (upright() ? UPRIGHT_SETTLED_AT : SETTLED_AT);
    const lockupAt = () => (upright() ? UPRIGHT_LOCKUP : LOCKUP);
    const fit = () => { const room = upright() ? UPRIGHT_ROOM : FRAME; return Math.min(W / room[0], H / room[1]); };
    const view = () => { const f = fit(); return { x: (FRAME[0] - W / f) / 2, y: (FRAME[1] - H / f) / 2, w: W / f, h: H / f }; };
    const reach = v => Math.hypot(v.w / 2, v.h / 2);
    const covers = (radius, r) => radius * (1 - WOBBLE) > r + 20;
    const flowAt = at => (at <= DRAIN_AT ? at - GUSH_AT : DRAIN_AT - GUSH_AT + (at - DRAIN_AT) * DRAIN_RUSH);
    const holeFrom = () => (Math.floor((DRAIN_AT - GUSH_AT) / BAND_EVERY) + 1) * BAND_EVERY;
    const radiusOf = age => MOUTH_RADIUS * Math.exp(GROWTH * age);
    const bowlSize = () => M().translate(BOWL_PIVOT[0], BOWL_PIVOT[1]).scale(BOWL_SCALE).translate(-BOWL_PIVOT[0], -BOWL_PIVOT[1]);
    const settled = () => { const s = settledAt(); return M().translate(s[0], s[1]).scale(SETTLED_SCALE).translate(-BOWL_PIVOT[0], -BOWL_PIVOT[1]); };
    const setT = m => ctx.setTransform(dpr * m.a, dpr * m.b, dpr * m.c, dpr * m.d, dpr * m.e, dpr * m.f);

    // ---------- goo words ----------
    function smooth(knots) {
      const pts = [];
      const lastI = knots.length - 1;
      for (let i = 0; i < lastI; i++) {
        const from = knots[i], to = knots[i + 1];
        const steps = Math.max(Math.ceil(len(sub(to, from)) / GOO_STEP), 1);
        for (let s = 0; s < steps; s++) pts.push(cubic(from, to, knots[Math.max(i - 1, 0)], knots[Math.min(i + 2, lastI)], s / steps));
      }
      pts.push(knots[lastI]);
      return pts;
    }
    function layGoo() {
      goo = [];
      gooUpright = upright();
      const shift = sub(lockupAt(), LOCKUP);
      for (const word of GOO_WORDS) {
        let at = add(word.at, shift);
        for (const letter of word.text) {
          for (const knots of GOO_STROKES[letter]) {
            const rest = smooth(knots.map(k => add(at, mul(k, word.height))));
            const index = goo.length;
            const smeared = rest.map((p, i) => {
              const away = norm(sub(p, MIDDLE));
              const drag = 0.55 + 0.45 * Math.sin((i / rest.length) * 5 + index * 2.1);
              return add(p, mul(away, drag * SMEAR));
            });
            goo.push({ index, rest, smeared, fat: word.height * GOO_FATNESS });
          }
          at = [at[0] + word.height * GOO_ADVANCE[letter], at[1]];
        }
      }
    }
    function shaped(st, pull) {
      const pts = [], widths = [];
      const n = st.rest.length;
      const loose = clamp(1 - pull, 0, 1);
      for (let i = 0; i < n; i++) {
        const along = i / Math.max(n - 1, 1);
        let at = lerpV(st.smeared[i], st.rest[i], pull);
        at = add(at, mul([Math.sin(time * 5 + i * 0.3 + st.index), Math.cos(time * 4.3 + i * 0.23 + st.index * 2)], 0.5 + 5 * loose));
        pts.push(at);
        const swell = 1 + 0.2 * Math.sin(along * 9 + st.index * 1.7 + time * 1.4) + 0.18 * (1 - Math.sin(along * Math.PI));
        widths.push(st.fat * swell * lerp(1, SMEAR_FAT, loose));
      }
      return [pts, widths];
    }

    // ---------- shapes ----------
    function poly(points, color) {
      ctx.beginPath();
      points.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.fillStyle = css(color);
      ctx.fill();
    }
    function line(points, color, width, closed = false) {
      ctx.beginPath();
      points.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      if (closed) ctx.closePath();
      ctx.strokeStyle = css(color);
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    function circle(p, r, color) { ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(0, r), 0, TAU); ctx.fillStyle = css(color); ctx.fill(); }
    function ring(p, r, color, width) { ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(0, r), 0, TAU); ctx.strokeStyle = css(color); ctx.lineWidth = width; ctx.stroke(); }
    function outlined(points, color, width) { poly(points, color); line(points, INK, width, true); }
    function arc(c, radii, from, to, steps = 24) {
      const out = [];
      for (let i = 0; i <= steps; i++) { const a = Math.PI * lerp(from, to, i / steps); out.push([c[0] + Math.cos(a) * radii[0], c[1] + Math.sin(a) * radii[1]]); }
      return out;
    }
    function arch(rect, g) {
      const b = grow(rect, g);
      const r = b.w / 2;
      const mid = [b.x + r, b.y + r];
      const pts = [[b.x, b.y + b.h], [b.x + b.w, b.y + b.h]];
      for (let i = 0; i <= 36; i++) pts.push(add(mid, mul(fromAngle(-Math.PI * i / 36), r)));
      return pts;
    }
    function ellipse(c, rx, ry) {
      const pts = [];
      for (let i = 0; i < 20; i++) { const a = TAU * i / 20; pts.push([c[0] + Math.cos(a) * rx, c[1] + Math.sin(a) * ry]); }
      return pts;
    }
    function boil(points, salt, closed) {
      const tick = Math.floor(time * 12) * 97 + salt * 1013;
      const out = points.map((p, i) => [p[0] + (hash(tick + i * 2) - 0.5) * 2.4, p[1] + (hash(tick + i * 2 + 1) - 0.5) * 2.4]);
      if (closed) out.push(out[0]);
      return out;
    }

    // ---------- bowl and door ----------
    function shake() {
      let s = [0, 0];
      KICKS.forEach((k, i) => {
        const since = time - k;
        if (since >= 0 && since < 0.5) {
          const fade = Math.exp(-since * 11) * KICK_POWER[i] * KICK_POWER[i] * SHAKE;
          s = add(s, mul([Math.sin(since * 67), Math.cos(since * 83)], fade));
        }
      });
      return s;
    }
    function bowlTransform() {
      let squash = 0.012 * Math.sin(time * 5) * (1 - smoothstep(ZOOM_AT - 0.45, ZOOM_AT - 0.05, time));
      let tilt = 0, hop = 0;
      KICKS.forEach((k, i) => {
        const since = time - k;
        if (since >= 0) {
          const ringV = Math.exp(-since * 8) * Math.sin(since * 38);
          squash += 0.085 * KICK_POWER[i] * ringV;
          tilt += 0.05 * KICK_POWER[i] * ringV * (i % 2 === 0 ? 1 : -1);
          hop += 16 * KICK_POWER[i] * Math.max(Math.sin(Math.min(since / 0.2, 1) * Math.PI), 0);
        }
      });
      const shudder = clamp((time - KICKS[2]) / 0.3, 0, 1) * (1 - smoothstep(DRAIN_AT - 0.4, DRAIN_AT, time));
      tilt += 0.024 * shudder * Math.sin(time * 31);
      squash += 0.03 * shudder * Math.sin(time * 23);
      return M().translate(FOOT[0], FOOT[1] - hop).rotate(tilt * 180 / Math.PI).scale(1 + squash, 1 - squash).translate(-FOOT[0], -FOOT[1]);
    }
    function doorAngle() {
      const flung = (time - KICKS[2]) / OPEN_SECONDS;
      const deg = d => d * Math.PI / 180;
      if (flung >= 0) return deg(AJAR + (128 - AJAR) * (1 - Math.exp(-flung * 5) * Math.cos(flung * 9)));
      const sprung = time - KICKS[1];
      if (sprung <= 0) return 0;
      return deg(AJAR * (1 - Math.exp(-sprung * 16)) + 3.5 * Math.sin(sprung * 46) * Math.exp(-sprung * 3));
    }
    function thump() {
      let t = 0;
      KICKS.forEach((k, i) => { if (time >= k) t = Math.max(t, KICK_POWER[i] * (1 - (time - k) / 0.2)); });
      return t;
    }
    function swung(p, angle, bulge) {
      const midY = DOOR_RECT.y + DOOR_RECT.h / 2;
      const across = (p[0] - DOOR_RECT.x) / DOOR_RECT.w;
      const swing = Math.sin(angle) * across;
      return [DOOR_RECT.x + Math.cos(angle) * DOOR_RECT.w * across * bulge, midY + (p[1] - midY) * (1 + 0.22 * swing) * bulge + 5 * swing];
    }

    function drawBowl(frame) {
      setT(frame);
      poly(ellipse(add(FOOT, [0, 8]), 250, 22), rgb(0.045, 0.03, 0.07));
      setT(frame.multiply(bowlTransform()));
      outlined([add(RIM, [-80, 150]), add(RIM, [80, 150]), add(RIM, [66, 188]), add(RIM, [-66, 188])], CERAMIC_SHADE, 7);
      const body = [];
      for (let i = 0; i <= 40; i++) { const a = Math.PI * i / 40; body.push([RIM[0] + Math.cos(a) * RIM_RADII[0], RIM[1] + Math.sin(a) * DEPTH]); }
      poly(body, CERAMIC);
      const shade = [];
      for (let i = 0; i <= 12; i++) { const a = Math.PI * (0.02 + 0.44 * i / 12); shade.push([RIM[0] + Math.cos(a) * RIM_RADII[0], RIM[1] + Math.sin(a) * DEPTH]); }
      for (let i = 0; i <= 12; i++) { const a = Math.PI * (0.46 - 0.44 * i / 12); shade.push([RIM[0] + Math.cos(a) * 160, RIM[1] + Math.sin(a) * 150]); }
      poly(shade, CERAMIC_SHADE);
      line(arc(add(RIM, [0, 10]), [207, 44], 0.07, 0.93), GLAZE, 10);
      line(arc(add(RIM, [0, 26]), [199, 42], 0.1, 0.9), GLAZE, 4);
      const shine = arc(RIM, [186, 146], 0.74, 0.9);
      line(shine, WHITE, 9);
      circle(shine[0], 4.5, WHITE);
      circle(shine[shine.length - 1], 4.5, WHITE);
      line(boil(body, 1, false), INK, 7);
      const rim = arc(RIM, RIM_RADII, 0, 2, 48);
      poly(rim, CERAMIC);
      const inside = arc(add(RIM, [0, 3]), [190, 30], 0, 2, 40);
      poly(inside, CERAMIC_SHADE);
      line(inside, INK, 5);
      const surface = arc(add(RIM, [0, 9]), [176, 21], 0, 2, 40);
      poly(surface, SOUP[0]);
      line(surface, INK, 5);
      for (let i = 0; i < 4; i++) {
        const blip = fposmod(time * 1.3 + i * 0.37, 1);
        ring(add(RIM, [-110 + i * 72 + Math.sin(i * 4) * 14, 9 + Math.sin(i * 2.3) * 7]), 3 + blip * 7, [1, 1, 1, 1 - blip], 2.5);
      }
      line(boil(rim, 2, true), INK, 7);
      for (let i = 0; i < 3; i++) {
        const curl = [];
        const rise = fposmod(time * 0.5 + i * 0.33, 1);
        for (let s = 0; s <= 8; s++) { const up = s / 8; curl.push(add(RIM, [-70 + i * 70 + Math.sin(up * 5 + time * 2 + i * 2) * 13, -50 - rise * 26 - up * 62])); }
        line(curl, [0.8, 0.72, 0.95, 0.5 * Math.sin(rise * Math.PI)], 6);
      }
      drawDoor();
    }

    function drawDoor() {
      const step = { x: DOOR_RECT.x - 13, y: DOOR_RECT.y + DOOR_RECT.h + 3, w: DOOR_RECT.w + 26, h: 9 };
      const sg = grow(step, 3.5);
      ctx.fillStyle = css(INK); ctx.fillRect(sg.x, sg.y, sg.w, sg.h);
      ctx.fillStyle = css(CERAMIC_SHADE); ctx.fillRect(step.x, step.y, step.w, step.h);
      poly(arch(DOOR_RECT, 10), INK);
      poly(arch(DOOR_RECT, 6), DOOR_FRAME);
      poly(arch(DOOR_RECT, 1.5), INK);
      poly(arch(DOOR_RECT, -1.5), mixC(DOORWAY, darken(JUICE[0], 0.2), smoothstep(KICKS[1], KICKS[1] + 0.3, time) * (1 - smoothstep(GUSH_AT, DRAIN_AT, time))));
      const angle = doorAngle();
      const th = thump();
      const bulge = 1 + 0.17 * th;
      const leaf = arch(DOOR_RECT, -2.5).map(p => swung(p, angle, bulge));
      const front = Math.cos(angle) > 0;
      if (Math.abs(Math.cos(angle)) > 0.04) {
        poly(leaf, front ? DOOR : DOOR_BACK);
        if (front) {
          for (const pn of [{ x: DOOR_RECT.x + 11, y: DOOR_RECT.y + 24, w: 32, h: 16 }, { x: DOOR_RECT.x + 11, y: DOOR_RECT.y + 46, w: 32, h: 20 }]) {
            poly([[pn.x, pn.y], [pn.x + pn.w, pn.y], [pn.x + pn.w, pn.y + pn.h], [pn.x, pn.y + pn.h]].map(p => swung(p, angle, bulge)), DOOR_BACK);
          }
        }
        const knob = swung([DOOR_RECT.x + DOOR_RECT.w - 9, DOOR_RECT.y + DOOR_RECT.h / 2 + 8], angle, bulge);
        knob[0] += Math.sin(time * 70) * 2 * th;
        circle(knob, 6, INK);
        circle(knob, 3.6, KNOB);
        DOOR_CRACKS.forEach((crack, i) => { if (time >= KICKS[i]) line(crack.map(p => swung([DOOR_RECT.x + p[0], DOOR_RECT.y + p[1]], angle, bulge)), INK, 3); });
        if (th > 0 && angle < 0.5) {
          const toe = swung([DOOR_RECT.x + 25, DOOR_RECT.y + 40], angle, bulge);
          outlined(ellipse(toe, 15 * Math.min(th, 1) + 3, 12 * Math.min(th, 1) + 3), lighten(DOOR, 0.28), 3);
        }
      }
      line(leaf, INK, 4, true);
      if (th > 0) {
        for (let i = 0; i < 5; i++) {
          const out = fromAngle(-Math.PI * (0.08 + 0.21 * i));
          const from = add([DOOR_RECT.x + DOOR_RECT.w / 2, DOOR_RECT.y + 30], mul(out, 50 + (1 - th) * 10));
          line([from, add(from, mul(out, 18 * Math.max(th, 0.6)))], INK, 5);
        }
      }
      drawKickedLoose();
      if (time >= DRAIN_AT) {
        const spill = [], fat = [];
        for (let i = 0; i <= 12; i++) { const s = i / 12; spill.push([DOOR_RECT.x + 2 + 50 * s, DOOR_RECT.y + DOOR_RECT.h + 6 + Math.sin(s * 6) * 1.2]); fat.push(4 + 1.5 * Math.sin(s * Math.PI + time)); }
        const since = time - GOO_AT;
        const ribbons = [[spill, fat]];
        for (const [at, length, delay] of [[[DOOR_RECT.x + 12, DOOR_RECT.y + DOOR_RECT.h + 8], 28, 0.5], [[DOOR_RECT.x + DOOR_RECT.w - 14, DOOR_RECT.y + DOOR_RECT.h + 8], 46, 0.8]]) {
          const run = Math.max(since - delay, 0);
          ribbons.push(drip(at, Math.max(length * (1 - Math.exp(-run * 1.2)), 2), 4.5));
        }
        pour(ribbons);
      }
    }

    function drawKickedLoose() {
      KICKS.forEach((k, kick) => {
        const since = time - k;
        if (since < 0 || since > 0.8) return;
        const power = KICK_POWER[kick];
        for (let i = 0; i < Math.floor(4 * power) + 2; i++) {
          const pick = kick * 53 + i * 11;
          const fall = [0, 640 * since * since];
          const out = fromAngle(-Math.PI * lerp(0.12, 0.88, hash(pick)));
          const edge = add(center(DOOR_RECT), [out[0] * 36, out[1] * 48]);
          const dust = clamp(since / 0.4, 0, 1);
          if (dust < 1) circle(add(edge, mul(out, 26 * dust)), 4 + 9 * dust * power, [CERAMIC[0], CERAMIC[1], CERAMIC[2], 0.5 * (1 - dust)]);
          const chip = add(add(edge, mul(out, lerp(150, 340, hash(pick + 1)) * power * since)), fall);
          const turn = since * 14 + pick;
          outlined([add(chip, mul(fromAngle(turn), 4.5)), add(chip, mul(fromAngle(turn + 2.2), 3.5)), add(chip, mul(fromAngle(turn + 4.1), 4.5))], i % 2 === 0 ? DOOR_FRAME : CERAMIC, 1.5);
          const slop = add([RIM[0] + lerp(-150, 150, hash(pick + 2)), RIM[1] + 4 + lerp(-250, -430, hash(pick + 3)) * power * since], fall);
          if (slop[1] < RIM[1] + 12) { circle(slop, 6.5, INK); circle(slop, 4, lighten(SOUP[0], 0.25)); }
        }
      });
    }

    // ---------- soup ----------
    function wobble(k, a) {
      return 1 + 0.11 * Math.sin(3 * a + k * 1.7 + time * 2.3) + 0.06 * Math.sin(5 * a - time * 3.4 + k * 0.9) + 0.035 * Math.sin(9 * a + time * 5.1 + k * 2.3);
    }
    function bandCenter(k, radius) {
      const settledMouth = add(settledAt(), mul(sub(MOUTH, BOWL_PIVOT), SETTLED_SCALE));
      const mouth = lerpV(MOUTH, settledMouth, smoothstep(MOUTH_MOVES[0], MOUTH_MOVES[1], k * BAND_EVERY));
      const hang = add(mouth, [0, Math.min(radius, 110) * 0.72]);
      return lerpV(hang, MIDDLE, smoothstep(110, 520, radius));
    }
    function edge(k, radius) {
      const c = bandCenter(k, radius);
      const sag = lerp(SAG, 1, smoothstep(40, 300, radius));
      const pts = new Array(EDGE_POINTS);
      for (let i = 0; i < EDGE_POINTS; i++) {
        const a = i * TAU / EDGE_POINTS;
        let along = [Math.cos(a), Math.sin(a)];
        if (along[1] > 0) along = [along[0], along[1] * sag];
        pts[i] = add(c, mul(along, radius * wobble(k, a)));
      }
      return pts;
    }
    function drawSoup(v, r, flow) {
      const hole = flow > holeFrom();
      const newest = Math.floor(Math.min(flow, DRAIN_AT - GUSH_AT) / BAND_EVERY);
      const radii = [];
      for (let k = 0; k <= newest; k++) radii.push(radiusOf(flow - k * BAND_EVERY));
      if (hole) radii.push(radiusOf(flow - holeFrom()));
      let first = 0;
      radii.forEach((rad, k) => { if (covers(rad, r)) first = k; });
      const edges = [];
      for (let k = first; k < radii.length; k++) edges.push(edge(k, radii[k]));
      for (let k = first; k <= newest; k++) {
        const radius = radii[k];
        const e = edges[k - first];
        const color = SOUP[k % SOUP.length];
        const width = clamp(radius * 0.035, 5, 15);
        const whole = covers(radius, r);
        if (k + 1 < radii.length && hole) {
          if (covers(radii[k + 1], r)) continue;
          // the soup between this edge and the next one in
          ctx.beginPath();
          e.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          ctx.closePath();
          const inner = edges[k + 1 - first];
          inner.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          ctx.closePath();
          ctx.fillStyle = css(color);
          ctx.fill('evenodd');
        } else if (whole) {
          ctx.fillStyle = css(color);
          ctx.fillRect(v.x - 40, v.y - 40, v.w + 80, v.h + 80);
        } else poly(e, color);
        if (!whole) {
          const c = bandCenter(k, radius);
          line(e.map(p => add(c, mul(sub(p, c), 0.92))), lighten(color, 0.42), width * 0.75, true);
          line(e, INK, width, true);
        }
        drawRiders(k, radius, width);
      }
      if (hole) line(edges[edges.length - 1], INK, clamp(radii[radii.length - 1] * 0.035, 5, 15), true);
    }
    function drawRiders(k, radius, width) {
      if (radius < 30) return;
      const c = bandCenter(k, radius);
      const color = SOUP[k % SOUP.length];
      for (let j = 0; j < RIDERS + (k === 0 ? 3 : 0); j++) {
        const pick = k * 31 + j * 7;
        const angle = hash(pick) * TAU + time * 0.3 * (j % 2 === 0 ? 1 : -1);
        const along = [Math.cos(angle), Math.sin(angle)];
        const size = radius * lerp(0.045, 0.08, hash(pick + 2));
        if (j >= RIDERS) {
          const d = add(c, mul(along, radius * wobble(k, angle) * lerp(1.12, 1.34, hash(pick + 1))));
          circle(d, size * 0.8 + width * 0.5, INK);
          circle(d, size * 0.8, color);
          continue;
        }
        const at = add(c, mul(along, radius * wobble(k, angle) * lerp(0.7, 0.86, hash(pick + 1))));
        const kind = Math.floor(hash(pick + 3) * 5);
        if (kind === 0) {
          circle(at, size + width * 0.5, INK); circle(at, size, lighten(color, 0.5)); circle(add(at, mul([-0.34, -0.34], size)), size * 0.3, WHITE);
        } else if (kind === 1) {
          const across = ortho(along);
          const noodle = [];
          for (let s = 0; s <= 24; s++) { const sh = s / 24 - 0.5; noodle.push(add(add(at, mul(across, sh * size * 4.4)), mul(along, Math.sin(sh * 9 + time * 7 + pick) * size * 0.55))); }
          line(noodle, INK, size * 0.6 + width);
          line(noodle, PASTA, size * 0.6);
        } else if (kind === 2) {
          circle(at, size * 0.8 + width * 0.5, INK); circle(at, size * 0.8, PEA); circle(add(at, mul([-0.3, -0.3], size)), size * 0.2, lighten(PEA, 0.6));
        } else if (kind === 3) {
          circle(at, size + width * 0.5, INK); circle(at, size, color === SOUP[4] ? PEA : CARROT); ring(at, size * 0.55, [1, 1, 1, 0.55], size * 0.16);
        } else {
          const spin = time * 1.5 + pick, s = size * 1.25;
          const ink = [], star = [];
          for (let i = 0; i < 10; i++) { const out = fromAngle(spin + i * TAU / 10); const far = i % 2 === 0 ? 1 : 0.52; ink.push(add(at, mul(out, s * far + width * 0.7))); star.push(add(at, mul(out, s * far))); }
          poly(ink, INK); poly(star, PASTA);
        }
      }
    }

    // ---------- lettering ----------
    let widthsCache = null;
    function drawLetters(shot) {
      if (time < LETTERS_AT) return;
      ctx.font = `700 ${LETTER_SIZE}px Fredoka, 'Arial Rounded MT Bold', sans-serif`;
      if (!widthsCache) widthsCache = WORDS.map(w => [...w].map(ch => ctx.measureText(ch).width));
      const cap = LETTER_SIZE * 0.7;
      let block = Math.max(...widthsCache.map(ws => ws.reduce((a, b) => a + b, 0))) * 1.03;
      let index = 0;
      WORDS.forEach((word, li) => {
        const ws = widthsCache[li];
        const total = ws.reduce((a, b) => a + b, 0);
        const gap = (block - total) / (word.length - 1);
        let x = MIDDLE[0] - block / 2;
        for (let i = 0; i < word.length; i++) {
          const width = ws[i];
          const home = [x + width / 2, MIDDLE[1] + (li - 0.5) * LETTER_SIZE * 0.93];
          const since = time - LETTERS_AT - index * LETTER_EVERY;
          x += width + gap;
          index++;
          if (since <= 0) continue;
          const landed = clamp(since / POP_SECONDS, 0, 1);
          const sett = spring((time - LOCKUP_AT - index * LOCKUP_EVERY) / LOCKUP_SECONDS);
          const afloat = 1 - clamp(sett, 0, 1);
          const at = add(lerpV(home, add(lockupAt(), mul(sub(home, MIDDLE), LOCKUP_SCALE)), sett), [0, Math.sin(time * 5.5 + index * 1.1) * 7 * afloat]);
          const tilt = Math.sin(time * 4.2 + index * 1.9) * 0.06 * afloat + (1 - landed) * 0.5 * (index % 2 === 0 ? 1 : -1);
          setT(shot.multiply(M().translate(at[0], at[1]).rotate(tilt * 180 / Math.PI).scale(pop(landed) * lerp(1, LOCKUP_SCALE, sett))));
          const corner = [-width / 2, cap / 2];
          const outline = Math.round(LETTER_SIZE * 0.13);
          ctx.lineJoin = 'round';
          ctx.lineWidth = outline * 2;
          ctx.strokeStyle = css(INK);
          ctx.strokeText(word[i], corner[0] + 9, corner[1] + 12);
          ctx.fillStyle = css(INK);
          ctx.fillText(word[i], corner[0] + 9, corner[1] + 12);
          ctx.strokeText(word[i], corner[0], corner[1]);
          ctx.fillStyle = css(LETTER);
          ctx.fillText(word[i], corner[0], corner[1]);
        }
      });
    }

    // ---------- goo ----------
    function juice(at) {
      const swirl = Math.sin(at[0] * 0.019 + time * 0.9) + 0.8 * Math.sin(at[1] * 0.043 - time * 1.2 + Math.sin(at[0] * 0.012) * 2) + 0.7 * Math.sin((at[0] + at[1]) * 0.014 + time * 0.6);
      const place = fposmod(swirl * 1.7, JUICE.length);
      const band = Math.floor(place);
      return mixC(JUICE[band], JUICE[(band + 1) % JUICE.length], smoothstep(0.28, 0.72, place - band));
    }
    function drip(at, length, fat) {
      const pts = [], widths = [];
      const steps = Math.max(Math.ceil(length / GOO_STEP), 2);
      for (let i = 0; i <= steps; i++) {
        const s = i / steps;
        pts.push(add(at, [Math.sin(s * 2 + at[0]) * 1.5, length * s]));
        const neck = lerp(fat, fat * 0.42, smoothstep(0, 0.5, s));
        widths.push(lerp(neck, fat, smoothstep(0.62, 1, s)));
      }
      return [pts, widths];
    }
    // A ribbon as round-capped segments: one ink pass, then juice-colored, so touching strokes run together.
    function ribbon(pts, widths, inkColor) {
      ctx.lineCap = 'round';
      for (let i = 0; i + 1 < pts.length; i++) {
        ctx.beginPath();
        ctx.moveTo(pts[i][0], pts[i][1]);
        ctx.lineTo(pts[i + 1][0], pts[i + 1][1]);
        ctx.lineWidth = 2 * (inkColor ? widths[i] + GOO_INK : widths[i]);
        ctx.strokeStyle = css(inkColor || juice(pts[i]));
        ctx.stroke();
      }
      if (pts.length === 1) circle(pts[0], inkColor ? widths[0] + GOO_INK : widths[0], inkColor || juice(pts[0]));
    }
    function pour(ribbons) {
      for (const [p, w] of ribbons) ribbon(p, w, INK);
      ribbons.forEach(([p, w], salt) => {
        ribbon(p, w, null);
        const n = p.length;
        if (n < 12) return;
        const from = Math.floor(hash(salt + 5) * n * 0.5);
        const to = Math.min(from + Math.floor(n * 0.28) + 4, n);
        const shine = [];
        for (let i = from; i < to; i++) shine.push(add(p[i], mul([-0.34, -0.34], w[i])));
        line(shine, [1, 1, 1, 0.55], Math.max(w[from] * 0.26, 1.5));
      });
    }
    function drawGoo(shot) {
      if (time < DRAIN_AT) return;
      setT(shot);
      const since = time - GOO_AT;
      const ribbons = goo.map(st => shaped(st, spring((since - st.index * 0.03) / GOO_SECONDS)));
      for (const [stroke, along, length, fat, delay] of GOO_DRIPS) {
        const run = since - delay;
        if (run > 0 && ribbons[stroke]) {
          const ln = ribbons[stroke][0];
          ribbons.push(drip(ln[Math.floor(along * (ln.length - 1))], length * (1 - Math.exp(-run * 1.5)), fat));
        }
      }
      pour(ribbons);
    }

    // ---------- camera and doorway ----------
    function camera(v) {
      const u = clamp((time - ZOOM_AT) / ZOOM_SECONDS, 0, 1);
      if (u <= 0) return M();
      const dw = grow(DOOR_RECT, -DOOR_LINING);
      const end = Math.max(v.w / dw.w, v.h / (dw.h - dw.w / 2)) * 1.15 / (BOWL_SCALE * SETTLED_SCALE);
      const zoom = Math.exp(Math.log(end) * Math.pow(u, 2.3)) * (1 - 0.05 * Math.sin(Math.min(u / 0.35, 1) * Math.PI));
      const door = apply(settled().multiply(bowlSize()), center(DOOR_RECT));
      const at = lerpV(door, [v.x + v.w / 2, v.y + v.h / 2], smoothstep(0, 0.6, u));
      return M().translate(at[0], at[1]).scale(zoom).translate(-door[0], -door[1]);
    }
    function openDoorway(bowl) {
      const opened = smoothstep(ZOOM_AT + 0.15, ZOOM_AT + 0.6, time);
      if (opened <= 0) return;
      setT(bowl);
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = opened;
      poly(arch(grow(DOOR_RECT, -DOOR_LINING), 0), WHITE);
      ctx.restore();
    }

    function draw() {
      if (gooUpright !== upright()) layGoo();
      const f = fit();
      const sh = shake();
      const frame = M().translate((W - FRAME[0] * f) / 2 + sh[0] * f, (H - FRAME[1] * f) / 2 + sh[1] * f).scale(f);
      const v = view();
      const r = reach(v);
      const flow = flowAt(time);
      const hole = flow > holeFrom();
      const shot = frame.multiply(camera(v));
      const stage = hole ? shot.multiply(settled()) : shot;
      const bowl = stage.multiply(bowlSize());
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setT(frame);
      if (hole || !covers(radiusOf(flow), r)) {
        const g = SHAKE * 3;
        ctx.fillStyle = css(BACKDROP);
        ctx.fillRect(v.x - g, v.y - g, v.w + 2 * g, v.h + 2 * g);
        setT(stage);
        circle([640, 372], 318, SPOT);
        circle([640, 372], 232, SPOT_CORE);
        drawBowl(bowl);
        drawGoo(shot);
        setT(frame);
      }
      if (flow > 0 && !(hole && covers(radiusOf(flow - holeFrom()), r))) drawSoup(v, r, flow);
      drawLetters(shot);
      setT(frame);
      if (time < FADE_IN) { ctx.fillStyle = `rgba(0,0,0,${1 - time / FADE_IN})`; ctx.fillRect(v.x, v.y, v.w, v.h); }
      openDoorway(bowl);
    }

    function sounds(before) {
      for (const [at, name, pitch, db] of CUES) if (at > before && at <= time) playSound(name, pitch, db);
    }

    function finish() {
      window.removeEventListener('resize', resize);
      canvas.remove();
      resolve();
    }
    function tellDraining() { if (!toldDraining) { toldDraining = true; onDraining && onDraining(); } }

    function frameLoop(now) {
      if (closing) return;
      const before = time;
      if (last != null) time += Math.min((now - last) / 1000, 0.1);
      last = now;
      sounds(before);
      if (time >= ZOOM_AT) tellDraining();
      if (time >= ZOOM_AT + ZOOM_SECONDS) { closing = true; finish(); return; }
      draw();
      requestAnimationFrame(frameLoop);
    }

    const skip = e => {
      e && e.preventDefault();
      if (closing) return;
      closing = true;
      tellDraining();
      canvas.style.transition = `opacity ${SKIP_FADE}s`;
      canvas.style.opacity = '0';
      setTimeout(finish, SKIP_FADE * 1000);
    };
    canvas.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip, { once: true });

    // Draw the dark first frame right away (no flash of the page), then start once the font is ready.
    layGoo();
    draw();
    // Testing only: hold one moment still.
    if (freezeAt != null) {
      const hold = () => { time = freezeAt; widthsCache = null; draw(); };
      (document.fonts ? document.fonts.load(`700 ${LETTER_SIZE}px Fredoka`) : Promise.resolve()).then(hold, hold);
      return;
    }
    const go = () => requestAnimationFrame(frameLoop);
    if (document.fonts && document.fonts.load) Promise.race([document.fonts.load(`700 ${LETTER_SIZE}px Fredoka`), new Promise(r => setTimeout(r, 1200))]).then(go, go);
    else go();
  });
}
