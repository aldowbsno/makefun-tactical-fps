// Composition root: fixed-step gameplay, continuous rendering, and browser presentation.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { decorateWorld } from './scenery.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createMatch } from './match.js';
import { captureMode, pixelDiversity } from './capture.js';

const STEP = 1 / 60;
const capture = captureMode(location.search);
const status = { ready: false, frames: 0, calls: 0, triangles: 0, pixels: null, error: null };
window.__shotReady = false;
window.__renderStatus = status;

function fail(error) {
  status.ready = window.__shotReady = false;
  status.error = String(error?.message || error);
  document.getElementById('overlay').hidden = false;
  document.getElementById('overlay-title').textContent = 'RENDERER UNAVAILABLE';
  document.getElementById('overlay-copy').textContent = `The 3D scene could not render. ${status.error}`;
  document.getElementById('play').disabled = true;
  console.error(error);
}

async function boot() {
  let seed = 1729;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // Preserve the rendered buffer for asynchronous browser captures and framebuffer readback.
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  document.getElementById('game').append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.canvas);
  scene.fog = new THREE.Fog(PALETTE.canvas, 22, 55);
  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 100);
  scene.add(camera);
  const world = createWorld(scene);
  decorateWorld(scene);
  const hud = createHud();
  let match;
  match = createMatch({ scene, camera, world, random, notice: hud.notice, hit: hud.hitMarker,
    onFinish(win, reason) {
      if (document.pointerLockElement) document.exitPointerLock();
      hud.show('result', match.state.result, `${reason} · ${win ? '+$2200' : '+$1400'} round income.`, 'NEXT ROUND');
    },
  });
  const { state, equipment, objective, human, allies, enemies } = match;
  const input = createInput(renderer.domElement, locked => {
    if (state.phase !== 'live') return;
    if (locked) hud.hide();
    else hud.show('pause', 'LINK PAUSED', 'Simulation waits while the mouse is released.', 'RESUME');
  });
  function updateHud() {
    hud.setState(state, equipment, objective.text(human.position), allies.remaining() + Number(human.alive), enemies.remaining());
  }
  function requisition() {
    hud.show('buy', 'REQUISITION', 'Warden squad · 3 vs 3. Link relay A or eliminate Ember. Surviving equipment persists; a fallen operator receives a carbine and one frag.', 'DEPLOY NOW');
  }
  function briefing() {
    hud.show('briefing', 'NEON BREACH', 'The tidal relay is compromised. Lead Warden squad through the dry dock, link the amber relay, and hold off Ember until the transfer completes.', 'ENTER REQUISITION');
  }
  hud.onBuy(item => { match.buy(item); updateHud(); });
  hud.onPlay(() => {
    input.clear();
    if (state.phase === 'briefing' || state.phase === 'result') {
      if (match.beginRound()) requisition();
    } else {
      if (state.phase === 'buy') { match.rounds.deploy(); hud.notice(''); }
      hud.hide(); input.requestLock();
    }
    updateHud();
  });
  addEventListener('keydown', event => {
    if (event.repeat || state.phase !== 'buy') return;
    if (event.code === 'KeyB') requisition();
    const item = { Digit1: 'carbine', Digit2: 'marksman', Digit3: 'grenade' }[event.code];
    if (item) { match.buy(item); updateHud(); }
  });
  document.addEventListener('pointerlockerror', () => {
    if (state.phase === 'live') hud.show('pause', 'MOUSE CAPTURE REQUIRED', 'Chrome refused pointer lock. Click resume to retry, or allow mouse capture for this page.', 'RESUME');
  });
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); input.clear(); fail(new Error('WebGL context lost. Reload to restart.'));
  });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); status.ready = window.__shotReady = false;
  });

  // Read-only diagnostics expose state without any test-only state mutation controls.
  window.__gameAudit = () => ({ ...state, weapon: equipment.id, ammo: { ...equipment.weapon.state },
    objective: { ...objective.state }, position: match.player.state.position.toArray(),
    locked: input.state.locked, enemies: enemies.remaining(), allies: allies.remaining(), capture });
  window.__sceneProbe = () => {
    if (status.error || renderer.getContext().isContextLost()) return { visible: false };
    renderer.render(scene, camera);
    const gl = renderer.getContext(), width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.finish(); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    status.pixels = pixelDiversity(pixels, width, height);
    status.calls = renderer.info.render.calls; status.triangles = renderer.info.render.triangles;
    return status.pixels;
  };

  if (capture === 'buy' || capture === 'live') {
    match.beginRound();
    if (capture === 'live') { match.rounds.deploy(); hud.hide(); hud.notice(''); }
    else requisition();
  } else briefing();
  updateHud();
  await renderer.compileAsync(scene, camera);
  let last = performance.now(), accumulator = 0;
  function frame(now) {
    if (status.error) return;
    try {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const running = !capture && (state.phase === 'buy' || (state.phase === 'live' && input.state.locked));
      if (running && !document.hidden) {
        accumulator += dt;
        while (accumulator >= STEP) {
          const previous = state.phase, look = input.takeLook();
          match.step(STEP, { keys: input.state.keys, firing: input.state.firing, lookX: look.x, lookY: look.y });
          accumulator -= STEP;
          if (previous === 'buy' && state.phase === 'live' && !input.state.locked) {
            hud.show('pause', 'OPERATION READY', 'Requisition closed. Capture the mouse to begin.', 'RESUME');
            hud.notice('');
            accumulator = 0; break;
          }
          if (state.phase === 'result') { accumulator = 0; break; }
        }
        updateHud();
      } else accumulator = 0;
      renderer.render(scene, camera);
      status.frames++;
      if (!status.ready && status.frames >= 3) {
        const pixels = window.__sceneProbe();
        status.ready = window.__shotReady = pixels.visible && status.calls > 0 && status.triangles > 0;
      }
      requestAnimationFrame(frame);
    } catch (error) { fail(error); }
  }
  requestAnimationFrame(frame);
}
boot().catch(fail);
