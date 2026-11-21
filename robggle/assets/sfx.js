// Tiny synth: every sound is made in code, no audio files.
let ctx = null, master = null;
let muted = false;
try { muted = localStorage.getItem('rb:mute') === '1'; } catch {}

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}
window.addEventListener('pointerdown', unlock, { passive: true });
window.addEventListener('keydown', unlock);

// True once the browser lets us play sound (it needs one click or tap on the page first).
// The output the round music plays through (null until sound is allowed).
export function audioOut() { return ctx ? { ctx, master } : null; }

export function audioReady() { return !!ctx && ctx.state === 'running'; }

export function setMuted(v) { muted = v; if (v) import('./music.js?v=cdcfe2c-1795303748').then(m => m.stopMusic(0.3)); try { localStorage.setItem('rb:mute', v ? '1' : '0'); } catch {} }
export function isMuted() { return muted; }

function tone(freq, { at = 0, dur = 0.12, type = 'sine', vol = 0.3, slide = 0, attack = 0.005 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise({ at = 0, dur = 0.2, vol = 0.2, freq = 1200 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(master);
  s.start(t);
}

// A warm, lo-fi pluck: two slightly detuned triangle waves and a soft octave, through a low-pass filter that
// closes as the note fades, with a slow tape-style wobble in pitch.
function pluck(freq, { at = 0, vol = 0.16, dur = 0.9 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 0.8;
  lp.frequency.setValueAtTime(Math.min(3200, freq * 6), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(500, freq * 1.5), t + dur);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 4.6;
  const depth = ctx.createGain(); depth.gain.value = 9; // cents of wobble
  lfo.connect(depth);
  [[-8, 'triangle', 1, 0.5], [8, 'triangle', 1, 0.5], [0, 'sine', 2, 0.16]].forEach(([cents, type, mult, level]) => {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq * mult; o.detune.value = cents;
    depth.connect(o.detune);
    const og = ctx.createGain(); og.gain.value = level;
    o.connect(og).connect(lp);
    o.start(t); o.stop(t + dur + 0.05);
  });
  lp.connect(g).connect(master);
  lfo.start(t); lfo.stop(t + dur + 0.05);
}
// A wind-chime glint, high and very quiet.
function chime(freq, at = 0) {
  while (freq > 2400) freq /= 2;
  tone(freq, { at, dur: 0.5, type: 'sine', vol: 0.052, attack: 0.004 });
  tone(freq * 1.5, { at: at + 0.05, dur: 0.35, type: 'sine', vol: 0.027, attack: 0.004 });
}
// A brush of tambourine.
function shake(at = 0, dur = 0.08, vol = 0.04) { noise({ at, dur, vol, freq: 6500 }); }

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
const note = (i, base = 392) => base * 2 ** (SCALE[Math.min(i, SCALE.length - 1)] / 12);

export const sfx = {
  tick(n) { tone(note(n, 330), { dur: 0.07, type: 'triangle', vol: 0.22 }); },
  ok(len) {
    tone(note(len, 440), { dur: 0.1, type: 'square', vol: 0.12 });
    tone(note(len + 2, 440), { at: 0.07, dur: 0.18, type: 'square', vol: 0.12 });
  },
  bad() { tone(180, { dur: 0.22, type: 'sawtooth', vol: 0.12, slide: 0.6 }); },
  dupe() { tone(520, { dur: 0.08, type: 'triangle', vol: 0.2 }); tone(520, { at: 0.11, dur: 0.08, type: 'triangle', vol: 0.2 }); },
  ally() { tone(880, { dur: 0.06, type: 'sine', vol: 0.15 }); tone(1175, { at: 0.06, dur: 0.1, type: 'sine', vol: 0.12 }); },
  beep(hi) { tone(hi ? 880 : 587, { dur: hi ? 0.35 : 0.15, type: 'square', vol: 0.14 }); },
  buzzer() { tone(140, { dur: 0.6, type: 'sawtooth', vol: 0.2, slide: 0.8 }); tone(147, { dur: 0.6, type: 'square', vol: 0.12 }); },
  blip(i) { tone(note(i % 12, 523), { dur: 0.09, type: 'triangle', vol: 0.22 }); },
  coin() { tone(988, { dur: 0.06, type: 'square', vol: 0.1 }); tone(1319, { at: 0.05, dur: 0.16, type: 'square', vol: 0.1 }); },
  solo() {
    noise({ dur: 0.25, vol: 0.25, freq: 900 });
    [0, 4, 7, 12, 16].forEach((s, i) => tone(523 * 2 ** (s / 12), { at: 0.05 + i * 0.05, dur: 0.22, type: 'square', vol: 0.11 }));
  },
  // A word only one person found (end card). A little flower-power moment, kept soft and lo-fi: a warm,
  // slightly wobbly electric-piano pluck, answered by a quieter note a third up, with a wind-chime glint
  // and a brush of tambourine. They come in runs, so each one is the next step of a tune that skips up the
  // major pentatonic scale in thirds and wanders back down; every eighth one is a full strummed chord, and
  // each time the tune comes round it sits a whole step higher (then drifts back).
  unique(n = 0) {
    const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19];
    const TUNE = [0, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 3, 4, 2, 3, 1];
    const KEYS = [0, 2, 4, 2];
    const key = KEYS[Math.floor(n / TUNE.length) % KEYS.length];
    const at = d => 293.66 * 2 ** ((PENTA[Math.min(d, PENTA.length - 1)] + key) / 12);
    const d = TUNE[n % TUNE.length];
    if (n % 8 === 7) {
      // The strum: four notes of the chord rolled upward, and a longer shake.
      [0, 2, 3, 5].forEach((k, i) => pluck(at(k), { at: i * 0.055, vol: 0.2, dur: 1.1 }));
      chime(at(5) * 2, 0.24);
      shake(0.0, 0.16, 0.075); shake(0.13, 0.1, 0.06);
      return;
    }
    pluck(at(d), { vol: 0.26, dur: 0.95 });
    pluck(at(d + 2), { at: 0.085, vol: 0.13, dur: 0.8 });
    chime(at(d) * 4, 0.13);
    shake(0.0, 0.07, 0.052);
  },
  // A minus handicap knocks pieces off a tower: a whack, then each piece clatters down a step lower.
  chop(n = 1) {
    noise({ dur: 0.1, vol: 0.32, freq: 1600 });
    tone(180, { dur: 0.16, type: 'sine', vol: 0.3, slide: 0.5 });
    for (let k = 0; k < Math.min(n, 8); k++) tone(660 * 2 ** (-k * 2 / 12), { at: 0.08 + k * 0.07, dur: 0.12, type: 'triangle', vol: 0.13, slide: 0.8 });
  },
  whoosh() { noise({ dur: 0.3, vol: 0.15, freq: 2500 }); },
  stamp() { noise({ dur: 0.15, vol: 0.35, freq: 300 }); tone(90, { dur: 0.2, type: 'sine', vol: 0.4, slide: 0.5 }); },
  fanfare() {
    const seq = [[0, 0.0], [4, 0.12], [7, 0.24], [12, 0.36], [7, 0.54], [12, 0.66]];
    seq.forEach(([s, at]) => tone(392 * 2 ** (s / 12), { at, dur: 0.3, type: 'square', vol: 0.12 }));
    tone(392 * 4, { at: 0.66, dur: 0.8, type: 'triangle', vol: 0.15 });
  },
  siren(i) { const f = 660 + i * 90; tone(f, { dur: 0.16, type: 'square', vol: 0.09, slide: 1.35 }); tone(f * 1.35, { at: 0.17, dur: 0.14, type: 'square', vol: 0.07, slide: 0.75 }); },
  alarm() { [0, 0.16, 0.32].forEach(at => tone(988, { at, dur: 0.1, type: 'square', vol: 0.1 })); tone(1319, { at: 0.48, dur: 0.25, type: 'square', vol: 0.12 }); },
  snore() { tone(110, { dur: 0.9, type: 'sawtooth', vol: 0.08, slide: 1.3, attack: 0.3 }); tone(90, { at: 1.1, dur: 0.8, type: 'sawtooth', vol: 0.06, slide: 0.7, attack: 0.2 }); },
  yawn() { tone(330, { dur: 0.5, type: 'triangle', vol: 0.07, slide: 0.55, attack: 0.12 }); },
  vroom() { tone(70, { dur: 1.4, type: 'sawtooth', vol: 0.16, slide: 3.2, attack: 0.05 }); noise({ at: 0.9, dur: 0.6, vol: 0.18, freq: 500 }); },
  nom(n) { tone(392 * 2 ** (Math.min(n, 30) / 24), { dur: 0.07, type: 'square', vol: 0.12, slide: 0.6 }); tone(196, { at: 0.04, dur: 0.06, type: 'sine', vol: 0.18 }); },
  bananaHello() { [0, 4, 7, 12].forEach((s, i) => tone(523 * 2 ** (s / 12), { at: i * 0.09, dur: 0.16, type: 'triangle', vol: 0.15 })); tone(1047, { at: 0.4, dur: 0.35, type: 'sine', vol: 0.12, slide: 1.5 }); },
  like() { tone(740, { dur: 0.07, type: 'sine', vol: 0.2, slide: 1.6 }); tone(1480, { at: 0.07, dur: 0.12, type: 'triangle', vol: 0.12 }); tone(1976, { at: 0.13, dur: 0.1, type: 'sine', vol: 0.07 }); },
  pop() { tone(660, { dur: 0.06, type: 'sine', vol: 0.25, slide: 1.8 }); },
  bridge() { [0, 4, 7, 11, 14].forEach((s, i) => tone(523 * 2 ** (s / 12), { at: i * 0.045, dur: 0.18, type: 'triangle', vol: 0.15 })); },
  gavel() { noise({ dur: 0.08, vol: 0.4, freq: 250 }); tone(140, { dur: 0.15, type: 'sine', vol: 0.4, slide: 0.6 }); },
  box() { noise({ dur: 0.5, vol: 0.3, freq: 1500 }); [0, 7, 12, 19].forEach((s, i) => tone(523 * 2 ** (s / 12), { at: 0.15 + i * 0.06, dur: 0.25, type: 'square', vol: 0.08 })); },
  // Someone scored (heard on the TV): a bell that climbs a little with their word count.
  ding(n = 0) {
    const f = 1568 * 2 ** (Math.min(n, 24) / 48);
    tone(f, { dur: 0.35, type: 'sine', vol: 0.13 });
    tone(f * 2, { dur: 0.18, type: 'sine', vol: 0.04 });
  },
  // Bridging the board, big-screen size: a rising sweep into a bright chord.
  bridgeBig() {
    noise({ dur: 0.45, vol: 0.18, freq: 2200 });
    [0, 4, 7, 11, 14, 19].forEach((s, i) => tone(523 * 2 ** (s / 12), { at: i * 0.05, dur: 0.3, type: 'triangle', vol: 0.16 }));
    [0, 7, 12].forEach(s => tone(1047 * 2 ** (s / 12), { at: 0.34, dur: 0.6, type: 'square', vol: 0.06 }));
  },
  // P-pa Monster: a low wobbling growl.
  growl() {
    tone(95, { dur: 0.5, type: 'sawtooth', vol: 0.16, slide: 0.7, attack: 0.05 });
    tone(101, { dur: 0.5, type: 'square', vol: 0.07, slide: 0.65, attack: 0.05 });
    tone(140, { at: 0.42, dur: 0.22, type: 'sawtooth', vol: 0.1, slide: 1.5 });
  },
  // Violet & Orin: two quick giggly slides, one up and one down.
  zoom() {
    tone(500, { dur: 0.16, type: 'triangle', vol: 0.16, slide: 2.1 });
    tone(1000, { at: 0.13, dur: 0.18, type: 'triangle', vol: 0.14, slide: 0.5 });
    noise({ dur: 0.2, vol: 0.08, freq: 3000 });
  },
  // Charlie: one step up, higher the taller the tile.
  step(n = 1) { tone(294 * 2 ** (Math.min(n, 24) / 12), { dur: 0.09, type: 'square', vol: 0.11 }); tone(294 * 2 ** ((Math.min(n, 24) + 5) / 12), { at: 0.07, dur: 0.12, type: 'triangle', vol: 0.14 }); },
  // Jess: ignition and away.
  rocket() {
    noise({ dur: 1.2, vol: 0.3, freq: 500 });
    tone(70, { dur: 1.3, type: 'sawtooth', vol: 0.16, slide: 6, attack: 0.1 });
    tone(880, { at: 0.75, dur: 0.5, type: 'sine', vol: 0.07, slide: 3 });
  },
  thud() { noise({ dur: 0.12, vol: 0.3, freq: 220 }); tone(110, { dur: 0.18, type: 'sine', vol: 0.3, slide: 0.5 }); },
  // G-ma's Wordle: a clue landed (2 = a green, 1 = a yellow, 0 = nothing).
  clue(best) {
    if (best === 2) { tone(784, { dur: 0.1, type: 'triangle', vol: 0.2 }); tone(1175, { at: 0.09, dur: 0.2, type: 'triangle', vol: 0.2 }); }
    else if (best === 1) tone(659, { dur: 0.16, type: 'triangle', vol: 0.18 });
    else tone(262, { dur: 0.14, type: 'triangle', vol: 0.12, slide: 0.85 });
  },
  // Thou Shalt Not Guess: three smug little "nuh"s.
  nuhuh() {
    [[262, 0], [262, 0.22], [208, 0.44]].forEach(([f, at], k) => {
      tone(f, { at, dur: k === 2 ? 0.26 : 0.15, type: 'sawtooth', vol: 0.13, slide: 0.9, attack: 0.02 });
      tone(f / 2, { at, dur: k === 2 ? 0.26 : 0.15, type: 'square', vol: 0.06, slide: 0.9, attack: 0.02 });
    });
  },
  // A naughty word: the TV censor's bleep, then a little "ooh".
  bleep() { tone(1000, { dur: 0.32, type: 'sine', vol: 0.2, attack: 0.01 }); tone(420, { at: 0.36, dur: 0.3, type: 'triangle', vol: 0.14, slide: 1.7, attack: 0.05 }); },
  // Someone pointed at a letter.
  point() { tone(988, { dur: 0.07, type: 'sine', vol: 0.16 }); tone(1319, { at: 0.06, dur: 0.12, type: 'sine', vol: 0.12 }); },
  // Ice cubes clinking.
  ice() {
    [[2637, 0], [3136, 0.09], [2349, 0.2], [2794, 0.34]].forEach(([f, at]) => tone(f, { at, dur: 0.09, type: 'sine', vol: 0.11 }));
    noise({ at: 0.02, dur: 0.12, vol: 0.06, freq: 6000 });
  },
  join() { tone(660, { dur: 0.08, type: 'triangle', vol: 0.2 }); tone(990, { at: 0.08, dur: 0.14, type: 'triangle', vol: 0.2 }); },
};
