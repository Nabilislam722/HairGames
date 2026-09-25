import hre from 'hardhat';

async function main() {
  const owner = "0x37cEf88183448E28dE0c11Fe0F224676c4fEa199"; 
  const submissionFee = hre.ethers.parseEther("0.00001");

  console.log("Deploying...");

  const contract = await hre.ethers.getContractFactory("ProofOfPatience");
  const status = await contract.deploy(owner, submissionFee);

  await status.waitForDeployment();
  console.log(`Contract deployed to: ${await status.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});