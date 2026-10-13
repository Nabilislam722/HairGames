# Development guide

How the HairGames code is organised, and how to work on it. For an overview of the project, see the [README](../README.md).

## Repository layout

```
HairGames/
├── client/                  React + Vite frontend
│   ├── index.html
│   ├── public/              Static files served as-is (sprites, game assets, Space Huggers and Candy Cascade builds)
│   └── src/
│       ├── main.jsx         Providers (wagmi, RainbowKit, React Query)
│       ├── App.jsx          Route table
│       ├── pages/           Site pages: Home, Dashboard, Profile, Leaderboard, EventRank, NotFound
│       ├── games/           One folder per game (see below)
│       ├── components/
│       │   ├── layout/      App shell (navbar, footer)
│       │   └── ui/          shadcn/ui primitives
│       ├── hooks/           Shared React hooks
│       ├── lib/             Shared helpers: web3, chain config, contracts, network retries, season
│       ├── assets/images/   Site-wide images imported from code
│       ├── styles/          globals.css (Tailwind entry), dashboard.css
│       └── legacy/          Unused older code kept for reference. Not part of the build.
├── backend/                 Express API (port 3000)
│   ├── server.js            Entry point
│   ├── config/              Database, RPC provider, contract addresses
│   ├── controllers/         Request handlers (auth, games, points, stats, Candy Cascade)
│   ├── models/              Mongoose models
│   ├── routes/              Route definitions, mounted under /api
│   └── services/            NFT indexer, Candy Cascade replay and signing
├── contract/                Hardhat project: Solidity game contracts, deploy scripts and tests
└── docs/                    Guides like this one
```

## Game folders

Every game in `client/src/games/` follows the same shape:

```
games/<game-name>/
├── <GameName>Page.jsx       Route component: wallet flow, start/submit, overlays
├── components/              Game-specific React components
├── lib/                     Engine, rendering, constants, types (no React)
└── assets/                  Images imported by this game only (optional)
```

| Folder | Route |
| --- | --- |
| `candy-cascade` | `/game/candy_cascade` |
| `proof-of-patience` | `/game/proof_of_patience` |
| `fruit-ninja` | `/game/max_fruitninja` |
| `space-shooter` | `/game/space_shooter` |
| `space-huggers` | `/game/space_huggers` |
| `racing` | `/game/race_car` |
| `fishing` | `/game/fishing_game` |

To add a game, create a folder with that shape, register its page in `client/src/App.jsx`, and add it to `GAMES` in `client/src/pages/Dashboard.jsx`.

Space Huggers and Candy Cascade are standalone builds served from `client/public/` and embedded in an iframe by their page.

### Naming conventions

- Folders: `kebab-case` (`fruit-ninja`, `proof-of-patience`)
- React components: `PascalCase.jsx` / `.tsx`
- Non-component modules: `camelCase.js` / `.ts`
- Imports across folders use the `@/` alias (`@/lib/web3`, `@/components/ui/button`). Imports inside a game folder stay relative.

## Candy Cascade

The game's source lives in its own repo, [candy-Cascade](https://github.com/Nabilislam722/candy-Cascade). A copy of its source is kept in `client/src/games/candy-cascade/game/` (the backend replays moves with it), and the built game is in `client/public/candy-cascade/`.

### On-chain saves and anti-cheat

Progress (highest cleared level, best score and stars per level) lives in the `CandyCascade` contract, not in the browser.

1. Every attempt starts on chain: the player sends `startLevel(levelId)`, which opens a numbered run. A new start replaces any open run, so losing or quitting never leaves a player stuck.
2. As soon as the wallet sends the start, the page asks `POST /api/candy-cascade/session` for the board. The server checks the start transaction (sender, contract, level), even while it is still pending, and picks the random seed. Each start transaction gets exactly one seed.
3. The game records every move. When the level is won, the page sends the moves to `POST /api/candy-cascade/verify`.
4. The server replays the moves with the game's own engine and signs only the score and stars the replay produced. It never uses a score from the client. It also checks that the start was mined and is still the open run, and binds the signature to that run.
5. The player submits `submitLevel(...)`. The contract checks the signature against the open run, then closes it, so one start can save at most one win. It also checks the level order and the fee.
6. `POST /api/points/add` reads the `LevelCleared` event and credits HP for **improvement over the previous best** on that level. Replays that don't beat it earn nothing.

A level with all **3 stars is finished**. The contract won't start it again and the backend won't issue a board for it, so players move on to new levels instead of farming old ones. Levels with 1 or 2 stars can be replayed to earn the rest.

On phones, the page sends every request through `fetchWithRetry` (`client/src/lib/network.js`: 12 s timeout, 3 tries) and pings `/api/ping` every 15 s while the game is open. If a board request fails after the start went out, "Try again" reuses that start instead of asking for a new transaction.

The backend loads the engine from `client/src/games/candy-cascade/game/src/core`, the same files the game is built from. A rules fingerprint is built into the game and computed again by the backend. If they differ, the backend refuses to sign and players are told to reload.

### Changing the game

1. Edit it in the [candy-Cascade](https://github.com/Nabilislam722/candy-Cascade) repo. After changing points or levels, run `npm run stars` to retune star scores.
2. Run `npm test`, then `npm run build`.
3. Copy `dist/index.html` and `dist/assets/` into `client/public/candy-cascade/`.
4. Copy the changed `src/` files into `client/src/games/candy-cascade/game/src/`, and restart the backend.
5. Deploy the client and the backend together.

### Adding levels

The game has 500 levels in 25 episodes.

1. In the game repo, raise `TOTAL_LEVELS` in `tools/generate-levels.mjs`, run `npm run levels -- <first new> <last>`, then `npm run stars -- <first new> <last>`. Existing levels stay untouched.
2. Extend `EPISODES` and `DIFFICULTY_CURVE` in `src/core/levels.js`.
3. Raise `LEVEL_COUNT` in `backend/services/candyCascade.js`.
4. Have the contract owner call `setLevelCount(n)`. No redeploy is needed.

### Deploying the contract

In `contract/.env`, set `SIGNER_ADDRESS` to the address of the backend's `SERVER_PRIVATE_KEY`, then run `npm run deploy:candy` in `contract/`. The fee is set in `scripts/deploy-candy-cascade.js`.

## NFT multiplier indexer

NFTs from the collections in `CollectionConfig` raise a player's HP multiplier (+`multiplier - 1` per NFT, capped at 1.5×). `backend/services/nftIndexer.js` keeps track of who owns them:

- **Reading the chain:** every 10 seconds it reads Transfer logs in block ranges and saves how far it got per collection (`IndexerState`). A restart continues from there, so no transfer is missed.
- **Reorg safety:** it stays 3 blocks behind the chain head.
- **One record per token:** each token has a single ownership record (`NftToken`), and only a later transfer replaces it. Replayed or duplicate events change nothing.
- **New collections:** a collection added to `CollectionConfig` is picked up on the next pass and backfilled from its `startBlock`. Set `startBlock` to the contract's deploy block; from 0, a backfill takes a few minutes.
- **Hold period:** a newly received NFT counts toward the multiplier only after `NFT_HOLD_HOURS` (default 24), so one NFT can't be passed between wallets to boost each of them. HP crediting reads the multiplier fresh from the index.
- **Profiles:** the profile endpoint reads the index (no chain calls). At most every 10 minutes per wallet, it double-checks on-chain balances in the background and repairs any difference.

## Tests

- Contracts and the NFT indexer: `npm test` in `contract/` (runs against a local Hardhat chain, including an end-to-end Candy Cascade test that replays real games).
- Candy Cascade rules: `npm test` in the [candy-Cascade](https://github.com/Nabilislam722/candy-Cascade) repo.

## Bans and suspicious activity

**Blocklist.** Wallets in the `blocklist` collection can't play or earn HP. Every route that starts or signs a game, or pays HP, runs through `rejectBanned` (`backend/services/moderation.js`), which answers a banned wallet with a 403 and `banned: true`. When a banned wallet connects, the site shows a "You are banned" screen on every page, with the ban's reason and end date. Each entry has:

| Field | Meaning |
| --- | --- |
| `wallet` | The banned address (stored lowercase) |
| `reason` | Shown to the player |
| `notes` | Internal only, never shown |
| `bannedBy` | Who added the ban |
| `expiresAt` | When the ban ends; empty for a permanent ban |

**Suspicious-activity log.** When the backend catches something that looks like cheating, it saves an entry in `suspiciousactivities` with the wallet, a type, a message, details, IP and browser. Entries are kept for 180 days. Logging never bans anyone by itself. What gets logged:

| Type | What happened |
| --- | --- |
| `claimed_foreign_tx` | Claimed HP for a transaction another wallet sent |
| `claimed_foreign_level` | Claimed HP for a Candy Cascade level another wallet cleared |
| `score_mismatch` | Claimed a different score than the transaction recorded |
| `pop_implausible_score` | A Proof of Patience score that the run's answers, length or fire rate couldn't produce |
| `candy_tampered_moves` | Candy Cascade moves that fail the server's replay |
| `candy_lost_game_submitted` | A lost Candy Cascade game sent as a win |
| `candy_start_reused` | A level start reused for a different level or wallet |
| `candy_foreign_start` | Asked for a board with a transaction that doesn't start that level for that wallet |

**Managing bans.** Run the admin script from the repo root on the server:

```bash
node backend/scripts/blocklist.js top --days 30                    # wallets with the most suspicious events
node backend/scripts/blocklist.js suspicious 0xWallet               # one wallet's events
node backend/scripts/blocklist.js ban 0xWallet --reason "Faked scores" --days 7 --by yourname
node backend/scripts/blocklist.js ban 0xWallet --reason "Repeated cheating"   # permanent
node backend/scripts/blocklist.js unban 0xWallet
node backend/scripts/blocklist.js list
```

Banned wallets can still call the game contracts directly, but without the server's signatures they can't save results, and `/api/points/add` won't credit them.

## Environment variables

Frontend (`client/.env`):

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Backend base URL (defaults to `http://localhost:3000`) |
| `VITE_VOTING_CONTRACT_ADDRESS` | Voting contract used on the dashboard |
| `VITE_CANDY_CASCADE_CONTRACT` | CandyCascade contract. Without it, the game runs in local play with nothing saved on chain |

Backend (`.env` in the directory you start the backend from):

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default `3000`) |
| `SERVER_PRIVATE_KEY` | Signs verified game results |
| `FRONTEND_URL` | Redirect target after OAuth |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` | Discord account linking |
| `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `TWITTER_REDIRECT_URI` | X account linking |
| `RACE_INITIAL_POINTS`, `RACE_POINTS_DECREMENT_PER_SECOND` | Racing game scoring |
| `CANDY_CASCADE_CONTRACT` | CandyCascade contract address (sessions, verification and HP crediting) |
| `CANDY_CASCADE_CORE_DIR` | Optional: where the backend loads the Candy Cascade engine from (default: the game source in `client/`) |
| `NFT_HOLD_HOURS` | Hours a newly received NFT is held before it counts toward the multiplier (default `24`) |

Contracts (`contract/.env`):

| Variable | Purpose |
| --- | --- |
| `DEPLOYER_PRIVATE_KEY` | Deploys contracts to Hemi (Hardhat also expects a valid key when running tests) |
| `SIGNER_ADDRESS` | Address of the backend's `SERVER_PRIVATE_KEY`, set as the trusted signer when deploying CandyCascade |

Never commit `.env` files. They are already in `.gitignore`.
