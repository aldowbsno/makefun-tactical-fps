// Tactical agents replan through a clearance grid, acquire with LOS, and investigate noise.
import * as THREE from 'three';

export function createBots(actors, navigation, combat, objective, random) {
  const eye = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const end = new THREE.Vector3();
  const patrol = [new THREE.Vector3(-8, 0, 1), new THREE.Vector3(8, 0, 0), new THREE.Vector3(0, 0, -6)];
  const bots = actors.filter(actor => !actor.player);
  function reset() {
    bots.forEach((bot, index) => {
      bot.route = [];
      bot.routeAge = 0;
      bot.cooldown = 0.7 + index * 0.23;
      bot.reaction = 0;
      bot.target = null;
      bot.heard = null;
      bot.memory = 0;
      bot.patrol = index % patrol.length;
      bot.mode = 'HOLD';
    });
  }
  reset();
  return {
    reset,
    hear(position, team) {
      for (const bot of bots) {
        if (bot.alive && bot.team !== team && bot.position.distanceTo(position) < 17) {
          bot.heard = position.clone();
          bot.memory = 4;
        }
      }
    },
    step(dt) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        eye.copy(bot.position).y += 1.45;
        let target = null, nearest = 24;
        for (const actor of actors) {
          if (!actor.alive || actor.team === bot.team) continue;
          aim.copy(actor.position).y += actor.player ? actor.eye() * 0.78 : 1.1;
          const distance = eye.distanceTo(aim);
          if (distance < nearest && combat.visible(eye, aim, bot, actor)) {
            nearest = distance;
            target = actor;
          }
        }
        bot.cooldown = Math.max(0, bot.cooldown - dt);
        bot.routeAge -= dt;
        bot.memory = Math.max(0, bot.memory - dt);
        if (target) {
          bot.reaction = bot.target === target ? bot.reaction + dt : 0;
          bot.target = target;
          bot.mode = 'ENGAGE';
          bot.group.rotation.y = Math.atan2(target.position.x - bot.position.x, target.position.z - bot.position.z);
          if (bot.reaction > 0.45 && bot.cooldown === 0) {
            aim.copy(target.position).y += target.player ? target.eye() * 0.8 : 1.05;
            // Error grows with distance; bullets still have to intersect the actual body.
            const error = nearest * 0.018;
            aim.x += (random() - 0.5) * error;
            aim.y += (random() - 0.5) * error;
            aim.z += (random() - 0.5) * error;
            end.copy(aim).sub(eye).normalize().multiplyScalar(45).add(eye);
            combat.fire(eye, end, bot, bot.team === 'blue' ? 22 : 13);
            bot.cooldown = 0.55 + random() * 0.45;
          }
          // Hold a firing angle rather than run blindly into an opponent.
          if (nearest < 15) continue;
        } else {
          bot.target = null;
          bot.reaction = 0;
        }
        let destination;
        if (bot.team === 'red' && objective.state.armed) {
          destination = objective.position;
          bot.mode = 'DISARM';
          if (objective.near(bot.position)) continue;
        } else if (bot.memory > 0 && bot.heard) {
          destination = bot.heard;
          bot.mode = 'INVESTIGATE';
        } else if (bot.team === 'blue') {
          destination = objective.position;
          bot.mode = 'ESCORT';
          if (objective.near(bot.position)) continue;
        } else {
          destination = patrol[bot.patrol];
          bot.mode = 'PATROL';
          if (Math.hypot(destination.x - bot.position.x, destination.z - bot.position.z) < 1.1) {
            bot.patrol = (bot.patrol + 1) % patrol.length;
          }
        }
        if (bot.routeAge <= 0) {
          bot.route = navigation.route(bot.position, destination);
          bot.routeAge = 0.8 + random() * 0.4;
        }
        const next = bot.route[0];
        if (!next) continue;
        const dx = next.x - bot.position.x, dz = next.z - bot.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.12) { bot.route.shift(); continue; }
        const speed = Math.min(distance, dt * (bot.team === 'blue' ? 2.8 : 2.1));
        navigation.move(bot.position, dx / distance * speed, dz / distance * speed);
        bot.group.rotation.y = Math.atan2(dx, dz);
      }
    },
    defusing() {
      return bots.some(bot => bot.alive && bot.team === 'red' && bot.mode === 'DISARM' && objective.near(bot.position) && !bot.target);
    },
  };
}
