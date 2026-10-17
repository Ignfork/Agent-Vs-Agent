// App actions: wallet connection, sign-in, session and arena intents.
import { api, setApiToken, ApiError } from './services/api';
import { ArenaSocket } from './services/socket';
import { getState, setState, toast } from './state';
import { connectWallet, disconnectWallet, isUserRejection, onAccountsChanged, signMessage, watchWallets, type StdWallet } from './wallet/standard';
import { b58encode } from '../shared/base58';
import type { ServerMsg } from '../shared/types';
import type { ActionId, EmoteId } from '../shared/game';
import { EMOTES } from '../shared/game';

const SESSION_KEY = 'ava.session';
const WALLET_KEY = 'ava.wallet';
let seq = 1;
let offAccounts: (() => void) | null = null;

const socket = new ArenaSocket(onServerMessage, (s) => setState({ socket: s }));
export const arenaSend = socket.send.bind(socket);

function saveSession(wallet: string, token: string, expiresAt: number) { try { localStorage.setItem(SESSION_KEY, JSON.stringify({ wallet, token, expiresAt })); } catch { /* storage unavailable */ } }
function loadSession(wallet: string): string | null {
  try { const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); return s && s.wallet === wallet && s.expiresAt > Date.now() + 60_000 ? s.token : null; } catch { return null; }
}
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } }

export async function init() {
  watchWallets((wallets) => setState({ wallets }));
  try {
    const config = await api.config();
    setState({ config, server: 'online' });
    socket.start(null);
  } catch {
    setState({ server: 'offline' });
  }
  // Quietly restore a previous wallet connection (no popup; wallets that
  // don't support silent connect simply stay disconnected).
  let name: string | null = null;
  try { name = localStorage.getItem(WALLET_KEY); } catch { /* ignore */ }
  if (name) {
    const tryRestore = (ws: StdWallet[]) => { const w = ws.find((x) => x.name === name); if (w && getState().walletStatus === 'disconnected') connect(w, true); };
    tryRestore(getState().wallets);
    setTimeout(() => tryRestore(getState().wallets), 800);
  }
}

export async function retryServer() {
  setState({ server: 'checking' });
  try { const config = await api.config(); setState({ config, server: 'online' }); socket.start(getState().token); if (getState().account && !getState().token) startSignIn(); }
  catch { setState({ server: 'offline' }); toast('Game server is still unreachable. Demo mode is available.', 'warn'); }
}

export async function connect(w: StdWallet, silent = false) {
  setState({ walletStatus: 'connecting', walletError: null });
  try {
    const account = await connectWallet(w, silent);
    try { localStorage.setItem(WALLET_KEY, w.name); } catch { /* ignore */ }
    offAccounts?.();
    offAccounts = onAccountsChanged(w, (accounts) => {
      const a = accounts[0];
      if (!a) { disconnect(); return; }
      if (a.address !== getState().account?.address) { signOut(true); setState({ account: a }); toast('Wallet account changed — sign in again to play as this account.', 'warn'); }
    });
    setState({ wallet: w, account, walletStatus: 'connected', walletModal: false });
    const token = loadSession(account.address);
    if (token && getState().server === 'online') await applyToken(token, true);
    else if (!silent && getState().server === 'online') startSignIn();
  } catch (e) {
    setState({ walletStatus: 'disconnected', wallet: null, account: null });
    if (silent) return;
    const msg = isUserRejection(e) ? 'Connection request was cancelled in your wallet.' : `Could not connect: ${(e as Error).message}`;
    setState({ walletError: msg });
  }
}

export async function disconnect() {
  const w = getState().wallet;
  signOut(true);
  offAccounts?.(); offAccounts = null;
  setState({ wallet: null, account: null, walletStatus: 'disconnected' });
  try { localStorage.removeItem(WALLET_KEY); } catch { /* ignore */ }
  if (w) await disconnectWallet(w);
}

export const startSignIn = () => setState({ signIn: 'explain', signInError: null });
export const cancelSignIn = () => setState({ signIn: 'idle', signInError: null });

/** Runs only after the player has read the explanation and pressed Continue. */
export async function confirmSignIn() {
  const { wallet, account } = getState();
  if (!wallet || !account) return setState({ signInError: 'Connect a wallet first.' });
  try {
    setState({ signIn: 'challenge', signInError: null });
    const { message } = await api.challenge(account.address);
    setState({ signIn: 'signing' });
    const sig = await signMessage(wallet, account, new TextEncoder().encode(message));
    setState({ signIn: 'verifying' });
    const { token, expiresAt } = await api.verify(account.address, b58encode(sig));
    saveSession(account.address, token, expiresAt);
    await applyToken(token, false);
    setState({ signIn: 'idle' });
    toast('Signed in. No transaction was sent.', 'success');
  } catch (e) {
    const msg = isUserRejection(e) ? 'You declined the signature in your wallet. Nothing was signed.' : e instanceof ApiError ? e.message : `Sign-in failed: ${(e as Error).message}`;
    setState({ signIn: 'explain', signInError: msg });
  }
}

async function applyToken(token: string, restored: boolean) {
  setApiToken(token);
  try {
    const me = await api.me();
    setState({ token, me });
    socket.setToken(token);
    if (socket.status === 'idle' || socket.status === 'closed') socket.start(token);
  } catch (e) {
    setApiToken(null);
    if (restored) { clearSession(); startSignIn(); } else throw e;
  }
}

export function signOut(silent = false) {
  clearSession(); setApiToken(null);
  setState({ token: null, me: null, queue: null, match: null, lastRound: null, endInfo: null, incoming: [], outgoing: null });
  if (getState().server === 'online') { socket.stop(); socket.start(null); }
  if (!silent) toast('Signed out.', 'info');
}

export async function refreshMe() {
  if (!getState().token) return;
  try { setState({ me: await api.me() }); } catch (e) { if (e instanceof ApiError && e.status === 401) { signOut(true); toast('Session expired — sign in again.', 'warn'); } }
}

// ---------------------------------------------------------------- arena
function onServerMessage(m: ServerMsg) {
  const s = getState();
  switch (m.t) {
    case 'hello': return;
    case 'auth.error': signOut(true); toast(m.message, 'warn'); return;
    case 'session.replaced': toast('This account is now playing in another tab. This tab is disconnected from the arena.', 'warn', 8000); return;
    case 'error': toast(m.message, 'error'); return;
    case 'queue.status': setState({ queue: m.inQueue ? m : null }); return;
    case 'challenge.incoming': setState({ incoming: [...s.incoming.filter((c) => c.id !== m.id), m] }); toast(`${m.from.name} challenged you!`, 'info'); return;
    case 'challenge.sent': setState({ outgoing: { id: m.id, to: m.to, expiresAt: m.expiresAt } }); return;
    case 'challenge.closed':
      setState({ incoming: s.incoming.filter((c) => c.id !== m.id), outgoing: s.outgoing?.id === m.id ? null : s.outgoing });
      if (s.outgoing?.id === m.id && m.reason !== 'accepted') toast(`Challenge ${m.reason}.`, 'info');
      return;
    case 'match.state': {
      if (s.spectate && m.match.id === s.spectate.id && !m.match.you) setState({ spectate: m.match });
      if (!m.match.you) return;
      const fresh = !s.match || s.match.id !== m.match.id;
      setState({ match: m.match, queue: null, ...(fresh ? { lastRound: null, endInfo: null, rematch: { a: false, b: false }, emote: null } : {}) });
      if (fresh && m.match.phase === 'ready') toast('Match found! Ready up.', 'success');
      if (m.reconnected) toast('Reconnected to your match.', 'success');
      return;
    }
    case 'match.round':
      if (s.spectate?.id === m.matchId && !m.match.you) return setState({ spectate: m.match, spectateRound: { result: m.result, seq: seq++ } });
      if (s.match?.id === m.matchId) setState({ match: m.match, lastRound: { result: m.result, seq: seq++ } });
      return;
    case 'match.end': {
      const last = m.match.rounds[m.match.rounds.length - 1];
      if (s.spectate?.id === m.matchId && !m.match.you) return setState({ spectate: m.match, spectateRound: last ? { result: last, seq: seq++ } : s.spectateRound });
      if (s.match?.id !== m.matchId) return;
      const newRound = last && (!s.lastRound || s.lastRound.result.round !== last.round);
      setState({ match: m.match, endInfo: { ratingDelta: m.ratingDelta, xp: m.xp, levelUps: m.levelUps }, ...(newRound ? { lastRound: { result: last, seq: seq++ } } : {}) });
      refreshMe();
      setState((x) => ({ dataVersion: x.dataVersion + 1 }));
      return;
    }
    case 'match.cancelled':
      if (s.spectate?.id === m.matchId) setState({ spectate: { ...s.spectate, phase: 'cancelled' } });
      if (s.match?.id === m.matchId) { setState({ match: null }); toast(m.reason + (m.requeued ? ' You are back in the queue.' : ''), 'warn', 6000); }
      return;
    case 'match.emote': if (s.match?.id === m.matchId || s.spectate?.id === m.matchId) setState({ emote: { side: m.side, emote: m.emote, at: Date.now() } }); return;
    case 'match.rematch': if (s.match?.id === m.matchId) setState({ rematch: { ...s.rematch, [m.side]: true } }); return;
  }
}

const need = () => { if (!getState().token) { toast('Sign in with your wallet to play online.', 'warn'); return false; } if (getState().socket !== 'open') { toast('Arena connection is not ready yet — retrying.', 'warn'); return false; } return true; };
export const joinQueue = (agentId: string) => need() && arenaSend({ t: 'queue.join', agentId });
export const leaveQueue = () => arenaSend({ t: 'queue.leave' });
export const sendChallenge = (target: string, agentId: string) => need() && arenaSend({ t: 'challenge.send', target, agentId });
export const respondChallenge = (id: string, accept: boolean, agentId?: string) => arenaSend({ t: 'challenge.respond', id, accept, agentId });
export const cancelChallenge = (id: string) => { arenaSend({ t: 'challenge.cancel', id }); setState({ outgoing: null }); };
export const readyUp = () => { const m = getState().match; if (m) arenaSend({ t: 'match.ready', matchId: m.id }); };
export const sendAction = (action: ActionId) => { const m = getState().match; if (m) arenaSend({ t: 'match.action', matchId: m.id, round: m.round, action }); };
export const forfeit = () => { const m = getState().match; if (m) arenaSend({ t: 'match.forfeit', matchId: m.id }); };
export const sendEmote = (emote: EmoteId) => { const m = getState().match; if (m && emote in EMOTES) arenaSend({ t: 'match.emote', matchId: m.id, emote }); };
export const requestRematch = () => { const m = getState().match; if (m) arenaSend({ t: 'match.rematch', matchId: m.id }); };
export const leaveFinishedMatch = () => setState({ match: null, lastRound: null, endInfo: null });
export function spectate(id: string) {
  const s = getState();
  if (s.spectate && s.spectate.id !== id) arenaSend({ t: 'spectate.leave', matchId: s.spectate.id });
  setState({ spectate: { id } as any, spectateRound: null });
  if (!arenaSend({ t: 'spectate', matchId: id })) setTimeout(() => arenaSend({ t: 'spectate', matchId: id }), 1200);
}
export function stopSpectating() { const s = getState(); if (s.spectate?.id) arenaSend({ t: 'spectate.leave', matchId: s.spectate.id }); setState({ spectate: null, spectateRound: null }); }
