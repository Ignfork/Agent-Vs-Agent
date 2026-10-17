// Browser end-to-end check (optional; needs Playwright + Chromium).
// Two browser sessions each get a Wallet Standard test wallet backed by a real
// ed25519 key, sign in through the UI, build agents, queue, and fight.
// Run: npx tsx tests/browser.ts   (expects `npm run build` first)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nacl from 'tweetnacl';
import { chromium, type Page, type BrowserContext } from 'playwright';
import { b58encode } from '../shared/base58';

const PORT = 8899, BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.SHOTS_DIR || path.join(os.tmpdir(), 'ava-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (m: string) => console.log('  ✓ ' + m);

async function withWallet(ctx: BrowserContext, label: string) {
  const kp = nacl.sign.keyPair();
  const address = b58encode(kp.publicKey);
  await ctx.exposeFunction('__mockSign', (bytes: number[]) => Array.from(nacl.sign.detached(Uint8Array.from(bytes), kp.secretKey)));
  // Passed as a string so the test runner's transpiler can't inject helpers.
  await ctx.addInitScript(`(() => {
    const account = { address: ${JSON.stringify(address)}, publicKey: new Uint8Array(${JSON.stringify(Array.from(kp.publicKey))}), chains: ['solana:devnet'], features: ['solana:signMessage'] };
    const wallet = {
      version: '1.0.0', name: ${JSON.stringify(label)}, icon: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#9b7bff"/></svg>'),
      chains: ['solana:devnet', 'solana:mainnet'], accounts: [],
      features: {
        'standard:connect': { version: '1.0.0', connect: async () => { wallet.accounts = [account]; return { accounts: [account] }; } },
        'standard:disconnect': { version: '1.0.0', disconnect: async () => { wallet.accounts = []; } },
        'standard:events': { version: '1.0.0', on: () => () => {} },
        'solana:signMessage': { version: '1.0.0', signMessage: async ({ message }) => { const sig = await window.__mockSign(Array.from(message)); return [{ signedMessage: message, signature: new Uint8Array(sig) }]; } }
      }
    };
    window.addEventListener('wallet-standard:app-ready', (e) => e.detail.register(wallet));
    window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: ({ register }) => register(wallet) }));
  })();`);
  return address;
}

async function signIn(p: Page, wallet: string) {
  await p.goto(BASE + '/#/');
  await p.getByRole('button', { name: 'Connect wallet' }).first().click();
  await p.getByRole('button', { name: new RegExp(wallet) }).click();
  await p.getByRole('dialog', { name: 'Sign in with your wallet' }).waitFor();
  await p.getByRole('button', { name: 'Continue to wallet' }).click();
  await p.getByText('Signed in. No transaction was sent.').waitFor();
}

async function makeAgent(p: Page, name: string, cls: string) {
  await p.goto(BASE + '/#/agents');
  await p.getByLabel('Name').fill(name);
  await p.locator('.choice', { hasText: cls }).first().click();
  await p.getByRole('button', { name: 'Review & save' }).click();
  await p.getByRole('dialog', { name: 'Save this agent?' }).waitFor();
  await p.getByRole('button', { name: 'Confirm & save' }).click();
  await p.getByText(`${name} saved`).waitFor();
}

async function main() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'ava-b-'));
  const server = spawn(process.execPath, [path.resolve('node_modules/tsx/dist/cli.mjs'), 'server/index.ts'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: data, SESSION_SECRET: 'x', TURN_SECONDS: '10', PUBLIC_DOMAIN: '127.0.0.1' }, stdio: 'inherit' });
  await sleep(1500);
  const browser = await chromium.launch();
  const errors: string[] = [];
  try {
    const ctxA = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await withWallet(ctxA, 'Test Wallet A'); await withWallet(ctxB, 'Test Wallet B');
    const a = await ctxA.newPage(), b = await ctxB.newPage();
    for (const p of [a, b]) p.on('pageerror', (e) => errors.push(e.message));

    await a.goto(BASE + '/#/');
    await a.waitForTimeout(1200);
    await a.screenshot({ path: path.join(SHOTS, '01-home.png') });
    await a.screenshot({ path: path.join(SHOTS, '01-home-full.png'), fullPage: true });
    log('home renders');

    await signIn(a, 'Test Wallet A'); await signIn(b, 'Test Wallet B');
    log('both players signed in through the wallet + signature flow');
    await makeAgent(a, 'Brick Halo', 'Heavy');
    await a.screenshot({ path: path.join(SHOTS, '02-agents.png'), fullPage: true });
    await makeAgent(b, 'Quill', 'Sniper');
    log('agents created via workshop with confirmation step');

    await a.goto(BASE + '/#/arena'); await b.goto(BASE + '/#/arena');
    await a.getByRole('button', { name: 'Find a match' }).click();
    await a.getByText('Searching for an opponent').waitFor();
    await a.screenshot({ path: path.join(SHOTS, '03-queue.png') });
    await b.getByRole('button', { name: 'Find a match' }).click();
    await a.getByRole('button', { name: "I'm ready" }).click();
    await b.getByRole('button', { name: "I'm ready" }).click();
    log('queue matched both players and ready check passed');
    await a.locator('.action-bar').waitFor();
    let rounds = 0;
    while (rounds < 20) {
      const over = await a.locator('.end-card').count();
      if (over) break;
      const keyA = ['1', '1', '3', '1', '2', '4'][rounds % 6], keyB = ['4', '1', '1', '3', '1', '2'][rounds % 6];
      await a.keyboard.press(keyA); await b.keyboard.press(keyB);
      await a.waitForTimeout(rounds === 2 ? 250 : 900);
      if (rounds === 2) await a.screenshot({ path: path.join(SHOTS, '04-arena.png') });
      rounds++;
    }
    await a.locator('.end-card').waitFor({ timeout: 15000 });
    await a.waitForTimeout(600);
    await a.screenshot({ path: path.join(SHOTS, '05-end.png') });
    log(`match played to completion through the UI in ${rounds} rounds`);

    await a.getByRole('link', { name: 'verify & replay' }).click();
    await a.getByText('Verified in your browser').waitFor({ timeout: 8000 });
    await a.screenshot({ path: path.join(SHOTS, '06-replay.png'), fullPage: true });
    log('replay page verifies seed commitment and outcome');

    await a.goto(BASE + '/#/leaderboard'); await a.locator('table tbody tr').first().waitFor();
    await a.screenshot({ path: path.join(SHOTS, '07-leaderboard.png') });
    await a.goto(BASE + '/#/profile'); await a.getByText('Match completed (participation)').first().waitFor();
    await a.screenshot({ path: path.join(SHOTS, '08-profile.png'), fullPage: true });
    log('leaderboard and profile show live results and reward reasons');
    for (const r of ['utility', 'how']) { await a.goto(BASE + `/#/${r}`); await a.waitForTimeout(400); await a.screenshot({ path: path.join(SHOTS, `09-${r}.png`), fullPage: true }); }

    // Demo mode without a wallet
    const ctxC = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const c = await ctxC.newPage(); c.on('pageerror', (e) => errors.push(e.message));
    await c.goto(BASE + '/#/'); await c.waitForTimeout(900);
    await c.screenshot({ path: path.join(SHOTS, '10-mobile-home.png'), fullPage: true });
    await c.goto(BASE + '/#/arena');
    await c.locator('.demo-pick').first().click();
    await c.getByText("You're fighting a bot running in your browser").waitFor();
    for (let i = 0; i < 4; i++) { await c.keyboard.press('1'); await c.waitForTimeout(250); }
    await c.screenshot({ path: path.join(SHOTS, '11-mobile-demo.png'), fullPage: true });
    log('demo mode works without a wallet and is labelled as not live');

    if (errors.length) throw new Error('Page errors: ' + errors.join(' | '));
    console.log(`\nBrowser test passed. Screenshots in ${SHOTS}\n`);
  } finally {
    await browser.close(); server.kill();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
