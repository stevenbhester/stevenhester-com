// Makes the numbered Overlap levels from overlap-pictures.js and writes overlap-levels.js.
// Run: node lightbox/tools/build-overlap.mjs
//
// Each level hides one picture. Its core shapes are the ones that end up on; this adds abstract decoys around them
// (overlap.js's `compose`), gives every shape an unrelated colour to solve in, and chooses the numbers. Levels grow:
// more decoys, then fewer spare numbers, then no giveaways. Each is replayed by sure steps alone, so none needs a guess.
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('../overlap-levels.js', import.meta.url));
if (!existsSync(out)) writeFileSync(out, 'export default [];\n');
const ov = await import('../overlap.js');
const { PICTURES } = await import('../overlap-pictures.js');
const { seeded, hash } = await import('../util.js');

// Shapes in each level, decoys included, by its place in the list. The first four keep two spare numbers, the next six
// keep one, the next six none, and the rest also drop every giveaway number they can.
const SIZES = [6, 6, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 13, 13, 13, 13, 13, 13, 13, 13, 13];
const round = v => (typeof v === 'number' ? Math.round(v * 10) / 10 : Array.isArray(v) ? v.map(round) : v);

const rows = []; let bad = 0;
PICTURES.forEach((P, i) => {
  const n = Math.max(SIZES[Math.min(i, SIZES.length - 1)], P.core.length * 2), opts = i < 4 ? { spares: 2 } : i < 10 ? { spares: 1 } : i < 16 ? {} : { pairs: true };
  const cores = P.core.map(a => a.slice(0, -1));
  let c = null;
  for (let seed = 0; seed < 10 && !c; seed++) c = ov.compose(seeded(hash(`${P.id}:${seed}`)), 'scatter', n, { ...opts, cores, tries: 3000 });
  if (!c) { bad++; console.log(`BAD ${P.id}: no layout came together`); return; }
  const shapes = c.raw.map(ov.make), plain = ov.playThrough(c.clues, shapes.length, false).ok, deep = ov.playThrough(c.clues, shapes.length, true);
  if (!deep.ok) { bad++; console.log(`BAD ${P.id}: cannot be finished`); return; }
  // Match each of the picture's shapes to where it ended up, to recolour it and to draw them in their own order.
  const same = (a, b) => JSON.stringify(round(a)) === JSON.stringify(round(b));
  const order = cores.map(core => c.raw.findIndex((a, k) => c.sol[k] && same(a.slice(0, -1), core)));
  if (order.includes(-1) || new Set(order).size !== order.length) { bad++; console.log(`BAD ${P.id}: lost track of the picture's shapes`); return; }
  const cols = {}; order.forEach((k, j) => { cols[k] = P.core[j].at(-1); });
  console.log(`${String(i + 1).padStart(2)} ${P.id.padEnd(9)} shapes ${String(shapes.length).padStart(2)}  on ${c.sol.filter(Boolean).length} (${cores.length} in the picture)  numbers ${String(c.clues.length).padStart(2)} (${c.clues.filter(k => k.over.length === 1).length} lone)  ${plain ? 'one number at a time' : `needs ${deep.hard} harder step${deep.hard === 1 ? '' : 's'}`}`);
  rows.push(`  { id: ${JSON.stringify(P.id)}, name: ${JSON.stringify(P.name)},${P.bg ? ` bg: ${JSON.stringify(P.bg)},` : ''}\n    shapes: ${JSON.stringify(round(c.raw))},\n    sol: ${JSON.stringify(c.sol.map(Number))}, order: ${JSON.stringify(order)}, cols: ${JSON.stringify(cols)},\n    clues: ${JSON.stringify(c.clues.map(k => ({ x: k.x, y: k.y, d: k.d, over: k.over, v: k.v })))},\n    extras: ${JSON.stringify(round(P.extras))} },`);
});
if (bad) process.exit(1);
writeFileSync(out, `// Written by tools/build-overlap.mjs from overlap-pictures.js. Do not edit by hand.\nexport default [\n${rows.join('\n')}\n];\n`);
