// Court, hoop, and queue-figure meshes. Units: 1 unit = 1 foot.
// Rim center at (0, 10, -13.75); free-throw line at z = 0.
import * as THREE from 'three';

export const RIM_CENTER = new THREE.Vector3(0, 10, -13.75);
export const RIM_RADIUS = 0.75;
export const BALL_RADIUS = 0.4;
// Just in front of and below the camera so the held ball reads as "in your
// hands" at the bottom of the frame instead of floating mid-court.
export const RELEASE_POINT = new THREE.Vector3(1.9, 4.5, 3.3);

export function buildCourt(scene: THREE.Scene): void {
  // Floor
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xc08a4e, roughness: 0.82 });
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

  // Backboard
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3.6, 0.15),
    new THREE.MeshStandardMaterial({ color: 0xe8edf5, roughness: 0.35, transparent: true, opacity: 0.88 }),
  );
  board.position.set(0, 11.4, -15);
  board.castShadow = true;
  scene.add(board);
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
    new THREE.CylinderGeometry(RIM_RADIUS * 0.96, 0.45, 1.5, 12, 5, true),
    new THREE.MeshBasicMaterial({ color: 0xf3f5f9, wireframe: true, transparent: true, opacity: 0.6 }),
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

export function buildFigure(scene: THREE.Scene, index: number): QueueFigure {
  const group = new THREE.Group();
  const color = FIGURE_COLORS[index % FIGURE_COLORS.length];
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.55, 2.4, 4, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.65 }),
  );
  body.position.y = 1.75;
  body.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.7 }),
  );
  head.position.y = 3.55;
  head.castShadow = true;
  group.add(body, head);
  scene.add(group);
  const target = new THREE.Vector3();
  let speed = 0;
  let moving = false;
  const figure: QueueFigure = {
    group,
    setQueueSlot(slot: number) {
      // Waiting line recedes up the right sideline so every figure stays in
      // frame (never behind the camera).
      figure.setTarget(new THREE.Vector3(4.3 + slot * 1.1, 0, -3.0 - slot * 2.4), WALK_SPEED);
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
      if (!moving) return;
      const to = target.clone().sub(group.position);
      to.y = 0;
      const dist = to.length();
      const step = speed * dt;
      if (dist <= step) {
        group.position.set(target.x, 0, target.z);
        moving = false;
        return;
      }
      group.position.addScaledVector(to.normalize(), step);
      // little run bob
      group.position.y = Math.abs(Math.sin(performance.now() / 90)) * 0.14;
    },
    setDead(dead: boolean) {
      if (dead) group.visible = false;
    },
  };
  // Spawn straight onto the first queue layout without gliding from origin.
  group.position.set(4.3 + index * 1.1, 0, -3.0 - index * 2.4);
  return figure;
}

export const WALK_SPEED = 6;
export const RUN_SPEED = 11;

// Where AI holders stand to shoot: chaser/leader spots flanking the FT line,
// both fully in frame.
export const AI_SHOOT_SPOTS = [new THREE.Vector3(-3.4, 0, -1.6), new THREE.Vector3(3.3, 0, -1.2)];
