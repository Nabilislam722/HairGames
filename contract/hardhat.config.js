import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

export default {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 }
    }
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