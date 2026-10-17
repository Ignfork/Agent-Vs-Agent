// Game service boundary (HTTP). Everything that touches game data goes
// through here; components never call fetch directly.
import type { Agent, LeaderRow, MatchRecord, Me, PlayerPublic, PublicConfig } from '../../shared/types';

declare global { interface Window { AVA_API_BASE?: string } }
export const API_BASE = (typeof window !== 'undefined' && window.AVA_API_BASE) || '';

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

let token: string | null = null;
export const setApiToken = (t: string | null) => { token = t; };

async function call<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(API_BASE + path, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal ?? AbortSignal.timeout(10_000)
    });
  } catch (e) {
    throw new ApiError(0, 'Could not reach the game server.');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, data?.error ?? `Request failed (${r.status})`);
  return data as T;
}

export type LiveMatch = { id: string; phase: string; round: number; range: string; startedAt: number; spectators: number; players: Record<'a' | 'b', { wallet: string; name: string; rating: number; hp: number; maxHp: number; agent: any }> };
export type RecentMatch = Omit<MatchRecord, 'turns' | 'rounds'> & { roundCount: number };

export const api = {
  config: () => call<PublicConfig>('/api/config', { signal: AbortSignal.timeout(4000) }),
  status: () => call<{ ok: boolean; online: number; queued: number; live: number; season: { id: string; name: string }; network: string }>('/api/status'),
  seasons: () => call<{ id: string; name: string; current: boolean }[]>('/api/seasons'),
  challenge: (wallet: string) => call<{ message: string; nonce: string }>('/api/auth/challenge', { body: { wallet } }),
  verify: (wallet: string, signature: string) => call<{ token: string; expiresAt: number }>('/api/auth/verify', { body: { wallet, signature } }),
  me: () => call<Me & { activeMatch: string | null }>('/api/me'),
  updateMe: (b: { name?: string; frame?: string; activeAgentId?: string }) => call<Me>('/api/me', { method: 'PATCH', body: b }),
  createAgent: (b: Partial<Agent>) => call<Agent>('/api/agents', { body: b }),
  updateAgent: (id: string, b: Partial<Agent>) => call<Agent>(`/api/agents/${id}`, { method: 'PUT', body: b }),
  deleteAgent: (id: string) => call<{ ok: true }>(`/api/agents/${id}`, { method: 'DELETE' }),
  featuredAgents: () => call<(Agent & { ownerName: string; games: number })[]>('/api/agents'),
  agent: (id: string) => call<{ agent: Agent; owner: PlayerPublic | null; matches: MatchRecord[] }>(`/api/agents/${id}`),
  player: (w: string) => call<{ player: PlayerPublic; agents: Agent[]; online: boolean; matches: MatchRecord[] }>(`/api/players/${w}`),
  leaderboard: (season: string, q = '') => call<LeaderRow[]>(`/api/leaderboard?season=${encodeURIComponent(season)}&q=${encodeURIComponent(q)}`),
  liveMatches: () => call<LiveMatch[]>('/api/matches/live'),
  recentMatches: () => call<RecentMatch[]>('/api/matches/recent'),
  match: (id: string) => call<MatchRecord>(`/api/matches/${id}`)
};

export const wsUrl = () => {
  const base = API_BASE || window.location.origin;
  return base.replace(/^http/, 'ws') + '/ws';
};
