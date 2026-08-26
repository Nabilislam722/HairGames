import hre from 'hardhat';

async function main() {
  const owner = "0xd3C008B48Db16c16309717d592C270310561c4fA"; 
  const submissionFee = hre.ethers.parseEther("0.000012");

  console.log("Deploying...");

  const contract = await hre.ethers.getContractFactory("BestGameVoting");
  const status = await contract.deploy(owner);

  await status.waitForDeployment();
  console.log(`Contract deployed to: ${await status.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});