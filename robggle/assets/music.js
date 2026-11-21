// The round music (web/robggle/audio/round.m4a, made by tools/make_music.py): one long loop. It starts up
// front for a few seconds, then sinks under the game so the sound effects stay on top.
import { audioOut, isMuted } from './sfx.js?v=0dabfef-1795241502';

const FILE = new URL('../audio/round.m4a', import.meta.url);
const LOUD = 0.85, BED = 0.3;          // up front, then the level it settles at
// The 4-bar intro plays once; after that it loops from the end of the last theme back to the first theme.
// (tools/make_music.py prints these two numbers.)
const LOOP_START = 7.86883, LOOP_LEN = 180.98362;
let buffer = null, loading = null;
let src = null, gain = null, token = 0;

function load(ctx) {
  if (buffer) return Promise.resolve(buffer);
  if (!loading) {
    loading = fetch(FILE).then(r => r.arrayBuffer()).then(a => new Promise((ok, no) => ctx.decodeAudioData(a, ok, no)))
      .then(b => (buffer = b)).catch(() => { loading = null; return null; });
  }
  return loading;
}

// Fetch it early (once sound is allowed) so the round doesn't wait on it.
export function preloadMusic() { const o = audioOut(); if (o) load(o.ctx); }

export async function startMusic() {
  stopMusic(0.2);
  const o = audioOut();
  if (!o || isMuted()) return;
  const my = ++token;
  const b = await load(o.ctx);
  if (!b || my !== token) return;
  const { ctx, master } = o;
  src = ctx.createBufferSource();
  src.buffer = b;
  src.loop = true;
  if (b.duration >= LOOP_START + LOOP_LEN - 0.25) { src.loopStart = LOOP_START; src.loopEnd = Math.min(b.duration, LOOP_START + LOOP_LEN); }
  gain = ctx.createGain();
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(LOUD, t + 0.4);
  gain.gain.setValueAtTime(LOUD, t + 5);
  gain.gain.linearRampToValueAtTime(BED, t + 9);
  src.connect(gain).connect(master);
  src.start(t);
}

export function stopMusic(fade = 1.5) {
  token++;
  if (!src) return;
  const o = audioOut();
  const s = src, g = gain;
  src = gain = null;
  if (!o) { try { s.stop(); } catch {} return; }
  const t = o.ctx.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(0.0001, t + fade);
  try { s.stop(t + fade + 0.05); } catch {}
}
