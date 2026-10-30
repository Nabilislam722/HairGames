# Development guide

How the HairGames code is organised, and how to work on it. For an overview of the project, see the [README](../README.md).

## Repository layout

```
HairGames/
├── client/                  React + Vite frontend
│   ├── index.html
│   ├── public/              Static files served as-is (sprites, game assets, and the Space Huggers, Candy Cascade and Moto Rush games)
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
│   ├── controllers/         Request handlers (auth, games, points, stats, Candy Cascade, Moto Rush)
│   ├── models/              Mongoose models
│   ├── routes/              Route definitions, mounted under /api
│   └── services/            NFT indexer, Candy Cascade and Moto Rush replay and signing
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
| `moto-rush` | `/game/moto_rush` |
| `candy-cascade` | `/game/candy_cascade` |
| `proof-of-patience` | `/game/proof_of_patience` |
| `fruit-ninja` | `/game/max_fruitninja` |
| `space-shooter` | `/game/space_shooter` |
| `space-huggers` | `/game/space_huggers` |
| `racing` | `/game/race_car` |
| `fishing` | `/game/fishing_game` |

To add a game, create a folder with that shape, register its page in `client/src/App.jsx`, and add it to `GAMES` in `client/src/pages/Dashboard.jsx`.

Space Huggers, Candy Cascade and Moto Rush are standalone games served from `client/public/` and embedded in an iframe by their page.

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
6. `POST /api/points/add` reads the `LevelCleared` event and credits HP for **improvement over the previous best** on that level, scaled like every other game's score (see [HP per play](#hp-per-play)). Replays that don't beat it earn nothing.

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

## Moto Rush

The game is plain JavaScript in `client/public/moto-rush/`, with no build step. `client/src/games/moto-rush/MotoRushPage.jsx` loads it in an iframe and handles the wallet, the transactions and the result box. The page and the game talk through `postMessage`.

| File | What it does |
| --- | --- |
| `js/game.js` | Menus, level list, garage, controls, game loop, and the messages to the page |
| `js/sim.js` | Physics for one ride: bike, rider, flips, crashes, finish and stars. The bikes are in `BIKES` |
| `js/levels.js` | The 500 tracks |
| `js/detmath.js` | Math functions that give the same result in every browser and on the server. Loads before planck |
| `vendor/planck.min.js` | The planck.js physics engine |
| `js/render.js`, `js/audio.js`, `js/opbike.js` | Drawing, sound, and the #27 Venom's artwork |

**Levels.** The first 9 levels are built by hand. The rest come from a seeded generator, so every player gets the same tracks, and they move to the next world every 5 levels: jungle, desert, ice, meadow, cave. A level's `stars` holds the finish times for 3 and 2 stars. Finishing at all earns 1 star, and every landed flip takes 1 second off the time. Add `#autopilot` to the game's URL to let the built-in driver ride every level.

**Bikes.** Four bikes unlock with total stars: at 0, 5, 12 and 20. The #27 Venom is only for holders of the Venom NFT (`nft/venom/`). It's the fastest bike and gets one revive per run. A ride on it adds 0.2 to the HP multiplier, up to 1.7× (`MOTO_RUSH` in `backend/config/constants.js`). The server checks the bike when it verifies a ride.

### On-chain saves and anti-cheat

Progress (the levels completed, with time and stars) lives in the `MotoRush` contract. Without `VITE_MOTO_RUSH_CONTRACT`, the page runs the game as free play: progress stays in the browser and no HP is paid.

1. Every attempt starts on chain: the player sends `startLevel(levelId)`, which opens a numbered run on their next level. Levels unlock in order. A new start replaces any open run, so crashing or quitting never leaves a player stuck.
2. The page sends the start transaction to `POST /api/moto-rush/session`. The server checks it (sender, contract, level), even while it is still pending, checks that the level is the player's next one, and returns a session id. Each start transaction gets one session.
3. The game records the controls (gas, brake, lean back, lean forward) for every physics step, 120 a second. At the finish, the page sends them to `POST /api/moto-rush/verify` with the bike and the step of any revive.
4. The server checks that the player may ride that bike, replays the ride with the game's own physics, and signs only a ride that reached the finish, with the time and stars the replay produced. It never uses a time from the client. It also checks that the start was mined and is still the open run, and binds the signature to that run.
5. The player submits `submitLevel(...)`. The contract checks the signature against the open run, closes it and locks the level. It also refuses a finish time shorter than the time since the run was opened, so the page waits for the chain's clock (`submitAfter`) before asking the wallet.
6. `POST /api/points/add` reads the `LevelCompleted` event and pays by stars (see [HP per play](#hp-per-play)), plus the Venom bonus if the ride used it.

Each level can be completed **once**, whatever its stars. The contract won't start it again, so its HP is paid once.

The backend loads the physics from `client/public/moto-rush/` (`MOTO_RUSH_DIR` to change it). The game and the backend both hash `js/detmath.js`, `vendor/planck.min.js`, `js/levels.js` and `js/sim.js`. If the hashes differ, the backend refuses to sign and the player is told to reload and ride the level again.

### Changing the game

- A change to any of the four hashed files changes how rides replay. Deploy the client and the backend together. A ride recorded before the change can't be saved and has to be ridden again.
- Other files (`game.js`, `render.js`, `audio.js`, `opbike.js`, `index.html`) only need a client deploy.

### Adding levels

1. In `js/levels.js`, raise `TOTAL` and give each new level an entry in `GEN_FIX` (the generator re-roll that rides cleanly), `GEN_TIMES` (the starter bike's autopilot time, which sets the 2-star time) and `GEN_THREE` (the 3-star time). A level without them gets 60 and 80 seconds.
2. Raise `LEVEL_COUNT` in `backend/services/motoRush.js`.
3. Have the contract owner call `setLevelCount(n)`. No redeploy is needed.

### Deploying the contract

In `contract/.env`, set `SIGNER_ADDRESS` to the address of the backend's `SERVER_PRIVATE_KEY`, and optionally `MOTO_SUBMISSION_FEE_ETH` (default `0.000008`). Run `npm run deploy:moto` in `contract/`. Then put the new address in `ECOSYSTEM_CONTRACTS.moto_rush` in `backend/config/constants.js`, and in `VITE_MOTO_RUSH_CONTRACT` in `client/.env`.

## HP per play

`POST /api/points/add` turns the score in a confirmed transaction into HP, then applies the player's NFT multiplier:

- **Moto Rush** pays by stars: 10,000 HP for 3, 7,000 for 2 and 5,000 for 1 (`STAR_HP` in `backend/services/motoRush.js`). A ride on the #27 Venom raises its multiplier to as much as 1.7× (see [Moto Rush](#moto-rush)).
- **Every other game** pays at most 3,000 HP a play (`GAME_HP` in `backend/config/constants.js`), and the score a game shows is the HP the play earns:
  - Games whose score the server checks or works out keep it on chain unchanged; the server multiplies it by the game's scale, and the game shows it already scaled (`client/src/lib/hp.js`, and `formatPoints` in Candy Cascade's `ui/goals.js`).
  - Games whose score comes straight from the browser keep their points small in the game itself and stop the score at 3,000.

| Game (`gameId`) | How | A top run |
|---|---|---|
| Need for Hair (`racing_game`) | scale 0.2 | 15,000 on chain, 3,000 HP |
| Proof of Patience (`proof_of_patience`) | scale 0.2 | 15,000 on chain, 3,000 HP |
| Candy Cascade (`candy_cascade`) | scale 0.2, paid on improvement over your best | about 11,000 on chain for a 3-star clear, 2,200 HP |
| Space Huggers (`space_huggers`) | scale 0.3 | about 9,750 on chain for a full level from level 10 on, 2,925 HP |
| Max Prø Fishing (`fishing_party`) | points in the game, stops at 3,000 | 3,000 |
| Max Fruit Slicer (`fruit_ninja`) | points in the game, stops at 3,000 | 3,000 |
| Void Striker (`default_legacy`) | points in the game, stops at 3,000 | 3,000 |

The candy bundle in `client/public/candy-cascade` is built from `client/src/games/candy-cascade/game`; a change to how it shows points goes in both.

## NFT multiplier indexer

NFTs from the collections in `CollectionConfig` raise a player's HP multiplier (+`multiplier - 1` per NFT, capped at 1.5×). `backend/services/nftIndexer.js` keeps track of who owns them:

- **Reading the chain:** every 10 seconds it reads Transfer logs in block ranges and saves how far it got per collection (`IndexerState`). A restart continues from there, so no transfer is missed.
- **Reorg safety:** it stays 3 blocks behind the chain head.
- **One record per token:** each token has a single ownership record (`NftToken`), and only a later transfer replaces it. Replayed or duplicate events change nothing.
- **New collections:** a collection added to `CollectionConfig` is picked up on the next pass and backfilled from its `startBlock`. Set `startBlock` to the contract's deploy block; from 0, a backfill takes a few minutes.
- **Hold period:** a newly received NFT counts toward the multiplier only after `NFT_HOLD_HOURS` (default 24), so one NFT can't be passed between wallets to boost each of them. HP crediting reads the multiplier fresh from the index.
- **Profiles:** the profile endpoint reads the index (no chain calls). At most every 10 minutes per wallet, it double-checks on-chain balances in the background and repairs any difference.
- **Our own NFTs:** everything for them lives in `nft/`, a Hardhat project of its own kept apart from the game contracts in `contract/`. That covers contracts, deploy scripts, admin tasks, tests, and a launch kit per collection. Venom deploys with `npm run deploy:venom` in `nft/`; `nft/venom/README.md` walks through it. `nft/contracts/mocks/MockERC721.sol` holds test-only collections for indexer tests.
- **Per-game bonuses:** a collection's optional `gameBonus` (for example `{ candy_cascade: 0.2 }`) adds to the multiplier in that game only, past the 1.5× cap, once per collection however many of its NFTs a wallet holds. The key is the `gameId` the game sends to `/api/points/add`. Give such a collection `multiplier: 1` if it shouldn't raise the regular multiplier too. Moto Rush doesn't use `gameBonus`: the Venom NFT (`nft/venom/`) adds its bonus there only on rides made on the #27 Venom (see [Moto Rush](#moto-rush)).

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
| `claimed_foreign_level` | Claimed HP for a Candy Cascade or Moto Rush level another wallet finished |
| `score_mismatch` | Claimed a different score than the transaction recorded |
| `pop_implausible_score` | A Proof of Patience score that the run's answers, length or fire rate couldn't produce |
| `candy_tampered_moves` | Candy Cascade moves that fail the server's replay |
| `candy_lost_game_submitted` | A lost Candy Cascade game sent as a win |
| `candy_start_reused` | A level start reused for a different level or wallet |
| `candy_foreign_start` | Asked for a board with a transaction that doesn't start that level for that wallet |
| `moto_tampered_inputs` | Moto Rush controls that fail the server's replay |
| `moto_unfinished_ride_submitted` | A Moto Rush ride that crashed or didn't reach the finish, sent as a finish |
| `moto_start_reused` | A Moto Rush level start reused for a different level or wallet |
| `moto_foreign_start` | Asked for a ride session with a transaction that doesn't start that level for that wallet |
| `moto_locked_bike` | Rode a bike the wallet's stars haven't unlocked |
| `moto_venom_without_nft` | Rode the #27 Venom without holding a Venom NFT |

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
| `VITE_MOTO_RUSH_CONTRACT` | MotoRush contract. With it, levels and stars are saved on chain and each level can be completed once; without it, Moto Rush is free play with progress kept in the browser |
| `VITE_VENOM_CONTRACT` | Venom NFT contract (`nft/`). Only Venom holders can ride the #27 Venom in Moto Rush; without it, the Venom stays locked for everyone |

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
| `MOTO_RUSH_DIR` | Optional: where the backend loads the Moto Rush physics from to replay rides (default: `client/public/moto-rush`) |
| `NFT_HOLD_HOURS` | Hours a newly received NFT is held before it counts toward the multiplier (default `24`) |

Contracts (`contract/.env`):

| Variable | Purpose |
| --- | --- |
| `DEPLOYER_PRIVATE_KEY` | Deploys contracts to Hemi (Hardhat also expects a valid key when running tests) |
| `SIGNER_ADDRESS` | Address of the backend's `SERVER_PRIVATE_KEY`, set as the trusted signer when deploying CandyCascade and MotoRush |
| `MOTO_SUBMISSION_FEE_ETH` | Optional: the fee to save a Moto Rush level, in ETH (default `0.000008`) |

Never commit `.env` files. They are already in `.gitignore`.
