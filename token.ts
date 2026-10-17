// $AVA service boundary. Reads are plain JSON-RPC calls; nothing here can
// move tokens. Utilities that would need a transaction are described with
// their exact requirements and stay in "preview" until the deployment
// provides a mint, a program/treasury and published prices.
import type { PublicConfig } from '../../shared/types';

export type UtilityStatus = 'active' | 'preview' | 'planned';
export interface Utility {
  id: string; title: string; summary: string; detail: string;
  tx: string; status: UtilityStatus; needs: string[]; affectsCombat: false;
}

export function utilities(cfg: PublicConfig | null): Utility[] {
  const mint = !!cfg?.avaMint;
  return [
    { id: 'balance', title: 'Show your $AVA balance', summary: 'Read-only view of the $AVA held by your connected wallet.', detail: 'Reach reads your token accounts over Solana RPC. No signature and no transaction are needed.', tx: 'None — read-only RPC call', status: mint ? 'active' : 'preview', needs: mint ? [] : ['AVA_MINT (the deployed token mint address)'], affectsCombat: false },
    { id: 'cosmetics', title: 'Unlock cosmetic skins & arena effects', summary: 'Spend $AVA on palettes, profile frames, emotes and arena effects. Purely visual.', detail: 'Each unlock is a single SPL token transfer you review and approve in your wallet. The server grants the cosmetic only after it confirms the transfer on-chain.', tx: 'SPL transfer · you approve in wallet · network fee shown first', status: 'planned', needs: ['AVA_MINT', 'Treasury or unlock program address', 'Published cosmetic prices', 'Server-side transfer verification enabled'], affectsCombat: false },
    { id: 'crafting', title: 'Craft visual gear', summary: 'Combine cosmetic pieces into new looks for your agent. No stat changes.', detail: 'Crafting recipes and costs will be published before launch. Crafted items are visual only and never change damage, HP or energy.', tx: 'SPL transfer per craft · you approve in wallet', status: 'planned', needs: ['Crafting program or treasury', 'Published recipes and costs'], affectsCombat: false },
    { id: 'seasonal', title: 'Seasonal cosmetic tracks', summary: 'Optional seasonal track with cosmetic rewards for playing matches.', detail: 'Joining a track is optional. Core seasons, ratings and the leaderboard stay free for everyone.', tx: 'One SPL transfer to join a track · you approve in wallet', status: 'planned', needs: ['Season track configuration', 'Published entry cost'], affectsCombat: false },
    { id: 'votes', title: 'Community votes', summary: 'Vote on cosmetic themes, arena maps and upcoming features.', detail: 'Votes are signed messages, not transactions. Eligibility rules (for example, holding any $AVA at a snapshot) will be published per vote.', tx: 'Message signature only · no fee', status: 'planned', needs: ['Vote service', 'Published eligibility rules'], affectsCombat: false }
  ];
}

/** Read the $AVA balance for an owner. Returns null when no mint is configured. */
export async function readAvaBalance(cfg: PublicConfig, owner: string): Promise<{ amount: number; accounts: number } | null> {
  if (!cfg.avaMint) return null;
  const r = await fetch(cfg.rpcUrl, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner', params: [owner, { mint: cfg.avaMint }, { encoding: 'jsonParsed', commitment: 'confirmed' }] }),
    signal: AbortSignal.timeout(8000)
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'RPC error');
  const accs = j.result?.value ?? [];
  const amount = accs.reduce((s: number, a: any) => s + Number(a.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0), 0);
  return { amount, accounts: accs.length };
}
