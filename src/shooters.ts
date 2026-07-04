// Real NBA shooters with (approximate) career free-throw percentages.
// Names + stats are public facts — no likenesses, jerseys, or team logos.
export interface Shooter {
  name: string;
  ft: number; // career FT% as 0..1
}

export const SHOOTERS: Shooter[] = [
  { name: 'Stephen Curry', ft: 0.910 },
  { name: 'Steve Nash', ft: 0.904 },
  { name: 'Larry Bird', ft: 0.886 },
  { name: 'Kevin Durant', ft: 0.884 },
  { name: 'Dirk Nowitzki', ft: 0.879 },
  { name: 'Damian Lillard', ft: 0.897 },
  { name: 'Kawhi Leonard', ft: 0.857 },
  { name: 'LeBron James', ft: 0.735 },
  { name: 'Giannis Antetokounmpo', ft: 0.690 },
  { name: 'Dwight Howard', ft: 0.567 },
  { name: "Shaquille O'Neal", ft: 0.527 },
  { name: 'Andre Drummond', ft: 0.470 },
  { name: 'Ben Wallace', ft: 0.414 },
];

// Choices offered to the player on the start screen (easy / medium / hard).
export const PLAYER_CHOICES: Shooter[] = [
  SHOOTERS[0], // Curry
  SHOOTERS[7], // LeBron
  SHOOTERS[10], // Shaq
];

// Make-window halfwidth from FT%: elite shooters get a wide green band,
// bricklayers get a sliver. Tuned so Curry ~= 2.6x Shaq's window.
export function bandHalfwidth(ft: number): number {
  const t = Math.min(1, Math.max(0, (ft - 0.40) / 0.55));
  return 0.035 + 0.15 * t;
}

export function pickOpponents(count: number, excludeName: string): Shooter[] {
  const pool = SHOOTERS.filter((s) => s.name !== excludeName);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
