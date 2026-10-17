# Agent VS Agent · $AVA

A skill-based pixel-combat PvP game on Solana. Players connect a wallet, sign in with a message signature, build an agent, and fight other wallets in matches the server referees. Every match publishes an auditable seed.

- **Arena**
  - Rated matchmaking queue and direct challenges (by player name or wallet).
  - Ready check, a server-authoritative combat loop, and reconnect/abandon handling.
  - Rematches, spectating, and match replays with in-browser verification.
- **Agents**
  - Four classes (Trooper, Heavy, Flanker, Sniper), each with a primary weapon and a sidegrade.
  - Six gadgets and six palettes.
  - Profile frames and emotes.
  - Workshop with a live preview and a confirmation step before saving.
- **Progression**
  - XP for every finished match, with participation XP for losers.
  - Level-up unlocks that are cosmetic or sidegrades only.
  - Elo rating per season.
  - Reward history that shows the reason for each grant and the match that earned it.
- **Leaderboard** with season filter, search and sort. Live data and demo data are clearly separated.
- **$AVA utility panel** that is transparent about status: active, preview or planned.
- **Demo mode** (local bot, no wallet) that is always labelled and never shown as live PvP.

---

## Quick start

```bash
npm install
cp .env.example .env        # optional for local dev
npm run dev                 # builds the client (watch) + runs the server (watch)
# open http://localhost:8787
```

Production:

```bash
npm run build
SESSION_SECRET=$(openssl rand -hex 32) PUBLIC_DOMAIN=yourgame.xyz npm start
```

Checks:

```bash
npm run typecheck
npm test               # 37 end-to-end checks against the real server (two ed25519 wallets)
npm run test:browser   # optional: full UI flow in Chromium (npx playwright install chromium)
```

Requires Node 20+.

## Project layout

```
shared/     Code used by both client and server
  game.ts         classes, weapons, gadgets, palettes, validation, stat summary
  engine.ts       deterministic combat engine (seeded rolls), replay(), demo bot
  progression.ts  XP, levels, unlocks, Elo
  types.ts        API + WebSocket contracts
  base58.ts       Solana address/signature encoding
server/     Node game server (no framework)
  config.ts       env config (.env loader)
  auth.ts         sign-in challenge, ed25519 verification, HMAC session tokens
  store.ts        persistence boundary (JSON file; swap for a database)
  players.ts      read models, agent CRUD + validation, leaderboard
  arena.ts        WebSocket hub, matchmaking, challenges, match rooms
  http.ts         REST API + static file serving
src/        React client (bundled with esbuild)
  wallet/         Wallet Standard discovery + requests
  services/       api, socket, token ($AVA) and demo — the client's service boundaries
  components/     arena HUD, pixel agents, wallet UI, shared primitives
  pages/          Home, Arena, Agents, Leaderboard, Utility, How it works, Profile, Match
tests/      run.ts (server e2e), browser.ts (UI e2e)
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SESSION_SECRET` | random per boot in dev | **Required in production.** Signs session tokens. |
| `PUBLIC_DOMAIN` | `localhost` | Domain shown inside the wallet sign-in message. Set to your real domain. |
| `PORT` | `8787` | HTTP + WebSocket port. |
| `DATA_DIR` | `data` | Location of the JSON store. |
| `ALLOWED_ORIGINS` | — | Comma-separated origins, only if the client is hosted separately from the server. |
| `SOLANA_NETWORK` | `devnet` | `devnet`, `testnet` or `mainnet-beta`. Shown in the header at all times. |
| `SOLANA_RPC_URL` | public endpoint | RPC used for read-only token balance lookups. |
| `AVA_MINT` | — | The real $AVA mint. **Leave empty until it exists.** Token features stay in preview. |
| `AVA_DECIMALS` | — | Optional; for display. |
| `SEASON_ID` / `SEASON_NAME` | `s1` / `Season 1 · Static Bloom` | Current season. Changing `SEASON_ID` starts a fresh ladder (ratings start at 1000). |
| `TURN_SECONDS` / `READY_SECONDS` / `RECONNECT_SECONDS` | `20` / `20` / `45` | Match timers. |

The client has **no build-time secrets**. It reads `/api/config` at runtime.

## How the important parts work

### Wallet and identity
- **Discovery.** `@wallet-standard/app` discovers any Wallet Standard Solana wallet (Phantom, Solflare, Backpack and others). No per-wallet adapters are needed.
- **Connect.** Connecting only reads the public address (`standard:connect`). The app tries a silent reconnect on reload.
- **Sign-in.**
  1. Before the wallet opens, the app shows a dialog explaining that this is a message signature, not a transaction, and costs nothing.
  2. The server issues a one-time, 5-minute, SIWS-style message.
  3. The wallet signs it with `solana:signMessage`.
  4. The server verifies the ed25519 signature (`tweetnacl`) and issues an HMAC session token (24h).
- **Rejections.** A rejected signature or connection shows a clear message and lets the player retry.
- **No transactions.** The app never calls `signTransaction` or `signAndSendTransaction`. It never asks for seed phrases or private keys.

### PvP arena (server-authoritative)
- **Turns.** Clients only send intents (`match.action` with the round number). Both players choose simultaneously, and the opponent sees only "locked in". The server resolves each round with `shared/engine.ts`.
- **Seeds.**
  - At match creation the server picks a random 32-byte seed and publishes `sha256(seed)` before round 1.
  - Every roll is derived from `(seed, round, side, tag)`.
  - The seed is revealed at the end, and the match page re-runs the engine in your browser to verify the result.
- **Matchmaking.**
  - Closest rating first.
  - The window starts at ±100 and widens by 20 per second waited, up to ±800.
  - After 90 seconds anyone can be paired (documented fallback).
- **Timers.**
  - Ready check: 20s. Unready players are dropped and ready players are re-queued.
  - Turn timer: 20s. No pick means Defend.
- **Disconnects.**
  - Opening the site again reattaches you to the match.
  - While you're away, your turns auto-Defend.
  - If you don't return within 45s, the match counts as a loss with 0 XP.
- **Abuse limits.** Per-socket message rate limit, per-IP auth rate limit, 4 KB WebSocket payload cap, and single active session per wallet (a new tab replaces the old one).
- **No stakes.** PvP never involves staking, wagers or token transfers.

### Fairness and progression
- All classes are built on one power budget. Bot-vs-bot simulations were used to tune it; win rates for every pairing stay within roughly 25–75%.
- Levels unlock palettes, frames, emotes and *sidegrades* (equal-budget alternatives). Nothing scales stats.
- XP per match:

  | Event | XP |
  |---|---|
  | Participation | +40 |
  | Per round (max 60) | +5 |
  | Win | +60 |
  | Draw | +25 |
  | Abandon | 0 |

- Each reward is stored with its reason lines and match ID.

## What is live vs. demo/preview

| Feature | Status |
|---|---|
| Wallet connect + signature sign-in | **Live** (any Wallet Standard wallet) |
| Agents, workshop, profiles, XP, unlocks | **Live** (game server) |
| Matchmaking, challenges, PvP matches, spectating, rematch, reconnect | **Live** (game server) |
| Leaderboard, match history, replays + verification | **Live** (game server) |
| Leaderboard "Demo sample" tab, featured agents fallback, hero exhibition, practice matches | **Demo**: labelled; sample data or a local bot |
| $AVA balance | **Preview** until `AVA_MINT` is set; then **active** (read-only RPC) |
| $AVA cosmetic unlocks, crafting, seasonal tracks, votes | **Planned**: the UI explains each one and its transaction; no transaction can be started |

When the server is unreachable (for example, the client is hosted as static files only), the site switches to demo mode automatically and says so. It never simulates online opponents.

### What's needed to enable $AVA transactions
No mint, supply, price, fee or tokenomics have been invented. To turn on cosmetic unlocks you need:
1. `AVA_MINT` (and `AVA_DECIMALS`) for the deployed token.
2. A treasury address or an unlock program ID, plus published cosmetic prices.
3. A client step that builds an SPL `transferChecked`, shows a summary with the estimated network fee, and asks the wallet to sign and send (for example with `@solana/web3.js` and `@solana/spl-token`).
4. A server endpoint that fetches the confirmed transaction (`getTransaction`, jsonParsed), checks the mint, amount, sender and treasury, rejects reused signatures, and only then grants the cosmetic.

The integration points are `src/services/token.ts` (statuses and requirements) and the store or player services on the server.

## Deployment

- **Single service (recommended).**
  - Run `npm run build && npm start` on any Node host (Fly.io, Render, Railway or a VPS).
  - The server serves `dist/` and `/api` + `/ws` on one port.
  - Put it behind HTTPS so the socket uses `wss://`.
  - Persist `DATA_DIR` on a volume.
- **Separate static client.**
  - Host `dist/` anywhere and set `window.AVA_API_BASE = 'https://api.yourgame.xyz'` in `index.html`.
  - Set `ALLOWED_ORIGINS` on the server.
- **Scale-out.** The match state lives in one process. For multiple instances, move `store.ts` to Postgres and route each match to one instance (or use Redis pub/sub). The service boundaries are already split for this.

### Devnet configuration
`SOLANA_NETWORK=devnet` is the default. Sign-in doesn't need SOL or any on-chain account. Point your wallet at devnet so its UI matches the network badge.

## Dependencies
Runtime dependencies are deliberately few:
- `react` and `react-dom`
- `@wallet-standard/app` (wallet discovery)
- `ws` (WebSockets)
- `tweetnacl` (signature verification)
- `tsx` (runs the TypeScript server)

If `@wallet-standard/app` isn't installed, the build falls back to `src/wallet/wallet-standard-app-shim.ts`, which implements the same registration protocol. A normal `npm install` uses the real package.

---

Agent VS Agent is a game. Nothing here is financial advice, $AVA confers no gameplay advantage, and there is no betting or wagering.
