# Testing and physical acceptance

The suite contains **40 unit/integration checks and 12 browser checks**. Current results are available in [GitHub CI](https://github.com/rojerm2/bostik-game/actions/workflows/ci.yml). Browser checks exercise the built subpath, real-model inference on synthetic video, CPU fallback, resource cleanup, synthetic calibration/controls, history restoration, a widescreen canvas camera, and offline restart.

Automated checks establish software behavior. A real camera opening and a model processing frames do not establish a child's gesture accuracy, comfort, or end-to-end latency. The first release remains **awaiting physical movement acceptance**.

## Reproduce software checks

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:browser
npm run build
```

The final build command restores a production artifact after the browser suite's isolated test build. Tests run at the actual `/bostik-game/` subpath. On Windows tests use installed Edge; on CI, Chromium. Browser tests require a localhost server, so a restricted execution environment may need localhost/process access.

Unit/integration coverage includes stable and incomplete calibration, normalized body sizes, mirrored coordinate direction, lane holds/dead zones/hysteresis/noise, jump/landing/rearm, squat-before-jump, simultaneous sideways jump, missing feet, hands gesture, confidence and timestamp failures, reacquisition, duration-based loss, input ownership, storage corruption/quota, late camera grants, camera errors and cleanup, single-flight inference invalidation, simulation pause/time gaps, multiple frame rates, collision windows, collection/invulnerability, deterministic generation and intentionally unsafe patterns. The route test checks 1,500 seeds at three speeds with 100 encounters per sequence.

The browser suite separates **synthetic observations** (deterministic recognition/game integration) from **fake camera video through the real model** (permission/stream/model/WASM/inference plumbing). Fake video contains no physical child and is not used to claim pose accuracy. It covers tutorial → countdown → play → pause/resume → game-over/restart, local best persistence, settings/mute, storage failure, resize/visibility, source conflicts, camera errors, model failure/retry, repeated teardown, ambiguity/reacquisition, outbound-request restrictions, and offline reload plus real model initialization. Test-only seams do not appear in ordinary UI.

## Available hardware check, 2026-10-26

Windows, Microsoft Edge **156.0.4314.42**, connected **HD User Facing** webcam. A real video stream opened at **640×480 / 24 FPS**, locally hosted lite model initialized and processed real webcam frames, and the camera track reported **ended** after Stop. No images, video, faces or landmarks were recorded. No available framed player was used; calibration reported missing reliable shoulders/hips. This is a camera pipeline check only.

Initial **CPU worker** snapshot with that real camera: **164 ms inference**, **167 ms software pipeline**, **5.4 pose updates/second**, **60 render FPS**. Real-model synthetic-video snapshots were about 142–152 ms and 6 pose Hz. These observations are below the 15 Hz tuning target, are not a minimum hardware specification, and are not physical-motion-to-screen latency. The worker bounds work to one frame and preserves rendering; a slower main-thread fallback caps inference at 6 Hz. An experimental GPU delegate initialized but failed during inference, stopped the session and reduced rendering to about 17 FPS on this environment. GPU inference is therefore not enabled in the delivered code; the successful CPU implementation is retained.

## Adult-run acceptance: pending

A separate 65-second synthetic-video model soak on the deployed HTTPS app stayed active. Under heavy local load it measured about 683 ms inference / 695 ms software pipeline / 1.4 pose Hz / 47 render FPS. At this latency, stale observations are suppressed and camera gameplay cannot be considered physically accepted. The normal unloaded webcam snapshot and this stressed run are distinct observations.

Later loaded-system browser runs measured about 184–225 ms inference and 4–5 pose Hz. Performance varies with load; use the complete range of observations when tuning, rather than treating the initial snapshot as a guarantee.

Record browser/device, camera/lighting/clothing, misses/false actions, comfortable sensitivity, session length, fatigue and software timing. Never record or commit identifying child captures.

- [ ] Clear floor space, secure camera, supervise, fit the intended child inside the guide and calibrate.
- [ ] Verify child-left → screen-left, child-right → screen-right, center return, and comfortable lean/step distances.
- [ ] Stand still for 30 seconds. Record false actions. Test slow/fast leaning and stepping without repeated transitions.
- [ ] Make 10 small jumps, 10 crouches, and 10 sideways jumps; count misses/doubles/false hops. Include a squat before a jump and repeated landings.
- [ ] Repeat under realistic lighting/clothing. Occlude feet briefly: hopping must turn off with a useful message, while available controls remain predictable. Test the explicitly selected hands alternative.
- [ ] Leave/re-enter the frame; bring a second person into view. Verify immediate gesture suppression, delayed simulation pause, stable reacquisition and explicit countdown resume. Check for similar-size/occlusion ambiguity limitations.
- [ ] Play a short practice and a longer session. Inspect responsiveness, heat, resource stability, collisions, child comfort and fatigue. Check repeated restart, setup, and camera selection.
- [ ] Physically unplug/reconnect a USB camera and recover. Deny permission, simulate busy camera, and retry. Automated error injection is a separate check.
- [ ] Background/restore the page while jumping/crouching; no stuck inputs, score gain while paused, large time steps or sudden collisions.
- [ ] Test the intended HDMI/TV arrangement. Record latency/comfort. Wireless casting latency remains unverified unless actually tested.
- [ ] If Android is desired, test Android Chrome on actual hardware. Desktop viewport emulation does not count.
- [x] Verify the actual HTTPS deployment URL and a warmed offline restart there, including model/WASM loading. Verified automatically at https://rojerm2.github.io/bostik-game/ with synthetic camera video; this does not establish physical movement accuracy.

Only the supervising adult can complete the intended-child checklist. Pending checks keep the development goal awaiting validation; they do not stop independent implementation and packaging.
