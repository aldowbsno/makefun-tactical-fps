// A real projectile with a fuse, box collision, and damage occluded by map geometry.
import * as THREE from 'three';
export function createGrenades(scene, colliders, actors, combat, damage) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffbf60' }));
  const blast = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), new THREE.MeshBasicMaterial({ color: '#ffc46b', wireframe: true, transparent: true, opacity: 0.5 }));
  mesh.visible = blast.visible = false;
  scene.add(mesh, blast);
  const velocity = new THREE.Vector3();
  const probe = new THREE.Box3();
  const aim = new THREE.Vector3();
  const next = new THREE.Vector3();
  let fuse = 0, glow = 0, owner = null;
  function blocked(position) {
    probe.min.copy(position).addScalar(-0.11);
    probe.max.copy(position).addScalar(0.11);
    return colliders.some(box => probe.intersectsBox(box));
  }
  return {
    throw(from, direction, actor) {
      if (fuse > 0) return false;
      mesh.position.copy(from);
      velocity.copy(direction).multiplyScalar(10);
      velocity.y += 3;
      fuse = 1.8;
      owner = actor;
      mesh.visible = true;
      return true;
    },
    reset() { fuse = glow = 0; mesh.visible = blast.visible = false; },
    step(dt) {
      if (glow > 0) {
        glow -= dt;
        blast.visible = glow > 0;
        blast.scale.setScalar(1 + (0.35 - glow) * 12);
        blast.material.opacity = Math.max(0, glow);
      }
      if (fuse <= 0) return;
      velocity.y -= 12 * dt;
      for (const axis of ['x', 'y', 'z']) {
        next.copy(mesh.position);
        next[axis] += velocity[axis] * dt;
        if (blocked(next)) velocity[axis] *= -0.45;
        else mesh.position.copy(next);
      }
      fuse = Math.max(0, fuse - dt);
      if (fuse > 0) return;
      mesh.visible = false;
      blast.position.copy(mesh.position);
      glow = 0.35;
      for (const actor of actors) {
        if (!actor.alive) continue;
        aim.copy(actor.position).y += 0.9;
        const distance = aim.distanceTo(mesh.position);
        if (distance < 5 && combat.visible(mesh.position, aim, null, actor)) damage(actor, Math.max(0, 130 * (1 - distance / 5)), owner, false);
      }
    },
  };
}
