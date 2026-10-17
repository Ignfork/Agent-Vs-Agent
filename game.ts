// Agent VS Agent — game definitions shared by client and server.
// Every class and weapon is built on the same power budget. Levels and $AVA
// never change combat stats; sidegrades trade strengths, they don't add them.

export type ClassId = 'trooper' | 'heavy' | 'flanker' | 'sniper';
export type WeaponId =
  | 'pulse_carbine' | 'burst_rifle'
  | 'scatter_cannon' | 'arc_maul'
  | 'twin_smg' | 'needle_pistol'
  | 'rail_lance' | 'longbow_mk2';
export type GadgetId = 'patch_kit' | 'mirage' | 'blink' | 'aegis' | 'emp' | 'overclock';
export type PaletteId = 'violet' | 'cyan' | 'steel' | 'ember' | 'glacier' | 'void';
export type FrameId = 'none' | 'circuit' | 'neon' | 'champion';
export type EmoteId = 'wave' | 'gg' | 'taunt' | 'salute';
export type Range = 'close' | 'far';
export type ActionId = 'attack' | 'defend' | 'gadget' | 'move';

export interface ClassDef {
  id: ClassId; name: string; role: string; blurb: string;
  hp: number; moveCost: number; block: number; evade: number;
  weapons: WeaponId[];
}
export interface WeaponDef { id: WeaponId; name: string; classId: ClassId; close: number; far: number; cost: number; crit: number; level: number; blurb: string; }
export interface GadgetDef { id: GadgetId; name: string; cost: number; cooldown: number; level: number; badge: string; blurb: string; }

export const CLASSES: Record<ClassId, ClassDef> = {
  trooper: { id: 'trooper', name: 'Trooper', role: 'All-rounder', blurb: 'Steady at any range. Forgiving and flexible.', hp: 110, moveCost: 10, block: 0.55, evade: 0, weapons: ['pulse_carbine', 'burst_rifle'] },
  heavy: { id: 'heavy', name: 'Heavy', role: 'Brawler', blurb: 'Devastating up close, slow to reposition.', hp: 115, moveCost: 20, block: 0.6, evade: 0, weapons: ['scatter_cannon', 'arc_maul'] },
  flanker: { id: 'flanker', name: 'Flanker', role: 'Skirmisher', blurb: 'Fragile but slippery. Repositions for free and dodges 15% of hits.', hp: 100, moveCost: 0, block: 0.5, evade: 0.15, weapons: ['twin_smg', 'needle_pistol'] },
  sniper: { id: 'sniper', name: 'Sniper', role: 'Marksman', blurb: 'Punishing at range, exposed when cornered.', hp: 100, moveCost: 10, block: 0.5, evade: 0, weapons: ['rail_lance', 'longbow_mk2'] }
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pulse_carbine: { id: 'pulse_carbine', name: 'Pulse Carbine', classId: 'trooper', close: 16, far: 15, cost: 20, crit: 0.10, level: 1, blurb: 'Even damage at both ranges.' },
  burst_rifle: { id: 'burst_rifle', name: 'Burst Rifle', classId: 'trooper', close: 19, far: 12, cost: 20, crit: 0.08, level: 4, blurb: 'Sidegrade: leans into close range.' },
  scatter_cannon: { id: 'scatter_cannon', name: 'Scatter Cannon', classId: 'heavy', close: 24, far: 6, cost: 25, crit: 0.05, level: 1, blurb: 'Huge close-range blast, nearly useless far away.' },
  arc_maul: { id: 'arc_maul', name: 'Arc Maul', classId: 'heavy', close: 20, far: 10, cost: 22, crit: 0.08, level: 4, blurb: 'Sidegrade: less burst, keeps some reach.' },
  twin_smg: { id: 'twin_smg', name: 'Twin SMGs', classId: 'flanker', close: 18, far: 10, cost: 15, crit: 0.14, level: 1, blurb: 'Cheap, fast and crit-prone up close.' },
  needle_pistol: { id: 'needle_pistol', name: 'Needle Pistol', classId: 'flanker', close: 15, far: 14, cost: 14, crit: 0.12, level: 4, blurb: 'Sidegrade: flat damage, any range.' },
  rail_lance: { id: 'rail_lance', name: 'Rail Lance', classId: 'sniper', close: 9, far: 26, cost: 28, crit: 0.15, level: 1, blurb: 'Massive long-range shots, expensive to fire.' },
  longbow_mk2: { id: 'longbow_mk2', name: 'Longbow Mk II', classId: 'sniper', close: 12, far: 22, cost: 24, crit: 0.12, level: 4, blurb: 'Sidegrade: cheaper, softer, less helpless up close.' }
};

export const GADGETS: Record<GadgetId, GadgetDef> = {
  patch_kit: { id: 'patch_kit', name: 'Patch Kit', cost: 25, cooldown: 4, level: 1, badge: '#ff5d73', blurb: 'Restore 22 HP.' },
  mirage: { id: 'mirage', name: 'Mirage', cost: 20, cooldown: 4, level: 1, badge: '#b8bdd8', blurb: 'Evade every attack this round and next round.' },
  blink: { id: 'blink', name: 'Blink', cost: 15, cooldown: 3, level: 1, badge: '#ffcf4a', blurb: 'Switch range instantly; your next attack deals +25%.' },
  aegis: { id: 'aegis', name: 'Aegis', cost: 25, cooldown: 4, level: 1, badge: '#35e0f0', blurb: 'Shield that absorbs 24 damage for 2 rounds.' },
  emp: { id: 'emp', name: 'EMP', cost: 20, cooldown: 4, level: 6, badge: '#b6f24a', blurb: 'Drain 35 energy from your opponent.' },
  overclock: { id: 'overclock', name: 'Overclock', cost: 0, cooldown: 5, level: 8, badge: '#ff9f1c', blurb: 'Gain 30 energy; your next attack costs nothing.' }
};

export const PALETTES: Record<PaletteId, { name: string; level: number; H: string; h: string; S: string; s: string; A: string }> = {
  violet: { name: 'Violet', level: 1, H: '#9b7bff', h: '#6a4fd6', S: '#3a3f72', s: '#2a2e57', A: '#c4b1ff' },
  cyan: { name: 'Cyan', level: 1, H: '#35d9ee', h: '#1a9fb3', S: '#27486a', s: '#1c3552', A: '#8ff0fb' },
  steel: { name: 'Steel', level: 1, H: '#c9cce0', h: '#8c90ad', S: '#3b4057', s: '#2b2f44', A: '#e3e5f2' },
  ember: { name: 'Ember', level: 2, H: '#ff8a5c', h: '#d1592f', S: '#4a2f3a', s: '#35212b', A: '#ffc09e' },
  glacier: { name: 'Glacier', level: 5, H: '#bfe9ff', h: '#7fb7d6', S: '#2f4a63', s: '#22374b', A: '#e6f7ff' },
  void: { name: 'Void', level: 10, H: '#3b2d6e', h: '#241a4a', S: '#151131', s: '#0e0b22', A: '#9b7bff' }
};

export const FRAMES: Record<FrameId, { name: string; level: number }> = {
  none: { name: 'Plain', level: 1 }, circuit: { name: 'Circuit', level: 3 }, neon: { name: 'Neon', level: 7 }, champion: { name: 'Champion', level: 10 }
};
export const EMOTES: Record<EmoteId, { name: string; text: string; level: number }> = {
  wave: { name: 'Wave', text: 'o/', level: 1 }, gg: { name: 'GG', text: 'GG', level: 2 }, taunt: { name: 'Taunt', text: 'come on!', level: 5 }, salute: { name: 'Salute', text: 'o7', level: 9 }
};

export const ACTIONS: Record<ActionId, { name: string; key: string; blurb: string }> = {
  attack: { name: 'Attack', key: '1', blurb: 'Fire your weapon. Damage depends on range; costs weapon energy.' },
  defend: { name: 'Defend', key: '2', blurb: 'Block part of incoming damage and recover 15 extra energy.' },
  gadget: { name: 'Gadget', key: '3', blurb: 'Use your gadget. Has an energy cost and a cooldown.' },
  move: { name: 'Move', key: '4', blurb: 'Switch between close and far range before shots land.' }
};

export const RULES = {
  maxEnergy: 100, startEnergy: 60, regen: 18, defendBonus: 15,
  critMultiplier: 1.6, blinkBonus: 1.25, maxRounds: 14, startRange: 'far' as Range,
  rollMin: 0.9, rollMax: 1.1
};

export interface Loadout { classId: ClassId; weapon: WeaponId; gadget: GadgetId; palette: PaletteId; name: string }

export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{1,14}[A-Za-z0-9]$/;

export function validateLoadout(l: Partial<Loadout>, level: number): string | null {
  if (!l.name || !NAME_RE.test(l.name)) return 'Name must be 3–16 characters: letters, numbers, spaces, - or _.';
  if (!l.classId || !CLASSES[l.classId]) return 'Choose a class.';
  if (!l.weapon || !WEAPONS[l.weapon]) return 'Choose a weapon.';
  if (WEAPONS[l.weapon].classId !== l.classId) return 'That weapon belongs to another class.';
  if (WEAPONS[l.weapon].level > level) return `${WEAPONS[l.weapon].name} unlocks at level ${WEAPONS[l.weapon].level}.`;
  if (!l.gadget || !GADGETS[l.gadget]) return 'Choose a gadget.';
  if (GADGETS[l.gadget].level > level) return `${GADGETS[l.gadget].name} unlocks at level ${GADGETS[l.gadget].level}.`;
  if (!l.palette || !PALETTES[l.palette]) return 'Choose a palette.';
  if (PALETTES[l.palette].level > level) return `${PALETTES[l.palette].name} unlocks at level ${PALETTES[l.palette].level}.`;
  return null;
}

/** Readable stat summary (0–10 scales). Purely derived from class + weapon + gadget. */
export function statSummary(l: Pick<Loadout, 'classId' | 'weapon' | 'gadget'>) {
  const c = CLASSES[l.classId], w = WEAPONS[l.weapon];
  const sc = (v: number, max: number) => Math.max(1, Math.min(10, Math.round((v / max) * 10)));
  return [
    { k: 'Durability', v: sc(c.hp, 115), raw: `${c.hp} HP` },
    { k: 'Close power', v: sc(w.close, 24), raw: `${w.close} dmg` },
    { k: 'Far power', v: sc(w.far, 26), raw: `${w.far} dmg` },
    { k: 'Efficiency', v: sc(35 - w.cost, 21), raw: `${w.cost} energy/shot` },
    { k: 'Mobility', v: sc(25 - c.moveCost + (c.evade ? 5 : 0), 30), raw: c.moveCost ? `${c.moveCost} energy/move` : 'free moves' }
  ];
}
