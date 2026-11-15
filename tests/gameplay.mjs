import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createRounds } from '../game/src/rounds.js';
import { createWorld } from '../game/src/world.js';
import { createNavigation } from '../game/src/navigation.js';
import { createPlayer } from '../game/src/player.js';
import { createTargets } from '../game/src/targets.js';
import { createArsenal } from '../game/src/arsenal.js';
import { createObjective } from '../game/src/objective.js';
import { createCombat } from '../game/src/combat.js';
import { createBots } from '../game/src/bots.js';
import { createGrenades } from '../game/src/grenades.js';

let checks = 0;
function test(name, callback) {
  callback();
  checks++;
  console.log(`PASS ${name}`);
}
const point = (x, y, z) => new THREE.Vector3(x, y, z);

test('official three.js and dossier library are byte-identical', () => {
  for (const [path, expected] of Object.entries({
    'game/vendor/three/three.core.min.js': '613e370f76638fdef83926642bf256dc9615684922de1ce1f63a8583e5d78578',
    'game/vendor/three/three.module.min.js': 'ef510bae547ab3789d6ed543333a8bf42510a8c70743b766c4e19039b976c26b',
    'vendor/makefun-threejs.ts': 'f9622210e6a0aed70d6f13273a24c9c4a661b5e272edf8fef21197fac6de7969',
  })) assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), expected);
  assert.equal(THREE.REVISION, '187');
});

test('round timer, buy restrictions, single payout, loss and reset', () => {
  const rounds = createRounds();
  rounds.tick(100);
  assert.equal(rounds.state.phase, 'briefing');
  assert.equal(rounds.spend(1), false);
  rounds.begin();
  assert.equal(rounds.spend(1900), true);
  assert.equal(rounds.spend(900), false);
  rounds.tick(12);
  assert.equal(rounds.state.phase, 'live');
  assert.equal(rounds.state.time, 85);
  assert.equal(rounds.spend(1), false);
  rounds.tick(5);
  assert.equal(rounds.state.time, 80);
  assert.equal(rounds.finish(true, 'test'), true);
  const money = rounds.state.money;
  assert.equal(rounds.finish(false, 'duplicate'), false);
  assert.equal(rounds.state.money, money);
  rounds.next();
  assert.equal(rounds.state.round, 2);
  assert.equal(rounds.state.health, 100);
  rounds.deploy();
  rounds.finish(false, 'test');
  assert.equal(rounds.state.red, 1);
  assert.equal(rounds.state.blue, 1);
  assert.equal(rounds.state.money, money + 1400);
});

const scene = new THREE.Scene();
const world = createWorld(scene);
const nav = createNavigation(world.colliders);
test('all squad spawns have collision-free routes to relay and player spawn', () => {
  for (const [x, z] of [[-6, -9], [6, -9], [9, -3], [-6, 8], [6, 8], [0, 9.5]]) {
    assert.equal(nav.blocked(x, z), false);
    for (const destination of [point(0, 0, -7), point(0, 0, 9)]) {
      const route = nav.route(point(x, 0, z), destination);
      const alreadyThere = Math.hypot(x - destination.x, z - destination.z) < 0.8;
      assert.ok(route.length > 0 || alreadyThere, `no route from ${x},${z} to ${destination.x},${destination.z}`);
      let previous = point(x, 0, z);
      for (const node of route) {
        assert.equal(nav.blocked(node.x, node.z), false);
        const moving = previous.clone();
        nav.move(moving, node.x - moving.x, node.z - moving.z);
        assert.ok(Math.hypot(moving.x - node.x, moving.z - node.z) < 0.01);
        previous.set(node.x, 0, node.z);
      }
    }
  }
  const p = point(0, 0, 0);
  nav.move(p, 0, -8);
  assert.ok(p.z > -2.5, 'swept movement must stop at central column');
});

test('player accelerates, crouches, and cannot move through cover or boundary', () => {
  const player = createPlayer(world.colliders);
  const keys = new Set(['KeyW']);
  player.step(1 / 60, keys);
  const firstSpeed = player.groundSpeed();
  assert.ok(firstSpeed > 0 && firstSpeed < 5.2);
  for (let i = 0; i < 300; i++) player.step(1 / 60, keys);
  assert.ok(player.state.position.z > -2.5);
  assert.ok(player.groundSpeed() < 0.01);
  keys.add('KeyC');
  for (let i = 0; i < 30; i++) player.step(1 / 60, keys);
  assert.equal(player.state.crouching, true);
  assert.ok(player.state.eye < 1.05);
  player.state.position.set(10, 0, 8);
  keys.clear(); keys.add('KeyD');
  for (let i = 0; i < 300; i++) player.step(1 / 60, keys);
  assert.ok(player.state.position.x < 11.67);
});

test('both weapon capacities, reload conservation, cadence and movement spread', () => {
  const arsenal = createArsenal(new THREE.PerspectiveCamera());
  for (const [id, capacity, reserve] of [['carbine', 30, 90], ['marksman', 12, 48]]) {
    arsenal.equip(id);
    arsenal.step(2);
    assert.equal(arsenal.weapon.state.mag, capacity);
    assert.equal(arsenal.fire(), true);
    assert.equal(arsenal.fire(), false);
    arsenal.weapon.reload();
    arsenal.step(2);
    assert.equal(arsenal.weapon.state.mag, capacity);
    assert.equal(arsenal.weapon.state.reserve, reserve - 1);
    arsenal.weapon.state.reserve = 0;
    for (let i = 0; i < capacity; i++) { arsenal.step(1); assert.equal(arsenal.fire(), true); }
    arsenal.step(1);
    assert.equal(arsenal.fire(), false);
    arsenal.weapon.reload();
    assert.equal(arsenal.weapon.state.reloadLeft, 0);
    assert.ok(arsenal.weapon.spread(5) > arsenal.weapon.spread(0));
  }
});

test('round targets stay dead until explicitly reset', () => {
  const targets = createTargets(new THREE.Scene(), { respawn: false });
  targets.damage(targets.items[0].head, 300);
  targets.step(10, 100);
  assert.equal(targets.remaining(), 3);
  targets.reset();
  assert.equal(targets.remaining(), 4);
});

test('plant interruption, successful link, disarm interruption and fuse', () => {
  const objective = createObjective(new THREE.Scene());
  objective.step(2, true, false);
  objective.step(0.1, false, false);
  assert.equal(objective.state.charge, 0);
  objective.step(3, true, false);
  assert.equal(objective.state.armed, true);
  objective.step(2, false, true);
  objective.step(0.1, false, false);
  assert.equal(objective.state.disarm, 0);
  objective.step(5, false, true);
  assert.equal(objective.state.disarm, 5);
  objective.reset();
  objective.step(3, true, false);
  objective.step(25, false, false);
  assert.equal(objective.state.fuse, 0);
});

function makeActor(scene, x, z, team) {
  const squad = createTargets(scene, { spawns: [[x, z]], team, respawn: false });
  const actor = squad.items[0];
  actor.position = actor.group.position;
  actor.meshes = [actor.torso, actor.head];
  for (const mesh of actor.meshes) mesh.userData.actor = actor;
  return actor;
}

test('nearest-hit occlusion, head damage multiplier and friendly bullet blocking', () => {
  const scene = new THREE.Scene();
  const shooter = makeActor(scene, 0, 5, 'blue');
  const target = makeActor(scene, 0, -5, 'red');
  const actors = [shooter, target];
  const world = { shootables: [] };
  let dealt = 0;
  const combat = createCombat(scene, world, actors, (_, amount) => { dealt += amount; });
  scene.updateMatrixWorld(true);
  const from = point(0, 1.53, 5), to = point(0, 1.53, -10);
  combat.fire(from, to, shooter, 34);
  assert.equal(dealt, 102);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 0.4));
  wall.position.set(0, 1.5, 0); scene.add(wall); world.shootables.push(wall);
  scene.updateMatrixWorld(true);
  combat.fire(from, to, shooter, 34);
  assert.equal(dealt, 102);
  assert.equal(combat.visible(from, target.head.getWorldPosition(new THREE.Vector3()), shooter, target), false);
  world.shootables.length = 0;
  const friendly = makeActor(scene, 0, 0, 'blue');
  actors.push(friendly); scene.updateMatrixWorld(true);
  combat.fire(from, to, shooter, 34);
  assert.equal(dealt, 102);
});

test('bots acquire and fire only with LOS; navigation never enters cover', () => {
  const scene = new THREE.Scene();
  const world = createWorld(scene);
  const nav = createNavigation(world.colliders);
  const red = makeActor(scene, 0, -6, 'red');
  const blue = makeActor(scene, 0, 0, 'blue');
  blue.player = true; blue.eye = () => 1.6;
  let damage = 0;
  const combat = createCombat(scene, world, [red, blue], () => { damage++; });
  const objective = createObjective(scene);
  const bots = createBots([red, blue], nav, combat, objective, () => 0.5);
  for (let i = 0; i < 30; i++) {
    scene.updateMatrixWorld(true); bots.step(1 / 60);
    assert.equal(nav.blocked(red.position.x, red.position.z), false);
  }
  assert.equal(damage, 0, 'central pillar must occlude firing');
  red.position.set(-8, 0, 0); blue.position.set(-8, 0, 5);
  bots.reset();
  for (let i = 0; i < 180; i++) { scene.updateMatrixWorld(true); bots.step(1 / 60); }
  assert.ok(damage > 0, 'clear lane should permit aimed fire');
});

test('grenade detonates after fuse, has radius falloff and cannot damage through walls', () => {
  const scene = new THREE.Scene();
  const target = makeActor(scene, 0, -2, 'red');
  const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 0.2));
  wall.position.set(0, 2, -1); scene.add(wall);
  const world = { shootables: [wall] };
  let damage = 0;
  const combat = createCombat(scene, world, [target], () => {});
  const grenade = createGrenades(scene, [], [target], combat, (_, amount) => { damage += amount; });
  scene.updateMatrixWorld(true);
  grenade.throw(point(0, 15.1, 0), point(0, -0.3, 0), { team: 'blue' });
  // Zero initial Y speed; starting height offsets free fall during the fuse.
  for (let i = 0; i < 109; i++) grenade.step(1 / 60);
  assert.equal(damage, 0);
  grenade.reset(); world.shootables.length = 0;
  grenade.throw(point(0, 20.1, 0), point(0, -0.3, 0), { team: 'blue' });
  for (let i = 0; i < 109; i++) grenade.step(1 / 60);
  assert.ok(damage > 0 && damage < 130);
});
console.log(`${checks} gameplay checks passed`);
