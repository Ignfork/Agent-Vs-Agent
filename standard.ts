// Solana wallet discovery and requests via the Wallet Standard
// (@wallet-standard/app). Phantom, Solflare, Backpack and other modern
// Solana wallets register themselves through this standard, so no
// per-wallet adapters are needed.
//
// What we ask wallets for:
//   - standard:connect     → read the public address (no signature)
//   - solana:signMessage   → sign the sign-in message (not a transaction)
// We never request signTransaction / signAndSendTransaction without an
// explicit, separate confirmation step from the player.
import { getWallets } from '@wallet-standard/app';

export interface StdAccount { address: string; publicKey: Uint8Array; chains: readonly string[]; features: readonly string[]; label?: string }
export interface StdWallet {
  name: string; icon: string; version: string; chains: readonly string[]; accounts: readonly StdAccount[];
  features: Record<string, any>;
}

const REQUIRED = ['standard:connect', 'solana:signMessage'];
export const isSolanaWallet = (w: StdWallet) =>
  REQUIRED.every((f) => f in w.features) && w.chains.some((c) => c.startsWith('solana:'));

export function watchWallets(cb: (wallets: StdWallet[]) => void): () => void {
  const api = getWallets();
  const emit = () => cb((api.get() as unknown as StdWallet[]).filter(isSolanaWallet));
  emit();
  const off1 = api.on('register', emit);
  const off2 = api.on('unregister', emit);
  return () => { off1(); off2(); };
}

export async function connectWallet(w: StdWallet, silent = false): Promise<StdAccount> {
  const res = await w.features['standard:connect'].connect(silent ? { silent: true } : undefined);
  const accounts: StdAccount[] = (res?.accounts ?? w.accounts) as StdAccount[];
  const acc = accounts.find((a) => a.chains.some((c) => c.startsWith('solana:'))) ?? accounts[0];
  if (!acc) throw new Error(silent ? 'silent-connect-unavailable' : 'The wallet did not share an account.');
  return acc;
}

export async function disconnectWallet(w: StdWallet) {
  try { await w.features['standard:disconnect']?.disconnect(); } catch { /* some wallets don't support it */ }
}

export async function signMessage(w: StdWallet, account: StdAccount, message: Uint8Array): Promise<Uint8Array> {
  const out = await w.features['solana:signMessage'].signMessage({ account, message });
  const first = Array.isArray(out) ? out[0] : out;
  if (!first?.signature) throw new Error('The wallet returned no signature.');
  return first.signature as Uint8Array;
}

export function onAccountsChanged(w: StdWallet, cb: (accounts: readonly StdAccount[]) => void): () => void {
  const ev = w.features['standard:events'];
  if (!ev?.on) return () => {};
  return ev.on('change', (p: { accounts?: readonly StdAccount[] }) => { if (p.accounts) cb(p.accounts); });
}

export function isUserRejection(e: unknown): boolean {
  const err = e as { code?: number; name?: string; message?: string };
  return err?.code === 4001 || /reject|cancel|denied|declined|closed/i.test(`${err?.name ?? ''} ${err?.message ?? ''}`);
}

export const INSTALL_LINKS = [
  { name: 'Phantom', url: 'https://phantom.com/download' },
  { name: 'Solflare', url: 'https://solflare.com/download' },
  { name: 'Backpack', url: 'https://backpack.app/download' }
];
