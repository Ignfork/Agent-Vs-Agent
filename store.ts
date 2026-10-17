// Persistence boundary. This implementation keeps everything in memory and
// snapshots it to a JSON file (atomic write). Swap it for Postgres/Redis by
// implementing the same methods — nothing else in the server touches disk.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config';
import type { Agent, MatchRecord, RewardRecord, SeasonStats } from '../shared/types';
import type { FrameId } from '../shared/game';
import { START_RATING, levelFromXp } from '../shared/progression';
import { shortAddr } from '../shared/base58';

export interface PlayerRow {
  wallet: string; name: string; createdAt: number; xp: number; frame: FrameId;
  activeAgentId: string | null; seasons: Record<string, SeasonStats>; rewards: RewardRecord[];
}
interface DB { version: 1; players: Record<string, PlayerRow>; agents: Record<string, Agent>; matches: Record<string, MatchRecord>; matchOrder: string[] }

const file = path.join(config.dataDir, 'db.json');
let db: DB = { version: 1, players: {}, agents: {}, matches: {}, matchOrder: [] };
let timer: NodeJS.Timeout | null = null;

export function loadStore() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  if (fs.existsSync(file)) {
    try { db = JSON.parse(fs.readFileSync(file, 'utf8')); console.log(`[store] loaded ${Object.keys(db.players).length} players, ${db.matchOrder.length} matches`); }
    catch (e) { console.error('[store] could not parse db.json — starting empty (old file kept as db.corrupt.json)', e); fs.renameSync(file, file.replace('.json', '.corrupt.json')); }
  }
}
function save() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
  }, 250);
}
export function flushStore() { if (timer) { clearTimeout(timer); timer = null; } fs.writeFileSync(file, JSON.stringify(db)); }

export const newId = (p: string) => `${p}_${crypto.randomBytes(8).toString('hex')}`;
export const emptySeason = (): SeasonStats => ({ rating: START_RATING, wins: 0, losses: 0, draws: 0, games: 0, lastMatchAt: null });

export const store = {
  getPlayer: (w: string): PlayerRow | undefined => db.players[w],
  ensurePlayer(w: string): PlayerRow {
    if (!db.players[w]) { db.players[w] = { wallet: w, name: shortAddr(w), createdAt: Date.now(), xp: 0, frame: 'none', activeAgentId: null, seasons: {}, rewards: [] }; save(); }
    return db.players[w];
  },
  season(p: PlayerRow, id = config.season.id): SeasonStats { if (!p.seasons[id]) p.seasons[id] = emptySeason(); return p.seasons[id]; },
  findPlayerByName: (n: string) => Object.values(db.players).find((p) => p.name.toLowerCase() === n.toLowerCase()),
  allPlayers: () => Object.values(db.players),
  updatePlayer(p: PlayerRow) { db.players[p.wallet] = p; save(); },
  level: (p: PlayerRow) => levelFromXp(p.xp).level,

  agentsOf: (w: string) => Object.values(db.agents).filter((a) => a.owner === w).sort((a, b) => a.createdAt - b.createdAt),
  getAgent: (id: string): Agent | undefined => db.agents[id],
  allAgents: () => Object.values(db.agents),
  putAgent(a: Agent) { db.agents[a.id] = a; save(); },
  deleteAgent(id: string) { delete db.agents[id]; save(); },

  putMatch(m: MatchRecord) { db.matches[m.id] = m; db.matchOrder.push(m.id); save(); },
  getMatch: (id: string): MatchRecord | undefined => db.matches[id],
  recentMatches(filter: (m: MatchRecord) => boolean, limit = 20) {
    const out: MatchRecord[] = [];
    for (let i = db.matchOrder.length - 1; i >= 0 && out.length < limit; i--) { const m = db.matches[db.matchOrder[i]]; if (m && filter(m)) out.push(m); }
    return out;
  },
  seasons() { const s = new Set<string>([config.season.id]); Object.values(db.matches).forEach((m) => s.add(m.season)); return [...s]; },
  save
};
