# Third-party notices

Pip, Sunbeam Meadow, procedural shapes, level generation, and synthesized audio are original project assets, licensed with the project under MIT. No Subway Surfers assets, names, audio, or level designs are included. Fonts use the device's system font stack.

| Component | Version | License | Source |
| --- | --- | --- | --- |
| Phaser | 4.2.1 | MIT, Copyright 2026 Richard Davey, Phaser Studio Inc. | https://github.com/phaserjs/phaser |
| MediaPipe Tasks Vision JavaScript and WASM | 1.1.1 | Apache-2.0, Google LLC | https://github.com/google-ai-edge/mediapipe/tree/v1.1.1 |
| Pose Landmarker Lite, float16, model revision 1 | revision 1 | Apache-2.0, Google LLC | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task |

Full licenses are in `licenses/` and are copied into the distributable under `licenses/`. Model and WASM are redistributed unmodified, verified by the SHA-256 checksums in `scripts/vision-assets.lock.json`. The model contains the pose detector and BlazePose GHUM landmark model. Model documentation: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker and https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf.

Google's maintainer confirmed the Web SDK's Apache-2.0 license and the corresponding versioned pose bundle redistribution license in https://github.com/google-ai-edge/mediapipe/issues/6306. MediaPipe 1.1.1 attempts performance/usage telemetry. Bostik's page and worker both enforce a same-origin, static-GET-only network boundary before model initialization, and its page also has a restrictive CSP. No MediaPipe telemetry is allowed to leave this application. The browser suite checks actual requests through repeated model sessions. This boundary must remain in place when upgrading MediaPipe.

Development/build dependencies are resolved by `package-lock.json`; their licenses remain with their npm packages. They are not separate runtime services. No runtime CDN, cloud inference, advertising, or analytics endpoint is used.
