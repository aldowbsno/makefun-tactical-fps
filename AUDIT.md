# FPS Entry Audit

Audited against `/root/makefun-fps-kit/threejs-fps-02-kit/RULES.txt` and the current game source on 2026-11-15. The official rules require a static offline three.js 0.187.0 FPS, real browser screenshots, 3-4 unmodified images at most 262144 bytes each, with a 480-pixel minimum side and 1280-pixel maximum side.

## Verified Findings

- `game/src/main.js` previously rendered a capture state twice, stopped its animation loop, then set `__shotReady` without checking the frame. `WebGLRenderer` did not retain its drawing buffer. This matched the judge report: `screenshots/live.png` is a 1280x720 navy HUD-only image. Continuous rendering, `preserveDrawingBuffer`, shader compilation, WebGL draw statistics, and sampled framebuffer color diversity now gate readiness.
- The old capture branch presented `ROUND SECURED` and a completed-transfer message for both `?shot=briefing` and `?shot=result`, without invoking `finish`. `captureMode` now supports only honest briefing, buy, and live states; legacy end/result requests fall back to briefing. A result can only be shown by a live `roundOutcome` followed by `rounds.finish`.
- The old player torso raycast box extended through the head sphere, so a head-level shot could register as torso damage. The torso proxy now ends below the separate head proxy. A match-level regression fires through that exact raycast setup and verifies the headshot kill and $450 reward.
- `objective.step` previously advanced disarm and fuse clocks independently for the whole timestep. A disarm completed on the same step as fuse expiration could also report a transfer. Objective events are now single and ordered, with disarm taking precedence on an exact tie. Objective range also checks height, so jumping above the relay cannot start a link.
- Round transitions had no state guards for starting or advancing rounds, purchases accepted invalid numeric costs, and rewards could be awarded outside a live round. The shared `createMatch` simulation now owns phase-guarded transitions, weapon and grenade purchases, combat, objective resolution, and full actor/equipment/input reset. The result UI only follows a successful live finish.
- Navigation selected the nearest open grid node even when a crate or corner separated it from the actor, and omitted the path from the actor to its first grid node. Routes now select a visible start node and include that first waypoint. Existing spawn, cover, and route tests pass.
- Visibility loss and blur cleared keyboard keys but could leave accumulated look deltas; keydown was also accepted without pointer lock. Input is now cleared on blur/hidden state and only captured while locked. Weapon reset also resets its viewmodel pose; simultaneous reload and fire resolves in favor of reload.
- `shots.json` pointed to obsolete `start/play/end` modes. It now describes the real briefing, requisition, and live capture states.

## Changes

- Extracted gameplay from the browser composition root into `game/src/match.js` so runtime state transitions and tests share the same implementation.
- Added `game/src/capture.js` and `scripts/capture.mjs`. The browser script waits for at least one WebGL draw with triangles and diverse scene pixels, captures direct browser JPEG output at an allowed size, and stages all three captures before replacing the managed screenshots. It exposes read-only match diagnostics only.
- Added regressions for blank framebuffer rejection, capture modes, objective/fuse ordering, phase guards, buy economy, round reset, match-level headshots, and result conditions. The suite now has 15 passing gameplay checks.

## Verification

- `node --loader ./tests/three-loader.mjs tests/gameplay.mjs` — passed, 15 checks.
- `node --check scripts/capture.mjs` and `node --check game/src/*.js` (run for every module) — passed.
- `git diff --check` — passed.
- `MAKEFUN_OUTPUT_DIR=/tmp/neon-audit-one node main.ts` and `MAKEFUN_OUTPUT_DIR=/tmp/neon-audit-two node main.ts`, then `diff -qr` — passed; both packages were byte-identical. A post-capture package run also passed.
- `cmp` of the bundled dossier library against the kit copy and SHA-256 checks for both vendored three.js files — passed before edits; no vendor files were changed.
- `node scripts/capture.mjs` — successfully run on the host. Its staged browser captures passed the WebGL, pixel-diversity, state, dimensions and byte-size checks before replacing the old PNGs. The resulting `briefing.jpg`, `buy.jpg`, and `live.jpg` are each 1200x675 and below 132 KiB; visual inspection confirms they show the dry dock, and the live screenshot shows a 0:0 live round with no result banner.
- A later direct rerun in this sandbox fails at the local HTTP server with `listen EPERM` on `127.0.0.1`; a direct Chrome launch also fails with `setsockopt: Operation not permitted`.

## Remaining Verification

The verified captures were made immediately before a final HUD cleanup that clears the stale “B · requisition during buy phase only” notice on deployment. The current live screenshot still includes that notice, although its score and phase are truthful. Rerun `node scripts/capture.mjs` on the host to make the live image match the final source; then rerun the package command. No submission, signing, commit, or push was performed.
