// Cuts every Stained Glass picture into panes and writes glass-levels.js. For each picture it tries thousands of random
// cuts and keeps the chunkiest one that can be finished one line at a time. Run: node lightbox/tools/cut-glass.mjs
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('../glass-levels.js', import.meta.url));
if (!existsSync(out)) writeFileSync(out, 'export default [];\n');
const { bestCut } = await import('../glass.js');
const { PICTURES } = await import('../glass-pictures.js');
const rows = [];
for (const P of PICTURES) {
  const N = P.pic.length;
  if (P.pic.some(r => r.length !== N)) throw new Error(`${P.id}: every row must be ${N} long`);
  const pane = bestCut(P.pic, 4000);
  if (!pane) throw new Error(`${P.id}: no cut can be finished line by line`);
  console.log(`${P.id.padEnd(10)} ${N}x${N}  ${Math.max(...pane) + 1} panes`);
  rows.push(`  { id: ${JSON.stringify(P.id)}, label: ${JSON.stringify(P.label)}, pic: ${JSON.stringify(P.pic)},\n    panes: ${JSON.stringify(pane)} },`);
}
writeFileSync(out, `// Written by tools/cut-glass.mjs from glass-pictures.js. Do not edit by hand.\nexport default [\n${rows.join('\n')}\n];\n`);
