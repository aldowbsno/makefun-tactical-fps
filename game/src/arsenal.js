// Equipment wraps the starter's viewmodel/ammunition module, preserving its animation.
import { createWeapon } from './weapon.js';
export const WEAPONS = {
  carbine: { name: 'VANGUARD / CARBINE', price: 1400, mag: 30, reserve: 90, gap: 0.13, damage: 34, kick: 0.012, spread: 1 },
  marksman: { name: 'KESTREL / MARKSMAN', price: 1900, mag: 12, reserve: 48, gap: 0.38, damage: 58, kick: 0.025, spread: 0.45 },
};
export function createArsenal(camera) {
  const weapon = createWeapon(camera);
  let id = 'carbine', cooldown = 0;
  function equip(next) {
    id = next;
    weapon.configure(WEAPONS[id].mag, WEAPONS[id].reserve);
  }
  return {
    weapon,
    get config() { return WEAPONS[id]; },
    get id() { return id; },
    equip,
    reset() { cooldown = 0; equip(id); },
    step(dt) { cooldown = Math.max(0, cooldown - dt); weapon.step(dt); },
    fire() {
      if (cooldown > 0 || !weapon.ready() || !weapon.takeRound()) return false;
      cooldown = WEAPONS[id].gap;
      weapon.pullTrigger();
      return true;
    },
  };
}
