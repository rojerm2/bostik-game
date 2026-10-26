# Architecture

The page is TypeScript/Vite, menus are semantic HTML, and the original perspective meadow is drawn with Phaser Graphics. Quiet sounds use short Web Audio oscillators after a user action. There are no downloaded fonts, art, or audio services.

| Boundary | Module | Contract |
| --- | --- | --- |
| Permission and devices | `src/tracking/camera.ts` | Video only, selected device, epoch cancellation, ended-track notification, idempotent stop |
| Model and observations | `pose-model.ts`, `pose.worker.ts`, `pipeline.ts` | Timestamped normalized body observations; CPU worker, bounded work, lower-rate main-thread fallback |
| Calibration and recognition | `gestures.ts` | Stable standing baseline; duration-based filters, lane position, independent jump/duck state machines |
| Input ownership | `src/input.ts` | Exactly one selected source; held lane/duck and one-shot jump; clear on interruption |
| Deterministic game | `src/game/simulation.ts` | Seeded patterns, 120 Hz fixed steps, swept crossings, score, hearts, pause |
| Rendering and flow | `src/game/scene.ts`, `src/main.ts` | Original shapes, wizard, tutorial, countdown, parent settings, safe resume |

## Coordinates and time

Observations use `performance.now()` milliseconds and strictly increasing timestamps within each session. `pose-model.ts` mirrors raw model x once (`1 - x`). The preview video is mirrored with CSS; overlay landmarks already use screen coordinates. Increasing x therefore moves Pip screen-right. Synthetic fixtures directly use this final coordinate convention. Foot points are the model's ankle landmarks (27/28), used as visible foot evidence.

Torso size is the vertical shoulder-to-hip separation. Lane offset is hip-center displacement divided by calibrated torso size, then an exponential filter with a 75 ms time constant. Default lane entry is 0.42 torso units, exit is 0.23; sensitivity scales both. Holding a side updates the same desired lane rather than issuing repeated relative changes.

Calibration needs at least 1.4 seconds of stable, reliable samples, at least eight observations, valid shoulders/hips, and visible feet unless the hands gesture was explicitly selected. Movement, incomplete framing, ambiguity and large gaps reject/restart collection. Baselines are not persisted.

Jump detection needs a rising torso and rising feet followed by sustained relative lift. Grounded/airborne/recovery states allow one trigger per landing, with 220 ms of stable grounded evidence to rearm. Crouching alone moves downward and cannot satisfy a jump. Crouch has separate duration-based entry/release, and horizontal movement remains independent of jumping. The alternative requires both visible hands above the shoulders for 160 ms, then lowered hands to rearm.

Invalid/low-confidence torso data immediately clears inputs. Missing feet disable only the physical hop; lane/duck remain available with an explanatory status. Out-of-order, nonfinite, future or >250 ms stale observations cannot trigger actions. Any interruption requires 600 ms stable standing before new gestures. After 500 ms tracking loss (configurable), simulation pauses and stays paused until explicit confirmation and a visible countdown. An empty result stream also triggers the timeout. Page visibility/blur pauses and clears held inputs.

## Inference and resource ownership

The pinned MediaPipe loader uses `importScripts`, so Vite produces a **classic IIFE worker** with a CPU delegate. If the worker cannot initialize, the page uses CPU at at most 6 Hz. The parent setting caps ordinary inference at 8 or 15 Hz; it is a ceiling, not a promised rate. A GPU experiment on the available Windows/Edge environment failed during inference and reduced rendering responsiveness, so it is not enabled in this release.

`SingleFlight` has no waiting queue. Capture begins only when idle, on a fresh video frame. At most one bitmap/inference is in flight. Dropped offers are not buffered. Bitmaps close in `finally`; transferred bitmaps also close in the worker. Session invalidation prevents late results from applying. Worker termination releases worker/model resources; fallback models close explicitly. Camera grants arriving after cancellation are stopped before attachment. No frame, landmark array or personal body measurement is logged or stored.

Diagnostics report model execution time, capture-to-result software time, observed update frequency and render FPS. They do not measure the camera sensor's latency, display scanout, physical motion or HDMI/casting latency.

## Fairness and timing

Every row reserves a clear lane; the certified lane changes by at most one lane per row. Encounter spacing is 2.8–3.3 seconds at the current fixed difficulty speed. The validator independently rejects blocking that lane or spacing below a conservative 1.8-second reaction allowance plus 0.22 seconds per lane traversed. This is a guaranteed achievable route, not a guarantee that any choice the player makes will be safe.

Simulation uses fixed 1/120-second steps and swept distance crossings, including frames spanning an obstacle. It freezes elapsed time, movement, scoring, invulnerability and obstacles on pause. Wall-clock gaps over 250 ms are discarded. Three hearts and two-second invulnerability soften collisions. Object and event lists are bounded by the visible region and per-frame drains. Patterns are finite (512 encounters, roughly 25 minutes); after those, the track becomes a calm collectible-free run rather than spawning unsafe content.

## Network and persistence

Only settings and best score enter localStorage. Reads, validation and writes tolerate denied access, corrupt data and quota failures. Model/WASM retrieval happens at installation/build with reviewed SHA-256 checksums. Production runtime URLs are all under Vite's base path. MediaPipe usage telemetry is blocked by `privacy.ts` in both execution contexts, plus page CSP. The browser suite asserts only same-origin static GET requests. No service worker runtime caching of arbitrary requests is used.

The service worker installs its complete cache atomically; partial installs are removed. Static cache lookup ignores response `Vary` because these assets are identical for all request origins. A failed navigation falls back to the cached index. An update waits rather than replacing the active page's assets mid-session. The ordinary production build does not expose the test seam.
