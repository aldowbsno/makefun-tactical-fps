// Composition root: fixed-step gameplay is separate from frame rendering and DOM events.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createTargets } from './targets.js';
import { createHud } from './hud.js';
import { createRounds } from './rounds.js';
import { createNavigation } from './navigation.js';
import { createObjective } from './objective.js';
import { createArsenal, WEAPONS } from './arsenal.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createGrenades } from './grenades.js';
import { decorateWorld } from './scenery.js';

const STEP = 1 / 60;
const capture = new URLSearchParams(window.location.search).get('shot');
let seed = 1729;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
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
const navigation = createNavigation(world.colliders);
const player = createPlayer(world.colliders);
const hud = createHud();
const rounds = createRounds();
const state = rounds.state;
const equipment = createArsenal(camera);
const objective = createObjective(scene);
const enemies = createTargets(scene, { spawns: [[-6, -9], [6, -9], [9, -3]], respawn: false });
const allies = createTargets(scene, { spawns: [[-6, 8], [6, 8]], team: 'blue', respawn: false });
const actors = [...enemies.items, ...allies.items];
for (const actor of actors) {
  actor.position = actor.group.position;
  actor.meshes = [actor.torso, actor.head];
  actor.squad = actor.team === 'red' ? enemies : allies;
  for (const mesh of actor.meshes) mesh.userData.actor = actor;
}
// Raycast proxies follow the player's actual crouch height. Invisible meshes still raycast.
const playerBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1, 0.5));
const playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8));
playerBody.visible = playerHead.visible = false;
scene.add(playerBody, playerHead);
const human = {
  player: true, team: 'blue', position: player.state.position,
  meshes: [playerBody, playerHead], eye: () => player.state.eye,
  get alive() { return state.health > 0; },
};
playerBody.userData.actor = playerHead.userData.actor = human;
playerHead.userData.part = 'head';
actors.push(human);
let elapsed = 0;
const combat = createCombat(scene, world, actors, damage);
const bots = createBots(actors, navigation, combat, objective, random);
const grenades = createGrenades(scene, world.colliders, actors, combat, damage);
const input = createInput(renderer.domElement, locked => {
  if (locked && state.phase === 'live') hud.hide();
  if (!locked && state.phase === 'live') {
    hud.show('pause', 'LINK PAUSED', 'Simulation waits while the mouse is released.', 'RESUME');
  }
});
const direction = new THREE.Vector3();
const endpoint = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const pressed = new Set();
let bloom = 0;

function damage(actor, amount, attacker, headshot) {
  if (!actor.alive || state.phase !== 'live') return;
  let killed;
  if (actor.player) {
    state.health = Math.max(0, state.health - amount);
    killed = !human.alive;
    hud.notice(killed ? 'OPERATOR DOWN · squad continues the operation' : 'TAKING FIRE · find cover');
  } else killed = actor.squad.damage(actor.torso, amount);
  if (attacker === human && actor.team !== human.team) {
    hud.hitMarker(killed, headshot);
    if (killed) {
      rounds.reward(headshot);
      hud.notice(headshot ? 'HEADSHOT · +$450' : 'HOSTILE DOWN · +$300');
    }
  }
}

function syncCamera() {
  camera.position.copy(player.state.position).y += player.state.eye;
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
  playerBody.position.copy(player.state.position).y += player.state.eye * 0.48;
  playerBody.scale.y = player.state.eye * 0.7;
  playerHead.position.copy(player.state.position).y += player.state.eye - 0.06;
  scene.updateMatrixWorld(true);
}

function shoot() {
  if (!equipment.fire()) return;
  const config = equipment.config;
  camera.getWorldDirection(direction);
  right.setFromMatrixColumn(camera.matrixWorld, 0);
  up.setFromMatrixColumn(camera.matrixWorld, 1);
  const spread = (equipment.weapon.spread(player.groundSpeed()) * config.spread + bloom) * (player.state.crouching ? 0.6 : 1);
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(random()) * spread;
  direction.addScaledVector(right, Math.cos(angle) * radius).addScaledVector(up, Math.sin(angle) * radius).normalize();
  endpoint.copy(direction).multiplyScalar(70).add(camera.position);
  combat.fire(camera.position, endpoint, human, config.damage);
  bots.hear(human.position, human.team);
  player.recoil(config.kick, (random() - 0.5) * config.kick * 0.5);
  bloom = Math.min(0.018, bloom + 0.003);
}

function beginRound(next = false) {
  const wasDead = state.health <= 0;
  if (next) rounds.next();
  else rounds.begin();
  enemies.reset();
  allies.reset();
  bots.reset();
  objective.reset();
  grenades.reset();
  if (wasDead) equipment.equip('carbine');
  equipment.reset();
  player.state.position.set(0, 0, 9.5);
  player.state.velocity.set(0, 0, 0);
  player.state.yaw = player.state.pitch = 0;
  player.state.eye = 1.6;
  player.state.crouching = false;
  player.state.height = 1.72;
  player.state.onGround = true;
  bloom = 0;
  elapsed = 0;
  pressed.clear();
  syncCamera();
  hud.show('buy', 'REQUISITION', 'Warden squad · 3 vs 3. Link relay A or eliminate Ember. Equipment persists between rounds.', 'DEPLOY NOW');
  hud.notice('B · requisition during buy phase only');
}

function buy(item) {
  if (state.phase !== 'buy') return;
  if (item === 'grenade') {
    if (state.grenades >= 2) { hud.notice('FRAG CAPACITY · 2'); return; }
    if (rounds.spend(300)) { state.grenades++; hud.notice('FRAG ACQUIRED'); }
    else hud.notice('INSUFFICIENT CREDITS');
  } else if (WEAPONS[item]) {
    if (equipment.id === item) { hud.notice('ALREADY EQUIPPED · ammo refills each round'); return; }
    if (rounds.spend(WEAPONS[item].price)) {
      equipment.equip(item);
      hud.notice(`${WEAPONS[item].name} ACQUIRED`);
    } else hud.notice('INSUFFICIENT CREDITS');
  }
  updateHud();
}

hud.onBuy(buy);
hud.onPlay(() => {
  if (state.phase === 'briefing') beginRound();
  else if (state.phase === 'result') beginRound(true);
  else {
    if (state.phase === 'buy') rounds.deploy();
    hud.hide();
    input.requestLock();
  }
  updateHud();
});
window.addEventListener('keydown', event => {
  if (event.repeat) return;
  if (event.code === 'KeyB' && state.phase === 'buy') hud.show('buy', 'REQUISITION', 'Choose equipment before deployment.', 'DEPLOY NOW');
  if (state.phase === 'buy' && ['Digit1', 'Digit2', 'Digit3'].includes(event.code)) {
    buy({ Digit1: 'carbine', Digit2: 'marksman', Digit3: 'grenade' }[event.code]);
  }
});
document.addEventListener('pointerlockerror', () => {
  hud.show('pause', 'MOUSE CAPTURE REQUIRED', 'Chrome refused pointer lock. Click resume to retry, or allow mouse capture for this page.', 'RESUME');
});

function finish(win, reason) {
  if (!rounds.finish(win, reason)) return;
  document.exitPointerLock();
  hud.show('result', state.result, `${reason} · ${win ? '+$2200' : '+$1400'} round income.`, 'NEXT ROUND');
}

function updateHud() {
  hud.setState(state, equipment, objective.text(human.position), allies.remaining() + (human.alive ? 1 : 0), enemies.remaining());
}

function simulate(dt) {
  if (state.phase !== 'buy' && state.phase !== 'live') return;
  const oldPhase = state.phase;
  rounds.tick(dt);
  if (oldPhase === 'buy') {
    if (state.phase === 'live' && !input.state.locked) hud.show('pause', 'OPERATION READY', 'Requisition closed. Capture the mouse to begin.', 'RESUME');
    updateHud();
    return;
  }
  elapsed += dt;
  bloom = Math.max(0, bloom - dt * 0.025);
  const look = input.takeLook();
  if (human.alive) {
    player.look(look.x, look.y);
    player.step(dt, input.state.keys);
  }
  syncCamera();
  equipment.step(dt);
  enemies.step(dt, elapsed);
  allies.step(dt, elapsed);
  scene.updateMatrixWorld(true);
  if (human.alive) {
    if (input.state.firing && !input.state.keys.has('KeyE')) shoot();
    if (input.state.keys.has('KeyR')) equipment.weapon.reload();
    if (input.state.keys.has('KeyG') && !pressed.has('KeyG') && state.grenades > 0) {
      camera.getWorldDirection(direction);
      if (grenades.throw(camera.position, direction, human)) {
        state.grenades--;
        bots.hear(human.position, human.team);
      }
    }
  }
  pressed.clear();
  for (const key of input.state.keys) pressed.add(key);
  bots.step(dt);
  scene.updateMatrixWorld(true);
  grenades.step(dt);
  combat.step(dt);
  const planting = human.alive && objective.near(human.position) && input.state.keys.has('KeyE') && player.groundSpeed() < 0.5;
  objective.step(dt, planting, bots.defusing());
  if (objective.state.disarm >= 5) finish(false, 'Ember disarmed the relay');
  else if (objective.state.armed && objective.state.fuse === 0) finish(true, 'Relay transfer completed');
  else if (enemies.remaining() === 0) finish(true, 'Ember squad eliminated');
  else if (!human.alive && allies.remaining() === 0 && !objective.state.armed) finish(false, 'Warden squad eliminated');
  else if (state.time === 0 && !objective.state.armed) finish(false, 'Link window expired');
  // Once planted the fuse replaces the round clock; a dead squad can still win the transfer.
  updateHud();
}

let last = performance.now(), accumulator = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const running = state.phase === 'buy' || (state.phase === 'live' && input.state.locked);
  if (running && !document.hidden) {
    accumulator += dt;
    while (accumulator >= STEP) { simulate(STEP); accumulator -= STEP; }
  } else accumulator = 0;
  renderer.render(scene, camera);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
syncCamera();
if (capture) {
  // Capture states use the same game scene and renderer, but freeze simulation for a reproducible frame.
  if (capture === 'buy') {
    beginRound();
    equipment.equip('marksman');
    rounds.spend(1900);
  } else if (capture === 'live' || capture === 'result') {
    beginRound();
    rounds.deploy();
    player.state.position.set(0, 0, 9.5);
    player.state.yaw = 0;
    syncCamera();
  }
  updateHud();
  if (capture !== 'live') hud.show(capture === 'buy' ? 'buy' : capture, capture === 'buy' ? 'REQUISITION' : 'ROUND SECURED', capture === 'buy' ? 'Warden squad · 3 vs 3. Link relay A or eliminate Ember. Equipment persists between rounds.' : 'Relay transfer complete · +$2200 round income.', capture === 'buy' ? 'DEPLOY NOW' : 'NEXT ROUND');
  else hud.hide();
  renderer.render(scene, camera);
  requestAnimationFrame(() => {
    renderer.render(scene, camera);
    window.__shotReady = true;
  });
} else {
  hud.show('briefing', 'NEON BREACH', 'The tidal relay is compromised. Lead Warden squad through the dry dock, link the amber relay, and hold off Ember until the transfer completes.', 'ENTER REQUISITION');
  requestAnimationFrame(frame);
}
