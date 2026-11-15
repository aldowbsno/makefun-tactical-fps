// Every firearm uses the same nearest-surface ray, including bots and friendly blockers.
import * as THREE from 'three';

export function createCombat(scene, world, actors, onDamage) {
  const ray = new THREE.Raycaster();
  const direction = new THREE.Vector3();
  const surfaces = [];
  const hits = [];
  const trails = Array.from({ length: 16 }, () => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4),
      new THREE.MeshBasicMaterial({ color: '#ffe3a1', transparent: true, opacity: 0.7 }));
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, life: 0 };
  });
  const up = new THREE.Vector3(0, 1, 0);
  let trailIndex = 0;
  function cast(from, to, shooter = null) {
    surfaces.length = 0;
    surfaces.push(...world.shootables);
    for (const actor of actors) {
      if (actor !== shooter && actor.alive) surfaces.push(...actor.meshes);
    }
    direction.copy(to).sub(from);
    const distance = direction.length();
    ray.set(from, direction.normalize());
    ray.far = distance;
    hits.length = 0;
    ray.intersectObjects(surfaces, false, hits);
    return hits[0];
  }
  return {
    visible(from, to, shooter, target) {
      const hit = cast(from, to, shooter);
      return !hit || hit.object.userData.actor === target;
    },
    fire(from, to, shooter, damage) {
      const hit = cast(from, to, shooter);
      const end = hit ? hit.point : to;
      const trail = trails[trailIndex++ % trails.length];
      trail.life = 0.055;
      trail.mesh.visible = true;
      trail.mesh.position.copy(from).lerp(end, 0.5);
      direction.copy(end).sub(from);
      trail.mesh.scale.y = direction.length();
      trail.mesh.quaternion.setFromUnitVectors(up, direction.normalize());
      const target = hit?.object.userData.actor;
      if (target && target.team !== shooter.team) {
        const headshot = hit.object.userData.part === 'head';
        onDamage(target, damage * (headshot ? 3 : 1), shooter, headshot);
      }
      return target && target.team !== shooter.team;
    },
    step(dt) {
      for (const trail of trails) {
        trail.life -= dt;
        trail.mesh.visible = trail.life > 0;
      }
    },
  };
}
