# Lightbox

Two picture-logic games in one web app, served at `/lightbox/`. No build step: plain JavaScript modules.

- **Overlap**: see-through shapes that are each on or off. Numbers count how many of the shapes covering a spot are on.
- **Stained Glass**: a window cut into panes. Row and column numbers count the lit squares. A pane is lit or dark as a whole.

Each mode has drawn pictures, an endless set (Totems, Masks) and a daily puzzle. Every puzzle is checked so it can be
finished by sure steps, with no guessing. Overlap gets harder as it goes: later pictures have more look-alike decoys and
need two numbers compared, or a shape tried out, before anything is certain.

The iPhone app in `../lightbox-ios` packs this folder inside it.

## Files

| File | What it holds |
|---|---|
| `app.js` | Screens, saved progress, daily puzzles, hints, sound |
| `overlap.js` | Overlap rules, number choosing, the Totem generator, drawing |
| `overlap-scenes.js` | The Overlap pictures, as drawn |
| `overlap-levels.js` | Written by `tools/build-overlap.mjs`; do not edit by hand |
| `glass.js` | Stained Glass rules, pane cutting, the Mask generator, drawing |
| `glass-pictures.js` | The Stained Glass pictures, as pixel grids |
| `glass-levels.js` | Written by `tools/cut-glass.mjs`; do not edit by hand |

## Adding pictures

- **Overlap**: add a scene to `overlap-scenes.js`, then run `node lightbox/tools/build-overlap.mjs`. It adds the
  look-alike decoys, chooses the numbers and rewrites `overlap-levels.js`. The `PLAN` table at the top of that tool sets
  how hard each picture is by its place in the list.
- **Stained Glass**: add a grid to `glass-pictures.js`, then run `node lightbox/tools/cut-glass.mjs`
  to cut it into panes and rewrite `glass-levels.js`.

## Not done yet

- Hints refill for free. The refill pop-up marks where a rewarded ad would go.
- Progress is saved on the device only.
- On the website the app needs a connection to load. The iPhone app does not.
- Bump `BUILD` in `app.js`, `version.json` and the `?v=` numbers in `index.html` on each release, so phones pick up the new files.
