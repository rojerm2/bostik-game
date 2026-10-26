# Bostik Game

Little steps. Big adventures. Help Pip the fox explore Sunbeam Meadow by stepping left and right, making little hops, and crouching under leafy arches. An original, gentle three-lane runner for a young child and a supervising adult.

**[Play Bostik Game](https://rojerm2.github.io/bostik-game/)** — HTTPS deployment verified on 2026-10-26, including keyboard gameplay and a warmed offline restart with real model inference on fake camera video. Intended-child physical acceptance remains pending.

## Play locally

Use Node.js 24+ and a current Chrome or Edge on Windows:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/bostik-game/**. `npm ci` retrieves the revision-pinned pose model and copies the version-pinned WASM files. Their checksums are verified before building. The first install requires internet access; the running game requests only its own static assets.

For the packaged app:

```sh
npm run build
npm run preview
```

Open **http://127.0.0.1:4173/bostik-game/**. Never open `dist/index.html` directly from the filesystem.

## Get moving

1. Clear floor space and secure the camera near the screen. Have an adult supervise setup. HDMI from a Windows laptop to a TV is a useful home arrangement.
2. Choose **Practice trail** or **Easy adventure**, then **Let's move**. Allow the camera, select a device if necessary, and put the whole body inside the guide.
3. Stand still in the middle for calibration. Try all four moves before starting. Step or lean comfortably; returning to center returns Pip to center. The camera preview behaves like a mirror.
4. Make a small hop over a log. Crouch and hold to go under leaves. If the camera cannot see both feet, hopping is disabled; explicitly select **Raise both hands** in Parent corner, then recalibrate.
5. Tracking loss pauses the game after 0.5 seconds by default. Return to a stable standing pose, choose **Continue adventure**, and wait for the countdown.

Keyboard mode: hold **Left/Right** or **A/D** for the corresponding lane; release for center. **Up**, **W**, or **Space** hops. Hold **Down/S** to crouch. **P/Escape** pauses. Large on-screen buttons are available in keyboard mode. Input modes never compete. Parent corner adjusts sensitivity, hop gesture, difficulty, sound, scene detail, inference rate and loss timeout.

Three hearts and a gentle protective bubble make bumps forgiving. Practice introduces lanes, then hops, then crouches before mixing obstacles. Every generated encounter has a conservatively reachable clear route. Collect stars, try again, and save a local best score.

## Privacy and offline use

Frames and landmarks stay in memory on the device. No recordings, microphone, accounts, backend, analytics, or cloud inference. Only preferences and best score are stored. Returning home, stopping the camera, or leaving camera mode stops tracks and inference. No personal camera fixtures are checked in.

MediaPipe 1.1.1 includes usage telemetry. The app and worker enforce local-asset GETs only, blocking that telemetry before it can make a network request. CSP also restricts the page. Do not remove these boundaries when upgrading dependencies. See [third-party notices](THIRD_PARTY_NOTICES.md).

The production app precaches HTML, JavaScript, art, **model and WASM**. Wait for **Ready for offline adventures** before disconnecting. A warmed installation is tested with networking disabled and real model initialization. Browser eviction or clearing site data can require another online visit. Updates wait for existing tabs to close; reload/reopen to use the new version. There is no claim of offline camera permission bypass.

## Build and verify

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

On Windows the browser suite uses installed Edge; CI uses Chromium. Set `CI=1` to use Playwright Chromium locally. The suite builds at `/bostik-game/` and checks the actual packaged application. Its observation replay seam is enabled only in the browser test build, never in the ordinary production UI. `npm run build` restores an ordinary distributable after browser tests. `npm run check` runs lint, typecheck, unit tests and production build. `npm run format` formats project source.

See [testing and adult acceptance](docs/TESTING.md), [architecture](docs/ARCHITECTURE.md), and [deployment](docs/DEPLOYMENT.md).

Development tracking playground: with `npm run dev`, open `http://127.0.0.1:5173/bostik-game/?playground=1`. It runs synthetic calibration and exposes center/left/right/hop/crouch, confidence and ambiguity scenarios through the real recognizer, with Pip responding in the movement tutorial. This developer panel is excluded from the production build.

## Support and limitations

- Primary: current desktop Chrome/Edge, Windows laptop, built-in or USB webcam, landscape display. Android is secondary and requires a real-device playtest; desktop emulation does not establish Android support.
- Camera access requires **HTTPS or localhost**. An ordinary HTTP LAN address is not a secure context. Allow camera permission in site settings; close other camera apps if it is busy. Missing/corrupt assets show a retry path; run `npm run assets` to repair local assets.
- Tracking uses the lite model with up to two poses. Two reliable torsos pause controls. Geometric continuity prefers the calibrated player, but this is not biometric identity recognition: an occluded second person or a similar-sized replacement can evade detection. Keep only one player in view and recalibrate after camera/player changes.
- Stillness, foot visibility, lighting, clothing, and comfortable sensitivity require physical tuning. Camera startup/inference on the available webcam is verified; **intended-child movement acceptance remains pending**. TV/HDMI and Android hardware are also unverified. The release goal remains awaiting that acceptance.
- Performance numbers and their limits are in [testing](docs/TESTING.md). No physical motion-to-screen latency or minimum hardware specification is promised.

Project code and original assets: MIT. MediaPipe/model/WASM: Apache-2.0. Phaser: MIT. Full redistribution licenses are included in source and the build.
