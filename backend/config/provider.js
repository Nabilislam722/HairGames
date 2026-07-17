import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

export const hemiRpcUrl = "https://rpc.hemi.network/rpc";
export const provider = new ethers.JsonRpcProvider(hemiRpcUrl);

export const getServerWallet = () => {
  if (!process.env.SERVER_PRIVATE_KEY) {
    throw new Error("Server private key missing");
  }
  return new ethers.Wallet(process.env.SERVER_PRIVATE_KEY);
};