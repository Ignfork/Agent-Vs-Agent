// Demo mode: clearly-labelled sample data and local bot matches. Nothing in
// this file talks to the server, and nothing here is presented as live PvP.
import { botAction, initMatch, resolveRound, type MatchState, type Side } from '../../shared/engine';
import type { ActionId, ClassId, GadgetId, Loadout, PaletteId, WeaponId } from '../../shared/game';
import type { LeaderRow, MatchSnapshot, PublicFighter } from '../../shared/types';

export const randomSeed = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');

const fakeWallet = (i: number) => {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let s = '', x = (i + 7) * 2654435761;
  for (let k = 0; k < 44; k++) { x = (x * 1103515245 + 12345) >>> 0; s += A[x % 58]; }
  return s;
};
type DemoAgent = { id: string; name: string; classId: ClassId; weapon: WeaponId; gadget: GadgetId; palette: PaletteId };
const A = (id: string, name: string, classId: ClassId, weapon: WeaponId, gadget: GadgetId, palette: PaletteId): DemoAgent => ({ id, name, classId, weapon, gadget, palette });
export const DEMO_AGENTS: DemoAgent[] = [
  A('demo-1', 'Brick Halo', 'heavy', 'scatter_cannon', 'aegis', 'violet'),
  A('demo-2', 'Quill', 'sniper', 'rail_lance', 'mirage', 'cyan'),
  A('demo-3', 'Sprocket', 'flanker', 'twin_smg', 'blink', 'steel'),
  A('demo-4', 'Lumen Nine', 'trooper', 'pulse_carbine', 'patch_kit', 'glacier'),
  A('demo-5', 'Gristle', 'heavy', 'arc_maul', 'patch_kit', 'ember'),
  A('demo-6', 'Kestrel', 'sniper', 'longbow_mk2', 'blink', 'violet'),
  A('demo-7', 'Static Moth', 'flanker', 'needle_pistol', 'mirage', 'cyan'),
  A('demo-8', 'Corvid', 'trooper', 'burst_rifle', 'aegis', 'void')
];
const NAMES = ['nullwave', 'pixelpilgrim', 'k1ra', 'orbitjam', 'devnet_dan', 'saltyvalidator', 'moonlight', 'hexbloom', 'tinkerbyte', 'ravenSOL', 'qwerty_q', 'lowping'];
export function demoLeaderboard(season: string): LeaderRow[] {
  const shift = season === 's1' ? 0 : 3;
  return NAMES.map((n, i) => {
    const wins = 42 - i * 3 + ((i * 7 + shift) % 5), losses = 10 + i * 2 + ((i + shift) % 4), draws = i % 3;
    const ag = DEMO_AGENTS[(i + shift) % DEMO_AGENTS.length];
    return { rank: i + 1, wallet: fakeWallet(i + shift), name: n, level: Math.max(2, 14 - i), rating: 1580 - i * 37 - shift * 11, wins, losses, draws, winRate: wins / (wins + losses + draws), lastMatchAt: Date.now() - (i * 47 + 3) * 60_000, agent: ag };
  });
}

export function demoFighter(name: string, a: DemoAgent | (Loadout & { id?: string }), rating = 1000): PublicFighter {
  return { wallet: 'demo', name, rating, agent: { id: (a as DemoAgent).id ?? 'demo', name: a.name, classId: a.classId, weapon: a.weapon, gadget: a.gadget, palette: a.palette, frame: 'none', emote: 'wave' } };
}

export function snapshotOf(state: MatchState, players: Record<Side, PublicFighter>, extra: Partial<MatchSnapshot> = {}): MatchSnapshot {
  return {
    id: 'demo', season: 'demo', phase: state.over ? 'ended' : 'active', mode: 'queue', seedCommit: '', seed: state.seed,
    players, round: state.round, range: state.range, f: state.f, ready: { a: true, b: true }, locked: { a: false, b: false },
    connected: { a: true, b: true }, deadline: null, graceUntil: {}, rounds: state.rounds, winner: state.winner,
    endReason: state.endReason, spectators: 0, startedAt: Date.now(), ...extra
  };
}

const loadoutOf = (f: PublicFighter): Loadout => ({ classId: f.agent.classId, weapon: f.agent.weapon, gadget: f.agent.gadget, palette: f.agent.palette, name: f.agent.name });

/** A local practice match against a bot. Same engine as the server, no network. */
export class DemoMatch {
  state: MatchState;
  turns: { a: ActionId; b: ActionId }[] = [];
  constructor(public players: Record<Side, PublicFighter>, public seed = randomSeed()) {
    this.state = initMatch(seed, loadoutOf(players.a), loadoutOf(players.b));
  }
  snapshot(you: Side | undefined = 'a'): MatchSnapshot { return snapshotOf(this.state, this.players, { you }); }
  /** Player acts as side a; the bot picks for side b. */
  play(action: ActionId, botSideAction?: ActionId) {
    const b = botSideAction ?? botAction(this.state, 'b', Math.random);
    this.turns.push({ a: action, b });
    this.state = resolveRound(this.state, action, b);
    return this.state.rounds[this.state.rounds.length - 1];
  }
}
