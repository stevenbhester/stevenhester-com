// Turns the pictures in overlap-scenes.js into levels and writes overlap-levels.js.
// Run: node lightbox/tools/build-overlap.mjs
//
// For each picture it adds look-alike decoys (shifted, resized copies of the picture's own parts, so the outline alone
// does not give the picture away), then chooses the numbers. Later pictures get more decoys and fewer numbers, and must
// need at least a set count of two-number steps. Every level is checked: it can be finished by sure steps, every shape
// has a roomy spot to tap, and no point sits under more than four shapes.
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('../overlap-levels.js', import.meta.url));
if (!existsSync(out)) writeFileSync(out, 'export default [];\n');
const ov = await import('../overlap.js');
const { SCENES } = await import('../overlap-scenes.js');
const { seeded, hash, between, pick } = await import('../util.js');

// How hard each picture is, by its place in the list: [look-alike decoys, harder steps needed, spare numbers].
const PLAN = [[2, 0, 1], [3, 0, 0], [4, 1, 0], [5, 1, 0], [5, 2, 0], [6, 2, 0], [6, 2, 0], [7, 3, 0], [7, 3, 0], [8, 3, 0],
  [8, 3, 0], [8, 4, 0], [9, 4, 0], [9, 4, 0], [9, 4, 0], [10, 5, 0], [10, 5, 0], [10, 5, 0]];
const MOST = 20;   // shapes in one picture, look-alikes included: more than this is too crowded to read
const round = v => Math.round(v * 10) / 10;

// A decoy that looks like it belongs: a copy of one of the picture's parts, moved, resized and recoloured.
function echo(raw, R) {
  const parts = raw.filter(a => a[0][0] !== '-' && ov.make(a).area < 22000);
  const base = parts[pick(R, parts.length)], k = base[0], size = Math.sqrt(ov.make(base).area);
  const dist = Math.min(80, Math.max(26, between(R, 0.35, 0.8) * size)), dir = R() * Math.PI * 2, dx = Math.cos(dir) * dist, dy = Math.sin(dir) * dist, s = between(R, 0.85, 1.15);
  const col = parts[pick(R, parts.length)].at(-1);
  if (k === 'c') return ['-c', round(base[1] + dx), round(base[2] + dy), round(base[3] * s), col];
  if (k === 'p') {
    const cx = base[1].reduce((t, p) => t + p[0], 0) / base[1].length, cy = base[1].reduce((t, p) => t + p[1], 0) / base[1].length, turn = between(R, -0.5, 0.5), c = Math.cos(turn), n = Math.sin(turn);
    return ['-p', base[1].map(([x, y]) => [round(cx + dx + ((x - cx) * c - (y - cy) * n) * s), round(cy + dy + ((x - cx) * n + (y - cy) * c) * s)]), col];
  }
  return ['-' + k, round(base[1] + dx), round(base[2] + dy), round(base[3] * s), round(base[4] * s), round(base[5] + between(R, -0.4, 0.4)), col];
}

// Shapes that can be played: nothing under more than four shapes, every shape with a roomy patch, and, since a tap goes
// to the smallest shape under it, enough area where each shape is the smallest. Returns the roomy patches, or null.
function playable(shapes) {
  const P = ov.patches(shapes, 4); if (!P) return null;
  // Roomy patches can each hold a number. Where two would sit too close to read, the roomier one keeps its place.
  const big = [];
  for (const p of P.filter(p => p.d >= 3).sort((a, b) => b.d - a.d)) if (!big.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 21)) big.push(p);
  if (shapes.some((s, k) => !big.some(p => p.mask >> k & 1))) return null;
  const tap = shapes.map(() => 0);
  P.forEach(p => { const over = ov.bits(p.mask); tap[over.reduce((a, b) => (shapes[b].area < shapes[a].area ? b : a))] += p.size; });
  return Math.min(...tap) < 450 ? null : { big, tap: Math.min(...tap) };
}
const inFrame = s => { const b = ov.bounds(s); return b[0] >= 4 && b[1] >= 4 && b[2] <= ov.W - 4 && b[3] <= ov.H - 4; };

// Number sets that fall out of chooseClues can usually be finished one number at a time. This swaps numbers in and
// out, keeping any swap that still finishes the picture but needs more two-number steps, until `need` is reached.
function harden(clues, all, n, need, R) {
  let cur = clues, hard = ov.playThrough(cur, n, true).hard;
  for (let t = 0; t < 1500 && hard < need; t++) {
    const drop = cur[pick(R, cur.length)], spare = all.filter(c => !cur.includes(c)); if (!spare.length) break;
    const next = cur.filter(c => c !== drop).concat(spare[pick(R, spare.length)]);
    if (R() < 0.3 && spare.length > 1) next.push(spare[pick(R, spare.length)]);
    if (new Set(next).size !== next.length || next.length > clues.length + 1) continue;
    const r = ov.playThrough(next, n, true);
    if (r.ok && r.hard >= hard) { cur = next; hard = r.hard; }
  }
  return { clues: cur, hard };
}

const rows = []; let bad = 0;
SCENES.forEach((S, i) => {
  const [planned, need, spares] = PLAN[Math.min(i, PLAN.length - 1)], echoes = Math.max(2, Math.min(planned, MOST - S.s.length));
  let best = null;
  for (let g = 0; g < 40 && !(best && best.hard >= need); g++) {
    const R = seeded(hash(S.id) + g), raw = S.s.slice();
    let geo = playable(raw.map(ov.make));
    if (!geo) { console.log(`BAD ${S.id}: the picture itself is not playable`); break; }
    // Add look-alikes one at a time, keeping each only if the picture stays playable.
    for (let e = 0; e < echoes; e++) for (let t = 0; t < 120; t++) {
      const a = echo(S.s, R); if (!inFrame(ov.make(a))) continue;
      const next = playable([...raw, a].map(ov.make));
      if (next) { raw.push(a); geo = next; break; }
    }
    const shapes = raw.map(ov.make), sol = raw.map(a => a[0][0] !== '-');
    // Several goes at choosing the numbers, keeping the set that needs the most two-number steps.
    const all = geo.big.map(p => { const over = ov.bits(p.mask); return { x: p.x, y: p.y, d: p.d, over, v: over.filter(k => sol[k]).length }; });
    for (let c = 0; c < (need ? 4 : 1) && !(best && best.hard >= need); c++) {
      const first = ov.chooseClues(shapes, sol, geo.big, R, { pairs: need > 0, spares }); if (!first) continue;
      // chooseClues makes its own copies of the numbers, so match them back to the full list before swapping.
      const mine = first.map(f => all.find(a => a.x === f.x && a.y === f.y));
      const { clues, hard } = need ? harden(mine, all, shapes.length, need, R) : { clues: first, hard: 0 }, added = raw.length - S.s.length;
      if (!best || hard > best.hard || (hard === best.hard && added > best.added)) best = { raw, sol, clues, hard, added, n: shapes.length, tap: geo.tap };
    }
  }
  if (!best) { bad++; console.log(`BAD ${S.id}: no level found`); return; }
  console.log(`${String(i + 1).padStart(2)} ${S.id.padEnd(11)} shapes ${String(best.n).padStart(2)} (${best.added} of ${echoes} look-alikes)  numbers ${String(best.clues.length).padStart(2)}  harder steps ${best.hard}${best.hard < need ? ` (wanted ${need})` : ''}  smallest tap area ${best.tap}px`);
  rows.push(`  { id: ${JSON.stringify(S.id)}, name: ${JSON.stringify(S.name)},${S.night ? ' night: true,' : ''}\n    shapes: ${JSON.stringify(best.raw.map(a => [a[0].replace('-', ''), ...a.slice(1).map(v => (typeof v === 'number' ? round(v) : v))]))},\n    sol: ${JSON.stringify(best.sol.map(Number))},\n    clues: ${JSON.stringify(best.clues.map(c => ({ x: c.x, y: c.y, d: c.d, over: c.over, v: c.v })))} },`);
});
if (bad) process.exit(1);
writeFileSync(out, `// Written by tools/build-overlap.mjs from overlap-scenes.js. Do not edit by hand.\nexport default [\n${rows.join('\n')}\n];\n`);
