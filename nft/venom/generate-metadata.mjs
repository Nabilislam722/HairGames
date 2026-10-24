// Builds the Venom NFT metadata from launch.config.json. The contract stores it and serves it
// on-chain (tokenURI and contractURI), so none of it gets uploaded: the deploy script calls
// buildMetadata(), and running this file writes a preview of what wallets and marketplaces will show:
//   preview/token-1.json      token #1 (every token is the same apart from its number)
//   preview/collection.json   the collection
// It checks the bike stats against the game code first, so the NFT can't promise numbers the bike
// doesn't have.
//   npm run venom:preview   (in nft/)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const GAME_JS = join(here, "..", "..", "client", "public", "moto-rush", "js");

// The bike as the game defines it: BIKES in sim.js and its engine voice (ENGINES.op) in audio.js.
async function gameBike(name) {
  const sim = await readFile(join(GAME_JS, "sim.js"), "utf8");
  const entry = sim.match(new RegExp(`\\{ name: '${name}'[^}]*\\}`))?.[0];
  if (!entry) throw new Error(`${name} not found in sim.js`);
  const num = (key) => Number(entry.match(new RegExp(`\\b${key}: ([\\d.]+)`))[1]);
  const [speed, power, handling] = entry.match(/stats: \[([^\]]+)\]/)[1].split(",").map(Number);
  const audio = await readFile(join(GAME_JS, "audio.js"), "utf8");
  const gears = Number(audio.match(/\bop: \{[\s\S]*?gears: (\d+)/)[1]);
  return {
    gears,
    ratings: { speed, power, handling },
    physics: { speed: num("speed"), torque: num("torque"), lean: num("lean"), spin: num("spin") },
  };
}

async function checkAgainstGame(bike) {
  const game = await gameBike(bike.name);
  const drift = [
    ["gears", bike.gears, game.gears],
    ...Object.keys(game.ratings).map((k) => [`ratings.${k}`, bike.ratings[k], game.ratings[k]]),
    ...Object.keys(game.physics).map((k) => [`physics.${k}`, bike.physics[k], game.physics[k]]),
  ].filter(([, ours, theirs]) => ours !== theirs);
  if (drift.length) {
    throw new Error(drift.map(([key, ours, theirs]) => `bike.${key} is ${ours} in launch.config.json but ${theirs} in the game`).join("\n"));
  }
}

const gameName = (gameId) => gameId.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

/**
 * The metadata the contract serves.
 *  - token: the fields every token shares. The contract adds "name" ("Venom #7") and an Edition
 *    attribute with the token's number.
 *  - collection: the collection-level document. The royalty fields appear once there's a recipient.
 */
export async function buildMetadata(config, { royaltyRecipient = config.royalty?.recipient } = {}) {
  const { bike } = config;
  await checkAgainstGame(bike);

  const token = {
    description: config.description,
    image: config.image,
    external_url: config.externalUrl,
    attributes: [
      { trait_type: "Bike", value: bike.name },
      { trait_type: "Number", value: bike.number },
      { trait_type: "Class", value: bike.class },
      { trait_type: "Engine", value: bike.engine },
      { trait_type: "Gears", display_type: "number", value: bike.gears },
      { trait_type: "Speed", display_type: "number", value: bike.ratings.speed },
      { trait_type: "Power", display_type: "number", value: bike.ratings.power },
      { trait_type: "Handling", display_type: "number", value: bike.ratings.handling },
      { trait_type: "Motor Speed", display_type: "number", value: bike.physics.speed },
      { trait_type: "Torque", display_type: "number", value: bike.physics.torque },
      { trait_type: "Lean", display_type: "number", value: bike.physics.lean },
      { trait_type: "Flip Spin", display_type: "number", value: bike.physics.spin },
      ...Object.entries(config.hairgames.gameBonus).map(([gameId, value]) => ({ trait_type: `${gameName(gameId)} HP Bonus`, value: `+${value}x` })),
    ],
  };

  const collection = {
    name: config.name,
    description: config.description,
    image: config.image,
    external_link: config.externalUrl,
    ...(royaltyRecipient && { seller_fee_basis_points: config.royalty.bps, fee_recipient: royaltyRecipient }),
  };

  return { token, collection };
}

// What tokenURI(id) returns, decoded. The contract builds the same thing on-chain.
export function tokenJson(config, token, id) {
  return {
    name: `${config.name} #${id}`,
    ...token,
    attributes: [...token.attributes, { trait_type: "Edition", display_type: "number", value: id, max_value: config.supply }],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = JSON.parse(await readFile(join(here, "launch.config.json"), "utf8"));
  try {
    const { token, collection } = await buildMetadata(config);
    const out = join(here, "preview");
    await mkdir(out, { recursive: true });
    await writeFile(join(out, "token-1.json"), `${JSON.stringify(tokenJson(config, token, 1), null, 2)}\n`);
    await writeFile(join(out, "collection.json"), `${JSON.stringify(collection, null, 2)}\n`);
    console.log(`Wrote the preview to ${out}`);
    if (config.image.includes("PASTE_")) console.warn("The image is still a placeholder: upload art/venom.png to IPFS and put its link in launch.config.json.");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
