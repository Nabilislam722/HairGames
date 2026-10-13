import hre from 'hardhat';

// Deploys CandyCascade. Set in contract/.env:
//   SIGNER_ADDRESS            address of the backend's SERVER_PRIVATE_KEY (it signs verified results)
//   CANDY_SUBMISSION_FEE_ETH  optional fee per saved level, default 0 (changeable later with setSubmissionFee)
async function main() {
  const signer = process.env.SIGNER_ADDRESS;
  if (!signer || !hre.ethers.isAddress(signer)) {
    throw new Error('Set SIGNER_ADDRESS in contract/.env to the address of the backend SERVER_PRIVATE_KEY.');
  }
  const fee = hre.ethers.parseEther("0.000008");

  console.log(`Deploying CandyCascade (signer ${signer}, fee ${hre.ethers.formatEther(fee)} ETH)...`);
  const factory = await hre.ethers.getContractFactory('CandyCascade');
  const contract = await factory.deploy(signer, fee);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log(`CandyCascade deployed to: ${address}`);
  console.log('\nNext:');
  console.log(`  backend/.env   CANDY_CASCADE_CONTRACT=${address}`);
  console.log(`  client/.env    VITE_CANDY_CASCADE_CONTRACT=${address}`);
  console.log(`  verify         npx hardhat verify --network hemi ${address} ${signer} ${fee}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
