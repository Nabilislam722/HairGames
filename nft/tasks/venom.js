const { task } = require("hardhat/config");
const {
  MINTORA_ABI, collectionConfigDoc, decodeJsonUri, explorerUrl, metadataPieces, readDeployment, readLaunchConfig, verifyOnExplorer,
} = require("../scripts/venom-lib");

// Admin commands for the deployed Venom NFT. The address comes from venom/deployment.json, and the
// owner key (DEPLOYER_PRIVATE_KEY in nft/.env) signs. Run in nft/, adding --network hemi to each:
//   npx hardhat venom:status                  supply, owner, royalties, metadata, Mintora listings
//   npx hardhat venom:mint [wallet] [amount]  mint to a wallet (default: everything left, to you)
//   npx hardhat venom:list <eth>              list your Venoms on Mintora, or reprice them
//   npx hardhat venom:unlist                  take your Venoms off Mintora
//   npx hardhat venom:metadata                push launch.config.json changes to the contract
//   npx hardhat venom:freeze                  lock the metadata for good
//   npx hardhat venom:verify                  verify the source on the explorer
//   npx hardhat venom:collection              the CollectionConfig document for MongoDB
// --from and --to limit venom:list and venom:unlist to a range of token IDs.

async function deployed(hre) {
  const deployment = readDeployment(hre.network.name);
  if (!deployment) throw new Error(`Venom isn't deployed on ${hre.network.name} yet (venom/deployment.json). Run npm run deploy:venom first.`);
  const [signer] = await hre.ethers.getSigners();
  return { deployment, signer, venom: await hre.ethers.getContractAt("Venom", deployment.address, signer) };
}

async function send(label, txPromise) {
  const tx = await txPromise;
  await tx.wait();
  console.log(`${label}  (${tx.hash})`);
}

const marketplaceOf = (hre, override, signer) => new hre.ethers.Contract(override ?? readLaunchConfig().mintora.marketplace, MINTORA_ABI, signer);
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

// Token IDs from..to (default: every minted one) that `wallet` owns.
async function ownedIds(venom, wallet, from, to) {
  const last = to ? Number(to) : Number(await venom.totalSupply());
  const ids = [];
  for (let id = Number(from ?? 1); id <= last; id++) if (same(await venom.ownerOf(id), wallet)) ids.push(id);
  return ids;
}

task("venom:status", "Shows the Venom contract's supply, metadata and Mintora listings")
  .addOptionalParam("marketplace", "Marketplace contract (default: mintora.marketplace in launch.config.json)")
  .setAction(async ({ marketplace }, hre) => {
    const { venom, deployment, signer } = await deployed(hre);
    const [minted, supply, frozen, owner] = await Promise.all([venom.totalSupply(), venom.maxSupply(), venom.metadataFrozen(), venom.owner()]);
    const [royaltyTo, royalty] = await venom.royaltyInfo(1, 10_000n);
    const collection = decodeJsonUri(await venom.contractURI());
    console.log(`Venom ${deployment.address}`);
    console.log(`  minted      ${minted} / ${supply}`);
    console.log(`  image       ${collection.image}`);
    console.log(`  metadata    ${frozen ? "frozen" : "changeable"}`);
    console.log(`  royalties   ${Number(royalty) / 100}% to ${royaltyTo}`);
    console.log(`  owner       ${owner}`);

    const market = marketplaceOf(hre, marketplace, signer);
    const prices = [];
    for (let id = 1; id <= Number(minted); id++) {
      const listing = await market.getListing(deployment.address, id).catch(() => null);
      if (listing && listing.price > 0n && same(listing.seller, await venom.ownerOf(id))) prices.push(listing.price);
    }
    const range = prices.length ? ` at ${hre.ethers.formatEther(prices.reduce((a, b) => (b < a ? b : a)))}–${hre.ethers.formatEther(prices.reduce((a, b) => (b > a ? b : a)))} ETH` : "";
    console.log(`  on Mintora  ${prices.length} listed${range}`);
    console.log(`  ${explorerUrl(hre, deployment.address)}`);
  });

task("venom:mint", "Mints Venoms to a wallet (default: everything left, to you)")
  .addOptionalPositionalParam("to", "Receiving wallet (default: you)")
  .addOptionalPositionalParam("amount", "How many (default: all that are left)")
  .setAction(async ({ to, amount }, hre) => {
    const { venom, signer } = await deployed(hre);
    const receiver = to ?? signer.address;
    if (!hre.ethers.isAddress(receiver)) throw new Error(`${receiver} isn't a wallet address.`);
    let left = amount ? Number(amount) : Number((await venom.maxSupply()) - (await venom.totalSupply()));
    if (left <= 0) return console.log("All Venoms are minted already.");
    while (left > 0) {
      const batch = Math.min(left, 25); // keeps each transaction a modest size
      const first = Number(await venom.totalSupply()) + 1;
      await send(`Minted #${first}–#${first + batch - 1} to ${receiver}`, venom.ownerMint(receiver, batch));
      left -= batch;
    }
  });

task("venom:list", "Lists your Venoms for sale on Mintora, or reprices the ones already listed")
  .addPositionalParam("price", "Price per token in ETH, like 0.01")
  .addOptionalParam("from", "First token ID", "1")
  .addOptionalParam("to", "Last token ID (default: the last minted)")
  .addOptionalParam("marketplace", "Marketplace contract (default: mintora.marketplace in launch.config.json)")
  .setAction(async ({ price, from, to, marketplace }, hre) => {
    const { venom, deployment, signer } = await deployed(hre);
    const market = marketplaceOf(hre, marketplace, signer);
    const marketAddress = await market.getAddress();
    const wei = hre.ethers.parseEther(price);
    if (wei === 0n) throw new Error("The price has to be above 0.");

    if (!(await venom.isApprovedForAll(signer.address, marketAddress))) {
      await send("Allowed the marketplace to hand sold Venoms to their buyers", venom.setApprovalForAll(marketAddress, true));
    }
    const ids = await ownedIds(venom, signer.address, from, to);
    let listed = 0, repriced = 0, unchanged = 0;
    for (const id of ids) {
      const listing = await market.getListing(deployment.address, id);
      const mine = listing.price > 0n && same(listing.seller, signer.address);
      if (mine && listing.price === wei) unchanged++;
      else if (mine) await send(`#${id} repriced to ${price} ETH`, market.updateListing(deployment.address, id, wei)).then(() => repriced++);
      else await send(`#${id} listed at ${price} ETH`, market.listItem(deployment.address, id, wei)).then(() => listed++);
    }
    console.log(`\nListed ${listed}, repriced ${repriced}, already at ${price} ETH: ${unchanged}. Tokens you don't hold are left alone.`);
  });

task("venom:unlist", "Takes your Venoms off Mintora")
  .addOptionalParam("from", "First token ID", "1")
  .addOptionalParam("to", "Last token ID (default: the last minted)")
  .addOptionalParam("marketplace", "Marketplace contract (default: mintora.marketplace in launch.config.json)")
  .setAction(async ({ from, to, marketplace }, hre) => {
    const { venom, deployment, signer } = await deployed(hre);
    const market = marketplaceOf(hre, marketplace, signer);
    let removed = 0;
    for (const id of await ownedIds(venom, signer.address, from, to)) {
      const listing = await market.getListing(deployment.address, id);
      if (listing.price > 0n && same(listing.seller, signer.address)) {
        await send(`#${id} unlisted`, market.cancelListing(deployment.address, id));
        removed++;
      }
    }
    console.log(`\nUnlisted ${removed}.`);
  });

task("venom:metadata", "Pushes launch.config.json (image, description, stats) to the contract").setAction(async (_, hre) => {
  const { venom } = await deployed(hre);
  const config = readLaunchConfig();
  const [royaltyTo] = await venom.royaltyInfo(1, 10_000n);
  const { tokenFields, attributes, contractJson } = await metadataPieces(config, config.royalty?.recipient || royaltyTo);
  await send("Metadata updated; marketplaces are told to refresh", venom.setMetadata(tokenFields, attributes, contractJson));
});

task("venom:freeze", "Locks the metadata for good").setAction(async (_, hre) => {
  const { venom } = await deployed(hre);
  await send("Metadata frozen", venom.freezeMetadata());
});

task("venom:verify", "Verifies the Venom source on the block explorer").setAction(async (_, hre) => {
  const { deployment } = await deployed(hre);
  console.log(`Source ${await verifyOnExplorer(hre, deployment.address)}: ${explorerUrl(hre, deployment.address)}?tab=contract`);
});

task("venom:collection", "Prints the CollectionConfig document for MongoDB").setAction(async (_, hre) => {
  const { deployment } = await deployed(hre);
  console.log(JSON.stringify(collectionConfigDoc(readLaunchConfig(), deployment), null, 2));
});
