// Loads the Tripo-generated 3D assets (a stylized baller + a real basketball)
// and hands out normalized, correctly-oriented clones. Everything degrades
// gracefully: until the GLBs finish loading (or if they fail), callers fall
// back to primitive meshes, so the game is always playable.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
let charTemplate: THREE.Object3D | null = null;
let ballTemplate: THREE.Object3D | null = null;
let ready = false;
const readyCbs: Array<() => void> = [];

export function charsReady(): boolean { return ready; }
export function onCharsReady(cb: () => void): void { if (ready) cb(); else readyCbs.push(cb); }

// Fit an object into a wrapper whose local origin sits at the feet-center,
// scaled to `targetH` tall and rotated to face -Z (toward the rim).
function fit(obj: THREE.Object3D, targetH: number, faceY: number): THREE.Group {
  const wrap = new THREE.Group();
  obj.rotation.y = faceY;
  wrap.add(obj);
  const box = new THREE.Box3().setFromObject(wrap);
  const size = box.getSize(new THREE.Vector3());
  const s = targetH / Math.max(size.y, 1e-3);
  obj.scale.setScalar(s);
  const box2 = new THREE.Box3().setFromObject(wrap);
  const c = box2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= box2.min.y;
  wrap.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; }
  });
  return wrap;
}

// Scale by the LARGEST dimension (for the roughly-spherical ball).
function fitMax(obj: THREE.Object3D, targetSize: number): THREE.Group {
  const wrap = new THREE.Group();
  wrap.add(obj);
  const box = new THREE.Box3().setFromObject(wrap);
  const size = box.getSize(new THREE.Vector3());
  const s = targetSize / Math.max(size.x, size.y, size.z, 1e-3);
  obj.scale.setScalar(s);
  const box2 = new THREE.Box3().setFromObject(wrap);
  const c = box2.getCenter(new THREE.Vector3());
  obj.position.sub(c);
  wrap.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });
  return wrap;
}

export function loadCharacters(): void {
  let charDone = false;
  let ballDone = false;
  const check = () => { if (charDone && ballDone) { ready = true; readyCbs.splice(0).forEach((cb) => cb()); } };
  loader.load(
    '/models/player_a.glb',
    (g) => { charTemplate = fit(g.scene, 4.0, Math.PI / 2); charDone = true; check(); },
    undefined,
    () => { charDone = true; check(); }, // failed — fallback capsules
  );
  loader.load(
    '/models/basketball.glb',
    (g) => { ballTemplate = fitMax(g.scene, 0.9); ballDone = true; check(); },
    undefined,
    () => { ballDone = true; check(); }, // failed — fallback sphere
  );
}

export function makeCharacter(): THREE.Object3D | null {
  return charTemplate ? charTemplate.clone(true) : null;
}

export function makeBall(): THREE.Object3D | null {
  return ballTemplate ? ballTemplate.clone(true) : null;
}
