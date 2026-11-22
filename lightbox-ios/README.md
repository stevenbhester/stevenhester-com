# Lightbox for iPhone

A small native shell around the game in `../lightbox`, built the same way as the Robggle app (SwiftUI, a web view,
XcodeGen). The game's files are packed inside the app, so it runs with no connection and nothing is loaded from the
website. The shell adds the phone's haptics.

**This has not been built yet.** It was written without a Mac to compile it on, so expect to fix a first error or two.

## Run it on your phone

1. `brew install xcodegen` if you don't have it (Robggle uses it too).
2. Plug in the iPhone, unlock it, and run `lightbox-ios/install.sh`.

Or open it in Xcode: `cd lightbox-ios && xcodegen generate && open Lightbox.xcodeproj`, pick your phone, press Run.

## How it fits together

| File | What it does |
|---|---|
| `project.yml` | The project description XcodeGen turns into `Lightbox.xcodeproj`. It copies `../lightbox` into the app as a folder. |
| `Lightbox/LightboxApp.swift` | The app: one full-screen web view on the paper-coloured background. |
| `Lightbox/GameWeb.swift` | Hands the web view the bundled files under `lightbox://app/`, and plays haptics the game asks for. |

- **Changing the game** needs no Swift changes: edit `../lightbox`, then build again.
- **Trying game changes without rebuilding:** serve the site folder from your Mac (`python3 -m http.server 8765`) and add
  the launch argument `-liveURL http://<your Mac's address>:8765/lightbox/` to the scheme in Xcode.
- **A new build for TestFlight:** raise `CURRENT_PROJECT_VERSION` in `project.yml`, run `xcodegen generate`, then
  Product → Archive in Xcode and upload from the Organizer. Create the app in App Store Connect first, with bundle ID
  `com.stevenhester.lightbox`. `robggle/ios/TESTFLIGHT.md` has the full walk-through.

## If something goes wrong on the first build

- **`xcodegen` complains about `../lightbox`:** copy the folder to `lightbox-ios/Lightbox/lightbox` and change that
  source's path in `project.yml` to `Lightbox/lightbox` (keep `type: folder`).
- **A blank cream screen:** the web view could not find the files. In Xcode, check that the built app contains a
  `lightbox` folder with `index.html` in it. With a debug build you can also inspect the page from Safari's Develop menu.
- **Progress is not kept between launches:** tell me; saved progress relies on the web view keeping storage for the
  `lightbox://app` address, which I could not test.
