# HairGames NFTs

Everything for HairGames' own NFT collections lives here: contracts, deploy scripts, admin commands, tests and launch kits. It's a Hardhat project of its own, separate from the game contracts in `../contract`, with its own dependencies and `.env`.

| Collection | Perk | Launch kit |
| --- | --- | --- |
| Venom, the #27 OP bike from Moto Rush | +0.2x Hair Points multiplier in Moto Rush, on top of the regular multiplier | [`venom/`](venom/) |

## Layout

```
nft/
├── hardhat.config.js        Hemi network, explorer verification, loads tasks/
├── package.json             npm scripts and dependencies
├── .env.example             copy to .env: DEPLOYER_PRIVATE_KEY
├── contracts/
│   ├── Venom.sol            the Venom NFT (ERC-721)
│   └── mocks/               test-only, never deployed: MockMarketplace (Mintora stand-in),
│                            MockERC721 (collections for backend NFT indexer tests)
├── scripts/
│   ├── deploy-venom.js      deploys Venom from venom/launch.config.json
│   └── venom-lib.js         shared by the deploy script and the tasks
├── tasks/venom.js           admin commands: npx hardhat venom:<command>
├── test/Venom.test.js
└── venom/                   launch kit: art, config, metadata builder, deployment record
```

A new collection gets the same pieces: a contract in `contracts/`, a deploy script, tasks, tests, and a launch-kit folder next to `venom/`.

## Commands

Run these in `nft/` after `npm install`:

| Command | What it does |
| --- | --- |
| `npm test` | Runs the contract tests |
| `npm run venom:preview` | Shows the metadata wallets and marketplaces will see (`venom/preview/`) |
| `npm run venom:dry-run` | Deploys Venom on a throwaway local chain and prints a token's on-chain metadata |
| `npm run deploy:venom` | Deploys Venom on Hemi |
| `npx hardhat venom:status --network hemi` | Shows the deployed contract and its Mintora listings. `npx hardhat help` lists all the `venom:` commands: mint, list, unlist, metadata, freeze… |

`venom/README.md` walks through a launch step by step.

## How an NFT plugs into HairGames

A collection does something in HairGames once it's listed in the `CollectionConfig` collection in MongoDB. The NFT indexer then tracks who holds it:

- `multiplier` raises the player's regular Hair Points multiplier in every game: +`multiplier - 1` per NFT, capped at 1.5x.
- `gameBonus` adds to the multiplier in one game only, for example `{ "moto_rush": 0.2 }`. This goes past the cap and counts once per collection.
- A newly received NFT counts after a 24-hour hold period.

Details are in [docs/development.md](../docs/development.md#nft-multiplier-indexer).
