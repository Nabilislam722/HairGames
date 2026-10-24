const hre = require("hardhat");
const {
  DEPLOYMENT_FILE, collectionConfigDoc, constructorArgs, decodeJsonUri, explorerUrl, launchProblems, readDeployment, readLaunchConfig,
  verifyOnExplorer, writeDeployment,
} = require("./venom-lib");

// Deploys the Venom NFT (contracts/Venom.sol) from venom/launch.config.json. Run in nft/:
//   npm run venom:dry-run     Hardhat's in-memory chain: deploys, mints #1 and shows its metadata
//   npm run deploy:venom      Hemi: saves venom/deployment.json and verifies the source
// DEPLOYER_PRIVATE_KEY in nft/.env deploys and owns the contract.
async function main() {
  const network = hre.network.name;
  const live = network !== "hardhat" && network !== "localhost";
  const config = readLaunchConfig();

  const problems = launchProblems(config);
  if (live) {
    if (problems.length) throw new Error(`Not ready to deploy:\n  - ${problems.join("\n  - ")}`);
    const existing = readDeployment(network);
    if (existing && process.env.VENOM_REDEPLOY !== "1") {
      throw new Error(`Venom is already deployed on ${network} at ${existing.address}. Set VENOM_REDEPLOY=1 to deploy another one anyway.`);
    }
  } else {
    console.log("Dry run on Hardhat's in-memory chain: nothing is saved.");
    for (const problem of problems) console.log(`  (before the real deploy) ${problem}`);
    console.log();
  }

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in nft/.env: the wallet that deploys and owns the contract.");
  const args = await constructorArgs(config, deployer.address);
  const [name, symbol, supply, , , , royaltyReceiver, royaltyBps] = args;
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log(`Deploying ${name} (${symbol}) on ${network}`);
  console.log(`  supply      ${supply}, minted by the owner`);
  console.log(`  image       ${config.image}`);
  console.log(`  royalties   ${royaltyBps / 100}% to ${royaltyReceiver}`);
  console.log(`  owner       ${deployer.address} (${hre.ethers.formatEther(balance)} ETH)`);

  const venom = await (await hre.ethers.getContractFactory("Venom")).deploy(...args);
  const receipt = await venom.deploymentTransaction().wait();
  const address = await venom.getAddress();
  console.log(`\nVenom deployed to ${address} in block ${receipt.blockNumber}`);

  if (!live) {
    // Show exactly what wallets and marketplaces will read for a token.
    await (await venom.ownerMint(deployer.address, 1)).wait();
    console.log("\nToken #1 as wallets and marketplaces will see it:");
    console.log(JSON.stringify(decodeJsonUri(await venom.tokenURI(1)), null, 2));
    console.log("\nThe collection:");
    console.log(JSON.stringify(decodeJsonUri(await venom.contractURI()), null, 2));
    return;
  }

  const deployment = {
    address,
    deployBlock: receipt.blockNumber,
    txHash: receipt.hash,
    owner: deployer.address,
    deployedAt: new Date().toISOString(),
    constructorArgs: args.map(String),
  };
  writeDeployment(network, deployment);
  console.log(`Saved to ${DEPLOYMENT_FILE}`);

  // The explorer needs the contract a few blocks deep before it can verify the source.
  console.log("\nWaiting for 5 confirmations, then verifying the source on the explorer...");
  await venom.deploymentTransaction().wait(5);
  try {
    console.log(`Source ${await verifyOnExplorer(hre, address)}.`);
  } catch (err) {
    console.warn(`Verification didn't go through (${err.message}). Retry with: npx hardhat venom:verify --network ${network}`);
  }

  console.log(`\n${explorerUrl(hre, address)}`);
  console.log("\nNext, in nft/ (venom/README.md has the details):");
  console.log(`  1. Mint all ${supply} to yourself:   npx hardhat venom:mint --network ${network}`);
  console.log("  2. Add this to the collectionconfigs collection in MongoDB (npx hardhat venom:collection prints it again):");
  console.log(JSON.stringify(collectionConfigDoc(config, deployment), null, 2).replace(/^/gm, "     "));
  console.log(`  3. In client/.env:   VITE_VENOM_CONTRACT=${address}`);
  console.log(`  4. In Mintora:       yarn list ${address}`);
  console.log(`  5. List them:        npx hardhat venom:list <price in ETH> --network ${network}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
