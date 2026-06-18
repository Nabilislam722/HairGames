import hre from 'hardhat';

async function main() {
  const trustedSigner = "0x37cEf88183448E28dE0c11Fe0F224676c4fEa199"; 
  const submissionFee = hre.ethers.parseEther("0.00001");

  console.log("Deploying Needforhair...");

  const SpaceHuggers = await hre.ethers.getContractFactory("NeedForHair");
  const contract = await SpaceHuggers.deploy(trustedSigner, submissionFee);

  await contract.waitForDeployment();
  console.log(`Contract deployed to: ${await contract.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});