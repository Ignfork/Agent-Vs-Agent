// API and WebSocket contracts shared by client and server.
import type { ActionId, ClassId, EmoteId, FrameId, GadgetId, Loadout, PaletteId, Range, WeaponId } from './game';
import type { FighterState, RoundResult, Side } from './engine';
import type { XpLine } from './progression';

export interface Agent {
  id: string; owner: string; name: string; classId: ClassId; weapon: WeaponId; gadget: GadgetId;
  palette: PaletteId; frame: FrameId; emote: EmoteId; createdAt: number;
  wins: number; losses: number; draws: number;
}
export interface SeasonStats { rating: number; wins: number; losses: number; draws: number; games: number; lastMatchAt: number | null }
export interface PlayerPublic {
  wallet: string; name: string; xp: number; level: number; createdAt: number;
  season: SeasonStats; activeAgentId: string | null; frame: FrameId;
}
export interface Me extends PlayerPublic { agents: Agent[]; unlocked: { kind: string; id: string; name: string; level: number }[]; rewards: RewardRecord[] }
export interface RewardRecord { matchId: string; at: number; lines: XpLine[]; total: number; levelUps: number[] }

export interface PublicFighter { wallet: string; name: string; rating: number; agent: Loadout & { id: string; frame: FrameId; emote: EmoteId } }
export type MatchPhase = 'ready' | 'active' | 'ended' | 'cancelled';
export type EndReason = 'ko' | 'rounds' | 'forfeit' | 'abandon';

export interface MatchSnapshot {
  id: string; season: string; phase: MatchPhase; mode: 'queue' | 'challenge' | 'rematch';
  seedCommit: string; seed?: string;
  players: Record<Side, PublicFighter>;
  you?: Side; // present for participants
  round: number; range: Range; f: Record<Side, FighterState>;
  ready: Record<Side, boolean>; locked: Record<Side, boolean>; connected: Record<Side, boolean>;
  deadline: number | null; graceUntil: Partial<Record<Side, number>>;
  rounds: RoundResult[]; winner: Side | 'draw' | null; endReason: EndReason | null;
  spectators: number; startedAt: number;
}

export interface MatchRecord {
  id: string; season: string; mode: string; startedAt: number; endedAt: number;
  seedCommit: string; seed: string;
  players: Record<Side, PublicFighter>;
  turns: { a: ActionId; b: ActionId; timedOut?: Partial<Record<Side, boolean>> }[];
  rounds: RoundResult[]; winner: Side | 'draw'; endReason: EndReason;
  ratingDelta: Record<Side, number>; xp: Record<Side, XpLine[]>; finalHp: Record<Side, number>;
}

export interface LeaderRow {
  rank: number; wallet: string; name: string; level: number; rating: number;
  wins: number; losses: number; draws: number; winRate: number; lastMatchAt: number | null;
  agent: { id: string; name: string; classId: ClassId; palette: PaletteId; weapon: WeaponId; gadget: GadgetId } | null;
}

export interface PublicConfig {
  network: 'devnet' | 'testnet' | 'mainnet-beta'; rpcUrl: string; chain: string;
  avaMint: string | null; avaDecimals: number | null; season: { id: string; name: string };
  turnSeconds: number; readySeconds: number; reconnectSeconds: number; domain: string;
}

// ---- WebSocket messages ----
export type ClientMsg =
  | { t: 'auth'; token: string }
  | { t: 'queue.join'; agentId: string }
  | { t: 'queue.leave' }
  | { t: 'challenge.send'; target: string; agentId: string }
  | { t: 'challenge.respond'; id: string; accept: boolean; agentId?: string }
  | { t: 'challenge.cancel'; id: string }
  | { t: 'match.ready'; matchId: string }
  | { t: 'match.action'; matchId: string; round: number; action: ActionId }
  | { t: 'match.forfeit'; matchId: string }
  | { t: 'match.emote'; matchId: string; emote: EmoteId }
  | { t: 'match.rematch'; matchId: string }
  | { t: 'spectate'; matchId: string }
  | { t: 'spectate.leave'; matchId: string }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'hello'; wallet: string; name: string }
  | { t: 'auth.error'; message: string }
  | { t: 'session.replaced' }
  | { t: 'queue.status'; inQueue: boolean; waitSec: number; window: number; queued: number; agentId?: string }
  | { t: 'challenge.incoming'; id: string; from: { wallet: string; name: string; rating: number }; agentName: string; expiresAt: number }
  | { t: 'challenge.sent'; id: string; to: { wallet: string; name: string }; expiresAt: number }
  | { t: 'challenge.closed'; id: string; reason: string }
  | { t: 'match.state'; match: MatchSnapshot; reconnected?: boolean }
  | { t: 'match.round'; matchId: string; result: RoundResult; match: MatchSnapshot }
  | { t: 'match.end'; matchId: string; match: MatchSnapshot; ratingDelta: Record<Side, number>; xp: Record<Side, XpLine[]>; levelUps: Record<Side, number[]> }
  | { t: 'match.cancelled'; matchId: string; reason: string; requeued: boolean }
  | { t: 'match.emote'; matchId: string; side: Side; emote: EmoteId }
  | { t: 'match.rematch'; matchId: string; side: Side }
  | { t: 'error'; message: string }
  | { t: 'pong' };
