import { createContext, useContext } from "react";
import { useAccount, useBalance, useWriteContract } from "wagmi";
import { parseEther } from "viem";

export const GAME_CONTRACT = "0x61A86E5B2075d0E6ff659a6b29D1E367CAa6a8E5";
export const GAME_COST_ETH = "0.0000012";
const GAME_ABI = [
  { name: "playGame", type: "function", stateMutability: "payable", inputs: [] },
  { name: "submitGuess", type: "function", stateMutability: "payable", inputs: [{ name: "number", type: "uint16" }] },
];

const Web3Context = createContext();

export function Web3Provider({ children }) {
  const { address, isConnected } = useAccount();

  const { data: ethBalance } = useBalance({
    address,
  });

  const { writeContractAsync } = useWriteContract();

  async function playGame() {
    return writeContractAsync({
      address: GAME_CONTRACT,
      abi: GAME_ABI,
      functionName: "playGame",
      value: parseEther(GAME_COST_ETH),
    });
  }

  async function submitGuess(number) {
    return writeContractAsync({
      address: GAME_CONTRACT,
      abi: GAME_ABI,
      functionName: "submitGuess",
      args: [number],
      value: parseEther(GAME_COST_ETH),
    });
  }

  return (
    <Web3Context.Provider
      value={{
        address,
        isConnected,
        ethBalance,
        playGame,
        submitGuess,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  return useContext(Web3Context);
}
