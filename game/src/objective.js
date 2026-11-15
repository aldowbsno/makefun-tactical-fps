// Attackers hold E at the amber relay. Defenders can interrupt and then disarm it.
import * as THREE from 'three';

export function createObjective(scene) {
  const position = new THREE.Vector3(0, 0, -7);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.65, 64),
    new THREE.MeshBasicMaterial({ color: '#ffc46b', side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(position).y = 0.025;
  scene.add(ring);
  const relay = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: '#ffc46b', emissive: '#e78926', emissiveIntensity: 0.35, metalness: 0.65 });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 0.8, 6), material);
  core.position.y = 0.4;
  relay.add(core);
  relay.position.copy(position);
  scene.add(relay);
  const state = { armed: false, charge: 0, disarm: 0, fuse: 25 };
  return {
    state, position,
    reset() { state.armed = false; state.charge = 0; state.disarm = 0; state.fuse = 25; },
    near(point) { return Math.hypot(point.x - position.x, point.z - position.z) < 1.9; },
    step(dt, planting, defusing) {
      if (!state.armed) {
        state.charge = planting ? Math.min(3, state.charge + dt) : 0;
        if (state.charge >= 3) state.armed = true;
      } else {
        state.fuse = Math.max(0, state.fuse - dt);
        state.disarm = defusing ? Math.min(5, state.disarm + dt) : 0;
      }
      material.emissiveIntensity = state.armed ? 0.6 + Math.sin(state.fuse * 8) * 0.4 : 0.35;
      ring.material.color.set(state.armed ? '#ff6577' : '#ffc46b');
    },
    text(point) {
      if (state.armed) return `RELAY ARMED · ${Math.ceil(state.fuse)}s · defend against disarm`;
      if (this.near(point)) return `HOLD E TO LINK · ${Math.floor(state.charge / 3 * 100)}%`;
      return 'LINK RELAY A · amber ring · hold E for 3s';
    },
  };
}
