import hre from 'hardhat';

// Every game on the hub by the backend's gameId (listed in this order, so numbered 1, 2, 3...), with its fee per saved result in ETH.
// Every game costs the same to save. Starting a run and checkpoints are free apart from gas. Sized so
// 5,000 transactions in a week cost a player about $6 at most (game fees plus Hemi fees, at ETH $1,693).
const SUBMIT_FEE = '0.000004';
const GAMES = {
  moto_rush: SUBMIT_FEE,
  candy_cascade: SUBMIT_FEE,
  pixel_fighter: SUBMIT_FEE,
  proof_of_patience: SUBMIT_FEE,
  fruit_ninja: SUBMIT_FEE,
  default_legacy: SUBMIT_FEE,
  space_huggers: SUBMIT_FEE,
  racing_game: SUBMIT_FEE,
  fishing_party: SUBMIT_FEE,
};

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const signer = process.env.SIGNER_ADDRESS;
  if (!signer || !ethers.isAddress(signer)) {
    throw new Error('Set SIGNER_ADDRESS in contract/.env to the address of the backend SERVER_PRIVATE_KEY.');
  }
  // How long a new admin must wait before accepting the role (default 1 day).
  const adminDelay = Number(process.env.HUB_ADMIN_DELAY_SECONDS ?? 86400);

  console.log('Deploying HairGamesSessionRegistry...');
  const registry = await (await ethers.getContractFactory('HairGamesSessionRegistry')).deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`HairGamesSessionRegistry deployed to: ${registryAddress}`);

  console.log(`Deploying HairGamesHubV2 (admin ${deployer.address}, admin delay ${adminDelay}s, signer ${signer})...`);
  const hub = await (await ethers.getContractFactory('HairGamesHubV2')).deploy(deployer.address, adminDelay, registryAddress, signer);
  await hub.waitForDeployment();
  const hubAddress = await hub.getAddress();
  console.log(`HairGamesHubV2 deployed to: ${hubAddress}`);

  for (const [gameId, fee] of Object.entries(GAMES)) {
    const name = ethers.encodeBytes32String(gameId);
    await (await hub.addGame(name, 0, ethers.parseEther(fee))).wait();
    console.log(`  game ${await hub.gameOf(name)}: ${gameId} (${fee} ETH per saved result)`);
  }

  console.log('\nNext:');
  console.log(`  backend        GAME_HUB = "${hubAddress}", SESSION_REGISTRY = "${registryAddress}" in backend/config/constants.js`);
  console.log(`  client/.env    VITE_GAME_HUB_CONTRACT=${hubAddress}`);
  console.log(`                 VITE_SESSION_REGISTRY_CONTRACT=${registryAddress}`);
  console.log(`  verify         npx hardhat verify --network hemi ${registryAddress}`);
  console.log(`                 npx hardhat verify --network hemi ${hubAddress} ${deployer.address} ${adminDelay} ${registryAddress} ${signer}`);
  console.log('  admin          To hand the admin role to a safer wallet (e.g. a multisig): beginDefaultAdminTransfer(newAdmin),');
  console.log('                 then acceptDefaultAdminTransfer() from it after the delay. Grant it GAME_MANAGER_ROLE, PAUSER_ROLE');
  console.log('                 and TREASURER_ROLE too, then renounce them from the deployer.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
