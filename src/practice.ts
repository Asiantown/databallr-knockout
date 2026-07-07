// Open-court PRACTICE mode: no opponents, no knockout — just you at the line,
// shooting free throws to dial in your flick (great for calibrating the webcam
// wrist-flick). Shoot, the ball comes right back, and makes/misses/streak are
// tracked. Reuses the exact ball, shot physics, inputs, and splash juice as the
// knockout game.
import * as THREE from 'three';
import { BallFlight, resolveShot } from './shot';
import { RELEASE_POINT, RIM_CENTER } from './court';
import { FlickInput } from './input';
import { Hud } from './hud';
import { Sfx } from './sfx';
import { spawnSplash } from './effects';
import { Shooter, bandHalfwidth } from './shooters';

const MISS_LABELS: Record<string, string> = { short: 'SHORT', long: 'LONG', rim_out: 'RIM OUT', airball: 'AIRBALL' };

export class PracticeGame {
  private ball: BallFlight;
  private input: FlickInput;
  private phase: 'aiming' | 'flight' = 'aiming';
  private makes = 0;
  private attempts = 0;
  private streak = 0;
  private best = 0;
  private lastOutcome: string | null = null;
  private lastPower: number | null = null;
  private rearmIn = 0;

  constructor(scene: THREE.Scene, private hud: Hud, private sfx: Sfx, private shooter: Shooter) {
    this.ball = new BallFlight(scene, {
      onArrive: (r) => {
        if (r.made) { this.sfx.swish(); spawnSplash(scene, RIM_CENTER); }
        else if (r.outcome !== 'airball') this.sfx.rim();
      },
      onBounce: () => this.sfx.bounce(),
      onMadeSettled: () => this.settle(true),
      onMissSettled: () => this.settle(false),
    });
    this.input = new FlickInput(
      (flick) => this.shootAt(flick.power),
      (power) => this.hud.meterFill(power),
      () => this.hud.message('TOO SOFT — FLICK FASTER', true, 900),
    );
    this.hud.renderLine([]); // no line of opponents in practice
    this.updateStats();
    this.arm(true);
  }

  private arm(first = false): void {
    this.phase = 'aiming';
    this.ball.holdAt(RELEASE_POINT);
    this.input.setEnabled(true);
    this.hud.meterBand(bandHalfwidth(this.shooter.ft));
    this.hud.meterLabel('free throw — flick · swipe · hold space');
    this.hud.meterFill(0);
    this.hud.meterTick(null);
    if (first) { this.hud.message('PRACTICE', false, 900); this.sfx.yourBall(); }
    this.hud.status(`<b>${lastName(this.shooter.name)}</b> · ${Math.round(this.shooter.ft * 100)}% FT window — flick to shoot, the ball comes right back.`);
  }

  // Called by drag/swipe/space (internal FlickInput) and by the webcam input.
  shootAt(power: number): void {
    if (this.phase !== 'aiming') return;
    const result = resolveShot(power, bandHalfwidth(this.shooter.ft));
    this.lastOutcome = result.outcome;
    this.lastPower = power;
    this.attempts += 1;
    this.phase = 'flight';
    this.input.setEnabled(false);
    this.hud.meterTick(power);
    this.hud.meterFill(0);
    this.ball.launch(RELEASE_POINT.clone(), result);
  }

  private settle(made: boolean): void {
    if (made) {
      this.makes += 1;
      this.streak += 1;
      this.best = Math.max(this.best, this.streak);
      this.hud.message(this.streak >= 3 ? `SWISH!  ${this.streak} in a row` : 'SWISH!');
      if (this.streak === 3 || this.streak === 5 || (this.streak >= 8 && this.streak % 5 === 0)) this.sfx.champion();
    } else {
      this.streak = 0;
      this.hud.message(MISS_LABELS[this.lastOutcome ?? ''] ?? 'NO GOOD', true, 800);
    }
    this.updateStats();
    this.rearmIn = 0.4; // brief beat, then the ball returns
  }

  update(dt: number): void {
    this.ball.update(dt);
    if (this.rearmIn > 0) {
      this.rearmIn -= dt;
      if (this.rearmIn <= 0) this.arm();
    }
  }

  private updateStats(): void {
    const pct = this.attempts ? Math.round((this.makes / this.attempts) * 100) : 0;
    this.hud.practiceStats(this.makes, this.attempts, pct, this.streak, this.best);
  }

  snapshot(): Record<string, unknown> {
    return {
      mode: 'practice', phase: this.phase, makes: this.makes, attempts: this.attempts,
      streak: this.streak, best: this.best, lastPower: this.lastPower, lastOutcome: this.lastOutcome,
    };
  }
}

function lastName(name: string): string {
  const parts = name.split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : name;
}
