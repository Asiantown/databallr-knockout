// Court, hoop, and queue-figure meshes. Units: 1 unit = 1 foot.
// Rim center at (0, 10, -13.75); free-throw line at z = 0.
import * as THREE from 'three';
import { charsReady, onCharsReady, makeCharacter } from './characters';

export const RIM_CENTER = new THREE.Vector3(0, 10, -13.75);
export const RIM_RADIUS = 0.75;
export const BALL_RADIUS = 0.4;
// Just in front of and below the camera so the held ball reads as "in your
// hands" at the bottom-center, peeking above the power meter.
export const RELEASE_POINT = new THREE.Vector3(-1.7, 5.0, 5.0);

export function buildCourt(scene: THREE.Scene): void {
  // Hardwood floor — procedural plank texture, low roughness so the arena
  // env-map lays a broadcast-style sheen across it.
  const floorTex = makeWoodTexture();
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(6, 6);
  floorTex.anisotropy = 8;
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.34, metalness: 0.0, envMapIntensity: 0.8 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 48), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -8);
  floor.receiveShadow = true;
  scene.add(floor);

  // Lane (the key) — painted rectangle from baseline to FT line
  const laneMat = new THREE.MeshStandardMaterial({ color: 0x2b4a8a, roughness: 0.85 });
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(12, 19), laneMat);
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0.01, -9.5);
  scene.add(lane);

  // Court lines (FT line, lane borders, FT circle)
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf3f5f9 });
  const mkLine = (w: number, d: number, x: number, z: number): void => {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.02, z);
    scene.add(line);
  };
  mkLine(12.4, 0.2, 0, 0); // FT line
  mkLine(0.2, 19, -6.1, -9.5); // lane left
  mkLine(0.2, 19, 6.1, -9.5); // lane right
  mkLine(12.4, 0.2, 0, -19); // baseline segment
  const circle = new THREE.Mesh(new THREE.RingGeometry(5.9, 6.1, 48), lineMat);
  circle.rotation.x = -Math.PI / 2;
  circle.position.set(0, 0.02, 0);
  scene.add(circle);

  // Backboard — tempered-glass look: cool tint, mostly transparent so it reads
  // as glass over the crowd instead of a solid white slab.
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3.6, 0.12),
    new THREE.MeshStandardMaterial({
      color: 0x9fc0e8, roughness: 0.12, metalness: 0.0,
      transparent: true, opacity: 0.28, envMapIntensity: 0.35,
    }),
  );
  board.position.set(0, 11.4, -15);
  scene.add(board);
  // White padded frame around the glass so the edges read clearly.
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xf3f5f9, roughness: 0.5 });
  const frameH = new THREE.BoxGeometry(6.2, 0.16, 0.16);
  const frameV = new THREE.BoxGeometry(0.16, 3.72, 0.16);
  const ft = new THREE.Mesh(frameH, frameMat); ft.position.set(0, 13.22, -15); scene.add(ft);
  const fb = new THREE.Mesh(frameH, frameMat); fb.position.set(0, 9.58, -15); scene.add(fb);
  const fl = new THREE.Mesh(frameV, frameMat); fl.position.set(-3.02, 11.4, -15); scene.add(fl);
  const fr = new THREE.Mesh(frameV, frameMat); fr.position.set(3.02, 11.4, -15); scene.add(fr);
  const squareShape = new THREE.Shape();
  squareShape.moveTo(-1.2, -0.75); squareShape.lineTo(1.2, -0.75);
  squareShape.lineTo(1.2, 0.75); squareShape.lineTo(-1.2, 0.75); squareShape.lineTo(-1.2, -0.75);
  const hole = new THREE.Path();
  hole.moveTo(-1.05, -0.6); hole.lineTo(1.05, -0.6);
  hole.lineTo(1.05, 0.6); hole.lineTo(-1.05, 0.6); hole.lineTo(-1.05, -0.6);
  squareShape.holes.push(hole);
  const square = new THREE.Mesh(
    new THREE.ShapeGeometry(squareShape),
    new THREE.MeshBasicMaterial({ color: 0xd23c3c }),
  );
  square.position.set(0, 10.9, -14.91);
  scene.add(square);

  // Rim + net
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(RIM_RADIUS, 0.06, 12, 36),
    new THREE.MeshStandardMaterial({ color: 0xe06428, roughness: 0.4, metalness: 0.5 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.copy(RIM_CENTER);
  rim.castShadow = true;
  scene.add(rim);
  const net = new THREE.Mesh(
    new THREE.CylinderGeometry(RIM_RADIUS * 0.98, 0.42, 1.5, 20, 8, true),
    new THREE.MeshStandardMaterial({
      map: makeNetTexture(), transparent: true, alphaTest: 0.25, side: THREE.DoubleSide,
      roughness: 0.9, depthWrite: false,
    }),
  );
  net.position.set(RIM_CENTER.x, RIM_CENTER.y - 0.8, RIM_CENTER.z);
  scene.add(net);

  // Arena backdrop — a crowd wall so the upper frame isn't empty void.
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = 1024; wallCanvas.height = 320;
  const wctx = wallCanvas.getContext('2d')!;
  const grad = wctx.createLinearGradient(0, 0, 0, 320);
  grad.addColorStop(0, '#0c1730');
  grad.addColorStop(1, '#16264a');
  wctx.fillStyle = grad;
  wctx.fillRect(0, 0, 1024, 320);
  const crowdColors = ['#2a3d66', '#3c5488', '#24365c', '#4a5f92', '#1e2f52', '#5a6ea0'];
  for (let row = 0; row < 9; row += 1) {
    for (let i = 0; i < 120; i += 1) {
      wctx.fillStyle = crowdColors[Math.floor(Math.random() * crowdColors.length)];
      const px = i * 8.6 + (row % 2) * 4 + Math.random() * 2;
      const py = 60 + row * 27 + Math.random() * 5;
      wctx.beginPath();
      wctx.arc(px, py, 2.6 + Math.random() * 1.4, 0, Math.PI * 2);
      wctx.fill();
    }
  }
  wctx.fillStyle = '#f4c84b';
  wctx.font = '900 34px -apple-system, Helvetica, Arial, sans-serif';
  wctx.textAlign = 'center';
  wctx.fillText('d a t a b a l l r', 512, 38);
  const wallTex = new THREE.CanvasTexture(wallCanvas);
  wallTex.colorSpace = THREE.SRGBColorSpace;
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 34),
    new THREE.MeshBasicMaterial({ map: wallTex }),
  );
  wall.position.set(0, 15, -36);
  scene.add(wall);

  // Stanchion
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x30405f, roughness: 0.6 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 11.4, 10), poleMat);
  pole.position.set(0, 5.7, -18);
  pole.castShadow = true;
  scene.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 3), poleMat);
  arm.position.set(0, 11.2, -16.5);
  scene.add(arm);
}

// Simple capsule figures for the queue of opponents behind the FT line.
// Figures GLIDE to targets (walk to the line, sprint to rebounds, jog to the
// back of the queue) so the knockout race is physically visible.
export interface QueueFigure {
  group: THREE.Group;
  setQueueSlot(slot: number): void;
  setTarget(target: THREE.Vector3, speed: number): void;
  atTarget(): boolean;
  update(dt: number): void;
  setDead(dead: boolean): void;
}

const FIGURE_COLORS = [0x60b6e9, 0x34d399, 0xa78bfa, 0xf87171, 0xf4c84b, 0xfb923c, 0x22d3ee, 0xf472b6];

// Fallback primitive body used until the 3D character loads (or if it fails).
function buildCapsule(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.55, 2.4, 4, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.65 }),
  );
  body.position.y = 1.75; body.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.7 }),
  );
  head.position.y = 3.55; head.castShadow = true;
  g.add(body, head);
  return g;
}

export function buildFigure(scene: THREE.Scene, index: number): QueueFigure {
  const group = new THREE.Group();
  const color = FIGURE_COLORS[index % FIGURE_COLORS.length];

  // Team-colored identity ring on the floor — reads clearly which baller is
  // which, and the emissive glow catches the bloom pass.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.95, 0.075, 10, 40),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.5 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);

  // 3D character if the model is ready; otherwise a capsule we swap out on load.
  let bodyNode: THREE.Object3D = makeCharacter() ?? buildCapsule(color);
  group.add(bodyNode);
  scene.add(group);

  if (!charsReady()) {
    onCharsReady(() => {
      const model = makeCharacter();
      if (!model) return;
      group.remove(bodyNode);
      bodyNode = model;
      group.add(bodyNode);
    });
  }

  const target = new THREE.Vector3();
  let speed = 0;
  let moving = false;
  let heading = 0;
  const figure: QueueFigure = {
    group,
    setQueueSlot(slot: number) {
      // Waiting line recedes up the right sideline as a readable diagonal —
      // wider lateral step than depth step so perspective doesn't collapse the
      // figures into a single column.
      figure.setTarget(new THREE.Vector3(4.0 + slot * 0.9, 0, -3.4 - slot * 1.85), WALK_SPEED);
      group.visible = true;
    },
    setTarget(next: THREE.Vector3, moveSpeed: number) {
      target.set(next.x, 0, next.z);
      speed = moveSpeed;
      moving = true;
    },
    atTarget() {
      return !moving;
    },
    update(dt: number) {
      if (moving) {
        const to = target.clone().sub(group.position);
        to.y = 0;
        const dist = to.length();
        const step = speed * dt;
        if (dist <= step) {
          group.position.set(target.x, 0, target.z);
          moving = false;
        } else {
          const dir = to.normalize();
          group.position.addScaledVector(dir, step);
          group.position.y = Math.abs(Math.sin(performance.now() / 90)) * 0.14; // run bob
          heading = Math.atan2(dir.x, -dir.z);
        }
      } else {
        group.position.y *= 0.7; // settle bob
        heading *= 0.82; // ease to face the rim (-Z) when idle
      }
      // Only the character body turns; the ring stays flat.
      bodyNode.rotation.y = heading;
    },
    setDead(dead: boolean) {
      if (dead) group.visible = false;
    },
  };
  // Spawn straight onto the first queue layout without gliding from origin.
  group.position.set(4.0 + index * 0.9, 0, -3.4 - index * 1.85);
  return figure;
}

// Procedural hardwood: warm planks with seams and fine grain. Tiled across the
// floor; low material roughness lets the arena env-map add a court sheen.
function makeWoodTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d')!;
  const planks = 7;
  const ph = 512 / planks;
  const bases = ['#b07a42', '#a06e3a', '#b8824a', '#9a6636', '#ad7640'];
  for (let p = 0; p < planks; p += 1) {
    ctx.fillStyle = bases[p % bases.length];
    ctx.fillRect(0, p * ph, 512, ph);
    // grain lines
    for (let g = 0; g < 26; g += 1) {
      ctx.strokeStyle = `rgba(60,38,18,${0.04 + Math.random() * 0.06})`;
      ctx.lineWidth = 0.6 + Math.random();
      ctx.beginPath();
      const y = p * ph + Math.random() * ph;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(170, y + (Math.random() - 0.5) * 6, 340, y + (Math.random() - 0.5) * 6, 512, y + (Math.random() - 0.5) * 4);
      ctx.stroke();
    }
    // plank seam
    ctx.strokeStyle = 'rgba(30,18,8,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, p * ph); ctx.lineTo(512, p * ph); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Diamond-mesh net: white cords on transparent, wrapped around the net cone.
function makeNetTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(240,244,250,0.92)';
  ctx.lineWidth = 3;
  const step = 32;
  for (let y = -256; y < 256; y += step) {
    ctx.beginPath();
    for (let x = 0; x <= 256; x += 8) ctx.lineTo(x, y + x); // diagonal /
    ctx.stroke();
    ctx.beginPath();
    for (let x = 0; x <= 256; x += 8) ctx.lineTo(x, y + 256 - x); // diagonal \
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1.4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const WALK_SPEED = 6;
export const RUN_SPEED = 11;

// Where AI holders stand to shoot. The primary spot is a short step INWARD from
// the front of the (right-side) line, so a new shooter never has to cross the
// whole court through center. The user's ball lives on the left, so this keeps
// shooter and ball on opposite sides. The second spot (used only when the user
// is deep in line and two AIs hold at once) flanks on the left.
export const AI_SHOOT_SPOTS = [new THREE.Vector3(2.9, 0, -2.3), new THREE.Vector3(-3.6, 0, -2.7)];
