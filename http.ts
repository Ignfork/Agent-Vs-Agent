// REST API + static file serving, on plain node:http (no framework needed).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config, publicConfig } from './config';
import { createChallenge, verifyChallenge, issueToken, readToken, HttpError } from './auth';
import { store } from './store';
import { meView, publicPlayer, setName, setFrame, createAgent, updateAgent, deleteAgent, leaderboard, featuredAgents } from './players';
import { liveMatches, activeMatchFor, onlineCount, queueSize, isOnline } from './arena';
import { isSolanaAddress } from '../shared/base58';

type Ctx = { req: http.IncomingMessage; res: http.ServerResponse; params: Record<string, string>; query: URLSearchParams; body: any; wallet: string | null };
type Handler = (c: Ctx) => unknown | Promise<unknown>;
const routes: { method: string; re: RegExp; keys: string[]; h: Handler; auth: boolean }[] = [];
function route(method: string, pattern: string, h: Handler, auth = false) {
  const keys: string[] = [];
  const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, h, auth });
}
const me = (c: Ctx) => store.ensurePlayer(c.wallet!);

// --- auth
route('POST', '/api/auth/challenge', (c) => createChallenge(String(c.body?.wallet ?? '')));
route('POST', '/api/auth/verify', (c) => {
  const wallet = String(c.body?.wallet ?? ''), signature = String(c.body?.signature ?? '');
  verifyChallenge(wallet, signature);
  store.ensurePlayer(wallet);
  return issueToken(wallet);
});

// --- config / status
route('GET', '/api/config', () => publicConfig());
route('GET', '/api/status', () => ({ ok: true, online: onlineCount(), queued: queueSize(), live: liveMatches().length, season: config.season, network: config.network, time: Date.now() }));
route('GET', '/api/seasons', () => store.seasons().map((id) => ({ id, name: id === config.season.id ? config.season.name : id, current: id === config.season.id })));

// --- me
route('GET', '/api/me', (c) => ({ ...meView(me(c)), activeMatch: activeMatchFor(c.wallet!) }), true);
route('PATCH', '/api/me', (c) => { const p = me(c); if (c.body?.name !== undefined) setName(p, c.body.name); if (c.body?.frame !== undefined) setFrame(p, c.body.frame); if (c.body?.activeAgentId !== undefined) { const a = store.getAgent(String(c.body.activeAgentId)); if (!a || a.owner !== p.wallet) throw new HttpError(404, 'Agent not found.'); p.activeAgentId = a.id; store.updatePlayer(p); } return meView(p); }, true);
route('POST', '/api/agents', (c) => createAgent(me(c), c.body ?? {}), true);
route('PUT', '/api/agents/:id', (c) => updateAgent(me(c), c.params.id, c.body ?? {}), true);
route('DELETE', '/api/agents/:id', (c) => { deleteAgent(me(c), c.params.id); return { ok: true }; }, true);

// --- public reads
route('GET', '/api/agents', () => featuredAgents(12));
route('GET', '/api/agents/:id', (c) => {
  const a = store.getAgent(c.params.id);
  if (!a) throw new HttpError(404, 'Agent not found.');
  const owner = store.getPlayer(a.owner);
  return { agent: a, owner: owner ? publicPlayer(owner) : null, matches: store.recentMatches((m) => m.players.a.agent.id === a.id || m.players.b.agent.id === a.id, 15) };
});
route('GET', '/api/players/:wallet', (c) => {
  const p = store.getPlayer(c.params.wallet);
  if (!p) throw new HttpError(404, 'Player not found.');
  return { player: publicPlayer(p), agents: store.agentsOf(p.wallet), online: isOnline(p.wallet), matches: store.recentMatches((m) => m.players.a.wallet === p.wallet || m.players.b.wallet === p.wallet, 20) };
});
route('GET', '/api/leaderboard', (c) => leaderboard(c.query.get('season') || config.season.id, c.query.get('q') || ''));
route('GET', '/api/matches/live', () => liveMatches());
route('GET', '/api/matches/recent', () => store.recentMatches(() => true, 12).map(({ turns, rounds, ...m }) => ({ ...m, roundCount: rounds.length })));
route('GET', '/api/matches/:id', (c) => { const m = store.getMatch(c.params.id); if (!m) throw new HttpError(404, 'Match not found (live matches appear here once they end).'); return m; });

// --- static
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.map': 'application/json', '.woff2': 'font/woff2' };
function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.normalize(path.join(config.distDir, urlPath));
  if (!file.startsWith(config.distDir)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(config.distDir, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(503, { 'content-type': 'text/plain' }).end('Client not built yet. Run `npm run build` (or `npm run dev`).'); return; }
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300' });
  fs.createReadStream(file).pipe(res);
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    req.on('data', (d: Buffer) => { size += d.length; if (size > 32_768) { reject(new HttpError(413, 'Request too large.')); req.destroy(); } else chunks.push(d); });
    req.on('end', () => { if (!chunks.length) return resolve(undefined); try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { reject(new HttpError(400, 'Body must be JSON.')); } });
    req.on('error', reject);
  });
}

// Simple per-IP rate limit for auth endpoints.
const hits = new Map<string, { n: number; at: number }>();
function limited(ip: string, max = 30) { const now = Date.now(); const h = hits.get(ip); if (!h || now - h.at > 60_000) { hits.set(ip, { n: 1, at: now }); return false; } return ++h.n > max; }

export function createHttpServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    const origin = req.headers.origin;
    if (origin && config.allowedOrigins.includes(origin)) { res.setHeader('access-control-allow-origin', origin); res.setHeader('access-control-allow-headers', 'content-type, authorization'); res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS'); }
    res.setHeader('x-content-type-options', 'nosniff');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res);
    const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    try {
      const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!r) return json(404, { error: 'Not found' });
      if (url.pathname.startsWith('/api/auth') && limited(req.socket.remoteAddress || '?')) throw new HttpError(429, 'Too many sign-in attempts. Wait a minute.');
      const m = url.pathname.match(r.re)!;
      const params: Record<string, string> = {}; r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      const wallet = readToken(auth);
      if (r.auth && !wallet) throw new HttpError(401, 'Sign in with your wallet first.');
      if (params.wallet && !isSolanaAddress(params.wallet)) throw new HttpError(400, 'Invalid wallet address.');
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method!) ? await readBody(req) : undefined;
      const out = await r.h({ req, res, params, query: url.searchParams, body, wallet });
      json(200, out ?? { ok: true });
    } catch (e: any) {
      if (e instanceof HttpError) return json(e.status, { error: e.message });
      console.error(e);
      json(500, { error: 'Something went wrong on our side.' });
    }
  });
}
