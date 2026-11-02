import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

export const hemiRpcUrl = "https://rpc.hemi.network/rpc";
const rpcRequest = new ethers.FetchRequest(hemiRpcUrl);
rpcRequest.setHeader("User-Agent", "HairGames/1.0 (game backend; +https://game.hairtoken.xyz)");
export const provider = new ethers.JsonRpcProvider(rpcRequest, 43111, { staticNetwork: true });

export const getServerWallet = () => {
  if (!process.env.SERVER_PRIVATE_KEY) {
    throw new Error("Server private key missing");
  }
  return new ethers.Wallet(process.env.SERVER_PRIVATE_KEY);
};