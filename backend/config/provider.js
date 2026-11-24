import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

// Hemi mainnet unless HEMI_RPC_URL / HEMI_CHAIN_ID point elsewhere (e.g. a local chain in tests).
export const hemiRpcUrl = process.env.HEMI_RPC_URL || "https://rpc.hemi.network/rpc";
export const hemiChainId = BigInt(process.env.HEMI_CHAIN_ID || 43111);
const rpcRequest = new ethers.FetchRequest(hemiRpcUrl);
rpcRequest.setHeader("User-Agent", "HairGames/1.0 (game backend; +https://game.hairtoken.xyz)");
export const provider = new ethers.JsonRpcProvider(rpcRequest, hemiChainId, { staticNetwork: true });

export const getServerWallet = () => {
  if (!process.env.SERVER_PRIVATE_KEY) {
    throw new Error("Server private key missing");
  }
  return new ethers.Wallet(process.env.SERVER_PRIVATE_KEY);
};