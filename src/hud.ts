// DOM HUD (per the jam repo convention: UI stays in DOM overlays).
import { PLAYER_CHOICES, Shooter } from './shooters';

export interface LineEntry {
  name: string;
  ft: number;
  isUser: boolean;
  alive: boolean;
  hasBall: boolean;
  status: string;
}

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export class Hud {
  private msgTimer: number | undefined;

  setAlive(alive: number, total: number): void {
    el('hud-alive').innerHTML = `alive <b>${alive}</b> / ${total}`;
  }

  practiceStats(makes: number, attempts: number, pct: number, streak: number, best: number): void {
    el('hud-alive').innerHTML = `<b>${makes}</b>/${attempts} · ${pct}% &nbsp;·&nbsp; streak <b>${streak}</b> &nbsp;·&nbsp; best <b>${best}</b>`;
  }

  renderLine(entries: LineEntry[]): void {
    el('hud-line').innerHTML = entries
      .map((entry) => {
        const cls = ['line-row', entry.isUser ? 'you' : '', entry.alive ? '' : 'dead', entry.hasBall ? 'hasball' : '']
          .filter(Boolean)
          .join(' ');
        const ball = entry.hasBall ? '🏀 ' : '';
        return `<div class="${cls}"><span class="nm">${ball}${entry.name}</span><span class="st">${entry.status || `${Math.round(entry.ft * 100)}% FT`}</span></div>`;
      })
      .join('');
  }

  message(text: string, bad = false, holdMs = 1100): void {
    const node = el('hud-message');
    node.textContent = text;
    node.classList.toggle('bad', bad);
    node.classList.add('show');
    window.clearTimeout(this.msgTimer);
    this.msgTimer = window.setTimeout(() => node.classList.remove('show'), holdMs);
  }

  status(html: string): void {
    el('hud-status').innerHTML = html;
  }

  meterBand(halfwidth: number): void {
    // power 0..2 maps to 0..100%; ideal power 1.0 sits at 50%.
    const left = (1 - halfwidth) * 50;
    const width = halfwidth * 100;
    const band = el('meter-band');
    band.style.left = `${left}%`;
    band.style.width = `${width}%`;
  }

  meterFill(power: number): void {
    el('meter-fill').style.width = `${Math.min(100, power * 50)}%`;
  }

  meterTick(power: number | null): void {
    const tick = el('meter-tick');
    if (power === null) {
      tick.classList.remove('show');
      return;
    }
    tick.style.left = `${Math.min(100, power * 50)}%`;
    tick.classList.add('show');
  }

  meterLabel(text: string): void {
    el('meter-label').textContent = text;
  }

  showStart(onStart: (shooter: Shooter, opponents: number, mode: 'knockout' | 'practice') => void): void {
    const overlay = el('overlay');
    overlay.classList.remove('hidden');
    let shooter = PLAYER_CHOICES[0];
    let count = 4;

    const shooterHost = el('pick-shooter');
    shooterHost.innerHTML = '';
    PLAYER_CHOICES.forEach((choice) => {
      const btn = document.createElement('button');
      btn.className = 'pick-btn';
      btn.innerHTML = `${choice.name}<small>${Math.round(choice.ft * 100)}% FT window</small>`;
      if (choice === shooter) btn.classList.add('sel');
      btn.onclick = () => {
        shooter = choice;
        shooterHost.querySelectorAll('.pick-btn').forEach((b) => b.classList.remove('sel'));
        btn.classList.add('sel');
      };
      shooterHost.appendChild(btn);
    });

    const countHost = el('pick-count');
    countHost.innerHTML = '';
    [2, 4, 7].forEach((n) => {
      const btn = document.createElement('button');
      btn.className = 'pick-btn';
      btn.innerHTML = `${n}<small>players</small>`;
      if (n === count) btn.classList.add('sel');
      btn.onclick = () => {
        count = n;
        countHost.querySelectorAll('.pick-btn').forEach((b) => b.classList.remove('sel'));
        btn.classList.add('sel');
      };
      countHost.appendChild(btn);
    });

    el('btn-start').onclick = () => {
      overlay.classList.add('hidden');
      onStart(shooter, count, 'knockout');
    };
    el('btn-practice').onclick = () => {
      overlay.classList.add('hidden');
      onStart(shooter, count, 'practice');
    };
  }

  showGameOver(champion: boolean, placement: number, total: number): void {
    const overlay = el('overlay');
    const card = el('overlay-card');
    card.innerHTML = champion
      ? `<h1><span>CHAMPION</span></h1>
         <p class="tagline">Last one standing. The line is cleared.</p>
         <button id="btn-start">RUN IT BACK</button>`
      : `<h1 class="ko">KNOCKED <span>OUT</span></h1>
         <p class="tagline">You finished #${placement} of ${total}.</p>
         <button id="btn-start">RUN IT BACK</button>`;
    overlay.classList.remove('hidden');
    (document.getElementById('btn-start') as HTMLButtonElement).onclick = () => window.location.reload();
  }
}
