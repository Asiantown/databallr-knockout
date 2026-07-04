// Knockout game engine — the classic playground rules:
// a line of shooters, the front two have balls, and if the person behind you
// scores before you do, you're out. Make your shot -> pass the ball on and
// rejoin the back of the line. Last one standing wins.
//
// The user's ball is the only one rendered in 3D; every AI race is legible
// through the HUD line (statuses tick in real time). AI make/miss odds are the
// shooters' REAL career FT% — that's the databallr hook.
import * as THREE from 'three';
import { BallFlight, resolveShot } from './shot';
import { RELEASE_POINT, RIM_CENTER, buildFigure, QueueFigure } from './court';
import { FlickInput } from './input';
import { Hud } from './hud';
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
}

const PUTBACK_BAND_MULT = 1.9;
const PUTBACK_ODDS_BONUS = 0.28;

export class KnockoutGame {
  private players: Player[] = [];
  private queue: Player[] = [];
  private hud: Hud;
  private ball: BallFlight;
  private input: FlickInput;
  private clock = 0;
  private over = false;
  private totalPlayers: number;
  private userPutbackFrom: THREE.Vector3 | null = null;

  constructor(scene: THREE.Scene, hud: Hud, userShooter: Shooter, opponentCount: number) {
    this.hud = hud;
    this.ball = new BallFlight(scene, {
      onMadeSettled: () => this.userShotFinished(true),
      onMissSettled: (pos) => this.userMissSettled(pos),
    });
    this.input = new FlickInput(
      (flick) => this.userFlick(flick.power),
      (power) => this.hud.meterFill(power),
    );

    const user: Player = {
      name: `You (${userShooter.name})`,
      ft: userShooter.ft,
      isUser: true,
      alive: true,
      phase: 'idle',
      timer: 0,
      possessionStart: null,
      status: 'in line',
      figure: null,
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
    }));

    // User starts second in line (chaser) so the pressure is on immediately.
    this.players = [ais[0], user, ...ais.slice(1)];
    this.queue = [...this.players];
    this.totalPlayers = this.players.length;

    this.assignBalls();
    this.refreshHud();
  }

  update(dt: number): void {
    if (this.over) return;
    this.clock += dt;
    this.ball.update(dt);

    for (const player of this.players) {
      if (!player.alive || player.possessionStart === null) continue;
      if (player.isUser) {
        this.updateUser(player, dt);
      } else {
        this.updateAi(player, dt);
      }
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

  private startAttempt(player: Player): void {
    if (player.isUser) {
      player.phase = 'aiming';
      player.status = 'shooting…';
      this.userPutbackFrom = null;
      this.ball.holdAt(RELEASE_POINT);
      this.input.setEnabled(true);
      this.hud.meterBand(bandHalfwidth(player.ft));
      this.hud.meterLabel('flick up to shoot — free throw');
      this.hud.status(`<b>Your ball.</b> Land the flick in the green window (${Math.round(player.ft * 100)}% FT).`);
    } else {
      player.phase = 'aiming';
      player.timer = 1.8 + Math.random() * 1.4;
      player.status = 'shooting…';
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
        this.hud.status('<b>Putback!</b> Close range — bigger window. Flick!');
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
    user.phase = 'flight';
    user.status = 'ball in air';
    this.input.setEnabled(false);
    this.hud.meterTick(power);
    this.ball.launch(from.clone(), result);
    this.hud.meterFill(0);
  }

  private userShotFinished(made: boolean): void {
    const user = this.userPlayer();
    if (!user || !user.alive || this.over) return;
    if (made) {
      this.hud.message('SPLASH!');
      this.handleMake(user);
    }
  }

  private userMissSettled(position: THREE.Vector3): void {
    const user = this.userPlayer();
    if (!user || !user.alive || this.over || user.possessionStart === null) return;
    const runDistance = position.distanceTo(new THREE.Vector3(0, 0, 0));
    user.phase = 'rebounding';
    user.timer = 0.5 + runDistance * 0.09;
    user.status = 'chasing board…';
    this.hud.message('OFF THE RIM', true, 700);
    this.hud.status('Chasing the rebound…');
    // Putback spot: pulled toward the basket from wherever the ball settled.
    this.userPutbackFrom = new THREE.Vector3(
      THREE.MathUtils.clamp(position.x, -4, 4),
      6.0,
      THREE.MathUtils.clamp(position.z, RIM_CENTER.z + 1.5, -7.5),
    );
  }

  // --- AI flow --------------------------------------------------------------------

  private updateAi(player: Player, dt: number): void {
    player.timer -= dt;
    if (player.timer > 0) return;
    if (player.phase === 'aiming') {
      if (Math.random() < player.ft) {
        this.handleMake(player);
      } else {
        player.phase = 'rebounding';
        player.timer = 1.6 + Math.random() * 1.2;
        player.status = 'chasing board…';
        this.refreshHud();
      }
    } else if (player.phase === 'rebounding') {
      player.phase = 'putback';
      player.timer = 0.7 + Math.random() * 0.6;
      player.status = 'putback…';
      this.refreshHud();
    } else if (player.phase === 'putback') {
      if (Math.random() < Math.min(0.95, player.ft + PUTBACK_ODDS_BONUS)) {
        this.handleMake(player);
      } else {
        player.phase = 'rebounding';
        player.timer = 1.2 + Math.random() * 1.0;
        player.status = 'chasing board…';
        this.refreshHud();
      }
    }
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
      this.eliminate(other, maker);
      if (this.over) return;
    }

    // Maker passes the ball on and rejoins the back of the line.
    maker.possessionStart = null;
    maker.phase = 'idle';
    maker.status = 'in line';
    if (!maker.isUser) {
      maker.timer = 0;
    } else {
      this.input.setEnabled(false);
      this.ball.hide();
      this.hud.meterTick(null);
      this.hud.meterLabel('in line — waiting for the ball');
      this.hud.status('Made it. Back of the line — watch the race.');
    }
    const idx = this.queue.indexOf(maker);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
      this.queue.push(maker);
    }
    if (!maker.isUser) this.hud.message(`${shortName(maker.name)} scores`, false, 800);

    this.assignBalls();
    this.refreshHud();
    this.checkWin();
  }

  private eliminate(victim: Player, by: Player): void {
    victim.alive = false;
    victim.possessionStart = null;
    victim.phase = 'idle';
    victim.status = 'OUT';
    victim.figure?.setDead(true);
    const placement = this.queue.length;
    const idx = this.queue.indexOf(victim);
    if (idx >= 0) this.queue.splice(idx, 1);

    if (victim.isUser) {
      this.over = true;
      this.input.setEnabled(false);
      this.ball.hide();
      this.hud.message('KNOCKED OUT', true, 2000);
      this.hud.renderLine(this.lineEntries());
      this.hud.showGameOver(false, placement, this.totalPlayers);
      return;
    }
    this.hud.message(`${shortName(victim.name)} is OUT`, true, 1000);
    void by;
  }

  private checkWin(): void {
    if (this.queue.length !== 1 || this.over) {
      return;
    }
    this.over = true;
    const winner = this.queue[0];
    this.input.setEnabled(false);
    if (winner.isUser) {
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
        // AI shooters stand to the left of the user's spot at the line.
        player.figure.group.position.set(-3.4 - aiHolderSlot * 1.7, 0, 0.4 + aiHolderSlot * 0.8);
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
      name: p.isUser ? p.name : p.name,
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

function shortName(name: string): string {
  const parts = name.split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : name;
}
