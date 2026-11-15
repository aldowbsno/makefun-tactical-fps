// Complete match simulation. Browser input, presentation and frame scheduling live in main.js.
import * as THREE from 'three';
import { createPlayer } from './player.js';
import { createTargets } from './targets.js';
import { createRounds, roundOutcome } from './rounds.js';
import { createNavigation } from './navigation.js';
import { createObjective } from './objective.js';
import { createArsenal, WEAPONS } from './arsenal.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createGrenades } from './grenades.js';

export function createMatch({ scene, camera, world, random = Math.random,
  notice = () => {}, hit = () => {}, onFinish = () => {} }) {
  const rounds = createRounds(), state = rounds.state;
  const player = createPlayer(world.colliders);
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
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1, 0.5));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8));
  body.visible = head.visible = false;
  scene.add(body, head);
  const human = {
    player: true, team: 'blue', position: player.state.position,
    meshes: [body, head], eye: () => player.state.eye,
    get alive() { return state.health > 0; },
  };
  body.userData.actor = head.userData.actor = human;
  head.userData.part = 'head';
  actors.push(human);
  const combat = createCombat(scene, world, actors, damage);
  const bots = createBots(actors, createNavigation(world.colliders), combat, objective, random);
  const grenades = createGrenades(scene, world.colliders, actors, combat, damage);
  const direction = new THREE.Vector3(), endpoint = new THREE.Vector3();
  const right = new THREE.Vector3(), up = new THREE.Vector3();
  const pressed = new Set();
  let elapsed = 0, bloom = 0;

  function damage(actor, amount, attacker, headshot) {
    if (!actor.alive || state.phase !== 'live' || !Number.isFinite(amount) || amount <= 0) return;
    let killed;
    if (actor.player) {
      state.health = Math.max(0, state.health - amount);
      killed = !human.alive;
      notice(killed ? 'OPERATOR DOWN · squad continues the operation' : 'TAKING FIRE · find cover');
    } else killed = actor.squad.damage(actor.torso, amount);
    if (attacker === human && actor.team !== human.team) {
      hit(killed, headshot);
      if (killed) {
        rounds.reward(headshot);
        notice(headshot ? 'HEADSHOT · +$450' : 'HOSTILE DOWN · +$300');
      }
    }
  }

  function syncCamera() {
    camera.position.copy(player.state.position).y += player.state.eye;
    camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
    // Keep the torso below the head: the old box overlapped its centre and stole headshots.
    body.position.copy(player.state.position).y += (player.state.eye - 0.25) / 2;
    body.scale.y = player.state.eye - 0.25;
    head.position.copy(player.state.position).y += player.state.eye - 0.06;
    scene.updateMatrixWorld(true);
  }

  function shoot() {
    if (!equipment.fire()) return;
    const config = equipment.config;
    camera.getWorldDirection(direction);
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    const spread = (equipment.weapon.spread(player.groundSpeed()) * config.spread + bloom) * (player.state.crouching ? 0.6 : 1);
    const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * spread;
    direction.addScaledVector(right, Math.cos(angle) * radius).addScaledVector(up, Math.sin(angle) * radius).normalize();
    endpoint.copy(direction).multiplyScalar(70).add(camera.position);
    combat.fire(camera.position, endpoint, human, config.damage);
    bots.hear(human.position, human.team);
    player.recoil(config.kick, (random() - 0.5) * config.kick * 0.5);
    bloom = Math.min(0.018, bloom + 0.003);
  }

  function beginRound() {
    const dead = !human.alive;
    const started = state.phase === 'result' ? rounds.next() : rounds.begin();
    if (!started) return false;
    enemies.reset(); allies.reset(); bots.reset(); objective.reset();
    grenades.reset(); combat.reset();
    if (dead) { equipment.equip('carbine'); state.grenades = 1; }
    equipment.reset();
    player.state.position.set(0, 0, 9.5);
    player.state.velocity.set(0, 0, 0);
    player.state.yaw = player.state.pitch = 0;
    player.state.eye = 1.6; player.state.height = 1.72;
    player.state.crouching = false; player.state.onGround = true;
    bloom = elapsed = 0; pressed.clear(); syncCamera();
    notice('B · requisition during buy phase only');
    return true;
  }

  function buy(item) {
    if (state.phase !== 'buy') return false;
    if (item === 'grenade') {
      if (state.grenades >= 2) { notice('FRAG CAPACITY · 2'); return false; }
      if (!rounds.spend(300)) { notice('INSUFFICIENT CREDITS'); return false; }
      state.grenades++; notice('FRAG ACQUIRED');
    } else if (Object.hasOwn(WEAPONS, item)) {
      if (equipment.id === item) { notice('ALREADY EQUIPPED · ammo refills each round'); return false; }
      if (!rounds.spend(WEAPONS[item].price)) { notice('INSUFFICIENT CREDITS'); return false; }
      equipment.equip(item); notice(`${WEAPONS[item].name} ACQUIRED`);
    } else return false;
    return true;
  }

  function finish(win, reason) {
    if (!rounds.finish(win, reason)) return false;
    onFinish(win, reason);
    return true;
  }

  function step(dt, controls) {
    if (state.phase !== 'buy' && state.phase !== 'live') return;
    const oldPhase = state.phase;
    rounds.tick(dt);
    if (oldPhase === 'buy') return;
    const { keys, firing, lookX = 0, lookY = 0 } = controls;
    elapsed += dt; bloom = Math.max(0, bloom - dt * 0.025);
    if (human.alive) { player.look(lookX, lookY); player.step(dt, keys); }
    syncCamera(); equipment.step(dt);
    enemies.step(dt, elapsed); allies.step(dt, elapsed);
    scene.updateMatrixWorld(true);
    if (human.alive) {
      // Reload takes priority over a simultaneous trigger press.
      if (keys.has('KeyR')) equipment.weapon.reload();
      if (firing && !keys.has('KeyE')) shoot();
      if (keys.has('KeyG') && !pressed.has('KeyG') && state.grenades > 0) {
        camera.getWorldDirection(direction);
        if (grenades.throw(camera.position, direction, human)) {
          state.grenades--; bots.hear(human.position, human.team);
        }
      }
    }
    pressed.clear(); for (const key of keys) pressed.add(key);
    bots.step(dt); scene.updateMatrixWorld(true);
    grenades.step(dt); combat.step(dt);
    const planting = human.alive && player.state.onGround && objective.near(human.position)
      && keys.has('KeyE') && player.groundSpeed() < 0.5;
    objective.step(dt, planting, bots.defusing());
    const outcome = roundOutcome(state, objective.state, enemies.remaining(), allies.remaining());
    if (outcome) finish(outcome.win, outcome.reason);
  }

  syncCamera();
  return { state, rounds, player, equipment, objective, enemies, allies, actors, human,
    combat, bots, grenades, beginRound, buy, step, syncCamera };
}
