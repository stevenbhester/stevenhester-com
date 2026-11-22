// Checks every Overlap picture: it must be finishable one sure step at a time, every shape must have a spot where a tap
// reaches it, and no point may sit under more than four shapes. Run: node lightbox/tools/check-overlap.mjs
import * as ov from '../overlap.js';
import { SCENES } from '../overlap-scenes.js';
let bad = 0;
SCENES.forEach((S, i) => {
  const g = ov.makeLevel(i), n = g.shapes.length, P = ov.patches(g.shapes, 99);
  let depth = 0; P.forEach(p => { let c = 0, m = p.mask; while (m) { c += m & 1; m >>>= 1; } depth = Math.max(depth, c); });
  const tap = g.shapes.map(() => 0);
  for (let y = 1; y < ov.H; y += 2) for (let x = 1; x < ov.W; x += 2) { let b = -1; g.shapes.forEach((s, k) => { if (ov.inside(s, x, y) && (b < 0 || s.area < g.shapes[b].area)) b = k; }); if (b >= 0) tap[b]++; }
  const ok = g.clues && depth <= 4 && Math.min(...tap) * 4 >= 300 && n <= 30;
  if (!ok) bad++;
  console.log(`${ok ? 'ok ' : 'BAD'} ${S.id.padEnd(11)} shapes ${String(n).padStart(2)}  depth ${depth}  numbers ${g.clues ? g.clues.length : 'cannot be finished'}  smallest tap area ${Math.min(...tap) * 4}px`);
});
process.exit(bad ? 1 : 0);
