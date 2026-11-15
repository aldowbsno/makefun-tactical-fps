# makefun-tactical-fps

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/aldowbsno/makefun-tactical-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/aldowbsno/makefun-tactical-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Neon Breach is an original, offline three.js tactical FPS with squad combat, a relay objective, weapon requisitions, and round-based scoring.

## Run it

```sh
node serve.ts
```

Open http://localhost:8080 in desktop Chrome. The game uses bundled three.js 0.187.0 and needs no build step or network connection.

Package the game, screenshots, and canonical dossier locally:

```sh
MAKEFUN_OUTPUT_DIR=/tmp/neon-breach-output node main.ts
```

Run the gameplay checks:

```sh
node --loader ./tests/three-loader.mjs tests/gameplay.mjs
```

Capture genuine browser renders after the WebGL scene passes its framebuffer checks:

```sh
node scripts/capture.mjs
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=gnx4ex8z&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
