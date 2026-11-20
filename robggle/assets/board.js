// The letter grid. Interactive boards let you trace a word by dragging across tiles.
// Chaos events can change a tile's letter (Z's), pull tiles out (bananas) or block them (Set cards).
import { sfx } from './sfx.js?v=fd261f1-1795140523';
import { haptic } from './net.js?v=fd261f1-1795140523';

export const tileText = t => (t === 'qu' ? 'Qu' : t.toUpperCase());
const tileHTML = t => (t === 'qu' ? '<span class="qu">Qu</span>' : t.toUpperCase());

// Flat (2D) flips only: iPhone Safari can leave a 3D-turned tile half drawn. Any earlier flip on the
// tile is cancelled first, and a timer clears this one even if the animation clock stalls.
function flip(t, frames, ms) {
  if (t._flip) t._flip.cancel();
  const a = t.animate(frames, { duration: ms, easing: 'ease-out' });
  t._flip = a;
  const done = () => { if (t._flip === a) { a.cancel(); t._flip = null; } };
  a.onfinish = done;
  setTimeout(done, ms + 150);
}

export function makeBoard(tiles, size, opts = {}) {
  const cur = tiles.slice();          // what each tile says right now
  const holes = new Set();            // tiles pulled out of the board
  let hidden = !!opts.blank;
  const el = document.createElement('div');
  el.className = 'board';
  el.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  const tileEls = tiles.map((t, i) => {
    const d = document.createElement('div');
    d.className = 'tile';
    d.dataset.i = i;
    d.innerHTML = hidden ? '' : tileHTML(t);
    el.appendChild(d);
    return d;
  });
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'path');
  const line = document.createElementNS(svgNS, 'polyline');
  svg.appendChild(line);
  el.appendChild(svg);
  // Layer for chaos effects (cards, smoke, the race car). Children choose their own pointer events.
  const fx = document.createElement('div');
  fx.className = 'board-fx';
  el.appendChild(fx);

  const ro = new ResizeObserver(() => {
    const w = el.clientWidth;
    const cell = w / size;
    el.style.setProperty('--fs', `${cell * 0.5}px`);
    el.style.setProperty('--gap', `${Math.max(3, cell * 0.1)}px`);
    el.style.setProperty('--edge', `${Math.max(2, cell * 0.07)}px`);
    svg.setAttribute('viewBox', `0 0 ${w} ${w}`);
    line.setAttribute('stroke-width', Math.max(6, cell * 0.22));
    drawLine();
    api.onResize && api.onResize();
  });
  ro.observe(el);

  let path = [];
  let centers = null;

  function centerOf(i) {
    const b = el.getBoundingClientRect();
    const r = tileEls[i].getBoundingClientRect();
    return [r.left - b.left + r.width / 2, r.top - b.top + r.height / 2];
  }
  // While a finger is down the tile centers were measured once at pointerdown; reuse them.
  function drawLine() {
    line.setAttribute('points', path.map(i => (centers && dragging ? centers[i] : centerOf(i)).join(',')).join(' '));
  }
  let dragging = false;
  function word() { return path.map(i => cur[i]).join(''); }
  function adjacent(a, b) {
    const ra = Math.floor(a / size), ca = a % size, rb = Math.floor(b / size), cb = b % size;
    return Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1 && a !== b;
  }
  function setPath(p) {
    path = p;
    tileEls.forEach((t, i) => t.classList.toggle('sel', path.includes(i)));
    drawLine();
    opts.onChange && opts.onChange(word(), path);
  }
  const usable = i => !holes.has(i) && !(api.blocked && api.blocked(i));

  const api = {
    el, tileEls, fx, size,
    enabled: !!opts.interactive,
    blocked: null,
    letters: () => cur.slice(),
    original: tiles,
    clear() { el.classList.remove('ok', 'no', 'dupe', 'wait'); setPath([]); },
    // Flash a result color on the traced tiles, then clear.
    result(kind) {
      el.classList.remove('ok', 'no', 'dupe', 'shake', 'wait');
      void el.offsetWidth;
      el.classList.add(kind);
      if (kind !== 'ok' && kind !== 'wait') el.classList.add('shake');
      clearTimeout(api._t);
      if (kind !== 'wait') api._t = setTimeout(() => api.clear(), kind === 'ok' ? 260 : 380);
    },
    setLetter(i, l) {
      if (cur[i] === l) return;
      cur[i] = l;
      const t = tileEls[i];
      t.classList.toggle('zzz', l !== tiles[i]);
      if (!hidden) {
        t.innerHTML = tileHTML(l);
        flip(t, [{ transform: 'scaleY(0.08)' }, { transform: 'scaleY(1.12)', offset: 0.65 }, { transform: 'none' }], 320);
      }
    },
    setHole(i, on) {
      if (on === holes.has(i)) return;
      if (on) holes.add(i); else holes.delete(i);
      tileEls[i].classList.toggle('hole', on);
    },
    // Light a path tile by tile (used by the reveal and ally hints).
    light(p, { color, step = 60, cls = 'lit' } = {}) {
      api.unlight();
      const gen = api._gen;
      p.forEach((i, n) => setTimeout(() => {
        if (gen !== api._gen) return;
        tileEls[i].style.setProperty('--lit', color || '');
        tileEls[i].classList.add(cls);
      }, n * step));
    },
    _gen: 0,
    unlight() { api._gen++; tileEls.forEach(t => t.classList.remove('lit')); },
    hint(p, color) {
      p.forEach((i, n) => setTimeout(() => {
        const t = tileEls[i];
        t.classList.remove('hint'); void t.offsetWidth;
        t.style.setProperty('--hc', color);
        t.classList.add('hint');
      }, n * 120));
    },
    // Color tiles by how often they were used (end-of-round heat map).
    heat(counts, hue = 'hot') {
      const max = Math.max(1, ...counts);
      tileEls.forEach((t, i) => {
        const v = counts[i] / max;
        t.classList.add('heat');
        t.style.setProperty('--heat', v.toFixed(3));
        t.dataset.n = counts[i] || '';
        t.classList.toggle('cold', !counts[i]);
      });
      el.classList.add('heatmap', `heat-${hue}`);
    },
    // A light sweeping across the whole board (bridge bonus).
    sweep(color = 'var(--sun)') {
      const s = document.createElement('div');
      s.className = 'sweep';
      s.style.setProperty('--c', color);
      fx.appendChild(s);
      setTimeout(() => s.remove(), 1100);
    },
    reveal() {
      hidden = false;
      tileEls.forEach((t, i) => {
        setTimeout(() => {
          t.innerHTML = tileHTML(cur[i]);
          flip(t, [{ transform: 'scaleX(0.05)' }, { transform: 'scaleX(1.06)', offset: 0.7 }, { transform: 'none' }], 300);
        }, i * 25);
      });
    },
    centerOf,
    // Sleepover moods: 'drowsy' (about to nod off), 'wake' (just woke up) or null.
    mood(i, m) {
      const t = tileEls[i];
      if (t._mood === m) return;
      if (t._mood) t.classList.remove(t._mood);
      t._mood = m;
      if (m) { void t.offsetWidth; t.classList.add(m); }
    },
    destroy() { ro.disconnect(); },
  };

  if (opts.interactive) {
    let down = false;
    const hitTile = (x, y, loose) => {
      let best = -1, bestD = Infinity;
      for (let i = 0; i < centers.length; i++) {
        const dx = x - centers[i][0], dy = y - centers[i][1], d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      }
      const r = centers.cell * (loose ? 0.75 : 0.42); // a tight radius makes diagonals easy
      return bestD <= r * r ? best : -1;
    };
    el.addEventListener('pointerdown', e => {
      if (!api.enabled) return;
      e.preventDefault();
      const b = el.getBoundingClientRect();
      centers = tileEls.map((_, i) => centerOf(i));
      centers.cell = b.width / size;
      down = true;
      dragging = true;
      el.setPointerCapture(e.pointerId);
      clearTimeout(api._t);
      el.classList.remove('ok', 'no', 'dupe', 'wait');
      const i = hitTile(e.clientX - b.left, e.clientY - b.top, true);
      if (i >= 0 && usable(i)) { setPath([i]); sfx.tick(0); haptic('tick'); } else setPath([]);
    });
    el.addEventListener('pointermove', e => {
      if (!down || !api.enabled) return;
      const b = el.getBoundingClientRect();
      const i = hitTile(e.clientX - b.left, e.clientY - b.top, path.length === 0);
      if (i < 0 || !usable(i)) return;
      if (!path.length) { setPath([i]); sfx.tick(0); haptic('tick'); return; }
      const last = path[path.length - 1];
      if (i === last) return;
      if (path.length > 1 && i === path[path.length - 2]) { setPath(path.slice(0, -1)); haptic('tick'); return; }
      if (path.includes(i) || !adjacent(last, i)) return;
      setPath([...path, i]);
      sfx.tick(path.length - 1);
      haptic('tick');
    });
    const up = () => {
      if (!down) return;
      down = false;
      dragging = false;
      const w = word();
      if (path.length && opts.onWord) opts.onWord(w, path.slice());
      else api.clear();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  return api;
}
