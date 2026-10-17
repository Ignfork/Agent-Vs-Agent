import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isSolanaAddress } from '../shared/base58';

// Tiny .env loader (no dependency). Existing environment variables win.
function loadEnv(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2].replace(/^['"]|['"]$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv(path.resolve(process.cwd(), '.env'));

const env = (k: string, d = '') => (process.env[k] ?? d).trim();
const network = env('SOLANA_NETWORK', 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta';
if (!['devnet', 'testnet', 'mainnet-beta'].includes(network)) throw new Error(`SOLANA_NETWORK must be devnet, testnet or mainnet-beta (got "${network}")`);

const defaultRpc = { devnet: 'https://api.devnet.solana.com', testnet: 'https://api.testnet.solana.com', 'mainnet-beta': 'https://api.mainnet-beta.solana.com' }[network];
const avaMint = env('AVA_MINT') || null;
if (avaMint && !isSolanaAddress(avaMint)) throw new Error('AVA_MINT is set but is not a valid Solana address.');

let sessionSecret = env('SESSION_SECRET');
const isProd = env('NODE_ENV') === 'production';
if (!sessionSecret) {
  if (isProd) throw new Error('SESSION_SECRET is required in production (use a long random string).');
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[config] SESSION_SECRET not set — using a random dev secret. Sessions reset on restart.');
}

export const config = {
  port: Number(env('PORT', '8787')),
  isProd,
  sessionSecret,
  sessionHours: Number(env('SESSION_HOURS', '24')),
  dataDir: path.resolve(process.cwd(), env('DATA_DIR', 'data')),
  distDir: path.resolve(process.cwd(), 'dist'),
  domain: env('PUBLIC_DOMAIN', 'localhost'),
  network,
  chain: `solana:${network === 'mainnet-beta' ? 'mainnet' : network}`,
  rpcUrl: env('SOLANA_RPC_URL', defaultRpc),
  avaMint,
  avaDecimals: env('AVA_DECIMALS') ? Number(env('AVA_DECIMALS')) : null,
  season: { id: env('SEASON_ID', 's1'), name: env('SEASON_NAME', 'Season 1 · Static Bloom') },
  turnSeconds: Number(env('TURN_SECONDS', '20')),
  readySeconds: Number(env('READY_SECONDS', '20')),
  reconnectSeconds: Number(env('RECONNECT_SECONDS', '45')),
  maxAgentsPerPlayer: 3,
  allowedOrigins: env('ALLOWED_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean)
};

export const publicConfig = () => ({
  network: config.network, rpcUrl: config.rpcUrl, chain: config.chain,
  avaMint: config.avaMint, avaDecimals: config.avaDecimals, season: config.season,
  turnSeconds: config.turnSeconds, readySeconds: config.readySeconds, reconnectSeconds: config.reconnectSeconds,
  domain: config.domain
});
