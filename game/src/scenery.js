// Original dry-dock dressing: overhead copper gantries, tide lines, lane paint and pylons.
// These details are outside the walkable volume or flat paint; cover stays in world.js.
import * as THREE from 'three';
export function decorateWorld(scene) {
  const teal = new THREE.MeshStandardMaterial({ color: '#194953', roughness: 0.75, metalness: 0.4 });
  const copper = new THREE.MeshStandardMaterial({ color: '#bf7958', roughness: 0.65, metalness: 0.55 });
  const light = new THREE.MeshBasicMaterial({ color: '#74edf1' });
  const amber = new THREE.MeshBasicMaterial({ color: '#ffc46b' });
  function box(size, position, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
  }
  for (const z of [-10, -2, 6]) {
    box([23.8, 0.22, 0.35], [0, 5.2, z], copper);
    box([23, 0.035, 0.08], [0, 5.05, z], light);
  }
  for (const x of [-11.95, 11.95]) {
    for (let z = -10; z <= 10; z += 4) {
      box([0.07, 2.6, 0.18], [x, 2.8, z], copper);
      box([0.08, 0.035, 2.8], [x, 1, z], light);
    }
  }
  const grid = new THREE.GridHelper(24, 24, '#38616a', '#1d343e');
  grid.position.y = 0.012;
  scene.add(grid);
  // Two dashed route lines converge toward the relay, leaving the cover silhouettes clear.
  for (const x of [-8.8, 8.8]) {
    for (let z = -9; z < 10; z += 1.7) box([0.08, 0.014, 0.8], [x, 0.02, z], amber);
  }
  for (const x of [-8, 8]) {
    const beacon = new THREE.PointLight('#54dce2', 12, 9, 2);
    beacon.position.set(x, 3, -8);
    scene.add(beacon);
  }
  for (const x of [-15, -9, 8, 15]) {
    box([3.2, 7 + Math.abs(x) * 0.15, 3], [x, 4, -16], teal);
    box([3.4, 0.3, 3.4], [x, 8.5, -16], copper);
  }
  // Typography is a game-generated texture, not a remote font or image asset.
  function sign(text, x, z, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = '#10232e'; context.fillRect(0, 0, 512, 128);
    context.strokeStyle = color; context.lineWidth = 5; context.strokeRect(5, 5, 502, 118);
    context.fillStyle = color; context.font = 'bold 54px monospace'; context.textAlign = 'center';
    context.fillText(text, 256, 82);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: texture }));
    plane.position.set(x, 3, z);
    scene.add(plane);
  }
  sign('A / TIDAL LINK', 0, -11.97, '#ffc46b');
  sign('DRY DOCK 07', -7, -11.97, '#74edf1');
}
