// Tiny global store (no dependency). Components read with useStore(selector);
// selectors should return existing references or primitives.
import { useSyncExternalStore } from 'react';
import type { MatchSnapshot, Me, PublicConfig } from '../shared/types';
import type { RoundResult, Side } from '../shared/engine';
import type { EmoteId } from '../shared/game';
import type { XpLine } from '../shared/progression';
import type { StdAccount, StdWallet } from './wallet/standard';
import type { SocketStatus } from './services/socket';

export interface Toast { id: number; kind: 'info' | 'success' | 'error' | 'warn'; text: string }
export type SignInStep = 'idle' | 'explain' | 'challenge' | 'signing' | 'verifying';
export interface EndInfo { ratingDelta: Record<Side, number>; xp: Record<Side, XpLine[]>; levelUps: Record<Side, number[]> }
export interface Challenge { id: string; from: { wallet: string; name: string; rating: number }; agentName: string; expiresAt: number }

export interface AppState {
  config: PublicConfig | null;
  server: 'checking' | 'online' | 'offline';
  wallets: StdWallet[];
  wallet: StdWallet | null;
  account: StdAccount | null;
  walletStatus: 'disconnected' | 'connecting' | 'connected';
  walletModal: boolean;
  walletError: string | null;
  signIn: SignInStep;
  signInError: string | null;
  token: string | null;
  me: (Me & { activeMatch: string | null }) | null;
  socket: SocketStatus;
  queue: { inQueue: boolean; waitSec: number; window: number; queued: number; agentId?: string } | null;
  match: MatchSnapshot | null;
  lastRound: { result: RoundResult; seq: number } | null;
  endInfo: EndInfo | null;
  rematch: Record<Side, boolean>;
  emote: { side: Side; emote: EmoteId; at: number } | null;
  incoming: Challenge[];
  outgoing: { id: string; to: { wallet: string; name: string }; expiresAt: number } | null;
  spectate: MatchSnapshot | null;
  spectateRound: { result: RoundResult; seq: number } | null;
  toasts: Toast[];
  dataVersion: number;
}

let state: AppState = {
  config: null, server: 'checking', wallets: [], wallet: null, account: null, walletStatus: 'disconnected',
  walletModal: false, walletError: null, signIn: 'idle', signInError: null, token: null, me: null, socket: 'idle',
  queue: null, match: null, lastRound: null, endInfo: null, rematch: { a: false, b: false }, emote: null,
  incoming: [], outgoing: null, spectate: null, spectateRound: null, toasts: [], dataVersion: 0
};
const subs = new Set<() => void>();
export const getState = () => state;
export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  subs.forEach((f) => f());
}
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
export function useStore<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(state));
}

let toastId = 1;
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 4500) {
  const id = toastId++;
  setState((s) => ({ toasts: [...s.toasts, { id, kind, text }].slice(-4) }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}
export const signedIn = (s: AppState) => !!(s.token && s.me);
