// Shot resolution + arcade ball flight. Outcome is decided up front from flick
// power vs the shooter's green band (deterministic core, weighted rim-rolls at
// the edges); the visible arc and bounces are cosmetic physics that always
// agree with the decided outcome. Same philosophy as the parent jam repo:
// arcade triggers, no physics engine.
import * as THREE from 'three';
import { BALL_RADIUS, RIM_CENTER, RIM_RADIUS } from './court';
import { makeBall } from './characters';

export type Outcome = 'splash' | 'rim_in' | 'rim_out' | 'short' | 'long' | 'airball';

export interface ShotResult {
  outcome: Outcome;
  made: boolean;
  err: number; // signed power error
}

export function resolveShot(power: number, bandHalf: number): ShotResult {
  const err = power - 1;
  const abs = Math.abs(err);
  if (abs <= bandHalf) return { outcome: 'splash', made: true, err };
  if (abs <= bandHalf * 1.45) {
    const made = Math.random() < 0.45;
    return { outcome: made ? 'rim_in' : 'rim_out', made, err };
  }
  if (err < -0.42) return { outcome: 'airball', made: false, err };
  return { outcome: err < 0 ? 'short' : 'long', made: false, err };
}

interface FlightTarget { point: THREE.Vector3; time: number; apex: number; }

function flightTarget(result: ShotResult, from: THREE.Vector3): FlightTarget {
  const jitterX = (Math.random() - 0.5) * 0.3;
  const distanceScale = Math.max(0.45, from.distanceTo(RIM_CENTER) / 13.5);
  const time = 0.95 * Math.sqrt(distanceScale);
  // Keep the apex low enough that the ball stays within the frame's top edge
  // (camera y≈8.4, FOV 50) rather than arcing out of view mid-flight.
  const apex = RIM_CENTER.y + 2.4 * distanceScale + 1.0;
  switch (result.outcome) {
    case 'splash':
      return { point: new THREE.Vector3(jitterX * 0.4, RIM_CENTER.y, RIM_CENTER.z), time, apex };
    case 'rim_in':
    case 'rim_out':
      return {
        point: new THREE.Vector3(jitterX, RIM_CENTER.y + 0.05, RIM_CENTER.z + (result.err < 0 ? RIM_RADIUS * 0.8 : -RIM_RADIUS * 0.8)),
        time,
        apex,
      };
    case 'short':
      return { point: new THREE.Vector3(jitterX, RIM_CENTER.y, RIM_CENTER.z + RIM_RADIUS + 0.15), time: time * 0.97, apex: apex - 0.8 };
    case 'long':
      return { point: new THREE.Vector3(jitterX, RIM_CENTER.y + 0.4, RIM_CENTER.z - RIM_RADIUS - 0.5), time, apex: apex + 0.8 };
    case 'airball':
      return { point: new THREE.Vector3(jitterX * 3, 2.5, RIM_CENTER.z + 3.2), time: time * 1.05, apex: apex - 2.2 };
  }
}

type Phase = 'idle' | 'arc' | 'drop' | 'bounce' | 'settled';

export interface BallEvents {
  onArrive(result: ShotResult): void; // ball reached the rim/target (play swish/clank here)
  onBounce(): void; // ball hit the floor during a miss bounce
  onMadeSettled(): void; // splash finished dropping through the net
  onMissSettled(position: THREE.Vector3): void; // bounce came to rest
}

export class BallFlight {
  readonly mesh: THREE.Object3D;
  private phase: Phase = 'idle';
  private from = new THREE.Vector3();
  private target = new THREE.Vector3();
  private flightTime = 1;
  private apex = 14;
  private elapsed = 0;
  private velocity = new THREE.Vector3();
  private result: ShotResult | null = null;
  private events: BallEvents;

  constructor(scene: THREE.Scene, events: BallEvents) {
    this.events = events;
    const model = makeBall();
    if (model) {
      this.mesh = model;
      this.mesh.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
    } else {
      const tex = makeBallTexture();
      this.mesh = new THREE.Mesh(
        new THREE.SphereGeometry(BALL_RADIUS, 20, 16),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }),
      );
      this.mesh.castShadow = true;
    }
    this.mesh.visible = false; // hidden until first holdAt/launch (no origin flash)
    scene.add(this.mesh);
  }

  holdAt(point: THREE.Vector3): void {
    this.phase = 'idle';
    this.mesh.position.copy(point);
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  launch(from: THREE.Vector3, result: ShotResult): void {
    this.result = result;
    this.from.copy(from);
    const t = flightTarget(result, from);
    this.target.copy(t.point);
    this.flightTime = t.time;
    this.apex = t.apex;
    this.elapsed = 0;
    this.phase = 'arc';
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (this.phase === 'idle' || this.phase === 'settled') return;
    this.mesh.rotation.x -= dt * 7;

    if (this.phase === 'arc') {
      this.elapsed += dt;
      const u = Math.min(1, this.elapsed / this.flightTime);
      const pos = this.from.clone().lerp(this.target, u);
      const base = THREE.MathUtils.lerp(this.from.y, this.target.y, u);
      pos.y = base + (this.apex - Math.max(this.from.y, this.target.y)) * 4 * u * (1 - u);
      this.mesh.position.copy(pos);
      if (u >= 1) this.arriveAtTarget();
      return;
    }

    if (this.phase === 'drop') {
      this.mesh.position.y -= dt * 9;
      if (this.mesh.position.y <= RIM_CENTER.y - 2.2) {
        this.phase = 'settled';
        this.events.onMadeSettled();
      }
      return;
    }

    if (this.phase === 'bounce') {
      this.velocity.y -= 32 * dt;
      this.mesh.position.addScaledVector(this.velocity, dt);
      if (this.mesh.position.y <= BALL_RADIUS) {
        this.mesh.position.y = BALL_RADIUS;
        this.velocity.y = Math.abs(this.velocity.y) * 0.55;
        this.velocity.x *= 0.8;
        this.velocity.z *= 0.8;
        if (this.velocity.y > 1.2) this.events.onBounce();
        if (this.velocity.length() < 2.2) {
          this.phase = 'settled';
          this.events.onMissSettled(this.mesh.position.clone());
        }
      }
    }
  }

  private arriveAtTarget(): void {
    const result = this.result;
    if (!result) return;
    this.events.onArrive(result);
    if (result.made) {
      this.phase = 'drop';
      this.mesh.position.set(RIM_CENTER.x, RIM_CENTER.y - 0.1, RIM_CENTER.z);
      return;
    }
    // Miss: hand off to bounce physics with a velocity that matches the miss type.
    this.phase = 'bounce';
    const rand = (spread: number) => (Math.random() - 0.5) * spread;
    switch (result.outcome) {
      case 'short':
        this.velocity.set(rand(7), 8 + Math.random() * 4, 9 + Math.random() * 5);
        break;
      case 'long':
        this.velocity.set(rand(10), 9 + Math.random() * 4, Math.random() < 0.5 ? 5 + Math.random() * 6 : -(2 + Math.random() * 3));
        break;
      case 'rim_out':
        this.velocity.set(rand(12), 10 + Math.random() * 4, 4 + Math.random() * 8);
        break;
      case 'airball':
        this.velocity.set(rand(4), 2.5, 6 + Math.random() * 3);
        break;
      default:
        this.velocity.set(rand(6), 8, 8);
    }
  }
}

function makeBallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e07830';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#3a2415';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 64); ctx.lineTo(128, 64);
  ctx.moveTo(64, 0); ctx.lineTo(64, 128);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(64, 64, 40, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
