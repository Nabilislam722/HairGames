import hre from 'hardhat';
async function main() {
  const signer = process.env.SIGNER_ADDRESS;
  if (!signer || !hre.ethers.isAddress(signer)) {
    throw new Error('Set SIGNER_ADDRESS in contract/.env to the address of the backend SERVER_PRIVATE_KEY.');
  }
  const fee = hre.ethers.parseEther(process.env.MOTO_SUBMISSION_FEE_ETH || '0.000008');

  console.log(`Deploying MotoRush (signer ${signer}, fee ${hre.ethers.formatEther(fee)} ETH)...`);
  const factory = await hre.ethers.getContractFactory('MotoRush');
  const contract = await factory.deploy(signer, fee);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log(`MotoRush deployed to: ${address}`);
  console.log('\nNext:');
  console.log(`  backend/.env   MOTO_RUSH_CONTRACT=${address}`);
  console.log(`  client/.env    VITE_MOTO_RUSH_CONTRACT=${address}`);
  console.log(`  verify         npx hardhat verify --network hemi ${address} ${signer} ${fee}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
