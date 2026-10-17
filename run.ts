// End-to-end test of the real server: two wallets sign in with ed25519
// signatures, build agents, find each other through the matchmaking queue,
// fight a full server-resolved match, then verify the result from the
// revealed seed. Also covers challenges, reconnection and bad input.
// Run: npm test
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import nacl from 'tweetnacl';
import WebSocket from 'ws';
import { b58encode } from '../shared/base58';
import { replay, type Side } from '../shared/engine';
import type { ServerMsg } from '../shared/types';

const PORT = 18000 + Math.floor(Math.random() * 1000);
process.env.PORT = String(PORT);
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ava-test-'));
process.env.SESSION_SECRET = 'test-secret';
process.env.TURN_SECONDS = '3';
process.env.READY_SECONDS = '5';
process.env.RECONNECT_SECONDS = '2';

let passed = 0;
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAIL: ' + msg); passed++; console.log('  ✓ ' + msg); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const base = `http://127.0.0.1:${PORT}`;

async function api(p: string, opts: { method?: string; body?: unknown; token?: string } = {}) {
  const r = await fetch(base + p, { method: opts.method ?? (opts.body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  return { status: r.status, data: await r.json() };
}

class Player {
  kp = nacl.sign.keyPair();
  wallet = b58encode(this.kp.publicKey);
  token = '';
  ws!: WebSocket;
  inbox: ServerMsg[] = [];
  async signIn() {
    const ch = await api('/api/auth/challenge', { body: { wallet: this.wallet } });
    const sig = nacl.sign.detached(new TextEncoder().encode(ch.data.message), this.kp.secretKey);
    const v = await api('/api/auth/verify', { body: { wallet: this.wallet, signature: b58encode(sig) } });
    this.token = v.data.token;
    return v;
  }
  connect() {
    return new Promise<void>((res) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
      this.ws.on('message', (d) => this.inbox.push(JSON.parse(d.toString())));
      this.ws.on('open', () => { this.send({ t: 'auth', token: this.token }); res(); });
    });
  }
  send(m: unknown) { this.ws.send(JSON.stringify(m)); }
  async wait<T extends ServerMsg['t']>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, ms = 8000): Promise<Extract<ServerMsg, { t: T }>> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const i = this.inbox.findIndex((m) => m.t === t && pred(m as any));
      if (i >= 0) return this.inbox.splice(i, 1)[0] as any;
      await sleep(20);
    }
    throw new Error(`timeout waiting for ${t}`);
  }
}

async function playOut(p1: Player, p2: Player, matchId: string, sideOf: Record<string, Side>) {
  const choose = ['attack', 'attack', 'gadget', 'attack', 'defend', 'move'];
  for (let i = 0; i < 20; i++) {
    const st1 = (await p1.wait('match.state', (m) => m.match.id === matchId && m.match.phase === 'active' && !m.match.locked[sideOf.p1], 6000).catch(() => null));
    if (!st1) break;
    const round = st1.match.round;
    p1.send({ t: 'match.action', matchId, round, action: choose[i % choose.length] });
    p2.send({ t: 'match.action', matchId, round, action: choose[(i + 2) % choose.length] });
    const next = await Promise.race([
      p1.wait('match.round', (m) => m.matchId === matchId, 6000).then(() => 'round'),
      p1.wait('match.end', (m) => m.matchId === matchId, 6000).then((m) => { p1.inbox.unshift(m); return 'end'; })
    ]);
    if (next === 'end') break;
  }
}

async function main() {
  await import('../server/index');
  await sleep(300);
  console.log('\nAuth');
  const p1 = new Player(), p2 = new Player(), p3 = new Player();
  const bad = await api('/api/auth/challenge', { body: { wallet: 'not-a-wallet' } });
  ok(bad.status === 400, 'rejects invalid wallet address');
  const ch = await api('/api/auth/challenge', { body: { wallet: p1.wallet } });
  ok(ch.data.message.includes('does not') && ch.data.message.includes(p1.wallet), 'challenge message explains it is not a transaction');
  const forged = nacl.sign.detached(new TextEncoder().encode(ch.data.message), nacl.sign.keyPair().secretKey);
  const fv = await api('/api/auth/verify', { body: { wallet: p1.wallet, signature: b58encode(forged) } });
  ok(fv.status === 401, 'rejects a signature from a different key');
  const replayAttempt = await api('/api/auth/verify', { body: { wallet: p1.wallet, signature: b58encode(forged) } });
  ok(replayAttempt.status === 400, 'challenge is single-use');
  ok((await p1.signIn()).status === 200 && p1.token, 'player 1 signs in with a valid signature');
  await p2.signIn(); await p3.signIn();
  ok((await api('/api/me')).status === 401, 'protected routes require a session');

  console.log('\nAgents');
  const badAgent = await api('/api/agents', { token: p1.token, body: { name: 'X', classId: 'heavy', weapon: 'scatter_cannon', gadget: 'aegis', palette: 'violet' } });
  ok(badAgent.status === 400, 'validates agent names');
  const locked = await api('/api/agents', { token: p1.token, body: { name: 'Tester', classId: 'heavy', weapon: 'arc_maul', gadget: 'aegis', palette: 'violet' } });
  ok(locked.status === 400 && /level 4/.test(locked.data.error), 'locks level-gated sidegrades');
  const a1 = (await api('/api/agents', { token: p1.token, body: { name: 'Brick Halo', classId: 'heavy', weapon: 'scatter_cannon', gadget: 'aegis', palette: 'violet' } })).data;
  const a2 = (await api('/api/agents', { token: p2.token, body: { name: 'Quill', classId: 'sniper', weapon: 'rail_lance', gadget: 'mirage', palette: 'cyan' } })).data;
  const a3 = (await api('/api/agents', { token: p3.token, body: { name: 'Sprocket', classId: 'flanker', weapon: 'twin_smg', gadget: 'blink', palette: 'steel' } })).data;
  ok(a1.id && a2.id && a3.id, 'creates agents for three players');
  const dup = await api('/api/agents', { token: p3.token, body: { name: 'quill', classId: 'trooper', weapon: 'pulse_carbine', gadget: 'blink', palette: 'steel' } });
  ok(dup.status === 409, 'agent names are unique');
  const nm = await api('/api/me', { method: 'PATCH', token: p2.token, body: { name: 'QuillMain' } });
  ok(nm.status === 200 && nm.data.name === 'QuillMain', 'player can set a display name');

  console.log('\nMatchmaking queue → full match');
  await p1.connect(); await p2.connect(); await p3.connect();
  await p1.wait('hello'); await p2.wait('hello'); await p3.wait('hello');
  p1.send({ t: 'queue.join', agentId: a1.id });
  ok((await p1.wait('queue.status', (m) => m.inQueue)).inQueue, 'player 1 enters the queue');
  p2.send({ t: 'queue.join', agentId: a2.id });
  const found1 = await p1.wait('match.state', (m) => m.match.phase === 'ready');
  const found2 = await p2.wait('match.state', (m) => m.match.phase === 'ready');
  ok(found1.match.id === found2.match.id, 'queue pairs the two players');
  ok(/^[0-9a-f]{64}$/.test(found1.match.seedCommit) && !found1.match.seed, 'seed is committed (hash) but hidden during play');
  const matchId = found1.match.id;
  const live = await api('/api/matches/live');
  ok(live.data.some((m: any) => m.id === matchId), 'match appears in the live list');
  const spect = new Player(); await spect.connect(); spect.send({ t: 'spectate', matchId });
  ok((await spect.wait('match.state')).match.you === undefined, 'spectator receives state without a side');
  p1.send({ t: 'match.ready', matchId }); p2.send({ t: 'match.ready', matchId });
  const sideOf = { p1: found1.match.you!, p2: found2.match.you! };
  const act = await p1.wait('match.state', (m) => m.match.phase === 'active');
  ok(act.match.round === 1, 'both ready → round 1 starts');
  p1.send({ t: 'match.action', matchId, round: 1, action: 'attack' });
  const lockedState = await p2.wait('match.state', (m) => m.match.locked[sideOf.p1]);
  ok(lockedState.match.locked[sideOf.p1] && !(lockedState.match as any).pending, 'opponent sees "locked in" but not the chosen action');
  p1.send({ t: 'match.action', matchId, round: 1, action: 'defend' });
  ok((await p1.wait('error')).message.includes('already locked'), 'cannot change an action after locking in');
  p2.send({ t: 'match.action', matchId, round: 1, action: 'attack' });
  const r1 = await p2.wait('match.round', (m) => m.matchId === matchId);
  ok(r1.result.round === 1 && r1.result.events.length > 0, 'server resolves round 1 and sends the combat log');
  p1.inbox = p1.inbox.filter((m) => m.t !== 'match.round');
  // A stale round number is rejected.
  p1.send({ t: 'match.action', matchId, round: 1, action: 'attack' });
  ok((await p1.wait('error')).message.includes('different round'), 'rejects actions for a past round');
  await playOut(p1, p2, matchId, sideOf);
  const end = await p1.wait('match.end', (m) => m.matchId === matchId, 60000);
  ok(end.match.phase === 'ended' && end.match.seed, 'match ends and reveals the seed');
  const commit = crypto.createHash('sha256').update(end.match.seed!).digest('hex');
  ok(commit === end.match.seedCommit, 'revealed seed matches the commitment');
  const rec = (await api(`/api/matches/${matchId}`)).data;
  const re = replay(rec.seed, { ...rec.players.a.agent }, { ...rec.players.b.agent }, rec.turns);
  ok(re.f.a.hp === rec.finalHp.a && re.f.b.hp === rec.finalHp.b && re.winner === rec.winner, 'independent replay reproduces the recorded result');
  ok(end.xp.a.length > 0 && end.xp.b.length > 0 && end.xp.a[0].xp > 0 && end.xp.b[0].xp > 0, 'both players earn XP (participation for the loser too)');
  ok(end.ratingDelta.a === -end.ratingDelta.b || end.match.winner === 'draw', 'rating changes are symmetric');
  const lb = (await api('/api/leaderboard')).data;
  ok(lb.length === 2 && lb[0].rating >= lb[1].rating, 'leaderboard shows both players sorted by rating');
  const meAfter = (await api('/api/me', { token: p1.token })).data;
  ok(meAfter.rewards[0]?.matchId === matchId && meAfter.rewards[0].lines.length, 'reward history records the reason and the match');

  console.log('\nRematch');
  p1.send({ t: 'match.rematch', matchId }); p2.send({ t: 'match.rematch', matchId });
  const rm = await p1.wait('match.state', (m) => m.match.mode === 'rematch' && m.match.phase === 'ready');
  ok(rm.match.id !== matchId, 'both requesting a rematch starts a new match');
  p1.send({ t: 'match.ready', matchId: rm.match.id }); p2.send({ t: 'match.ready', matchId: rm.match.id });
  await p1.wait('match.state', (m) => m.match.id === rm.match.id && m.match.phase === 'active');

  console.log('\nDisconnect, reconnect, abandon');
  p2.ws.close();
  const dc = await p1.wait('match.state', (m) => m.match.id === rm.match.id && !m.match.connected[sideOf.p2 === 'a' ? 'a' : 'b'] && !!Object.keys(m.match.graceUntil).length);
  ok(dc, 'opponent sees the disconnect and a reconnect deadline');
  await p2.connect();
  const back = await p2.wait('match.state', (m) => m.match.id === rm.match.id && m.reconnected === true);
  ok(back.match.phase === 'active', 'reconnecting player resumes the same match');
  p2.ws.close();
  const ab = await p1.wait('match.end', (m) => m.matchId === rm.match.id, 15000);
  ok(ab.match.endReason === 'abandon' && ab.match.winner === ab.match.you, 'staying away past the grace period forfeits the match');
  ok(ab.xp[ab.match.you === 'a' ? 'b' : 'a'][0].xp === 0, 'the player who left gets no XP');

  console.log('\nDirect challenge');
  await p2.connect(); await p2.wait('hello');
  p3.send({ t: 'challenge.send', target: 'QuillMain', agentId: a3.id });
  const inc = await p2.wait('challenge.incoming');
  ok(inc.from.wallet === p3.wallet, 'challenge by player name reaches the target');
  p2.send({ t: 'challenge.respond', id: inc.id, accept: true, agentId: a2.id });
  const cm = await p3.wait('match.state', (m) => m.match.mode === 'challenge');
  ok(cm.match.phase === 'ready', 'accepting a challenge creates a match');
  p3.send({ t: 'match.forfeit', matchId: cm.match.id });
  const cx = await p2.wait('match.cancelled', (m) => m.matchId === cm.match.id);
  ok(cx, 'leaving before both ready cancels without a result');
  p3.send({ t: 'challenge.send', target: p3.wallet, agentId: a3.id });
  ok((await p3.wait('error')).message.includes("can't challenge yourself"), 'cannot challenge yourself');

  console.log(`\nAll ${passed} checks passed.\n`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
