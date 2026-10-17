// Deterministic combat engine. The server is the only authority in online
// matches; clients run the same code for demo mode and to verify replays.
// Every random roll is derived from (seed, round, side, tag), so a revealed
// seed plus the action log reproduces a match exactly.

import { ActionId, CLASSES, GADGETS, Loadout, Range, RULES, WEAPONS } from './game';

export type Side = 'a' | 'b';
export const other = (s: Side): Side => (s === 'a' ? 'b' : 'a');

export interface FighterState {
  hp: number; maxHp: number; energy: number; cooldown: number;
  shield: number; shieldRounds: number; mirageRounds: number;
  blinkBonus: boolean; freeShot: boolean;
}
export interface CombatEvent {
  type: 'attack' | 'evade' | 'block' | 'gadget' | 'move' | 'fallback' | 'timeout' | 'info';
  side: Side; text: string; dmg?: number; crit?: boolean; absorbed?: number; heal?: number;
}
export interface RoundResult {
  round: number; actions: Record<Side, ActionId>; requested: Record<Side, ActionId>;
  rangeBefore: Range; rangeAfter: Range; events: CombatEvent[];
  hp: Record<Side, number>; energy: Record<Side, number>; damage: Record<Side, number>;
}
export interface MatchState {
  seed: string; round: number; range: Range;
  loadouts: Record<Side, Loadout>; f: Record<Side, FighterState>;
  over: boolean; winner: Side | 'draw' | null; endReason: 'ko' | 'rounds' | null;
  rounds: RoundResult[];
}

function fnv(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** Deterministic roll in [0,1) from the match seed and a label. */
export function roll(seed: string, round: number, side: Side, tag: string): number {
  let a = fnv(`${seed}|${round}|${side}|${tag}`);
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function initMatch(seed: string, a: Loadout, b: Loadout): MatchState {
  const mk = (l: Loadout): FighterState => {
    const hp = CLASSES[l.classId].hp;
    return { hp, maxHp: hp, energy: RULES.startEnergy, cooldown: 0, shield: 0, shieldRounds: 0, mirageRounds: 0, blinkBonus: false, freeShot: false };
  };
  return { seed, round: 1, range: RULES.startRange, loadouts: { a, b }, f: { a: mk(a), b: mk(b) }, over: false, winner: null, endReason: null, rounds: [] };
}

export function actionCost(s: MatchState, side: Side, act: ActionId): number {
  const l = s.loadouts[side], f = s.f[side];
  if (act === 'attack') return f.freeShot ? 0 : WEAPONS[l.weapon].cost;
  if (act === 'gadget') return GADGETS[l.gadget].cost;
  if (act === 'move') return CLASSES[l.classId].moveCost;
  return 0;
}

/** Which actions are legal right now, with a reason when not. */
export function legalActions(s: MatchState, side: Side): Record<ActionId, { ok: boolean; reason?: string; cost: number }> {
  const f = s.f[side];
  const out = {} as Record<ActionId, { ok: boolean; reason?: string; cost: number }>;
  (['attack', 'defend', 'gadget', 'move'] as ActionId[]).forEach((a) => {
    const cost = actionCost(s, side, a);
    if (s.over) out[a] = { ok: false, reason: 'Match is over', cost };
    else if (a === 'gadget' && f.cooldown > 0) out[a] = { ok: false, reason: `Cooldown: ${f.cooldown} round${f.cooldown > 1 ? 's' : ''}`, cost };
    else if (cost > f.energy) out[a] = { ok: false, reason: `Needs ${cost} energy`, cost };
    else out[a] = { ok: true, cost };
  });
  return out;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Resolve one simultaneous round. Pure: returns a new state. */
export function resolveRound(prev: MatchState, reqA: ActionId, reqB: ActionId, timedOut: Partial<Record<Side, boolean>> = {}): MatchState {
  if (prev.over) return prev;
  const s = clone(prev);
  const r = s.round;
  const ev: CombatEvent[] = [];
  const requested: Record<Side, ActionId> = { a: reqA, b: reqB };
  const act: Record<Side, ActionId> = { a: reqA, b: reqB };
  const sides: Side[] = ['a', 'b'];
  const name = (x: Side) => s.loadouts[x].name;
  const damage: Record<Side, number> = { a: 0, b: 0 };

  // 1. Validate and pay costs. Illegal requests fall back to Defend.
  const legalA = legalActions(s, 'a'), legalB = legalActions(s, 'b');
  for (const x of sides) {
    if (timedOut[x]) ev.push({ type: 'timeout', side: x, text: `${name(x)} ran out of time and braced (Defend).` });
    const legal = x === 'a' ? legalA : legalB;
    if (!legal[act[x]] || !legal[act[x]].ok) {
      ev.push({ type: 'fallback', side: x, text: `${name(x)} couldn't ${act[x]} (${legal[act[x]]?.reason ?? 'invalid'}) and braced instead.` });
      act[x] = 'defend';
    }
    const cost = actionCost(s, x, act[x]);
    s.f[x].energy -= cost;
  }
  const rangeBefore = s.range;

  // 2. Movement and Blink resolve before shots.
  let toggles = 0;
  for (const x of sides) {
    if (act[x] === 'move') { toggles++; ev.push({ type: 'move', side: x, text: `${name(x)} repositions.` }); }
    if (act[x] === 'gadget' && s.loadouts[x].gadget === 'blink') { toggles++; s.f[x].blinkBonus = true; }
  }
  if (toggles % 2 === 1) s.range = s.range === 'close' ? 'far' : 'close';
  if (toggles > 0) ev.push({ type: 'info', side: 'a', text: toggles % 2 === 1 ? `Range is now ${s.range.toUpperCase()}.` : `Both moved — range stays ${s.range.toUpperCase()}.` });

  // 3. Gadgets.
  for (const x of sides) {
    if (act[x] !== 'gadget') continue;
    const g = s.loadouts[x].gadget, f = s.f[x], o = s.f[other(x)];
    f.cooldown = GADGETS[g].cooldown + 1; // ticks down at end of this round
    if (g === 'patch_kit') { const heal = Math.min(22, f.maxHp - f.hp); f.hp += heal; ev.push({ type: 'gadget', side: x, heal, text: `${name(x)} uses Patch Kit (+${heal} HP).` }); }
    if (g === 'mirage') { f.mirageRounds = 2; ev.push({ type: 'gadget', side: x, text: `${name(x)} vanishes into a Mirage.` }); }
    if (g === 'blink') ev.push({ type: 'gadget', side: x, text: `${name(x)} Blinks — next attack +25%.` });
    if (g === 'aegis') { f.shield = 24; f.shieldRounds = 2; ev.push({ type: 'gadget', side: x, text: `${name(x)} raises an Aegis shield (24).` }); }
    if (g === 'emp') { const d = Math.min(35, o.energy); o.energy -= d; ev.push({ type: 'gadget', side: x, text: `${name(x)} fires an EMP (−${d} energy to ${name(other(x))}).` }); }
    if (g === 'overclock') { f.energy = Math.min(RULES.maxEnergy, f.energy + 30); f.freeShot = true; ev.push({ type: 'gadget', side: x, text: `${name(x)} Overclocks (+30 energy, next shot free).` }); }
  }

  // 4. Attacks (simultaneous).
  for (const x of sides) {
    if (act[x] !== 'attack') continue;
    const y = other(x), att = s.f[x], def = s.f[y];
    const w = WEAPONS[s.loadouts[x].weapon];
    att.freeShot = false;
    if (def.mirageRounds > 0) { ev.push({ type: 'evade', side: y, text: `${name(x)}'s shot passes through ${name(y)}'s Mirage.` }); att.blinkBonus = false; continue; }
    const evade = CLASSES[s.loadouts[y].classId].evade;
    if (evade > 0 && roll(s.seed, r, y, 'evade') < evade) { ev.push({ type: 'evade', side: y, text: `${name(y)} dodges ${name(x)}'s ${w.name}.` }); att.blinkBonus = false; continue; }
    let dmg = s.range === 'close' ? w.close : w.far;
    dmg *= RULES.rollMin + (RULES.rollMax - RULES.rollMin) * roll(s.seed, r, x, 'dmg');
    if (att.blinkBonus) { dmg *= RULES.blinkBonus; att.blinkBonus = false; }
    const crit = roll(s.seed, r, x, 'crit') < w.crit;
    if (crit) dmg *= RULES.critMultiplier;
    let blockedTxt = '';
    if (act[y] === 'defend') { dmg *= 1 - CLASSES[s.loadouts[y].classId].block; blockedTxt = ' (blocked)'; }
    dmg = Math.round(dmg);
    let absorbed = 0;
    if (def.shield > 0) { absorbed = Math.min(def.shield, dmg); def.shield -= absorbed; dmg -= absorbed; }
    def.hp = Math.max(0, def.hp - dmg);
    damage[y] += dmg;
    ev.push({ type: 'attack', side: x, dmg, crit, absorbed, text: `${name(x)} hits ${name(y)} for ${dmg}${crit ? ' CRIT' : ''}${blockedTxt}${absorbed ? `, shield absorbs ${absorbed}` : ''}.` });
  }
  for (const x of sides) if (act[x] === 'defend' && !ev.some((e) => e.type === 'attack' && e.side === other(x))) ev.push({ type: 'block', side: x, text: `${name(x)} defends.` });

  // 5. End of round upkeep.
  for (const x of sides) {
    const f = s.f[x];
    f.energy = Math.min(RULES.maxEnergy, f.energy + RULES.regen + (act[x] === 'defend' ? RULES.defendBonus : 0));
    if (f.cooldown > 0) f.cooldown--;
    if (f.mirageRounds > 0) f.mirageRounds--;
    if (f.shieldRounds > 0) { f.shieldRounds--; if (f.shieldRounds === 0) f.shield = 0; }
  }

  s.rounds.push({ round: r, actions: act, requested, rangeBefore, rangeAfter: s.range, events: ev, hp: { a: s.f.a.hp, b: s.f.b.hp }, energy: { a: s.f.a.energy, b: s.f.b.energy }, damage });

  const koA = s.f.a.hp <= 0, koB = s.f.b.hp <= 0;
  if (koA || koB) { s.over = true; s.endReason = 'ko'; s.winner = koA && koB ? 'draw' : koA ? 'b' : 'a'; }
  else if (r >= RULES.maxRounds) {
    s.over = true; s.endReason = 'rounds';
    const pa = s.f.a.hp / s.f.a.maxHp, pb = s.f.b.hp / s.f.b.maxHp;
    s.winner = Math.abs(pa - pb) < 1e-9 ? 'draw' : pa > pb ? 'a' : 'b';
  } else s.round = r + 1;
  return s;
}

/** Re-run a match from its seed and requested actions. Used to audit results. */
export function replay(seed: string, a: Loadout, b: Loadout, turns: { a: ActionId; b: ActionId; timedOut?: Partial<Record<Side, boolean>> }[]): MatchState {
  let s = initMatch(seed, a, b);
  for (const t of turns) { if (s.over) break; s = resolveRound(s, t.a, t.b, t.timedOut); }
  return s;
}

/** A simple heuristic bot, used only for local demo matches and the hero animation. */
export function botAction(s: MatchState, side: Side, rnd: () => number): ActionId {
  const legal = legalActions(s, side), f = s.f[side], l = s.loadouts[side], w = WEAPONS[l.weapon];
  const pref: Range = w.close >= w.far ? 'close' : 'far';
  const opts: [ActionId, number][] = [];
  if (legal.attack.ok) opts.push(['attack', (s.range === 'close' ? w.close : w.far) >= 13 ? 5 : 2]);
  if (legal.gadget.ok) opts.push(['gadget', l.gadget === 'patch_kit' ? (f.hp < f.maxHp * 0.6 ? 5 : 0.3) : 1.6]);
  if (legal.move.ok && s.range !== pref) opts.push(['move', 3]);
  opts.push(['defend', f.energy < 30 ? 4 : 1]);
  const total = opts.reduce((a, o) => a + o[1], 0);
  let x = rnd() * total;
  for (const [a, wgt] of opts) { x -= wgt; if (x <= 0) return a; }
  return 'defend';
}
