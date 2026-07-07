// databallr KNOCKOUT — free-throw knockout vs real NBA shooters.
// Flick up to shoot; your make window is your player's real career FT%.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildCourt, RIM_CENTER } from './court';
import { loadCharacters } from './characters';
import { Hud } from './hud';
import { Sfx } from './sfx';
import { KnockoutGame } from './knockout';

// Begin fetching the 3D baller + ball GLBs immediately; the game falls back to
// primitives until they resolve, so this never blocks play.
loadCharacters();

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1428);
scene.fog = new THREE.Fog(0x0a1428, 60, 120);

// Image-based lighting: gives every PBR material (rim metal, glass board,
// glossy floor, the ball) real-world reflections. Baked once, cheap to sample.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 8.4, 10.4);
camera.lookAt(RIM_CENTER.x, RIM_CENTER.y - 4.6, RIM_CENTER.z);

const hemi = new THREE.HemisphereLight(0xbdd4ff, 0x14213d, 0.55);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff2d8, 2.2);
key.position.set(14, 28, 12);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -26;
key.shadow.camera.right = 26;
key.shadow.camera.top = 32;
key.shadow.camera.bottom = -12;
key.shadow.camera.near = 1;
key.shadow.camera.far = 80;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 3;
scene.add(key);
// Cool rim/fill light from the far side for shape definition.
const fill = new THREE.DirectionalLight(0x6aa8ff, 0.5);
fill.position.set(-16, 14, -10);
scene.add(fill);

buildCourt(scene);

// Post-processing: subtle bloom so highlights (rim, ball, court lines, the
// gold banner) glow like a broadcast. High threshold keeps mid-tones clean.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.22, // strength — subtle, just a highlight sheen
  0.5, // radius
  0.9, // threshold — only the very brightest pixels bloom
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

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
  composer.setSize(window.innerWidth, window.innerHeight);
});

let lastT = performance.now();
let frameCount = 0;
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  game?.update(dt);
  composer.render();
  frameCount += 1;
});

// Diagnostics hook for the QA harness (same convention as the jam repo).
// Screenshotting a continuously-rendering WebGL+bloom canvas hangs Playwright's
// actionability/font-wait, so the visual gate reads these render counters
// instead — a stronger "the scene is actually drawing" signal that works in
// every browser engine.
declare global {
  interface Window {
    __THREE_GAME_DIAGNOSTICS__?: {
      renderer: string;
      drawCalls: () => number;
      geometries: () => number;
      frames: () => number;
    };
    __THREE_GAME_TEST_HOOKS__?: { state: () => unknown };
  }
}
window.__THREE_GAME_DIAGNOSTICS__ = {
  renderer: 'three@webgl',
  // NB: renderer.info.render reflects only the LAST pass (the bloom/output
  // fullscreen triangle), so it's not a scene-geometry signal. memory.geometries
  // counts geometries resident on the GPU — a stable proxy for "scene is built".
  drawCalls: () => renderer.info.render.calls,
  geometries: () => renderer.info.memory.geometries,
  frames: () => frameCount,
};
window.__THREE_GAME_TEST_HOOKS__ = {
  state: () => game?.snapshot() ?? null,
};
