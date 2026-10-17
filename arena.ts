// Real-time arena: sockets, matchmaking queue, direct challenges and
// server-authoritative match rooms. Clients only ever send intents
// ("I choose Attack for round 3"); the server resolves every round.
import crypto from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from './config';
import { readToken } from './auth';
import { store, newId } from './store';
import { initMatch, resolveRound, type MatchState, type Side, other } from '../shared/engine';
import { ACTIONS, EMOTES, type ActionId, type EmoteId, type Loadout } from '../shared/game';
import { computeXp, eloDelta, levelFromXp } from '../shared/progression';
import { isSolanaAddress } from '../shared/base58';
import type { ClientMsg, EndReason, MatchRecord, MatchSnapshot, PublicFighter, ServerMsg } from '../shared/types';

interface Conn { ws: WebSocket; wallet: string | null; spectating: Set<string>; alive: boolean; replaced: boolean; msgCount: number; msgWindow: number }

const conns = new Set<Conn>();
const byWallet = new Map<string, Conn>();
const send = (c: Conn | undefined, m: ServerMsg) => { if (c && c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(m)); };
const sendTo = (wallet: string, m: ServerMsg) => send(byWallet.get(wallet), m);
export const isOnline = (wallet: string) => byWallet.has(wallet);
export const onlineCount = () => byWallet.size;

// ---------------------------------------------------------------- queue
interface QueueEntry { wallet: string; agentId: string; rating: number; joinedAt: number }
const queue = new Map<string, QueueEntry>();
/** Rating window widens the longer you wait; after 90s anyone is fair game. */
export const queueWindow = (waitMs: number) => (waitMs >= 90_000 ? Infinity : Math.min(800, 100 + 20 * Math.floor(waitMs / 1000)));
export const queueSize = () => queue.size;

function ratingOf(wallet: string) { const p = store.getPlayer(wallet); return p ? store.season(p).rating : 1000; }

function checkAgent(wallet: string, agentId: string): string | null {
  const a = store.getAgent(agentId);
  if (!a || a.owner !== wallet) return 'Pick one of your own agents first.';
  return null;
}
function busy(wallet: string): string | null {
  if (roomByWallet.has(wallet)) return 'You are already in a match.';
  return null;
}

function joinQueue(wallet: string, agentId: string) {
  const err = busy(wallet) || checkAgent(wallet, agentId);
  if (err) return sendTo(wallet, { t: 'error', message: err });
  queue.set(wallet, { wallet, agentId, rating: ratingOf(wallet), joinedAt: queue.get(wallet)?.joinedAt ?? Date.now() });
  queueStatus(wallet);
}
function leaveQueue(wallet: string) { queue.delete(wallet); sendTo(wallet, { t: 'queue.status', inQueue: false, waitSec: 0, window: 0, queued: queue.size }); }
function queueStatus(wallet: string) {
  const e = queue.get(wallet);
  if (!e) return;
  const wait = Date.now() - e.joinedAt;
  const w = queueWindow(wait);
  sendTo(wallet, { t: 'queue.status', inQueue: true, waitSec: Math.floor(wait / 1000), window: Number.isFinite(w) ? w : -1, queued: queue.size, agentId: e.agentId });
}
function pairQueue() {
  const now = Date.now();
  const list = [...queue.values()].sort((x, y) => x.joinedAt - y.joinedAt);
  const used = new Set<string>();
  for (const p of list) {
    if (used.has(p.wallet)) continue;
    let best: QueueEntry | null = null, bestD = Infinity;
    for (const q of list) {
      if (q === p || used.has(q.wallet)) continue;
      const d = Math.abs(p.rating - q.rating);
      const allowed = Math.max(queueWindow(now - p.joinedAt), queueWindow(now - q.joinedAt));
      if (d <= allowed && d < bestD) { best = q; bestD = d; }
    }
    if (best) {
      used.add(p.wallet); used.add(best.wallet); queue.delete(p.wallet); queue.delete(best.wallet);
      createRoom({ wallet: p.wallet, agentId: p.agentId }, { wallet: best.wallet, agentId: best.agentId }, 'queue');
    }
  }
  for (const w of queue.keys()) queueStatus(w);
}

// ---------------------------------------------------------------- challenges
interface Challenge { id: string; from: string; to: string; fromAgentId: string; expiresAt: number }
const challenges = new Map<string, Challenge>();
function resolvePlayer(q: string) {
  const t = q.trim();
  if (isSolanaAddress(t)) return store.getPlayer(t);
  return store.findPlayerByName(t);
}
function sendChallenge(from: string, target: string, agentId: string) {
  const err = busy(from) || checkAgent(from, agentId);
  if (err) return sendTo(from, { t: 'error', message: err });
  const tp = typeof target === 'string' ? resolvePlayer(target) : undefined;
  if (!tp) return sendTo(from, { t: 'error', message: 'No player with that name or wallet has signed in yet.' });
  if (tp.wallet === from) return sendTo(from, { t: 'error', message: "You can't challenge yourself." });
  if (!isOnline(tp.wallet)) return sendTo(from, { t: 'error', message: `${tp.name} is offline right now.` });
  if (roomByWallet.has(tp.wallet)) return sendTo(from, { t: 'error', message: `${tp.name} is in a match. Try again shortly.` });
  if ([...challenges.values()].some((c) => c.from === from && c.to === tp.wallet)) return sendTo(from, { t: 'error', message: 'You already have a pending challenge to that player.' });
  const c: Challenge = { id: newId('ch'), from, to: tp.wallet, fromAgentId: agentId, expiresAt: Date.now() + 60_000 };
  challenges.set(c.id, c);
  const fp = store.getPlayer(from)!;
  sendTo(tp.wallet, { t: 'challenge.incoming', id: c.id, from: { wallet: from, name: fp.name, rating: store.season(fp).rating }, agentName: store.getAgent(agentId)!.name, expiresAt: c.expiresAt });
  sendTo(from, { t: 'challenge.sent', id: c.id, to: { wallet: tp.wallet, name: tp.name }, expiresAt: c.expiresAt });
}
function closeChallenge(c: Challenge, reason: string) {
  challenges.delete(c.id);
  sendTo(c.from, { t: 'challenge.closed', id: c.id, reason });
  sendTo(c.to, { t: 'challenge.closed', id: c.id, reason });
}
function respondChallenge(wallet: string, id: string, accept: boolean, agentId?: string) {
  const c = challenges.get(id);
  if (!c || c.to !== wallet) return sendTo(wallet, { t: 'error', message: 'That challenge is no longer available.' });
  if (!accept) return closeChallenge(c, 'declined');
  const err = busy(wallet) || busy(c.from) || checkAgent(wallet, agentId ?? '') || checkAgent(c.from, c.fromAgentId);
  if (err) { closeChallenge(c, 'unavailable'); return sendTo(wallet, { t: 'error', message: err }); }
  if (!isOnline(c.from)) return closeChallenge(c, 'challenger went offline');
  challenges.delete(c.id);
  queue.delete(wallet); queue.delete(c.from);
  sendTo(c.from, { t: 'challenge.closed', id: c.id, reason: 'accepted' });
  sendTo(c.to, { t: 'challenge.closed', id: c.id, reason: 'accepted' });
  createRoom({ wallet: c.from, agentId: c.fromAgentId }, { wallet, agentId: agentId! }, 'challenge');
}

// ---------------------------------------------------------------- rooms
const rooms = new Map<string, Room>();
const roomByWallet = new Map<string, string>();

function fighter(wallet: string, agentId: string): PublicFighter {
  const p = store.ensurePlayer(wallet), a = store.getAgent(agentId)!;
  return { wallet, name: p.name, rating: store.season(p).rating, agent: { id: a.id, name: a.name, classId: a.classId, weapon: a.weapon, gadget: a.gadget, palette: a.palette, frame: a.frame, emote: a.emote } };
}
function createRoom(a: { wallet: string; agentId: string }, b: { wallet: string; agentId: string }, mode: MatchSnapshot['mode']) {
  const room = new Room(fighter(a.wallet, a.agentId), fighter(b.wallet, b.agentId), mode);
  rooms.set(room.id, room);
  roomByWallet.set(a.wallet, room.id); roomByWallet.set(b.wallet, room.id);
  room.begin();
  return room;
}

class Room {
  id = newId('m');
  seed = crypto.randomBytes(32).toString('hex');
  seedCommit = crypto.createHash('sha256').update(this.seed).digest('hex');
  state: MatchState;
  phase: MatchSnapshot['phase'] = 'ready';
  ready: Record<Side, boolean> = { a: false, b: false };
  pending: Partial<Record<Side, ActionId>> = {};
  turns: MatchRecord['turns'] = [];
  deadline: number | null = null;
  timer: NodeJS.Timeout | null = null;
  graceUntil: Partial<Record<Side, number>> = {};
  graceTimers: Partial<Record<Side, NodeJS.Timeout>> = {};
  spectators = new Set<Conn>();
  rematch: Record<Side, boolean> = { a: false, b: false };
  lastEmote: Record<Side, number> = { a: 0, b: 0 };
  winner: Side | 'draw' | null = null;
  endReason: EndReason | null = null;
  startedAt = Date.now();

  players: Record<Side, PublicFighter>;
  constructor(a: PublicFighter, b: PublicFighter, public mode: MatchSnapshot['mode'] = 'queue') {
    this.players = { a, b };
    const lo = (f: PublicFighter): Loadout => ({ classId: f.agent.classId, weapon: f.agent.weapon, gadget: f.agent.gadget, palette: f.agent.palette, name: f.agent.name });
    this.state = initMatch(this.seed, lo(a), lo(b));
  }
  get P() { return this.players; }
  sideOf(wallet: string): Side | null { return this.P.a.wallet === wallet ? 'a' : this.P.b.wallet === wallet ? 'b' : null; }

  snapshot(you?: Side): MatchSnapshot {
    const s = this.state;
    return {
      id: this.id, season: config.season.id, phase: this.phase, mode: this.mode, seedCommit: this.seedCommit,
      seed: this.phase === 'ended' ? this.seed : undefined, players: this.P, you,
      round: s.round, range: s.range, f: s.f, ready: this.ready, locked: { a: !!this.pending.a, b: !!this.pending.b },
      connected: { a: isOnline(this.P.a.wallet), b: isOnline(this.P.b.wallet) }, deadline: this.deadline, graceUntil: this.graceUntil,
      rounds: s.rounds, winner: this.winner, endReason: this.endReason, spectators: this.spectators.size, startedAt: this.startedAt
    };
  }
  emit(build: (you?: Side) => ServerMsg) {
    sendTo(this.P.a.wallet, build('a')); sendTo(this.P.b.wallet, build('b'));
    for (const c of this.spectators) send(c, build(undefined));
  }
  pushState() { this.emit((you) => ({ t: 'match.state', match: this.snapshot(you) })); }
  setTimer(ms: number, fn: () => void) { if (this.timer) clearTimeout(this.timer); this.deadline = Date.now() + ms; this.timer = setTimeout(fn, ms); }

  begin() {
    this.setTimer(config.readySeconds * 1000, () => this.readyTimeout());
    this.pushState();
  }
  onReady(side: Side) {
    if (this.phase !== 'ready') return;
    this.ready[side] = true;
    if (this.ready.a && this.ready.b) { this.phase = 'active'; this.startRound(); } else this.pushState();
  }
  readyTimeout() {
    if (this.phase !== 'ready') return;
    this.phase = 'cancelled';
    this.cleanup();
    for (const side of ['a', 'b'] as Side[]) {
      const f = this.P[side];
      const requeue = this.mode === 'queue' && this.ready[side] && isOnline(f.wallet);
      sendTo(f.wallet, { t: 'match.cancelled', matchId: this.id, reason: this.ready[side] ? 'Your opponent did not ready up in time.' : 'You did not ready up in time.', requeued: requeue });
      if (requeue) joinQueue(f.wallet, f.agent.id);
    }
    for (const c of this.spectators) send(c, { t: 'match.cancelled', matchId: this.id, reason: 'Match did not start.', requeued: false });
    rooms.delete(this.id);
  }
  startRound() {
    this.pending = {};
    this.setTimer(config.turnSeconds * 1000, () => this.resolve(true));
    this.pushState();
  }
  onAction(side: Side, round: number, action: ActionId) {
    if (this.phase !== 'active') return sendTo(this.P[side].wallet, { t: 'error', message: 'The match is not in progress.' });
    if (round !== this.state.round) return sendTo(this.P[side].wallet, { t: 'error', message: 'That action was for a different round.' });
    if (!(action in ACTIONS)) return sendTo(this.P[side].wallet, { t: 'error', message: 'Unknown action.' });
    if (this.pending[side]) return sendTo(this.P[side].wallet, { t: 'error', message: 'You already locked in this round.' });
    this.pending[side] = action;
    if (this.pending.a && this.pending.b) this.resolve(false); else this.pushState();
  }
  resolve(fromTimer: boolean) {
    if (this.phase !== 'active') return;
    const timedOut: Partial<Record<Side, boolean>> = {};
    if (fromTimer) { if (!this.pending.a) timedOut.a = true; if (!this.pending.b) timedOut.b = true; }
    const a = this.pending.a ?? 'defend', b = this.pending.b ?? 'defend';
    this.turns.push(Object.keys(timedOut).length ? { a, b, timedOut } : { a, b });
    this.state = resolveRound(this.state, a, b, timedOut);
    const result = this.state.rounds[this.state.rounds.length - 1];
    this.pending = {};
    if (this.state.over) { this.winner = this.state.winner; this.end(this.state.endReason as EndReason); return; }
    this.setTimer(config.turnSeconds * 1000, () => this.resolve(true));
    this.emit((you) => ({ t: 'match.round', matchId: this.id, result, match: this.snapshot(you) }));
  }
  onDisconnect(side: Side) {
    if (this.phase === 'ended' || this.phase === 'cancelled') return;
    this.graceUntil[side] = Date.now() + config.reconnectSeconds * 1000;
    this.graceTimers[side] = setTimeout(() => {
      if (isOnline(this.P[side].wallet)) return;
      if (this.phase === 'active') this.end('abandon', side);
      else if (this.phase === 'ready') this.readyTimeout();
    }, config.reconnectSeconds * 1000);
    this.pushState();
  }
  onReconnect(side: Side) {
    if (this.graceTimers[side]) clearTimeout(this.graceTimers[side]!);
    delete this.graceTimers[side]; delete this.graceUntil[side];
    sendTo(this.P[side].wallet, { t: 'match.state', match: this.snapshot(side), reconnected: true });
    this.pushState();
  }
  forfeit(side: Side) { if (this.phase === 'active' || this.phase === 'ready') { if (this.phase === 'ready') { this.readyTimeout(); return; } this.end('forfeit', side); } }
  emote(side: Side, emote: EmoteId) {
    const p = store.getPlayer(this.P[side].wallet);
    if (!(emote in EMOTES) || !p || EMOTES[emote].level > levelFromXp(p.xp).level) return;
    if (Date.now() - this.lastEmote[side] < 2500) return;
    this.lastEmote[side] = Date.now();
    this.emit(() => ({ t: 'match.emote', matchId: this.id, side, emote }));
  }

  end(reason: EndReason, loser?: Side) {
    if (this.phase === 'ended') return;
    this.phase = 'ended'; this.endReason = reason; this.deadline = null;
    if (loser) this.winner = other(loser);
    this.cleanup();
    const sides: Side[] = ['a', 'b'];
    const rows = { a: store.ensurePlayer(this.P.a.wallet), b: store.ensurePlayer(this.P.b.wallet) };
    const seasons = { a: store.season(rows.a), b: store.season(rows.b) };
    const score = (x: Side) => (this.winner === 'draw' ? 0.5 : this.winner === x ? 1 : 0);
    const ratingDelta = { a: eloDelta(seasons.a.rating, seasons.b.rating, score('a'), seasons.a.games), b: eloDelta(seasons.b.rating, seasons.a.rating, score('b'), seasons.b.games) };
    const xp = {} as Record<Side, ReturnType<typeof computeXp>>;
    const levelUps: Record<Side, number[]> = { a: [], b: [] };
    for (const x of sides) {
      const st = seasons[x], row = rows[x];
      st.rating += ratingDelta[x]; st.games++; st.lastMatchAt = Date.now();
      if (this.winner === 'draw') st.draws++; else if (this.winner === x) st.wins++; else st.losses++;
      const outcome = this.winner === 'draw' ? 'draw' : this.winner === x ? 'win' : 'loss';
      xp[x] = computeXp({ outcome, rounds: this.state.rounds.length, abandoned: reason === 'abandon' && loser === x, opponentAbandoned: reason === 'abandon' && loser === other(x) });
      const total = xp[x].reduce((s, l) => s + l.xp, 0);
      const before = levelFromXp(row.xp).level; row.xp += total; const after = levelFromXp(row.xp).level;
      for (let l = before + 1; l <= after; l++) levelUps[x].push(l);
      row.rewards.push({ matchId: this.id, at: Date.now(), lines: xp[x], total, levelUps: levelUps[x] });
      if (row.rewards.length > 50) row.rewards.splice(0, row.rewards.length - 50);
      store.updatePlayer(row);
      const ag = store.getAgent(this.P[x].agent.id);
      if (ag) { if (outcome === 'win') ag.wins++; else if (outcome === 'loss') ag.losses++; else ag.draws++; store.putAgent(ag); }
    }
    const record: MatchRecord = {
      id: this.id, season: config.season.id, mode: this.mode, startedAt: this.startedAt, endedAt: Date.now(),
      seedCommit: this.seedCommit, seed: this.seed, players: this.P, turns: this.turns, rounds: this.state.rounds,
      winner: this.winner ?? 'draw', endReason: reason, ratingDelta, xp, finalHp: { a: this.state.f.a.hp, b: this.state.f.b.hp }
    };
    store.putMatch(record);
    this.emit((you) => ({ t: 'match.end', matchId: this.id, match: this.snapshot(you), ratingDelta, xp, levelUps }));
    // Keep the room around briefly so both players can ask for a rematch.
    this.timer = setTimeout(() => { rooms.delete(this.id); }, 30_000);
  }
  cleanup() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const t of Object.values(this.graceTimers)) if (t) clearTimeout(t);
    this.graceTimers = {}; this.graceUntil = {};
    for (const x of ['a', 'b'] as Side[]) if (roomByWallet.get(this.P[x].wallet) === this.id) roomByWallet.delete(this.P[x].wallet);
  }
  requestRematch(side: Side) {
    if (this.phase !== 'ended' || !rooms.has(this.id)) return sendTo(this.P[side].wallet, { t: 'error', message: 'Rematch window has closed.' });
    this.rematch[side] = true;
    this.emit(() => ({ t: 'match.rematch', matchId: this.id, side }));
    if (this.rematch.a && this.rematch.b) {
      const ok = (x: Side) => !busy(this.P[x].wallet) && !checkAgent(this.P[x].wallet, this.P[x].agent.id) && isOnline(this.P[x].wallet);
      if (!ok('a') || !ok('b')) { this.emit(() => ({ t: 'error', message: 'Rematch unavailable — a player left or changed agents.' })); return; }
      rooms.delete(this.id);
      createRoom({ wallet: this.P.a.wallet, agentId: this.P.a.agent.id }, { wallet: this.P.b.wallet, agentId: this.P.b.agent.id }, 'rematch');
    }
  }
}

export function liveMatches() {
  return [...rooms.values()].filter((r) => r.phase === 'active' || r.phase === 'ready').map((r) => ({
    id: r.id, phase: r.phase, round: r.state.round, range: r.state.range, startedAt: r.startedAt, spectators: r.spectators.size,
    players: { a: { ...r.P.a, hp: r.state.f.a.hp, maxHp: r.state.f.a.maxHp }, b: { ...r.P.b, hp: r.state.f.b.hp, maxHp: r.state.f.b.maxHp } }
  }));
}
export const activeMatchFor = (wallet: string) => roomByWallet.get(wallet) ?? null;

// ---------------------------------------------------------------- sockets
function onMessage(c: Conn, raw: string) {
  // Basic flood protection: 40 messages per 5 seconds.
  const now = Date.now();
  if (now - c.msgWindow > 5000) { c.msgWindow = now; c.msgCount = 0; }
  if (++c.msgCount > 40) return send(c, { t: 'error', message: 'Slow down.' });
  let m: ClientMsg;
  try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m !== 'object') return;
  if (m.t === 'ping') return send(c, { t: 'pong' });
  if (m.t === 'spectate') {
    const r = rooms.get(String(m.matchId));
    if (!r) return send(c, { t: 'error', message: 'That match is not live.' });
    r.spectators.add(c); c.spectating.add(r.id);
    return send(c, { t: 'match.state', match: r.snapshot(c.wallet ? r.sideOf(c.wallet) ?? undefined : undefined) });
  }
  if (m.t === 'spectate.leave') { const r = rooms.get(String(m.matchId)); r?.spectators.delete(c); c.spectating.delete(String(m.matchId)); return; }
  if (m.t === 'auth') {
    const wallet = readToken(m.token);
    if (!wallet) return send(c, { t: 'auth.error', message: 'Session expired. Please sign in again.' });
    const prev = byWallet.get(wallet);
    if (prev && prev !== c) { prev.replaced = true; send(prev, { t: 'session.replaced' }); prev.ws.close(4000, 'replaced'); }
    c.wallet = wallet; byWallet.set(wallet, c);
    const p = store.ensurePlayer(wallet);
    send(c, { t: 'hello', wallet, name: p.name });
    queueStatus(wallet);
    const rid = roomByWallet.get(wallet); const r = rid ? rooms.get(rid) : undefined;
    if (r) r.onReconnect(r.sideOf(wallet)!);
    return;
  }
  const w = c.wallet;
  if (!w) return send(c, { t: 'error', message: 'Sign in with your wallet to play.' });
  const room = (id: string) => { const r = rooms.get(String(id)); const side = r?.sideOf(w); return r && side ? { r, side } : null; };
  switch (m.t) {
    case 'queue.join': return joinQueue(w, String(m.agentId));
    case 'queue.leave': return leaveQueue(w);
    case 'challenge.send': return sendChallenge(w, String(m.target ?? ''), String(m.agentId));
    case 'challenge.respond': return respondChallenge(w, String(m.id), !!m.accept, m.agentId ? String(m.agentId) : undefined);
    case 'challenge.cancel': { const ch = challenges.get(String(m.id)); if (ch && ch.from === w) closeChallenge(ch, 'cancelled'); return; }
    case 'match.ready': { const x = room(m.matchId); return x?.r.onReady(x.side); }
    case 'match.action': { const x = room(m.matchId); if (!x) return send(c, { t: 'error', message: 'You are not in that match.' }); return x.r.onAction(x.side, Number(m.round), m.action); }
    case 'match.forfeit': { const x = room(m.matchId); return x?.r.forfeit(x.side); }
    case 'match.emote': { const x = room(m.matchId); return x?.r.emote(x.side, m.emote); }
    case 'match.rematch': { const x = room(m.matchId); if (!x) return send(c, { t: 'error', message: 'Rematch window has closed.' }); return x.r.requestRematch(x.side); }
  }
}
function onClose(c: Conn) {
  conns.delete(c);
  for (const id of c.spectating) rooms.get(id)?.spectators.delete(c);
  if (!c.wallet || c.replaced || byWallet.get(c.wallet) !== c) return;
  const w = c.wallet;
  byWallet.delete(w);
  queue.delete(w);
  for (const ch of [...challenges.values()]) if (ch.from === w || ch.to === w) closeChallenge(ch, 'player went offline');
  const rid = roomByWallet.get(w); const r = rid ? rooms.get(rid) : undefined;
  if (r) r.onDisconnect(r.sideOf(w)!);
}

export function attachArena(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    if (!req.url?.startsWith('/ws')) return socket.destroy();
    const origin = req.headers.origin;
    if (config.allowedOrigins.length && origin && !config.allowedOrigins.includes(origin)) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => {
      const c: Conn = { ws, wallet: null, spectating: new Set(), alive: true, replaced: false, msgCount: 0, msgWindow: Date.now() };
      conns.add(c);
      ws.on('message', (d) => onMessage(c, d.toString()));
      ws.on('pong', () => (c.alive = true));
      ws.on('close', () => onClose(c));
      ws.on('error', () => ws.terminate());
    });
  });
  setInterval(pairQueue, 1000).unref();
  setInterval(() => {
    for (const c of conns) { if (!c.alive) { c.ws.terminate(); continue; } c.alive = false; c.ws.ping(); }
    const now = Date.now();
    for (const ch of [...challenges.values()]) if (ch.expiresAt < now) closeChallenge(ch, 'expired');
  }, 15_000).unref();
  return wss;
}
