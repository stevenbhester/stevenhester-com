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

export function setMuted(v) { muted = v; try { localStorage.setItem('rb:mute', v ? '1' : '0'); } catch {} }
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
  whoosh() { noise({ dur: 0.3, vol: 0.15, freq: 2500 }); },
  stamp() { noise({ dur: 0.15, vol: 0.35, freq: 300 }); tone(90, { dur: 0.2, type: 'sine', vol: 0.4, slide: 0.5 }); },
  fanfare() {
    const seq = [[0, 0.0], [4, 0.12], [7, 0.24], [12, 0.36], [7, 0.54], [12, 0.66]];
    seq.forEach(([s, at]) => tone(392 * 2 ** (s / 12), { at, dur: 0.3, type: 'square', vol: 0.12 }));
    tone(392 * 4, { at: 0.66, dur: 0.8, type: 'triangle', vol: 0.15 });
  },
  join() { tone(660, { dur: 0.08, type: 'triangle', vol: 0.2 }); tone(990, { at: 0.08, dur: 0.14, type: 'triangle', vol: 0.2 }); },
};
