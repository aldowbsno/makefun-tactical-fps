// One-metre clearance grid, breadth-first routes, and swept axis collision for bots.
// Low cover is blocked too: bots route around it rather than walking through crates.
import * as THREE from 'three';

export function createNavigation(colliders) {
  const radius = 0.36;
  const probe = new THREE.Box3();
  const size = 23;
  const nodes = [];
  function blocked(x, z) {
    probe.min.set(x - radius, 0.06, z - radius);
    probe.max.set(x + radius, 1.72, z + radius);
    return colliders.some(box => probe.intersectsBox(box));
  }
  for (let z = -11; z <= 11; z++) {
    for (let x = -11; x <= 11; x++) nodes.push({ x, z, open: !blocked(x, z), links: [] });
  }
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n.open) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = n.x + dx, z = n.z + dz;
      if (x < -11 || x > 11 || z < -11 || z > 11) continue;
      const j = (z + 11) * size + x + 11;
      if (nodes[j].open && !blocked(n.x + dx * 0.5, n.z + dz * 0.5)) n.links.push(j);
    }
  }
  function clearSegment(from, to) {
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.1));
    for (let i = 0; i <= steps; i++) {
      if (blocked(from.x + (to.x - from.x) * i / steps, from.z + (to.z - from.z) * i / steps)) return false;
    }
    return true;
  }
  function nearest(point, reachable = false) {
    let best = -1, distance = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const d = (point.x - n.x) ** 2 + (point.z - n.z) ** 2;
      if (n.open && d < distance && (!reachable || clearSegment(point, n))) { best = i; distance = d; }
    }
    return best;
  }
  return {
    blocked,
    route(from, to) {
      const start = nearest(from, true), end = nearest(to);
      if (start < 0 || end < 0) return [];
      const previous = new Int32Array(nodes.length).fill(-1);
      previous[start] = start;
      const queue = [start];
      for (let head = 0; head < queue.length && previous[end] < 0; head++) {
        for (const next of nodes[queue[head]].links) {
          if (previous[next] >= 0) continue;
          previous[next] = queue[head];
          queue.push(next);
        }
      }
      if (previous[end] < 0) return [];
      const path = [];
      for (let i = end; i !== start; i = previous[i]) path.push(nodes[i]);
      path.reverse();
      if (Math.hypot(from.x - nodes[start].x, from.z - nodes[start].z) > 0.12) path.unshift(nodes[start]);
      return path;
    },
    move(position, dx, dz) {
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.15));
      for (let i = 0; i < steps; i++) {
        if (!blocked(position.x + dx / steps, position.z)) position.x += dx / steps;
        if (!blocked(position.x, position.z + dz / steps)) position.z += dz / steps;
      }
    },
  };
}
