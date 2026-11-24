import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

export default {
  // The multi-compiler form, because Hardhat ignores `overrides` next to a single `version`.
  solidity: {
    compilers: [{
      version: "0.8.24",
      settings: {
        evmVersion: "cancun",
        optimizer: { enabled: true, runs: 200 }
      }
    }],
    // The hub and registry use the latest stable compiler, optimized for cheap calls over a small deployment.
    // Measured: the legacy pipeline with 1,000,000 runs makes the cheapest checkpoint, the call sent most,
    // and the cheapest hour of play; via-IR made checkpoints dearer. evmVersion stays "cancun", the newest
    // level Hemi is confirmed to run (newer compilers default to later EVM versions). Every other contract
    // keeps the settings above, so the contracts already deployed still match their verified bytecode.
    overrides: Object.fromEntries(["contracts/HairGamesHubV2.sol", "contracts/SessionRegistry.sol"].map((file) => [file, {
      version: "0.8.39",
      settings: { evmVersion: "cancun", optimizer: { enabled: true, runs: 1000000 } }
    }]))
  },
  networks: {
    hemi: {
      url: "https://rpc.hemi.network/rpc",
      chainId: 43111,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY]
    }
  },
  etherscan: {
    apiKey: {
      'hemi': 'empty'
    },
    customChains: [
      {
        network: "hemi",
        chainId: 43111,
        urls: {
          apiURL: "https://explorer.hemi.xyz/api",
          browserURL: "https://explorer.hemi.xyz"
        }
      }
    ]
  }
};