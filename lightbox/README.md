# Lightbox

Two picture-logic games in one web app, served at `/lightbox/`. No build step: plain JavaScript modules.

- **Overlap**: see-through shapes that are each on or off. Numbers count how many of the shapes covering a spot are on.
- **Stained Glass**: a window cut into panes. Row and column numbers count the lit squares. A pane is lit or dark as a whole.

While it is being solved an Overlap puzzle looks like an abstract composition, and the numbers are the only way in. Each
numbered level hides a picture: its few big plain shapes are among the ones that end up on, and solving it brings in the
real colours and the details (eyes, beaks, stripes) so the picture appears. Stained Glass has drawn windows. Each mode
also has an endless set (Sketches, Masks) and a daily puzzle. Every puzzle is checked so it can be finished by sure steps,
with no guessing.

The iPhone app in `../lightbox-ios` packs this folder inside it.

## Files

| File | What it holds |
|---|---|
| `app.js` | Screens, saved progress, daily puzzles, hints, sound |
| `overlap.js` | Overlap rules, the composition styles, number choosing, drawing |
| `overlap-pictures.js` | The hidden pictures: core shapes and the details added at the reveal |
| `overlap-levels.js` | Written by `tools/build-overlap.mjs`; do not edit by hand |
| `glass.js` | Stained Glass rules, pane cutting, the Mask generator, drawing |
| `glass-pictures.js` | The Stained Glass pictures, as pixel grids |
| `glass-levels.js` | Written by `tools/cut-glass.mjs`; do not edit by hand |

## Adding levels

- **Overlap**: add a picture to `overlap-pictures.js` (a few big `core` shapes plus `extras` for the reveal), then run
  `node lightbox/tools/build-overlap.mjs`. It adds the abstract decoys, chooses the numbers and rewrites
  `overlap-levels.js`. Keep the core to two to four plain shapes: the plainer they are, the less the outline gives away.
- **Stained Glass**: add a grid to `glass-pictures.js`, then run `node lightbox/tools/cut-glass.mjs`
  to cut it into panes and rewrite `glass-levels.js`.

## Not done yet

- Hints refill for free. The refill pop-up marks where a rewarded ad would go.
- Progress is saved on the device only.
- On the website the app needs a connection to load. The iPhone app does not.
- Bump `BUILD` in `app.js`, `version.json` and the `?v=` numbers in `index.html` on each release, so phones pick up the new files.
