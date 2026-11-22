// Makes the numbered Overlap levels and writes overlap-levels.js. Run: node lightbox/tools/build-overlap.mjs
//
// Each level is an abstract composition from overlap.js's `compose`, made from a fixed seed so it is the same for
// everyone. The styles take turns and the levels grow: more shapes, then fewer spare numbers, then no giveaways.
// Every level is replayed here by sure steps alone, so none can need a guess.
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('../overlap-levels.js', import.meta.url));
if (!existsSync(out)) writeFileSync(out, 'export default [];\n');
const ov = await import('../overlap.js');
const { seeded, hash } = await import('../util.js');

const STYLES = ['scatter', 'discs', 'planes', 'circles', 'totem'];
// Shapes in each level, in order. The first four keep two spare numbers, the next six keep one, the next eight none,
// and the rest also drop every giveaway number they can.
const SIZES = [4, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12, 12];
const round = v => (typeof v === 'number' ? Math.round(v * 10) / 10 : Array.isArray(v) ? v.map(round) : v);

const rows = []; let bad = 0;
SIZES.forEach((n, i) => {
  const style = STYLES[i % STYLES.length], opts = i < 4 ? { spares: 2 } : i < 10 ? { spares: 1 } : i < 18 ? {} : { pairs: true };
  let c = null;
  for (let seed = 0; seed < 4 && !c; seed++) c = ov.compose(seeded(hash(`level:${i}:${seed}`)), style, n, { ...opts, tries: 4000 });
  // A style that is too crowded at this size hands over to the next one.
  for (let k = 1; k < STYLES.length && !c; k++) c = ov.compose(seeded(hash(`level:${i}:other${k}`)), STYLES[(i + k) % STYLES.length], n, { ...opts, tries: 4000 });
  if (!c) { bad++; console.log(`BAD level ${i + 1} (${style}, ${n} shapes): nothing came together`); return; }
  const shapes = c.raw.map(ov.make), plain = ov.playThrough(c.clues, shapes.length, false).ok, deep = ov.playThrough(c.clues, shapes.length, true);
  if (!deep.ok) { bad++; console.log(`BAD level ${i + 1}: cannot be finished`); return; }
  console.log(`${String(i + 1).padStart(2)} ${c.style.padEnd(8)} shapes ${String(shapes.length).padStart(2)}  on ${c.sol.filter(Boolean).length}  numbers ${String(c.clues.length).padStart(2)} (${c.clues.filter(k => k.over.length === 1).length} lone)  ${plain ? 'one number at a time' : `needs ${deep.hard} harder step${deep.hard === 1 ? '' : 's'}`}`);
  rows.push(`  { id: "c${i + 1}",${c.night ? ' night: true,' : ''} shapes: ${JSON.stringify(round(c.raw))},\n    sol: ${JSON.stringify(c.sol.map(Number))},\n    clues: ${JSON.stringify(c.clues.map(k => ({ x: k.x, y: k.y, d: k.d, over: k.over, v: k.v })))} },`);
});
if (bad) process.exit(1);
writeFileSync(out, `// Written by tools/build-overlap.mjs. Do not edit by hand.\nexport default [\n${rows.join('\n')}\n];\n`);
