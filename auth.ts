// Wallet sign-in: the server issues a one-time challenge message, the wallet
// signs it (a message signature — never a transaction), and the server
// verifies the ed25519 signature against the wallet's public key.
import crypto from 'node:crypto';
import nacl from 'tweetnacl';
import { b58decode, isSolanaAddress } from '../shared/base58';
import { config } from './config';

interface Challenge { message: string; expires: number }
const challenges = new Map<string, Challenge>();
const CHALLENGE_TTL = 5 * 60_000;

setInterval(() => { const now = Date.now(); for (const [k, c] of challenges) if (c.expires < now) challenges.delete(k); }, 60_000).unref();

export function createChallenge(wallet: string) {
  if (!isSolanaAddress(wallet)) throw new HttpError(400, 'That is not a valid Solana address.');
  const nonce = crypto.randomBytes(16).toString('hex');
  const issued = new Date().toISOString();
  const message = [
    `${config.domain} wants you to sign in with your Solana account:`,
    wallet,
    '',
    'Sign in to Agent VS Agent. This is a message signature only: it does not',
    'send a transaction, move tokens or cost any fees.',
    '',
    `URI: ${config.domain}`,
    'Version: 1',
    `Chain ID: ${config.network}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issued}`,
    `Expiration Time: ${new Date(Date.now() + CHALLENGE_TTL).toISOString()}`
  ].join('\n');
  challenges.set(wallet, { message, expires: Date.now() + CHALLENGE_TTL });
  return { message, nonce };
}

/** Accepts a base58 or base64 signature. Challenges are single-use. */
export function verifyChallenge(wallet: string, signature: string): boolean {
  const c = challenges.get(wallet);
  if (!c || c.expires < Date.now()) throw new HttpError(400, 'Sign-in request expired. Please try again.');
  challenges.delete(wallet);
  let sig: Uint8Array;
  try { sig = /^[1-9A-HJ-NP-Za-km-z]+$/.test(signature) ? b58decode(signature) : new Uint8Array(Buffer.from(signature, 'base64')); }
  catch { throw new HttpError(400, 'Malformed signature.'); }
  if (sig.length !== 64) throw new HttpError(400, 'Malformed signature.');
  const ok = nacl.sign.detached.verify(new TextEncoder().encode(c.message), sig, b58decode(wallet));
  if (!ok) throw new HttpError(401, 'Signature did not match this wallet.');
  return true;
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
export function issueToken(wallet: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + config.sessionHours * 3600_000;
  const body = b64u(JSON.stringify({ w: wallet, exp: expiresAt }));
  const mac = crypto.createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
  return { token: `${body}.${mac}`, expiresAt };
}
export function readToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expect = crypto.createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
  if (expect.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(mac))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() && isSolanaAddress(p.w) ? p.w : null; } catch { return null; }
}

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
