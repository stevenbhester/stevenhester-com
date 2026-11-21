// Connection to the game server: reconnects on its own and keeps a server-clock offset.

// The production server address. Local pages (localhost / LAN) talk to the server that served them.
const PROD_SERVER = 'https://music-grid-io-42616e204fd3.herokuapp.com/rg'; // runs inside the MusicGrid server

export const SERVER = (() => {
  const q = new URLSearchParams(location.search).get('server');
  if (q) { try { sessionStorage.setItem('rb:server', q); } catch {} return q; }
  try { const s = sessionStorage.getItem('rb:server'); if (s) return s; } catch {}
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.endsWith('.local')) return location.origin;
  return PROD_SERVER;
})();

const WS_URL = SERVER.replace(/^http/, 'ws') + '/ws';

// Build number of this copy of the game. tools/publish_site.sh stamps it (the robggle repo's commit count);
// 0 means a local, unpublished copy, which never asks anyone to update. ?build=N fakes one on localhost.
export const BUILD = (() => {
  const stamped = 20;
  const q = new URLSearchParams(location.search).get('build');
  return location.hostname === 'localhost' && q ? +q : stamped;
})();
// The iPhone app's own build (CFBundleVersion), from its user agent: "RobggleApp/1.0 (2)".
// The first TestFlight build said just "RobggleApp/1.0", so that counts as build 1. null in a browser.
export const APP_BUILD = (() => {
  const m = navigator.userAgent.match(/RobggleApp\/[\d.]+(?: \((\d+)\))?/);
  if (m) return m[1] ? +m[1] : 1;
  const q = new URLSearchParams(location.search).get('appBuild');
  return location.hostname === 'localhost' && q ? +q : null;
})();
// What's published right now: { build, minApp }. Never cached.
export async function fetchLatest() {
  try {
    const r = await fetch(new URL(`../version.json?t=${Date.now()}`, import.meta.url), { cache: 'no-store' });
    return await r.json();
  } catch { return null; }
}

// Must match server/board.js
export function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export class Conn {
  constructor(onMsg, onStatus) {
    this.onMsg = onMsg;
    this.onStatus = onStatus || (() => {});
    this.hello = null;     // sent on every (re)connect
    this.queue = [];
    this.offset = 0;
    this.samples = [];
    this.retry = 0;
    this.closed = false;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && (!this.ws || this.ws.readyState > 1)) this.open(true);
    });
    window.addEventListener('online', () => this.open(true));
  }

  now() { return Date.now() + this.offset; }

  open(force) {
    if (this.closed) return;
    if (this.ws && this.ws.readyState <= 1 && !force) return;
    if (this.ws && this.ws.readyState <= 1) return;
    clearTimeout(this.retryTimer);
    const ws = new WebSocket(WS_URL);
    this.ws = ws;
    this.onStatus('connecting');
    ws.onopen = () => {
      this.retry = 0;
      this.onStatus('open');
      if (this.hello) ws.send(JSON.stringify({ ...this.hello, build: BUILD, app: APP_BUILD }));
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
      this.pingBurst();
    };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'pong') return this.gotPong(m);
      this.onMsg(m);
    };
    ws.onclose = e => {
      if (this.ws !== ws) return;
      clearInterval(this.pingTimer);
      this.onStatus('closed');
      if (this.closed || e.code === 4000) return;
      const wait = Math.min(5000, 400 * 2 ** this.retry++);
      this.retryTimer = setTimeout(() => this.open(), wait);
    };
  }

  send(m) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
    else { if (m.t !== 'ping') this.queue.push(m); this.open(); }
  }

  close() { this.closed = true; clearInterval(this.pingTimer); try { this.ws.close(); } catch {} }

  pingBurst() {
    let n = 0;
    clearInterval(this.pingTimer);
    const ping = () => this.send({ t: 'ping', c: performance.now() });
    ping();
    this.pingTimer = setInterval(() => {
      ping();
      if (++n === 5) { clearInterval(this.pingTimer); this.pingTimer = setInterval(ping, 10000); }
    }, 600);
  }

  // Keep the offset from the fastest recent round trip: least affected by lag.
  gotPong(m) {
    const t1 = performance.now();
    const rtt = t1 - m.c;
    const localMid = Date.now() - rtt / 2;
    this.samples.push({ rtt, off: m.s - localMid });
    if (this.samples.length > 8) this.samples.shift();
    const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    this.offset = best.off;
    this.rtt = best.rtt;
  }
}

export async function fetchLobbies() {
  const r = await fetch(SERVER + '/api/lobbies', { cache: 'no-store' });
  return (await r.json()).lobbies || [];
}

// Native bridge (iOS app). No-ops in a plain browser.
export function native(msg) {
  try { window.webkit?.messageHandlers?.robggle?.postMessage(msg); } catch {}
}
export const IN_APP = new URLSearchParams(location.search).has('app') || /RobggleApp/.test(navigator.userAgent);

export function haptic(kind) {
  if (IN_APP) native({ haptic: kind });
  else if (navigator.vibrate && kind !== 'tick') navigator.vibrate(kind === 'success' ? 20 : kind === 'error' ? [30, 40, 30] : 10);
}
