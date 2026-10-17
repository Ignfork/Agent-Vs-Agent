// Progression: XP, levels, unlocks and rating. Levels unlock cosmetics and
// sidegrades only — never raw stat increases.
import { EMOTES, FRAMES, GADGETS, PALETTES, WEAPONS } from './game';

export const XP_RULES = { participation: 40, win: 60, draw: 25, perRound: 5, roundCap: 60, abandonPenalty: true };

/** Total XP required to reach a level (level 1 = 0). */
export function xpForLevel(level: number): number {
  let total = 0;
  for (let k = 1; k < level; k++) total += 200 + 100 * (k - 1);
  return total;
}
export function levelFromXp(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const base = xpForLevel(level), next = xpForLevel(level + 1);
  return { level, into: xp - base, need: next - base };
}

export interface XpLine { reason: string; xp: number }
export function computeXp(o: { outcome: 'win' | 'loss' | 'draw'; rounds: number; abandoned: boolean; opponentAbandoned: boolean }): XpLine[] {
  if (o.abandoned) return [{ reason: 'Left the match before it ended — no XP', xp: 0 }];
  const lines: XpLine[] = [{ reason: 'Match completed (participation)', xp: XP_RULES.participation }];
  const roundXp = Math.min(XP_RULES.roundCap, o.rounds * XP_RULES.perRound);
  if (roundXp > 0) lines.push({ reason: `${o.rounds} round${o.rounds === 1 ? '' : 's'} fought`, xp: roundXp });
  if (o.outcome === 'win') lines.push({ reason: o.opponentAbandoned ? 'Victory (opponent left)' : 'Victory', xp: XP_RULES.win });
  if (o.outcome === 'draw') lines.push({ reason: 'Draw', xp: XP_RULES.draw });
  return lines;
}

export type UnlockKind = 'palette' | 'frame' | 'emote' | 'weapon' | 'gadget';
export interface Unlock { level: number; kind: UnlockKind; id: string; name: string }
export const UNLOCKS: Unlock[] = [
  ...Object.entries(PALETTES).map(([id, p]) => ({ level: p.level, kind: 'palette' as const, id, name: `${p.name} palette` })),
  ...Object.entries(FRAMES).map(([id, f]) => ({ level: f.level, kind: 'frame' as const, id, name: `${f.name} frame` })),
  ...Object.entries(EMOTES).map(([id, e]) => ({ level: e.level, kind: 'emote' as const, id, name: `“${e.name}” emote` })),
  ...Object.values(WEAPONS).map((w) => ({ level: w.level, kind: 'weapon' as const, id: w.id, name: `${w.name} (sidegrade)` })),
  ...Object.values(GADGETS).map((g) => ({ level: g.level, kind: 'gadget' as const, id: g.id, name: `${g.name} gadget` }))
].sort((a, b) => a.level - b.level);

export const unlocksAt = (level: number) => UNLOCKS.filter((u) => u.level === level && u.level > 1);
export const unlockedBy = (level: number) => UNLOCKS.filter((u) => u.level <= level);

// Elo rating. Everyone starts at 1000. K is higher for the first 10 matches.
export const START_RATING = 1000;
export function eloDelta(ra: number, rb: number, scoreA: number, gamesA: number): number {
  const k = gamesA < 10 ? 40 : 24;
  const expected = 1 / (1 + Math.pow(10, (rb - ra) / 400));
  return Math.round(k * (scoreA - expected));
}
