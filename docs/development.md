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
│       │   ├── arena/       Shared page pieces: avatar, heads and toggles, game card, rankings, trend cards, recent plays, segmented bar, stat tile, connect prompt
│       │   ├── layout/      App shell (navbar, footer)
│       │   └── ui/          shadcn/ui primitives
│       ├── hooks/           Shared React hooks
│       ├── lib/             Shared helpers: web3, chain config, contracts, network retries, season, the game list,
│       │                    rank levels, recent plays from the explorer, daily tasks, competitions, game sessions
│       ├── assets/images/   Site-wide images imported from code
│       ├── styles/          globals.css (Tailwind entry), hg.css (shared page styles and load-in animation),
│       │                    plus one file per page that needs more: dashboard.css, home.css, profile.css
│       └── legacy/          Unused older code kept for reference. Not part of the build.
├── backend/                 Express API (port 3000)
│   ├── server.js            Entry point
│   ├── config/              Database, RPC provider, contract addresses
│   ├── controllers/         Request handlers (auth, games, points, stats, daily tasks, Candy Cascade, Moto Rush)
│   ├── models/              Mongoose models
│   ├── routes/              Route definitions, mounted under /api
│   └── services/            NFT indexer, daily task draw, Candy Cascade and Moto Rush replay and signing
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

To add a game, create a folder with that shape, register its page in `client/src/App.jsx`, and add it to `GAMES` in `client/src/lib/games.js` (with its contract, so its plays show up on the Dashboard). The navbar and Dashboard both read that list.

Space Huggers, Candy Cascade and Moto Rush are standalone games served from `client/public/` and embedded in an iframe by their page.

### Naming conventions

- Folders: `kebab-case` (`fruit-ninja`, `proof-of-patience`)
- React components: `PascalCase.jsx` / `.tsx`
- Non-component modules: `camelCase.js` / `.ts`
- Imports across folders use the `@/` alias (`@/lib/web3`, `@/components/ui/button`). Imports inside a game folder stay relative.

## Candy Cascade

The game's source lives in its own repo, [candy-Cascade](https://github.com/Nabilislam722/candy-Cascade). A copy of its source is kept in `client/src/games/candy-cascade/game/` (the backend replays moves with it, and it matches the repo file for file), and the built game is in `client/public/candy-cascade/`.

### Stars

Stars come from the **moves left when the goals are met**, not from score:

- **1 star:** clear the level.
- **2 and 3 stars:** finish with at least `starMoves[0]` and `starMoves[1]` moves left. Each level has its own marks, shown on its intro ("Finish with 6 moves left").
- **Stopwatch candies** add moves, so on their levels the top stars can ask for more moves than the level starts with.

The HUD shows the three stars with the moves each needs. A star dims as soon as it's out of reach and lights again if a stopwatch brings it back. After a win, the result screen says how many moves were left and what the next star needed. Score still counts (best score per level) but has no cap: holding back the last goal to keep scoring only costs stars.

### Difficulty

Difficulty rises in steps of 5 levels along `DIFFICULTY_CURVE` in `src/core/levels.js`. Each point on it sets:

- **How its levels play:** the goal size (`targetScale`, from 1× to 1.4× for score and collect goals) and the refill assist (`cascadeChance`, from 0.35 to none by level 301). With a strong assist the board plays itself, so it fades out.
- **What `npm run balance` aims for:** it plays every level 1,000 times as two players:
  - the balancing bot, which aims at the goals;
  - a casual player, half the bot's moves and half random ones.

  It gives each level the fewest moves with which both reach their win rate, between 10 and 50 moves. It then sets the star marks so the bot earns 2 and 3 stars in the curve's share of its wins.

Every 10th level is a challenge, balanced to lower win rates. Measured with `npm run balance`:

| Levels | Bot wins | Casual wins | Bot gets 3 stars | Challenges: bot / casual wins |
| --- | --- | --- | --- | --- |
| 1–20 | 97% | 89% | 39% | 83% / 69% |
| 21–100 | 91% | 79% | 30% | 73% / 51% |
| 101–300 | 84% | 66% | 23% | 65% / 43% |
| 301–500 | 80% | 60% | 20% | 62% / 39% |

The bot never plans ahead, so these numbers show how hard levels feel relative to each other, not exact odds for people.

### Saving on the hub

Candy Cascade plays on HairGames Hub V2 (see [Hub backend](#hub-backend)). Without `VITE_GAME_HUB_CONTRACT`, the page runs it on its own, with progress in the browser.

1. **Start:** every attempt starts with `startRun(2, level)`, sent by the session key or the wallet. `POST /api/hub/candy-cascade/session` checks it: the level must be unlocked, without 3 stars yet. The server also picks the board's seed, once per start.
2. **Play:** after every move, the game tells the page its moves so far, and the page's checkpoints carry a hash of them.
3. **Verify:** every finished attempt, won or lost, goes to `POST /api/hub/candy-cascade/verify`. The server replays the moves with the game's own engine and signs what the replay produced:
   - the score;
   - `details`: the level, stars (0 for a loss), moves left and moves played.

   It never uses a result from the client.
4. **Save:** the page saves the result with `submitRun` and reports it.
   - **A loss is saved too:** it counts as a play, and its time as playtime, but it changes no progress.
   - **Timing:** a level has no clock in its replay, so it counts at most 15 seconds of playtime per move. Its result can't be saved sooner than 0.5 seconds per move after its start (`CANDY_SECONDS_PER_MOVE`).

**Progress** is kept by the backend (`hubprogresses`) and read with `GET /api/hub/candy-cascade/progress`: the highest unlocked level, plus the best stars and score per level. Levels open in order. A level with 3 stars is finished, and any other can be played again for more.

**Rules fingerprint.** The backend loads the engine from `client/src/games/candy-cascade/game/src/core`, the same files the game is built from. The build bakes in a hash of those files, and the backend computes it again. If they differ, the backend refuses to sign and the player is told to reload.

The old `CandyCascade` contract, which paid HP per level, is retired. `/api/candy-cascade/session` and `/verify` answer 410 with "reload the page", and the levels, stars and scores saved there aren't carried over.

### Changing the game

1. Edit it in the candy-Cascade repo. After changing levels, points or the difficulty curve, run `npm run balance`. It rewrites the moves and star marks in `src/core/level-data.js`; add `-- --dry` to only see the numbers, or give a range (`-- 40 60`).
2. Run `npm test`, then `npm run build`.
3. Copy `dist/index.html` and `dist/assets/` into `client/public/candy-cascade/`.
4. Copy `src/`, `index.html` and `styles.css` into `client/src/games/candy-cascade/game/`, then restart the backend.
5. Deploy the client and the backend together.

`npm run simulate` prints win and star rates for the levels as they are.

### Adding levels

The game has 500 levels in 25 episodes.

1. In the game repo, raise `TOTAL_LEVELS` in `tools/generate-levels.mjs`, run `npm run levels -- <first new> <last>`, then `npm run balance -- <first new> <last>`. Existing levels stay untouched.
2. Extend `EPISODES` (and `DIFFICULTY_CURVE`, to go past level 500) in `src/core/levels.js`.
3. Raise `LEVEL_COUNT` in `backend/services/candyCascade.js`.

## Moto Rush

The game is plain JavaScript in `client/public/moto-rush/`, with no build step. `client/src/games/moto-rush/MotoRushPage.jsx` loads it in an iframe and runs its starts and saves on the hub (see [Playing on the hub](#playing-on-the-hub)). The page and the game talk through `postMessage`.

| File | What it does |
| --- | --- |
| `js/game.js` | Menus, level list, garage, controls, game loop, and the messages to the page |
| `js/sim.js` | Physics for one ride: bike, rider, flips, crashes, finish and stars. The bikes are in `BIKES` |
| `js/levels.js` | The 500 tracks |
| `js/detmath.js` | Math functions that give the same result in every browser and on the server. Loads before planck |
| `vendor/planck.min.js` | The planck.js physics engine |
| `js/render.js`, `js/audio.js`, `js/opbike.js` | Drawing, sound, and the #27 Venom's artwork |

**Levels.** The first 9 levels are built by hand. The rest come from a seeded generator, so every player gets the same tracks, and they move to the next world every 5 levels: jungle, desert, ice, meadow, cave. A level's `stars` holds the finish times for 3 and 2 stars. Finishing at all earns 1 star, and every landed flip takes 1 second off the time. Add `#autopilot` to the game's URL to let the built-in driver ride every level.

**Bikes.** Four bikes unlock with total stars: at 0, 5, 12 and 20. The #27 Venom is only for holders of the Venom NFT (`nft/venom/`). It's the fastest bike and gets one revive per run. The server checks the bike when it verifies a ride. (A Venom ride used to add 0.2 to that level's HP multiplier, up to 1.7× (`MOTO_RUSH` in `backend/config/constants.js`), but hub levels pay no HP.)

### Saving on the hub

Moto Rush plays on HairGames Hub V2 (see [Hub backend](#hub-backend)). Without `VITE_GAME_HUB_CONTRACT`, the page runs the game as free play, with progress in the browser.

1. **Start:** every attempt starts with `startRun(1, level)`, sent by the session key or the wallet. `POST /api/hub/moto-rush/session` checks the start, even while it's pending, and that the level is the player's next one. Levels unlock in order.
2. **Record:** the game records the controls (gas, brake, lean back, lean forward) for every physics step, 120 a second. At the finish, the page sends them to `POST /api/hub/moto-rush/verify` with the bike and the step of any revive.
3. **Verify:** the server checks the player may ride that bike: the Venom needs the NFT, and other bikes need their stars. It replays the ride with the game's own physics and signs only a ride that reached the finish, with the time and stars the replay produced. The result can't be saved sooner than the ride's start plus its length.
4. **Save:** the page saves it with `submitRun` and reports it. Progress (levels completed, with time and stars) is kept by the backend and read with `GET /api/hub/moto-rush/progress`.

Each level can be completed **once**. Levels pay no HP: daily tasks pay for plays and playtime.

The backend loads the physics from `client/public/moto-rush/` (`MOTO_RUSH_DIR` to change it). The game and the backend both hash `js/detmath.js`, `vendor/planck.min.js`, `js/levels.js` and `js/sim.js`. If the hashes differ, the backend refuses to sign, and the player is told to reload and ride the level again.

The old `MotoRush` contract is retired: `/api/moto-rush/session` and `/verify` answer 410, and its progress isn't carried over.

### Changing the game

- A change to any of the four hashed files changes how rides replay. Deploy the client and the backend together. A ride recorded before the change can't be saved and has to be ridden again.
- Other files (`game.js`, `render.js`, `audio.js`, `opbike.js`, `index.html`) only need a client deploy.

### Adding levels

1. In `js/levels.js`, raise `TOTAL` and give each new level an entry in:
   - `GEN_FIX`: the generator re-roll that rides cleanly;
   - `GEN_TIMES`: the starter bike's autopilot time, which sets the 2-star time;
   - `GEN_THREE`: the 3-star time.

   A level without them gets 60 and 80 seconds.
2. Raise `LEVEL_COUNT` in `backend/services/motoRush.js`.

## HP per play

Games on HairGames Hub V2 (Moto Rush, Candy Cascade and Pixel Fighters) pay no HP per play: [daily tasks](#daily-tasks) pay for their plays and playtime.

For the other games, `POST /api/points/add` turns the score in a confirmed transaction into HP, then applies the player's NFT multiplier:

- **Each game** pays at most 3,000 HP a play (`GAME_HP` in `backend/config/constants.js`), and the score a game shows is the HP the play earns:
  - Games whose score the server checks or works out keep it on chain unchanged; the server multiplies it by the game's scale, and the game shows it already scaled (`client/src/lib/hp.js`).
  - Games whose score comes straight from the browser keep their points small in the game itself and stop the score at 3,000.

| Game (`gameId`) | How | A top run |
|---|---|---|
| Need for Hair (`racing_game`) | scale 0.2 | 15,000 on chain, 3,000 HP |
| Proof of Patience (`proof_of_patience`) | scale 0.2 | 15,000 on chain, 3,000 HP |
| Space Huggers (`space_huggers`) | scale 0.3 | about 9,750 on chain for a full level from level 10 on, 2,925 HP |
| Max Prø Fishing (`fishing_party`) | points in the game, stops at 3,000 | 3,000 |
| Max Fruit Slicer (`fruit_ninja`) | points in the game, stops at 3,000 | 3,000 |
| Void Striker (`default_legacy`) | points in the game, stops at 3,000 | 3,000 |


## Daily tasks

The Dashboard's Tasks panel opens on **Today**: tasks drawn every UTC day from the ones you add in MongoDB. The one-time tasks (follow on X, join Discord and so on) are under **Bonus**.

### Adding a task

Insert a document into the `dailytasks` collection:

```js
db.dailytasks.insertOne({
  title: "Play 3 Pixel Fighters matches",
  description: "Our newest game. Win or lose, every match counts.",
  reward: 1500,
  game: "pixel_fighter",
  playCount: 3,
  boost: 3,
})
```

| Field | Meaning |
| --- | --- |
| `title` | Shown on the task card. Required |
| `description` | Shown under the title. Optional |
| `reward` | HP paid when the task is claimed. Required |
| `game` | The game whose plays count: a `gameId` from `ECOSYSTEM_CONTRACTS` in `backend/config/constants.js`, or `"any"` (the default) for every game |
| `playCount` | Plays needed in the day. Give this or `playMinutes`, not both |
| `playMinutes` | Minutes of verified play needed in the day. Only hub games have verified playtime, so `game` must be one of `HUB.LIVE` (`moto_rush`, `pixel_fighter`, `candy_cascade`) or `"any"` (the minutes of every hub game together). See [Playtime](#playtime) |
| `boost` | Draw weight, 1 by default: a task with boost 3 is three times as likely to be drawn as one with boost 1, and shows a Boosted badge. Use it to promote a new game |
| `active` | `false` keeps the task out of future draws. A task without the field counts as active |

The `gameId`s are `moto_rush`, `candy_cascade`, `pixel_fighter`, `proof_of_patience`, `fruit_ninja`, `default_legacy` (Void Striker), `space_huggers`, `racing_game` (Need for Hair) and `fishing_party`. A task is skipped if it has an unknown game, no title or reward, or not exactly one goal (`playCount` or `playMinutes`, a whole number from 1), or if it's a minutes task for a game that isn't on the hub.

Edits show on the Dashboard within a minute, and claims use the current reward and goal. Which tasks were drawn stays fixed for the day:

- **New task:** goes into the next day's draw.
- **Deleted task:** drops off today's list.
- **Task set to `active: false`:** stays for the rest of today.
- **Task edited into something unusable** (say, its reward removed): keeps the copy saved with the draw.

### The draw

On the first request after 00:00 UTC, `backend/services/dailyTasks.js`:

1. Reads the latest Bitcoin block from the Hemi Bitcoin Kit (hBK) on Hemi with `getLastHeader()` (`HEMI_BITCOIN_KIT` in `backend/config/constants.js`).
2. Seeds the draw with `keccak256(blockHash, day)`, packed.
3. Picks `DAILY_TASKS.COUNT` (4) of the active tasks, without repeats, weighted by `boost`.
4. Saves the day in `dailytaskdraws`: the block's height and hash, every task that could have been drawn (`candidates`), and a copy of the drawn tasks as a record.

The Dashboard links the block on mempool.space, and anyone can redo the draw from what's saved with `drawSeed` and `drawTasks`. If hBK can't be read, the day isn't drawn yet, and the Today tab shows the error with a Try again button.

### Progress and claiming

- **A play is a saved game:**
  - on the older per-game contracts, a save that `/api/points/add` accepts, even one that pays 0 HP;
  - on the hub, a saved run (`RunSaved`), which pays no HP by itself.
- **Minutes are verified hub playtime** (see [Playtime](#playtime)), rounded down to whole minutes.
- **Only the current UTC day counts.**
- **`GET /api/tasks/daily?wallet=0x…`** returns today's tasks. Each has a `unit` (`"plays"` or `"minutes"`), a `goal`, the wallet's `progress` (capped at the goal) and whether it's `claimed`. `playCount` and `plays` repeat the goal and progress for the current Dashboard.
- **`POST /api/tasks/daily/claim`** pays a task once its goal is reached:
  - The HP is the task's `reward` times the wallet's NFT multiplier, including any NFT bonus for the task's game (`nft.walletMultiplier`).
  - It goes to the wallet's lifetime points and counts toward the weekly event.
  - The claim in `dailytaskclaims` keeps the HP paid, the `baseReward` and the `multiplier`, and shows in the HP chart's history.
- **Each task can be claimed once a day.**
- **Tasks left unclaimed at the reset are gone.**

## HairGames Hub V2 and game sessions

Two contracts in `contract/contracts/`, `HairGamesSessionRegistry` (in `SessionRegistry.sol`) and `HairGamesHubV2`, replace the per-game contracts for new play, so players can play without a wallet popup for every transaction. Both are deployed on Hemi mainnet: the hub at `0x1758E07a53dec67624994785Be89294f7d513860` and the registry at `0x7c46c9B8DD81eb8388F39763C1737De2AEDAd681`. Moto Rush, Candy Cascade and Pixel Fighters play on them (see [Hub backend](#hub-backend) and [Playing on the hub](#playing-on-the-hub)).

Both are compiled with Solidity 0.8.39, the latest stable release, with 1,000,000 optimizer runs for cheap calls. This is a per-file override in `hardhat.config.js`:

- **Compiler pipeline:** the legacy pipeline, not via-IR, measured to give the cheapest checkpoint and the cheapest hour of play.
- **EVM target:** `cancun`, the newest level Hemi is confirmed to run. Newer compilers default to later EVM versions, so the target is set explicitly.
- **Other contracts:** stay on 0.8.24 with their own settings, so the contracts already deployed still match their verified bytecode.

### HairGamesSessionRegistry

A wallet appoints a **session key**: a key kept in the player's browser, holding a small ETH balance for gas and fees. Until the session ends, the key plays as the wallet on contracts that ask the registry. Token and NFT contracts never ask it, so the key can't touch the player's tokens or NFTs.

- **`openSession(key, expiresAt, r, vs)`** opens or renews a session (at most 30 days), and forwards any ETH sent with it to the key; renewing with ETH tops the key up. The key signs its consent (EIP-712 `SessionConsent(owner, key, expiresAt)`, sent as a compact EIP-2098 signature), so nobody can tie a key they don't hold to their own wallet, not even by copying a player's pending transaction.
- **ETH sent to a key stays in the key.** No contract can take it back, so the site has the key send what's left to the wallet when the session ends. It's only lost if the browser loses the key.
- **A key belongs to one wallet for good.** Only that wallet can renew it.
- **Ending a session:** the key can call `closeSession()`, the wallet can call `revokeSession(key)` for one key, or `revokeAll()` for every key at once (after losing a device).
- **A live session key can't open sessions itself**, so sessions never chain.
- **`playerFor(caller)`** answers who a call plays for: the wallet behind a live session key, otherwise the caller.
- **No owner, admin or upgrade path:** nobody can change who a key plays for.

### HairGamesHubV2

One contract for every game. The game rules (level order, stars, replays, NFT-only items) stay in the backend, which signs only results it has checked. The hub checks who the player is, the fees and the signature, and records everything as events.

Games are numbered in the order they're listed (1, 2, 3…), because a small number fits in the same storage slot as a run. `gameOf(name)` and `gameName(game)` translate between numbers and the backend's ids, which are `bytes32` short strings (`ethers.encodeBytes32String("moto_rush")`).

- **`startRun(game, params)`** opens a run for the player (the wallet, or the wallet a session key plays for), about 62,000 gas. `params` is the game's start data, such as a level or difficulty, read by the backend from `RunStarted`.
- **`checkpoint(runId, stateHash)`** records that a run is still being played. It's a bare event: no checks, no storage and no fee, about 24,000 gas, close to the 21,000 every transaction costs. A checkpoint changes nothing on chain, so the **backend** must check each one before counting playtime:
  - the `sender` was the run's player, or a session key playing for them at that block (the hub indexer does this);
  - `stateHash` (16 bytes) matches the run's replay. The indexer stores it with each checkpoint but doesn't check it yet; that comes with the games' checkpoint loop. Until then, the playtime cap (the replayed length plus a minute) limits what extra checkpoints can add.
- **`submitRun(runId, score, details, notBefore, deadline, r, vs)`** saves a result, about 41,000 gas. It needs the signer's compact signature over EIP-712 `Result(runId, player, game, score, detailsHash, notBefore, deadline)`.
  - `details` is the game's result data, defined per game by the backend.
  - The result can't be saved before `notBefore` (the general form of "finished too fast") or after `deadline`.
  - Each run is saved once, and only by its own player. A saved run is deleted, which earns a gas refund.
- **The registry is fixed at deployment,** so no admin can change who a session key plays for.
- **Fees are capped at `MAX_FEE` (0.001 ETH)**, because session keys pay them without asking the player each time. Fees are exact, and plain ETH can't be sent to the hub.
- **Roles instead of one owner:**
  - **Admin:** sets the signer and backup signer and manages roles. Moving it to a new wallet takes two steps and a waiting period.
  - **Game managers:** list games and set fees.
  - **Pausers:** pause one game, or starts and saves everywhere (`setPaused`).
  - **Treasurers:** withdraw fees.
- **Growing without upgrades:**
  - A new game is `addGame(name, startFee, submitFee)`.
  - To rotate the backend key without downtime: `setBackupSigner(newKey)`, switch the backend to the new key, then `setSigner(newKey)` and `setBackupSigner(address(0))`.
  - A later version can be deployed next to this one.

### Deploying

Set `SIGNER_ADDRESS` in `contract/.env`, then run `npm run deploy:hub` in `contract/` (`scripts/deploy-hub-v2.js`). The script deploys both contracts, lists every game with today's fee per saved result (starting a run is free), and prints:

- each game's number;
- the addresses for the backend and `client/.env`;
- the `hardhat verify` commands;
- how to move the admin role to a safer wallet, such as a multisig.

The deployer starts with every role.

### Hub backend

The live hub games are `HUB.LIVE` in `backend/config/constants.js`: Moto Rush, Pixel Fighters and Candy Cascade. `HUB` also holds the contract addresses, the block the indexer starts from, and the game numbers, which must match the deployed hub's.

**A run, step by step** (`backend/controllers/hubController.js`):

1. The game sends `startRun(game, params)` to the hub, usually from the player's session key. For Moto Rush and Candy Cascade, `params` is the level; for Pixel Fighters, it's the CPU level (0 easy, 1 normal, 2 hard).
2. **`POST /api/hub/<game>/session`** `{ wallet, startTxHash }` (Pixel Fighters also sends `p1`, the player's fighter) checks that transaction, even while it's pending:
   - It must call `startRun` on the hub for this game.
   - Its sender must be the wallet, or a session key the registry says plays for it.
   - A Moto Rush level must be the wallet's next one. A Candy Cascade level must be unlocked and without 3 stars yet.
   - Pixel Fighters also gets its CPU fighter and seed here, and Candy Cascade its board's seed.
   - A start can open one session only. Using another wallet's start returns 409 and is logged as suspicious.
3. **`POST /api/hub/<game>/verify`** replays the recorded inputs with the game's own engine, as the older contracts did:
   - For Moto Rush, it also checks the bike: the Venom needs the NFT, and other bikes need their stars from hub progress.
   - A ride or match that fails the replay or doesn't finish is rejected for good. A Candy Cascade level is saved won or lost.
   - Once the start is mined, it signs the replayed result for that run, with `notBefore` set to the run's start plus the replayed length (for Candy Cascade, which has no clock, 0.5 seconds per move). `deadline` is 30 minutes after `notBefore` or after now, whichever is later. Asking again returns the same result with a fresh signature.
4. The game sends `submitRun` with that signature, then reports the transaction to **`POST /api/hub/saved`** `{ wallet, txHash }`, so progress moves on at once.

Hub games pay no HP per play; daily tasks pay HP for plays and playtime.

**Result data.** `details` is ABI-encoded per game (`DETAILS` in `backend/services/hub.js`):

- **Moto Rush:** `(uint16 level, uint32 timeMs, uint8 stars, uint8 bike)`. The score is the time in ms.
- **Pixel Fighters:** `(uint8 difficulty, bool won, uint32 durationMs)`.
- **Candy Cascade:** `(uint16 level, uint8 stars, uint8 movesLeft, uint16 moves)`, with stars 0 for a lost level. The score is the game's score.

**The hub indexer** (`backend/services/hubIndexer.js`, started by `server.js`) works like the NFT indexer:

- It reads the hub's and the registry's logs together, in chain order, 2 blocks behind the head, with its cursor in `indexerstates` (`key: "hub"`).
- It keeps each session key's live intervals (`sessionkeys`), from `SessionOpened`, `SessionClosed` and `AllSessionsRevoked`.
- It stores runs (`hubruns`) with their start and save transactions, valid checkpoints and saves. A checkpoint counts only if it falls between the run's start and save, and its sender was the player or a key live for the player at that block.
- It applies every save (`backend/services/hubRuns.js`). A save is applied once, whether `/api/hub/saved` or the indexer gets to it first, so reading the same logs twice changes nothing.

**Progress** lives in the backend's database, starting fresh on the hub, not on chain:

- **Moto Rush:** levels completed in order, plus stars and times, in `hubprogresses` (`GET /api/hub/moto-rush/progress?wallet=`).
- **Pixel Fighters:** matches, wins, best and total score, from saved runs (`GET /api/hub/pixel-fighter/stats?wallet=`).
- **Candy Cascade:** the best stars and score per level, in `hubprogresses` (`GET /api/hub/candy-cascade/progress?wallet=`; see [Candy Cascade](#saving-on-the-hub)).

**`GET /api/hub/runs?wallet=0x…&days=14`** lists a wallet's recent runs (game, start and save transactions, times, result) for the site's Recent plays.

The old per-game routes, `/api/candy-cascade/*`, `/api/moto-rush/*` and `/api/pixel-fighter/*` (`session` and `verify`), answer 410 with "reload the page": their contracts paid HP per play.

#### Playtime

Only saved runs earn playtime. The points in time are the run's start, its valid checkpoints and its save:

- **Gaps:** each gap between two points counts if it's 30 seconds or less (`PLAYTIME.MAX_GAP_S`). A longer pause isn't play.
- **Cap:** a run never earns more than its replayed length plus 60 seconds (`PLAYTIME.SLACK_S`). A Candy Cascade level counts 15 seconds per move as its length.
- **Days:** time is split by UTC day, toward the day each gap ends in, and stored on the run as `activeByDay`.

So a game should send a checkpoint about every 10 seconds; without checkpoints, only a run shorter than 30 seconds earns playtime. **`GET /api/hub/playtime?wallet=0x…&day=YYYY-MM-DD`** returns saved runs and seconds per game for a day (today by default), and `GET /api/hub/config` returns the addresses, game numbers and live games.

### Playing on the hub

The site's side is `client/src/lib/gameSession.js` (session keys) and `client/src/lib/hub.js` (runs), used by the Moto Rush, Candy Cascade and Pixel Fighters pages.

**Game sessions.** On the Dashboard (or in the navbar), the player starts a session:

- **Opening:** the site makes a key in the browser, the key signs its consent (`SessionConsent`), and the wallet confirms one `openSession` with the top-up. That's the only popup.
- **While it lasts:** the key sends every start, checkpoint and save, so games play without popups. The game pages show "No popups · balance" in their header, with a switch to play with the wallet instead. When the key runs low, the header offers to add funds.
- **Ending:** the key closes the session itself and sends what's left back to the wallet. A session that ended on its own (it expired, or was revoked from another device) is swept back the next time the site opens.

**A run** (`useHubRun` in `lib/hub.js`):

1. `startRun`, then the game's `/session`.
2. Once the start is mined: a checkpoint right away, then one every 10 seconds, session key only (with the wallet, each one would be a popup). Each carries a hash of the game's state (Candy Cascade's moves; Moto Rush and Pixel Fighters send none yet).
3. When the game ends: `/verify`, a wait until the chain's clock passes `notBefore`, `submitRun`, then `/api/hub/saved`.

With the session key, the save shows as a small pill over the game. With the wallet, or on an error, it opens up with each step and Retry/Skip. The key's transactions go out one at a time, with nonces counted in the browser, so checkpoints never collide with a save. If the key can't cover a save, the wallet sends it.

**Recent plays** (Profile) merges two sources:

- the wallet's own transactions to the older games' contracts (from the explorer);
- the hub runs from `/api/hub/runs`.

The ETH-spent chart counts the wallet's game transactions and what it put on session keys.

**Pixel Fighters difficulty** is in the pixel-fighter repo, `shared/src/hairgames/replay.ts`: `CPU_DAMAGE` per CPU level, and `PLAYER_REACH`. With the Normal AI standing in for a player, the player wins roughly 90% on Easy, 60% on Normal and 30% on Hard; measure with `npx tsx scripts/hg-difficulty.ts`. Rebuild with `npm run build:hairgames`, then deploy the client and the backend together.

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

- Contracts: `npx hardhat test test/PixelFighter.test.cjs test/SessionRegistry.test.cjs test/HairGamesHubV2.test.cjs` in `contract/`, against a local Hardhat chain. Name the files: `npm test` with no files fails to load the test matchers.
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
| `VITE_GAME_HUB_CONTRACT` | HairGamesHubV2. Moto Rush, Candy Cascade and Pixel Fighters start and save their runs on it; without it they run as free play with progress in the browser |
| `VITE_CANDY_CASCADE_CONTRACT` | The retired CandyCascade contract, only to recognise old plays in Recent plays |
| `VITE_MOTO_RUSH_CONTRACT` | The retired MotoRush contract, only to recognise old plays in Recent plays |
| `VITE_VENOM_CONTRACT` | Venom NFT contract (`nft/`). Only Venom holders can ride the #27 Venom in Moto Rush; without it, the Venom stays locked for everyone |
| `VITE_SESSION_REGISTRY_CONTRACT` | HairGamesSessionRegistry, for game sessions (`client/src/lib/gameSession.js`): players approve a temporary key once and play without wallet popups. Without it, the navbar and Dashboard hide game sessions and games ask the wallet every time |
| `VITE_HEMI_RPC_URL` | Optional: another Hemi RPC for the site (default `https://rpc.hemi.network/rpc`), e.g. a local test chain |

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
| `HUB_ADDRESS`, `SESSION_REGISTRY_ADDRESS` | Optional: HairGamesHubV2 and the session registry (default: the mainnet contracts in `HUB` in `backend/config/constants.js`) |
| `HUB_START_BLOCK` | Optional: the block the hub indexer starts from on a fresh database (default `5803557`, the hub's deployment) |
| `HEMI_RPC_URL`, `HEMI_CHAIN_ID` | Optional: the chain the backend reads and signs for (default Hemi mainnet, `https://rpc.hemi.network/rpc`, `43111`). Used to test against a local Hardhat chain |

Contracts (`contract/.env`):

| Variable | Purpose |
| --- | --- |
| `DEPLOYER_PRIVATE_KEY` | Deploys contracts to Hemi (Hardhat also expects a valid key when running tests) |
| `SIGNER_ADDRESS` | Address of the backend's `SERVER_PRIVATE_KEY`, set as the trusted signer when deploying CandyCascade, MotoRush and HairGamesHubV2 |
| `MOTO_SUBMISSION_FEE_ETH` | Optional: the fee to save a Moto Rush level, in ETH (default `0.000008`) |
| `HUB_ADMIN_DELAY_SECONDS` | Optional: how long a new HairGamesHubV2 admin waits before accepting the role (default `86400`, one day) |

Never commit `.env` files. They are already in `.gitignore`.
