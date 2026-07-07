// Lightweight, self-cleaning particle/flash effects for made shots. No physics
// engine — just cheap animated meshes that expand and fade, then remove
// themselves. updateEffects(dt) is pumped from the main loop.
import * as THREE from 'three';

interface Effect {
  update(dt: number): boolean; // returns false when finished
  dispose(): void;
}

const active: Effect[] = [];

// Soft round sprite for spark particles (default point sprites are square).
let sparkTex: THREE.CanvasTexture | null = null;
function sparkTexture(): THREE.CanvasTexture {
  if (sparkTex) return sparkTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,220,120,0.9)');
  g.addColorStop(1, 'rgba(255,200,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  sparkTex = new THREE.CanvasTexture(c);
  return sparkTex;
}

export function updateEffects(dt: number): void {
  for (let i = active.length - 1; i >= 0; i -= 1) {
    if (!active[i].update(dt)) {
      active[i].dispose();
      active.splice(i, 1);
    }
  }
}

// A burst of gold sparks + an expanding ring flash at a made shot.
export function spawnSplash(scene: THREE.Scene, center: THREE.Vector3): void {
  active.push(new SparkBurst(scene, center));
  active.push(new RingFlash(scene, center));
}

class SparkBurst implements Effect {
  private points: THREE.Points;
  private velocities: THREE.Vector3[] = [];
  private mat: THREE.PointsMaterial;
  private t = 0;
  private readonly life = 0.75;

  constructor(private scene: THREE.Scene, center: THREE.Vector3) {
    const count = 44;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = center.x;
      positions[i * 3 + 1] = center.y;
      positions[i * 3 + 2] = center.z;
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 3.5 + Math.random() * 5;
      this.velocities.push(new THREE.Vector3(Math.cos(a) * speed, 2.5 + Math.random() * 4, Math.sin(a) * speed));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.mat = new THREE.PointsMaterial({
      color: 0xffcf40, size: 1.0, map: sparkTexture(), transparent: true, opacity: 1,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    scene.add(this.points);
  }

  update(dt: number): boolean {
    this.t += dt;
    const attr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.velocities.length; i += 1) {
      const v = this.velocities[i];
      v.y -= 9 * dt; // gravity
      attr.setXYZ(i, attr.getX(i) + v.x * dt, attr.getY(i) + v.y * dt, attr.getZ(i) + v.z * dt);
    }
    attr.needsUpdate = true;
    this.mat.opacity = Math.max(0, 1 - this.t / this.life);
    return this.t < this.life;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

class RingFlash implements Effect {
  private ring: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private t = 0;
  private readonly life = 0.45;

  constructor(private scene: THREE.Scene, center: THREE.Vector3) {
    this.mat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.3, 40), this.mat);
    this.ring.position.set(center.x, center.y, center.z + 0.4); // just in front of the rim
    this.ring.lookAt(center.x, center.y, center.z + 10); // face the camera
    scene.add(this.ring);
  }

  update(dt: number): boolean {
    this.t += dt;
    const k = this.t / this.life;
    const scale = 1 + k * 6;
    this.ring.scale.setScalar(scale);
    this.mat.opacity = Math.max(0, 1 - k);
    return this.t < this.life;
  }

  dispose(): void {
    this.scene.remove(this.ring);
    this.ring.geometry.dispose();
    this.mat.dispose();
  }
}
