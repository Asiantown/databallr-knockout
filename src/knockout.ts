// Knockout game engine — the classic playground rules:
// a line of shooters, the front two have balls, and if the person behind you
// scores before you do, you're out. Make your shot -> pass the ball on and
// rejoin the back of the line. Last one standing wins.
//
// The race is PHYSICAL: AI holders walk to their spot at the line, dribble,
// launch a real ball at the same rim, chase their own rebounds, and jog to the
// back of the queue after a make. AI accuracy isn't hidden dice — every AI
// shot is a noisy "flick" resolved through the same power-band physics the
// user plays, with the band set by their REAL career FT% (the databallr hook).
//
// Message discipline (UX): the big center text belongs to the USER's moments
// (your result, YOUR BALL, eliminations, the win). AI play is visible in the
// world and ticks in the side rail — it never talks over your shot.
import * as THREE from 'three';
import { BallFlight, resolveShot, ShotResult } from './shot';
import { AI_SHOOT_SPOTS, RELEASE_POINT, RIM_CENTER, RUN_SPEED, WALK_SPEED, buildFigure, QueueFigure } from './court';
import { FlickInput } from './input';
import { Hud } from './hud';
import { Sfx } from './sfx';
import { Shooter, bandHalfwidth, pickOpponents } from './shooters';

type PlayerPhase = 'idle' | 'aiming' | 'flight' | 'rebounding' | 'putback';

interface Player {
  name: string;
  ft: number;
  isUser: boolean;
  alive: boolean;
  phase: PlayerPhase;
  timer: number;
  possessionStart: number | null;
  status: string;
  figure: QueueFigure | null;
  ball: BallFlight | null;
  isPutback: boolean;
}

export interface GameStateSnapshot {
  userPhase: PlayerPhase;
  over: boolean;
  alive: number;
  total: number;
  queue: string[];
  lastPower: number | null;
  lastOutcome: string | null;
}

const PUTBACK_BAND_MULT = 1.9;
const AI_FLICK_SIGMA = 0.1; // wrist noise; make rate then emerges from the FT% band
const AI_VOLUME = 0.35;

const MISS_LABELS: Record<string, string> = {
  short: 'FRONT RIM',
  long: 'BACK IRON',
  rim_out: 'RIMS OUT',
  airball: 'AIRBALL',
};

function gauss(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class KnockoutGame {
  private players: Player[] = [];
  private queue: Player[] = [];
  private hud: Hud;
  private sfx: Sfx;
  private scene: THREE.Scene;
  private ball: BallFlight; // the user's ball
  private input: FlickInput;
  private clock = 0;
  private over = false;
  private totalPlayers: number;
  private userPutbackFrom: THREE.Vector3 | null = null;
  private lastResult: ShotResult | null = null;
  private lastPower: number | null = null;

  constructor(scene: THREE.Scene, hud: Hud, sfx: Sfx, userShooter: Shooter, opponentCount: number) {
    this.hud = hud;
    this.sfx = sfx;
    this.scene = scene;
    this.ball = new BallFlight(scene, {
      onArrive: (result) => {
        if (result.made) this.sfx.swish();
        else if (result.outcome !== 'airball') this.sfx.rim();
      },
      onBounce: () => this.sfx.bounce(),
      onMadeSettled: () => this.userShotFinished(),
      onMissSettled: (pos) => this.userMissSettled(pos),
    });
    this.input = new FlickInput(
      (flick) => this.userFlick(flick.power),
      (power) => this.hud.meterFill(power),
      () => this.hud.message('TOO SOFT — FLICK FASTER', true, 900),
    );

    const user: Player = {
      name: `You · ${lastName(userShooter.name)}`,
      ft: userShooter.ft,
      isUser: true,
      alive: true,
      phase: 'idle',
      timer: 0,
      possessionStart: null,
      status: 'in line',
      figure: null,
      ball: null,
      isPutback: false,
    };
    const ais = pickOpponents(opponentCount, userShooter.name).map((s, i): Player => ({
      name: s.name,
      ft: s.ft,
      isUser: false,
      alive: true,
      phase: 'idle',
      timer: 0,
      possessionStart: null,
      status: 'in line',
      figure: buildFigure(scene, i),
      ball: null,
      isPutback: false,
    }));

    // User starts second in line (chaser) so the pressure is on immediately.
    this.players = [ais[0], user, ...ais.slice(1)];
    this.queue = [...this.players];
    this.totalPlayers = this.players.length;

    this.assignBalls();
    this.refreshHud();
  }

  // QA-only: fire the user's shot at an exact power (bypasses input timing,
  // which is unreliable under headless software rendering). No effect unless the
  // user is currently aiming/putback — same guard as a real flick.
  testShoot(power: number): void {
    this.userFlick(power);
  }

  snapshot(): GameStateSnapshot {
    const user = this.userPlayer();
    return {
      userPhase: user?.phase ?? 'idle',
      over: this.over,
      alive: this.queue.length,
      total: this.totalPlayers,
      queue: this.queue.map((p) => p.name),
      lastPower: this.lastPower,
      lastOutcome: this.lastResult?.outcome ?? null,
    };
  }

  update(dt: number): void {
    if (this.over) return;
    this.clock += dt;
    this.ball.update(dt);
    for (const player of this.players) {
      player.figure?.update(dt);
      player.ball?.update(dt);
      if (!player.alive || player.possessionStart === null) continue;
      if (player.isUser) this.updateUser(player, dt);
      else this.updateAi(player, dt);
    }
  }

  // --- ball assignment / queue ------------------------------------------------

  private holders(): Player[] {
    return this.queue.slice(0, 2);
  }

  private assignBalls(): void {
    for (const player of this.holders()) {
      if (player.possessionStart === null) {
        player.possessionStart = this.clock;
        this.startAttempt(player);
      }
    }
    this.positionFigures();
  }

  private aiBall(player: Player): BallFlight {
    if (!player.ball) {
      player.ball = new BallFlight(this.scene, {
        onArrive: (result) => {
          if (result.made) this.sfx.swish(AI_VOLUME);
          else if (result.outcome !== 'airball') this.sfx.rim(AI_VOLUME);
        },
        onBounce: () => this.sfx.bounce(AI_VOLUME),
        onMadeSettled: () => {
          if (player.alive && !this.over) this.handleMake(player);
        },
        onMissSettled: (pos) => {
          if (!player.alive || this.over || player.possessionStart === null) return;
          player.phase = 'rebounding';
          player.status = 'chasing board…';
          player.figure?.setTarget(pos, RUN_SPEED);
          this.refreshHud();
        },
      });
    }
    return player.ball;
  }

  private startAttempt(player: Player): void {
    player.isPutback = false;
    if (player.isUser) {
      player.phase = 'aiming';
      player.status = 'shooting…';
      this.userPutbackFrom = null;
      this.ball.holdAt(RELEASE_POINT);
      this.input.setEnabled(true);
      this.hud.meterBand(bandHalfwidth(player.ft));
      this.hud.meterLabel('free throw — flick · swipe · hold space');
      this.hud.message('YOUR BALL', false, 900);
      this.sfx.yourBall();
      const other = this.holders().find((p) => p !== player && p.possessionStart !== null);
      const otherStart = other?.possessionStart;
      const myStart = player.possessionStart;
      let pressure = '';
      if (other && !other.isUser && otherStart !== null && otherStart !== undefined && myStart !== null) {
        pressure = otherStart < myStart
          ? ` Score before ${lastName(other.name)} to knock him out!`
          : ` ${lastName(other.name)} is shooting behind you.`;
      }
      this.hud.status(`<b>Your ball.</b> Green window = ${Math.round(player.ft * 100)}% FT.${pressure}`);
    } else {
      player.phase = 'aiming';
      player.timer = 1.9 + Math.random() * 1.5;
      player.status = 'shooting…';
      this.aiBall(player); // ensure the ball exists; it renders during the dribble
    }
  }

  // --- user flow ----------------------------------------------------------------

  private updateUser(player: Player, dt: number): void {
    if (player.phase === 'rebounding') {
      player.timer -= dt;
      if (player.timer <= 0) {
        player.phase = 'putback';
        player.status = 'putback!';
        const from = this.userPutbackFrom ?? new THREE.Vector3(0, 6, -11);
        this.ball.holdAt(from);
        this.input.setEnabled(true);
        this.hud.meterBand(bandHalfwidth(player.ft) * PUTBACK_BAND_MULT);
        this.hud.meterLabel('PUTBACK — quick flick!');
        this.hud.status('<b>Putback!</b> Close range — bigger window.');
        this.refreshHud();
      }
    }
  }

  private userFlick(power: number): void {
    const user = this.userPlayer();
    if (!user || this.over) return;
    if (user.phase !== 'aiming' && user.phase !== 'putback') return;
    const isPutback = user.phase === 'putback';
    const band = bandHalfwidth(user.ft) * (isPutback ? PUTBACK_BAND_MULT : 1);
    const result = resolveShot(power, band);
    const from = isPutback && this.userPutbackFrom ? this.userPutbackFrom : RELEASE_POINT;
    this.lastResult = result;
    this.lastPower = power;
    user.phase = 'flight';
    user.status = 'ball in air';
    this.input.setEnabled(false);
    this.hud.meterTick(power);
    this.ball.launch(from.clone(), result);
    this.hud.meterFill(0);
    this.refreshHud();
  }

  private userShotFinished(): void {
    const user = this.userPlayer();
    if (!user || !user.alive || this.over) return;
    this.hud.message('SPLASH!');
    this.handleMake(user);
  }

  private userMissSettled(position: THREE.Vector3): void {
    const user = this.userPlayer();
    if (!user || !user.alive || this.over || user.possessionStart === null) return;
    const runDistance = position.distanceTo(new THREE.Vector3(0, 0, 0));
    user.phase = 'rebounding';
    user.timer = 0.5 + runDistance * 0.09;
    user.status = 'chasing board…';
    const label = MISS_LABELS[this.lastResult?.outcome ?? ''] ?? 'NO GOOD';
    this.hud.message(label, true, 800);
    this.hud.status('Chasing the rebound…');
    this.refreshHud();
    // Putback spot: pulled toward the basket from wherever the ball settled.
    this.userPutbackFrom = new THREE.Vector3(
      THREE.MathUtils.clamp(position.x, -4, 4),
      6.0,
      THREE.MathUtils.clamp(position.z, RIM_CENTER.z + 1.5, -7.5),
    );
  }

  // --- AI flow: visible, physical, same shot physics as the user ------------------

  private updateAi(player: Player, dt: number): void {
    const figure = player.figure;
    if (!figure) return;

    if (player.phase === 'aiming') {
      // Walk to the spot first (carrying the ball), then dribble and shoot.
      if (!figure.atTarget()) {
        this.carry(player);
        return;
      }
      this.dribble(player);
      player.timer -= dt;
      if (player.timer > 0) return;
      this.aiLaunch(player);
      return;
    }

    if (player.phase === 'rebounding') {
      if (!figure.atTarget()) return;
      player.phase = 'putback';
      player.timer = 0.35 + Math.random() * 0.3;
      player.status = 'putback…';
      this.refreshHud();
      return;
    }

    if (player.phase === 'putback') {
      this.dribble(player);
      player.timer -= dt;
      if (player.timer > 0) return;
      player.isPutback = true;
      this.aiLaunch(player);
    }
  }

  private carry(player: Player): void {
    const figure = player.figure;
    const ball = player.ball;
    if (!figure || !ball) return;
    const base = figure.group.position;
    ball.holdAt(new THREE.Vector3(base.x + 0.7, 2.9, base.z + 0.3));
  }

  private dribble(player: Player): void {
    const figure = player.figure;
    const ball = player.ball;
    if (!figure || !ball) return;
    const base = figure.group.position;
    const bob = Math.abs(Math.sin(performance.now() / 140));
    ball.holdAt(new THREE.Vector3(base.x + 0.75, 0.5 + bob * 2.6, base.z + 0.2));
  }

  private aiLaunch(player: Player): void {
    const figure = player.figure;
    if (!figure) return;
    const band = bandHalfwidth(player.ft) * (player.isPutback ? PUTBACK_BAND_MULT : 1);
    const power = 1 + gauss() * AI_FLICK_SIGMA;
    const result = resolveShot(power, band);
    const from = figure.group.position.clone();
    from.y = 6.0;
    from.z -= 0.5;
    player.phase = 'flight';
    player.status = 'ball in air';
    this.aiBall(player).launch(from, result);
    this.refreshHud();
  }

  // --- knockout rules ---------------------------------------------------------------

  private handleMake(maker: Player): void {
    if (this.over) return;
    const holders = this.holders();
    const other = holders.find((p) => p !== maker && p.possessionStart !== null);

    // The later possession knocks out the earlier one.
    if (
      other &&
      maker.possessionStart !== null &&
      other.possessionStart !== null &&
      maker.possessionStart > other.possessionStart
    ) {
      this.eliminate(other);
      if (this.over) return;
    }

    // Maker passes the ball on and rejoins the back of the line.
    maker.possessionStart = null;
    maker.phase = 'idle';
    maker.status = 'in line';
    maker.ball?.hide();
    if (maker.isUser) {
      this.input.setEnabled(false);
      this.ball.hide();
      this.hud.meterTick(null);
      this.hud.meterLabel('in line — the ball comes back when someone scores');
      this.hud.status('Made it. Watch the race — you shoot again soon.');
    }
    const idx = this.queue.indexOf(maker);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
      this.queue.push(maker);
    }

    this.assignBalls();
    this.refreshHud();
    this.checkWin();
  }

  private eliminate(victim: Player): void {
    victim.alive = false;
    victim.possessionStart = null;
    victim.phase = 'idle';
    victim.status = 'OUT';
    victim.ball?.hide();
    victim.figure?.setDead(true);
    const placement = this.queue.length;
    const idx = this.queue.indexOf(victim);
    if (idx >= 0) this.queue.splice(idx, 1);
    this.sfx.knockout();

    if (victim.isUser) {
      this.over = true;
      this.input.setEnabled(false);
      this.ball.hide();
      this.hud.message('KNOCKED OUT', true, 2000);
      this.refreshHud();
      this.hud.showGameOver(false, placement, this.totalPlayers);
      return;
    }
    this.hud.message(`${lastName(victim.name)} IS OUT`, true, 1000);
    this.refreshHud();
  }

  private checkWin(): void {
    if (this.queue.length !== 1 || this.over) {
      return;
    }
    this.over = true;
    const winner = this.queue[0];
    this.input.setEnabled(false);
    this.refreshHud();
    if (winner.isUser) {
      this.sfx.champion();
      this.hud.message('CHAMPION!', false, 2500);
      this.hud.showGameOver(true, 1, this.totalPlayers);
    } else {
      this.hud.showGameOver(false, 2, this.totalPlayers);
    }
  }

  // --- presentation -----------------------------------------------------------------

  private positionFigures(): void {
    const holders = this.holders();
    let aiHolderSlot = 0;
    let lineSlot = 0;
    for (const player of this.queue) {
      if (player.isUser || !player.figure) {
        if (player.isUser) lineSlot += 1;
        continue;
      }
      if (holders.includes(player)) {
        // AI shooters walk to their spot flanking the FT line.
        const spot = AI_SHOOT_SPOTS[Math.min(aiHolderSlot, AI_SHOOT_SPOTS.length - 1)];
        player.figure.setTarget(spot, WALK_SPEED);
        aiHolderSlot += 1;
      } else {
        player.figure.setQueueSlot(lineSlot);
      }
      lineSlot += 1;
    }
  }

  private lineEntries() {
    const holders = this.holders();
    const inQueue = this.queue.map((p) => ({
      name: p.name,
      ft: p.ft,
      isUser: p.isUser,
      alive: p.alive,
      hasBall: holders.includes(p) && p.possessionStart !== null,
      status: p.status,
    }));
    const dead = this.players
      .filter((p) => !p.alive)
      .map((p) => ({ name: p.name, ft: p.ft, isUser: p.isUser, alive: false, hasBall: false, status: 'OUT' }));
    return [...inQueue, ...dead];
  }

  private refreshHud(): void {
    this.hud.setAlive(this.queue.length, this.totalPlayers);
    this.hud.renderLine(this.lineEntries());
  }

  private userPlayer(): Player | undefined {
    return this.players.find((p) => p.isUser);
  }
}

function lastName(name: string): string {
  const parts = name.split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : name;
}
