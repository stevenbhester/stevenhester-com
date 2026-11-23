# Lightbox: handoff

Written at the end of a cloud session that could not reach a Mac. Everything below is pushed to `main` of
`stevenbhester/stevenhester-com` (last commit: "Lightbox build 6"). Start a new session on the Mac in this repo.

## What Lightbox is

Two picture-logic games in one app, both built so a puzzle can always be finished by sure steps, never a guess.

- **Overlap**: see-through shapes that are each on or off. A number in a patch counts how many of the shapes covering
  it are on. While solving it looks abstract; each level hides a picture whose two to four big plain shapes are among
  the ones that end up on. Solving it fades in the real colours, then eyes, beaks and so on pop in ("It's a bear!").
- **Stained Glass**: a grid cut into panes, with row and column numbers for how many squares are lit. A pane is lit or
  dark as a whole. (This is the existing paper puzzle Tile Paint with a new look.)

Each mode has numbered levels (31 Overlap, 33 Stained Glass), an endless set (Sketches, Masks) and a daily puzzle.

## Where things are

| Path | What it is |
|---|---|
| `lightbox/` | The game: a web app with no build step. Live at stevenhester.com/lightbox/ (build 6). |
| `lightbox/README.md` | File-by-file guide, how to add levels, music and settings notes. |
| `lightbox-ios/` | The iPhone shell: SwiftUI + a web view, modelled on `robggle/ios`. **Never compiled.** |
| `lightbox-ios/README.md` | How to build, and the three most likely first-build problems. |
| `demo/index.html` | The original sketches page (One Trip, Nest, early Overlap and Stained Glass). |

## The job that is left: get it on two phones

1. `brew install xcodegen` if needed, plug in the iPhone, run `lightbox-ios/install.sh`.
2. Fix whatever the first build throws. Nothing in `lightbox-ios/Lightbox/*.swift` has been through a compiler.
3. For Erin's phone (not on a cable): create the app in App Store Connect with bundle ID `com.stevenhester.lightbox`,
   archive in Xcode, upload, add her as a TestFlight tester. `robggle/ios/TESTFLIGHT.md` has the steps used for Robggle.

Things to check on a real phone, because none of them could be tested in the cloud:

- **Files load**: the app serves `lightbox/` from inside the bundle under the made-up address `lightbox://app/`
  (`BundledFiles` in `GameWeb.swift`). A blank cream screen means the web view could not find them. `project.yml`
  copies `../lightbox` in as a folder reference; if XcodeGen objects, the README has the fallback.
- **Saved progress** survives closing and reopening the app (it relies on the web view keeping storage for that address).
- **Music plays** and loops. It is `lightbox/music.m4a`, decoded with Web Audio after the first tap. The test browser
  could not decode the format, so playback has never been heard.
- **Double-tap zoom** is gone. It was a long-running complaint on the web page; the app's web view should not zoom at all.
- **Haptics** fire on taps and wins.

Until the native app works, both phones can use the web app: open stevenhester.com/lightbox/ in Safari, then
Share → Add to Home Screen.

## Decisions made along the way, and why

- **Web app in a native shell, not Godot.** Robggle is built this way, it could be tested in a cloud browser, and
  Godot was not installed. The game's files are packed inside the app so it runs offline, which also covers the App
  Review risk noted in the Robggle notes for apps that are mostly a view of a website.
- **Overlap's pictures are hidden while solving.** Three versions were tried. Recognisable pictures made it trivial
  (you could see the picture and skip the numbers). Adding look-alike decoys made it busy without making it better.
  Pure abstract compositions played well but had no payoff. The current version keeps the abstract play and adds the
  reveal. About three shapes in five are on, some of them decoys that become a soft backdrop.
- **Numbers changing colour is a setting**, default "With a hint": testers found always-on colours made it too easy.
- **Hints are 3 per puzzle**; Restart wipes the puzzle and gives 3 more.
- **Stained Glass pane states** were restyled because a lit dark-coloured pane looked "off" and a lit pale one looked
  untouched: untouched is pale and hatched, dark is near-black with a cross, lit has a bright rim and a glint.
- **Music is original**, written by `lightbox/tools/make-music.py`: F major, 104 bpm, swung, walking bass, doo-wop
  chords with a minor-fourth bridge, soft chiptune lead. The brief was a contemplative take on Pokemon Yellow route
  music plus an electro-swing reference track (about 123 bpm, F major). Nothing is copied from either.
  **Nobody has listened to it yet**: it was checked by measurement only (clean loop seam, highs rolled off).

## Known weak spots

- **Overlap difficulty has a ceiling.** Each number covers at most three shapes, so most steps are simple. The last
  few levels need a harder step (comparing two numbers, or trying a shape and seeing a number break). If it is still
  too easy, the next idea is a new clue type: a line across the picture that counts the on-shapes it crosses.
- **Some pictures may be guessable from their outline**, most likely the bear (two ears) and the robot (stacked boxes).
- **The tutorial** (first two Overlap levels) repeats its speech bubble on multi-tap steps, the bubble can cover part
  of the board, and level 1 opens on a "3" rather than an easier "1" or "0".
- **No ads or purchases** are wired up. Extra hints without restarting is the natural rewarded-ad spot.
- **Progress is saved on the device only.**
- **"Lightbox" is a working title.** No app-store search has been done for the name or for either mechanic. A web
  search found nothing matching Overlap, and only one tiny Android app for the Tile Paint mechanic.
- **Demo ratings**: the `/demo` page posts ratings with game keys `lap`, `glass`, `trip`, `nest`. If the ratings
  server only accepts known keys, those need adding there.

## How to change things

- **Game code or levels**: edit under `lightbox/`, bump `BUILD` in `app.js`, `version.json` and the `?v=` numbers in
  `index.html`, push to `main`. GitHub Pages publishes in about a minute. The iPhone app picks changes up on its next build.
- **New Overlap picture**: add to `overlap-pictures.js`, run `node lightbox/tools/build-overlap.mjs`.
- **New Stained Glass window**: add to `glass-pictures.js`, run `node lightbox/tools/cut-glass.mjs`.
- **New music**: edit and run `python3 lightbox/tools/make-music.py`.
- **Testing**: there is no test suite in the repo. Each change was checked by serving the repo locally
  (`python3 -m http.server`) and replaying every level in a phone-sized headless browser, driving real taps from the
  game's own next-move logic (`window.lightbox.play.game.autoStep()`).
