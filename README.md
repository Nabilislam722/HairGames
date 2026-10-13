# HairGames

On-chain mini-games on the Hemi network. Players pay a small entry fee, play in the browser, submit their score to a game contract and earn Hair Points (HP), boosted by NFT multipliers.

## Repository layout

```
hairGames/
├── client/                  React + Vite frontend
│   ├── index.html
│   ├── public/              Static files served as-is (sprites, game assets, SpaceHuggers and candy-cascade builds)
│   └── src/
│       ├── main.jsx         Providers (wagmi, RainbowKit, React Query)
│       ├── App.jsx          Route table
│       ├── pages/           Site pages: Home, Dashboard, Profile, Leaderboard, EventRank, NotFound
│       ├── games/           One folder per game (see below)
│       ├── components/
│       │   ├── layout/      App shell (nav, footer)
│       │   └── ui/          shadcn/ui primitives
│       ├── hooks/           Shared React hooks
│       ├── lib/             Shared helpers: web3, chain config, contracts, utils
│       ├── assets/images/   Site-wide images imported from code
│       ├── styles/          globals.css (Tailwind entry), dashboard.css
│       └── legacy/          Unused older code kept for reference. Not part of the build.
├── backend/                 Express API (port 3000)
│   ├── server.js            Entry point
│   ├── config/              DB, RPC provider, constants
│   ├── controllers/         Request handlers (auth, games, points, stats)
│   ├── models/              Mongoose models
│   ├── routes/              Route definitions, mounted under /api
│   └── services/            Background jobs (NFT watcher)
├── contract/                Hardhat project: Solidity game contracts + deploy script
└── docs/                    Operational notes (server-operations.md)
```

### Game folders

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
| `space-shooter` | `/game/space_shooter` |
| `space-huggers` | `/game/space_huggers` |
| `fruit-ninja` | `/game/max_fruitninja` |
| `racing` | `/game/race_car` |
| `fishing` | `/game/fishing_game` |
| `proof-of-patience` | `/game/proof_of_patience` |
| `candy-cascade` | `/game/candy_cascade` |

To add a game, create a new folder with that shape, register its page in `client/src/App.jsx` and add it to `GAMES` in `client/src/pages/Dashboard.jsx`.

Space Huggers and Candy Cascade are standalone builds served from `client/public/` and embedded in an iframe by their page.

### Candy Cascade: on-chain saves and anti-cheat

Progress (highest cleared level, best score and stars per level) lives in the `CandyCascade` contract, not in the browser.

1. Every attempt starts on chain: the player sends `startLevel(levelId)`, which opens a numbered run. A new start replaces any open run, so losing or quitting never leaves a player stuck.
2. As soon as the wallet sends the start, the page asks `POST /api/candy-cascade/session` for the board. The server checks the start transaction (sender, contract, level), even while it is still pending, and picks the random seed. Each start transaction gets exactly one seed.
3. The game records every move. When the level is won, the page sends the moves to `POST /api/candy-cascade/verify`.
4. The server replays the moves with the game's own engine and signs only the score and stars the replay produced. It never uses a score from the client. It also checks that the start was mined and is still the open run, and binds the signature to that run.
5. The player submits `submitLevel(...)`. The contract checks the signature against the open run, then closes it, so one start can save at most one win. It also checks the level order and the fee.
6. `POST /api/points/add` reads the `LevelCleared` event and credits HP for **improvement over the previous best** on that level. Replays that don't beat it earn nothing.

A level with all **3 stars is finished**. The contract won't start it again and the backend won't issue a board for it, so players move on to new levels instead of farming old ones. Levels with 1 or 2 stars can be replayed to earn the rest. In the game, tapping a 3-star level shows "Level mastered" with a shortcut to the newest level.

Phone networks: the page sends every request through `fetchWithRetry` (`client/src/lib/network.js`: 12 s timeout, 3 tries), and pings `/api/ping` every 15 s while the game is open. If a board request fails after the start went out, "Try again" reuses that start instead of asking for a new transaction.

The backend loads the engine from `client/src/games/candy-cascade/game/src/core`, the same files the game is built from. A rules fingerprint is built into the game and computed again by the backend. If they differ, the backend refuses to sign and players are told to reload.

**To change the game:** edit it in its repo ([candy-Cascade](https://github.com/Nabilislam722/candy-Cascade)). Run `npm test`, then `npm run build`, and copy `dist/index.html` and `dist/assets/` into `client/public/candy-cascade/`. Then copy the changed `src/` files into `client/src/games/candy-cascade/game/src/` and restart the backend. Deploy the client and the backend together. After changing points or levels, run `npm run stars` in the game repo before building.

**Deploying the contract:** in `contract/.env`, set `SIGNER_ADDRESS` to the address of the backend `SERVER_PRIVATE_KEY`. Then run `npm run deploy:candy` in `contract/`. The fee is set in `scripts/deploy-candy-cascade.js`. Contract tests: `npm test` in `contract/`.

**Adding levels:** the game has 500 levels in 25 episodes.
1. In the game repo, raise `TOTAL_LEVELS` in `tools/generate-levels.mjs`, run `npm run levels -- <first new> <last>`, then `npm run stars -- <first new> <last>`. Existing levels stay untouched.
2. Extend `EPISODES` and `DIFFICULTY_CURVE` in `src/core/levels.js`.
3. Raise `LEVEL_COUNT` in `backend/services/candyCascade.js`.
4. Have the contract owner call `setLevelCount(n)`. No redeploy is needed.

### Naming conventions

- Folders: `kebab-case` (`fruit-ninja`, `proof-of-patience`)
- React components: `PascalCase.jsx` / `.tsx`
- Non-component modules: `camelCase.js` / `.ts`
- Imports across folders use the `@/` alias (`@/lib/web3`, `@/components/ui/button`); imports inside a game folder stay relative.

### NFT multiplier indexer

NFTs from the collections in `CollectionConfig` raise a player's HP multiplier (+`multiplier - 1` per NFT, capped at 1.5×). `backend/services/nftIndexer.js` keeps track of who owns them:

- **How it reads the chain:** every 10 seconds it reads Transfer logs in block ranges and saves how far it got per collection (`IndexerState`). A restart continues from there, so no transfer is missed.
- **Reorg safety:** it stays 3 blocks behind the chain head, so shallow reorgs never land.
- **One record per token:** each token has a single ownership record (`NftToken`), and only a later transfer replaces it. Replayed or duplicate events change nothing.
- **New collections:** a collection added to `CollectionConfig` is picked up on the next pass and backfilled from its `startBlock`. Set `startBlock` to the contract's deploy block; from 0 a backfill takes a few minutes.
- **Hold period:** a newly received NFT counts toward the multiplier only after `NFT_HOLD_HOURS` (default 24), so one NFT can't be passed between wallets to boost each of them. HP crediting reads the multiplier fresh from the index.
- **Profiles:** the profile endpoint reads the index (no chain calls), and at most every 10 minutes per wallet it double-checks on-chain balances in the background and repairs any difference.

Tests run against a local chain: `contract/test/NftIndexer.test.js`.

## Getting started

Requirements: Node.js 20+, a local MongoDB (or the SSH tunnel described in [docs/server-operations.md](docs/server-operations.md)).

```bash
npm install

# Frontend (http://127.0.0.1:5000)
npm run dev:client

# Backend API (http://localhost:3000)
node backend/server.js

# Production build of the frontend -> dist/public
npm run build
```

## Environment variables

Frontend (`client/.env`):

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Backend base URL (defaults to `http://localhost:3000`) |
| `VITE_VOTING_CONTRACT_ADDRESS` | Voting contract used on the dashboard |
| `VITE_CANDY_CASCADE_CONTRACT` | CandyCascade contract. Without it the game runs in local play, with nothing saved on chain |

Backend:

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default `3000`) |
| `SERVER_PRIVATE_KEY` | Signer for score signatures |
| `FRONTEND_URL` | Redirect target after OAuth |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` | Discord account linking |
| `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `TWITTER_REDIRECT_URI` | X account linking |
| `RACE_INITIAL_POINTS`, `RACE_POINTS_DECREMENT_PER_SECOND` | Racing game scoring |
| `CANDY_CASCADE_CONTRACT` | CandyCascade contract address (session, verify and HP crediting) |
| `CANDY_CASCADE_CORE_DIR` | Optional: where the backend loads the Candy Cascade engine from (default: the game source in `client/`) |
| `NFT_HOLD_HOURS` | Hours a newly received NFT is held before it counts toward the multiplier (default `24`) |

Never commit `.env` files. They are already in `.gitignore`.
