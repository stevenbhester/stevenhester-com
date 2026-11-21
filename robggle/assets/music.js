// The game's two pieces of music, both made in code and rendered to web/robggle/audio/:
//   round.m4a (tools/make_music.py): plays during a round. Up front for a few seconds, then it sinks under
//     the game so the sound effects stay on top.
//   lobby.m4a (tools/make_lobby.py): plays on the home screen and in the lobby, quietly, until a round starts.
//   results.m4a (tools/make_lobby.py too): the lobby tune's post-game variant, under the end-of-round show.
import { audioOut, isMuted } from './sfx.js?v=dc68fa1-1795297650';

// loopStart/loopLen are printed by the tools. The round's 4-bar intro plays once, then it loops from the end
// of the last theme back to the first; the lobby loops whole. (Looping on exact lengths, not the file's end,
// keeps the join clean whatever padding the audio format adds.)
const TRACKS = {
  round: { file: new URL('../audio/round.m4a', import.meta.url), loopStart: 7.86883, loopLen: 180.98362 },
  lobby: { file: new URL('../audio/lobby.m4a', import.meta.url), loopStart: 0, loopLen: 147.69229 },
  results: { file: new URL('../audio/results.m4a', import.meta.url), loopStart: 0, loopLen: 110.76925 },
};
const LOUD = 0.85, BED = 0.3;          // the round: up front, then the level it settles at
const LOBBY = 0.34;                    // the lobby: one steady, easy level
const RESULTS = 0.26;                  // post-game: under the end card's own sounds
const buffers = {}, loading = {};
let src = null, gain = null, token = 0, playing = null;

function load(ctx, name) {
  if (buffers[name]) return Promise.resolve(buffers[name]);
  if (!loading[name]) {
    loading[name] = fetch(TRACKS[name].file).then(r => r.arrayBuffer()).then(a => new Promise((ok, no) => ctx.decodeAudioData(a, ok, no)))
      .then(b => (buffers[name] = b)).catch(() => { loading[name] = null; return null; });
  }
  return loading[name];
}

// Fetch a track early (once sound is allowed) so nothing waits on it.
export function preloadMusic(name = 'round') { const o = audioOut(); if (o) load(o.ctx, name); }

// Which track is playing (or about to): 'round', 'lobby', 'results' or null.
export const musicPlaying = () => playing;

async function play(name, shape) {
  stopMusic(0.4);
  const o = audioOut();
  if (!o || isMuted()) return;
  const my = ++token;
  playing = name;
  const b = await load(o.ctx, name);
  if (my !== token) return;
  if (!b) { playing = null; return; }
  const { ctx, master } = o;
  const T = TRACKS[name];
  src = ctx.createBufferSource();
  src.buffer = b;
  src.loop = true;
  if (b.duration >= T.loopStart + T.loopLen - 0.25) { src.loopStart = T.loopStart; src.loopEnd = Math.min(b.duration, T.loopStart + T.loopLen); }
  gain = ctx.createGain();
  shape(gain.gain, ctx.currentTime);
  src.connect(gain).connect(master);
  src.start(ctx.currentTime);
}

export function startMusic() {
  return play('round', (g, t) => {
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(LOUD, t + 0.4);
    g.setValueAtTime(LOUD, t + 5);
    g.linearRampToValueAtTime(BED, t + 9);
  });
}

// Safe to call over and over (every time the lobby redraws): it only starts if it isn't already going.
export function startLobbyMusic() {
  if (playing === 'lobby') return;
  return play('lobby', (g, t) => {
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(LOBBY, t + 1.5);
  });
}

export function startResultsMusic() {
  if (playing === 'results') return;
  return play('results', (g, t) => {
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(RESULTS, t + 1.2);
  });
}

export function stopMusic(fade = 1.5) {
  token++;
  playing = null;
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
