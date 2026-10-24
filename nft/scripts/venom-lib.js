// Shared by scripts/deploy-venom.js, tasks/venom.js and the tests: the launch config (what you
// edit), the deployment record (what a deploy writes) and the contract arguments built from them.
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const VENOM_DIR = join(__dirname, "..", "venom");
const CONFIG_FILE = join(VENOM_DIR, "launch.config.json");
const DEPLOYMENT_FILE = join(VENOM_DIR, "deployment.json");

// The Mintora marketplace calls the listing commands use (Mintora/packages/marketcontract).
const MINTORA_ABI = [
  "function listItem(address nft, uint256 tokenId, uint256 price)",
  "function updateListing(address nft, uint256 tokenId, uint256 newPrice)",
  "function cancelListing(address nft, uint256 tokenId)",
  "function getListing(address nft, uint256 tokenId) view returns (tuple(address seller, uint256 price))",
];

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const isAddress = (value) => /^0x[0-9a-fA-F]{40}$/.test(value);
// ipfs://<CID>[/path] with a real CID (Qm… or bafy…), or any https link.
const IMAGE_LINK = /^(ipfs:\/\/(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})(\/\S*)?|https:\/\/\S+)$/;

const readLaunchConfig = () => readJson(CONFIG_FILE);

// deployment.json holds one record per network, e.g. { "hemi": { address, deployBlock, ... } }.
const readDeployment = (network) => (existsSync(DEPLOYMENT_FILE) ? readJson(DEPLOYMENT_FILE)[network] : undefined);
function writeDeployment(network, record) {
  const all = existsSync(DEPLOYMENT_FILE) ? readJson(DEPLOYMENT_FILE) : {};
  writeFileSync(DEPLOYMENT_FILE, `${JSON.stringify({ ...all, [network]: record }, null, 2)}\n`);
}

// Everything that has to be right before a real deploy, as messages saying how to fix it.
function launchProblems(config) {
  const problems = [];
  if (!IMAGE_LINK.test(config.image ?? "")) {
    problems.push('image isn\'t a real link yet: upload art/venom.png to IPFS and put "ipfs://<its CID>" in launch.config.json.');
  }
  if (/["\\]/.test(config.name)) problems.push("name can't contain quotes or backslashes.");
  if (config.royalty?.recipient && !isAddress(config.royalty.recipient)) problems.push("royalty.recipient isn't a wallet address.");
  const bps = config.royalty?.bps;
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) problems.push("royalty.bps should be a whole number of basis points, like 500 for 5%.");
  return problems;
}

// The metadata as the three JSON pieces Venom.sol stores: the shared token fields, the attributes
// (comma-separated objects) and the collection document. JSON.stringify does all the escaping.
async function metadataPieces(config, royaltyRecipient) {
  const { buildMetadata } = await import(pathToFileURL(join(VENOM_DIR, "generate-metadata.mjs")).href);
  const { token, collection } = await buildMetadata(config, { royaltyRecipient });
  const { attributes, ...fields } = token;
  return {
    tokenFields: Object.entries(fields).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`).join(","),
    attributes: attributes.map((a) => JSON.stringify(a)).join(","),
    contractJson: JSON.stringify(collection),
  };
}

// Venom's constructor arguments, in order. Royalties go to the deployer unless the config names someone.
async function constructorArgs(config, deployer) {
  const royaltyRecipient = config.royalty?.recipient || deployer;
  const { tokenFields, attributes, contractJson } = await metadataPieces(config, royaltyRecipient);
  return [config.name, config.symbol, config.supply, tokenFields, attributes, contractJson, royaltyRecipient, config.royalty?.bps ?? 0];
}

// tokenURI() and contractURI() return data:application/json;base64,… — this reads them back.
const decodeJsonUri = (uri) => JSON.parse(Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64").toString("utf8"));

// An https link to the image, for places that can't open ipfs:// links themselves.
const imageHttpUrl = (image) => image.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/");

// The CollectionConfig document that makes HairGames index Venom holders and apply the bonus.
function collectionConfigDoc(config, deployment) {
  return {
    address: deployment.address.toLowerCase(),
    name: config.name,
    multiplier: config.hairgames.multiplier,
    gameBonus: config.hairgames.gameBonus,
    holdHours: 0,
    startBlock: deployment.deployBlock,
    imageUrl: imageHttpUrl(config.image),
    emoji: config.hairgames.emoji,
    color: config.hairgames.color,
  };
}

// The block explorer page for `address`, from the network's entry in hardhat.config.js.
function explorerUrl(hre, address) {
  const chain = hre.config.etherscan?.customChains?.find((c) => c.network === hre.network.name);
  return chain ? `${chain.urls.browserURL}/address/${address}` : address;
}

// Verifies the contract's source on the network's Blockscout explorer through its file-upload API.
// hardhat-verify uses the form API instead, which Cloudflare blocks on explorer.hemi.xyz (403).
async function verifyOnExplorer(hre, address) {
  const chain = hre.config.etherscan?.customChains?.find((c) => c.network === hre.network.name);
  if (!chain) throw new Error(`no explorer is configured for ${hre.network.name}`);
  const base = chain.urls.browserURL.replace(/\/$/, "");
  const isVerified = async () => (await (await fetch(`${base}/api/v2/smart-contracts/${address}`)).json()).is_verified === true;
  if (await isVerified()) return "already verified";

  const buildInfo = await hre.artifacts.getBuildInfo("contracts/Venom.sol:Venom");
  const form = new FormData();
  form.append("compiler_version", `v${buildInfo.solcLongVersion}`);
  form.append("contract_name", "Venom");
  form.append("license_type", "mit");
  form.append("autodetect_constructor_args", "true");
  form.append("files[0]", new Blob([JSON.stringify(buildInfo.input)], { type: "application/json" }), "Venom.standard-input.json");
  const res = await fetch(`${base}/api/v2/smart-contracts/${address}/verification/via/standard-input`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`the explorer answered ${res.status}`);

  // The explorer checks the source in the background.
  for (let i = 0; i < 24; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    if (await isVerified()) return "verified";
  }
  throw new Error("the explorer took the source but hasn't confirmed it yet; check the Contract tab in a minute");
}

module.exports = {
  DEPLOYMENT_FILE,
  MINTORA_ABI,
  readLaunchConfig,
  readDeployment,
  writeDeployment,
  launchProblems,
  metadataPieces,
  constructorArgs,
  decodeJsonUri,
  collectionConfigDoc,
  explorerUrl,
  verifyOnExplorer,
};
