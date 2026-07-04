// databallr KNOCKOUT — free-throw knockout vs real NBA shooters.
// Flick up to shoot; your make window is your player's real career FT%.
import * as THREE from 'three';
import { buildCourt, RIM_CENTER } from './court';
import { Hud } from './hud';
import { Sfx } from './sfx';
import { KnockoutGame } from './knockout';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1428);
scene.fog = new THREE.Fog(0x0a1428, 55, 110);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 6.3, 8.2);
camera.lookAt(RIM_CENTER.x, RIM_CENTER.y - 2.6, RIM_CENTER.z);

const hemi = new THREE.HemisphereLight(0xbdd4ff, 0x1a2438, 0.9);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff2d8, 1.6);
key.position.set(14, 26, 10);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -25;
key.shadow.camera.right = 25;
key.shadow.camera.top = 30;
key.shadow.camera.bottom = -10;
scene.add(key);

buildCourt(scene);

const hud = new Hud();
const sfx = new Sfx();
let game: KnockoutGame | null = null;

const muteBtn = document.getElementById('btn-mute') as HTMLButtonElement;
const renderMute = () => { muteBtn.textContent = sfx.isMuted ? '\u{1F507}' : '\u{1F50A}'; };
renderMute();
muteBtn.onclick = () => { sfx.toggleMute(); renderMute(); };

hud.showStart((shooter, opponents) => {
  game = new KnockoutGame(scene, hud, sfx, shooter, opponents);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let lastT = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  game?.update(dt);
  renderer.render(scene, camera);
});

// Diagnostics hook for the QA harness (same convention as the jam repo).
declare global {
  interface Window {
    __THREE_GAME_DIAGNOSTICS__?: { renderer: string; drawCalls: () => number };
    __THREE_GAME_TEST_HOOKS__?: { state: () => unknown };
  }
}
window.__THREE_GAME_DIAGNOSTICS__ = {
  renderer: 'three@webgl',
  drawCalls: () => renderer.info.render.calls,
};
window.__THREE_GAME_TEST_HOOKS__ = {
  state: () => game?.snapshot() ?? null,
};
