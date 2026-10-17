// Read models: turn stored rows into the public shapes the API returns.
import { store, PlayerRow, newId } from './store';
import { config } from './config';
import { levelFromXp, unlockedBy } from '../shared/progression';
import { CLASSES, NAME_RE, validateLoadout, FRAMES, EMOTES, type FrameId, type EmoteId } from '../shared/game';
import type { Agent, LeaderRow, Me, PlayerPublic } from '../shared/types';
import { HttpError } from './auth';

export function publicPlayer(p: PlayerRow, season = config.season.id): PlayerPublic {
  return { wallet: p.wallet, name: p.name, xp: p.xp, level: levelFromXp(p.xp).level, createdAt: p.createdAt, season: store.season(p, season), activeAgentId: p.activeAgentId, frame: p.frame };
}
export function meView(p: PlayerRow): Me {
  const lvl = levelFromXp(p.xp).level;
  return { ...publicPlayer(p), agents: store.agentsOf(p.wallet), unlocked: unlockedBy(lvl), rewards: p.rewards.slice(-15).reverse() };
}

export function setName(p: PlayerRow, name: unknown) {
  if (typeof name !== 'string' || !NAME_RE.test(name.trim())) throw new HttpError(400, 'Name must be 3–16 characters: letters, numbers, spaces, - or _.');
  const n = name.trim();
  const taken = store.findPlayerByName(n);
  if (taken && taken.wallet !== p.wallet) throw new HttpError(409, 'That name is taken.');
  p.name = n; store.updatePlayer(p);
}
export function setFrame(p: PlayerRow, frame: unknown) {
  if (typeof frame !== 'string' || !(frame in FRAMES)) throw new HttpError(400, 'Unknown frame.');
  if (FRAMES[frame as FrameId].level > levelFromXp(p.xp).level) throw new HttpError(403, 'Frame not unlocked yet.');
  p.frame = frame as FrameId; store.updatePlayer(p);
}

type AgentInput = Partial<Pick<Agent, 'name' | 'classId' | 'weapon' | 'gadget' | 'palette' | 'frame' | 'emote'>>;
function cleanAgent(input: AgentInput, level: number) {
  const pick = {
    name: typeof input.name === 'string' ? input.name.trim() : '', classId: input.classId, weapon: input.weapon, gadget: input.gadget,
    palette: input.palette, frame: (input.frame ?? 'none') as FrameId, emote: (input.emote ?? 'wave') as EmoteId
  };
  const err = validateLoadout(pick, level);
  if (err) throw new HttpError(400, err);
  if (!(pick.frame in FRAMES) || FRAMES[pick.frame].level > level) throw new HttpError(400, 'Frame not unlocked.');
  if (!(pick.emote in EMOTES) || EMOTES[pick.emote].level > level) throw new HttpError(400, 'Emote not unlocked.');
  return pick as Required<typeof pick>;
}
export function createAgent(p: PlayerRow, input: AgentInput): Agent {
  if (store.agentsOf(p.wallet).length >= config.maxAgentsPerPlayer) throw new HttpError(400, `You can keep up to ${config.maxAgentsPerPlayer} agents. Retire one first.`);
  const c = cleanAgent(input, levelFromXp(p.xp).level);
  if (store.allAgents().some((a) => a.name.toLowerCase() === c.name.toLowerCase())) throw new HttpError(409, 'Another agent already uses that name.');
  const a: Agent = { id: newId('agt'), owner: p.wallet, ...c, createdAt: Date.now(), wins: 0, losses: 0, draws: 0 } as Agent;
  store.putAgent(a);
  if (!p.activeAgentId) { p.activeAgentId = a.id; store.updatePlayer(p); }
  return a;
}
export function updateAgent(p: PlayerRow, id: string, input: AgentInput): Agent {
  const a = store.getAgent(id);
  if (!a || a.owner !== p.wallet) throw new HttpError(404, 'Agent not found.');
  const c = cleanAgent({ ...a, ...input }, levelFromXp(p.xp).level);
  if (store.allAgents().some((x) => x.id !== id && x.name.toLowerCase() === c.name.toLowerCase())) throw new HttpError(409, 'Another agent already uses that name.');
  Object.assign(a, c); store.putAgent(a);
  return a;
}
export function deleteAgent(p: PlayerRow, id: string) {
  const a = store.getAgent(id);
  if (!a || a.owner !== p.wallet) throw new HttpError(404, 'Agent not found.');
  store.deleteAgent(id);
  if (p.activeAgentId === id) { p.activeAgentId = store.agentsOf(p.wallet)[0]?.id ?? null; store.updatePlayer(p); }
}

export function leaderboard(season: string, q = '', limit = 100): LeaderRow[] {
  const ql = q.trim().toLowerCase();
  const rows = store.allPlayers()
    .filter((p) => p.seasons[season] && p.seasons[season].games > 0)
    .map((p) => {
      const s = p.seasons[season];
      const ag = p.activeAgentId ? store.getAgent(p.activeAgentId) : undefined;
      return {
        rank: 0, wallet: p.wallet, name: p.name, level: levelFromXp(p.xp).level, rating: s.rating, wins: s.wins, losses: s.losses, draws: s.draws,
        winRate: s.games ? s.wins / s.games : 0, lastMatchAt: s.lastMatchAt,
        agent: ag ? { id: ag.id, name: ag.name, classId: ag.classId, palette: ag.palette, weapon: ag.weapon, gadget: ag.gadget } : null
      };
    })
    .sort((a, b) => b.rating - a.rating || b.wins - a.wins);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows.filter((r) => !ql || r.name.toLowerCase().includes(ql) || r.wallet.toLowerCase().startsWith(ql)).slice(0, limit);
}

export function featuredAgents(limit = 8) {
  return store.allAgents()
    .map((a) => ({ ...a, ownerName: store.getPlayer(a.owner)?.name ?? '' , games: a.wins + a.losses + a.draws }))
    .sort((a, b) => b.wins - a.wins || b.games - a.games || b.createdAt - a.createdAt)
    .slice(0, limit);
}
export const classIds = Object.keys(CLASSES);
