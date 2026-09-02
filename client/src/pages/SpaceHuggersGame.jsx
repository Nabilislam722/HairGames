import { useEffect, useState, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from "viem";

const GAME_COST_ETH = 0.00001;
const SPACE_HUGGERS_CONTRACT_ADDRESS = "0x895087a3b85C38DAB365495A5E1EA518459A9750";
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";
const SPACE_HUGGERS_ABI = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "level", "type": "uint256" },
      { "internalType": "uint256", "name": "kills", "type": "uint256" },
      { "internalType": "uint256", "name": "points", "type": "uint256" },
      { "internalType": "uint256", "name": "nonce", "type": "uint256" },
      { "internalType": "bytes", "name": "signature", "type": "bytes" }
    ],
    "name": "submitLevelScore",
    "outputs": [],
    "stateMutability": "external",
    "type": "function"
  }
];

export default function SpaceHuggersGame() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState(null);
  const [currentLevelData, setCurrentLevelData] = useState(null);
  const [activeTxHash, setActiveTxHash] = useState(undefined);

  const iframeRef = useRef(null);
  const hasSubmittedRef = useRef(false);
  
  // ◄ NEW: Keep track of previous level's total kills to calculate the delta
  const previousTotalKillsRef = useRef(0);

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: activeTxHash,
  });

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    if (isConfirmed && activeTxHash) {
      console.log("Transaction successfully written to block matrix!");

      if (iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: "WEB3_TX_SUCCESS" }, "*");
      }

      setTxLoading(false);
      setCurrentLevelData(null);
      hasSubmittedRef.current = false;
      setActiveTxHash(undefined);
    }
  }, [isConfirmed, activeTxHash]);

  useEffect(() => {
    const handleMessage = async (event) => {
      if (event.data && event.data.type === "SPACE_HUGGERS_LEVEL_COMPLETE") {
        let { level, livesRemaining, kills: incomingTotalKills } = event.data;

        if (!isConnected || !address) {
          console.error("Wallet not connected. Cannot submit level score data.");
          return;
        }

        if (hasSubmittedRef.current) return;
        hasSubmittedRef.current = true;

        // If the game resets to level 1, or kills drop (new session), reset the tracker
        if (level === 1 || incomingTotalKills < previousTotalKillsRef.current) {
            previousTotalKillsRef.current = 0;
        }
        
        // Calculate ONLY the kills achieved in this specific level
        const currentLevelKills = incomingTotalKills - previousTotalKillsRef.current;
        
        // Save the new total for the next level's calculation
        previousTotalKillsRef.current = incomingTotalKills;
        // ==========================================

        // Initialize state with DELTA kills
        setCurrentLevelData({ level, livesRemaining, kills: currentLevelKills, score: null });
        setTxLoading(true);
        setTxError(null);

        try {
          console.log(`Submitting stats for Level ${level} to the secure backend authority...`);

          const verifyRes = await fetch(`${API_BASE}/api/points/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gameId: "space_huggers",
              wallet: address,
              level: level,
              kills: currentLevelKills, // ◄ Using Delta here
              livesRemaining: livesRemaining
            }),
          });

          if (!verifyRes.ok) throw new Error("Failed anti-cheat verification script check.");
          const { nonce, signature, points } = await verifyRes.json();

          setCurrentLevelData(prev => ({ ...prev, score: points }));
          console.log("Backend verification approved. Requesting on-chain transaction signature...");

          const txHash = await writeContractAsync({
            address: SPACE_HUGGERS_CONTRACT_ADDRESS,
            abi: SPACE_HUGGERS_ABI,
            functionName: 'submitLevelScore',
            args: [BigInt(level), BigInt(currentLevelKills), BigInt(points), BigInt(nonce), signature], // ◄ Using Delta here
            value: parseEther(String(GAME_COST_ETH))
          });

          setActiveTxHash(txHash);

          const res = await fetch(`${API_BASE}/api/points/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wallet: address,
              txHash: txHash,
              score: points,
              gameId: "space_huggers"
            }),
          });

          if (!res.ok) throw new Error("Failed to write updated score payload data to API.");
          console.log("On-chain points ledger updated successfully. Waiting for block confirmation...");

        } catch (err) {
          console.error('Score submit error execution:', err);
          setTxError(err?.message ?? 'Unknown submission error');
          setTxLoading(false);
          hasSubmittedRef.current = false;
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isConnected, address, writeContractAsync]);

  const handleManualBypassRetry = () => {
    hasSubmittedRef.current = false;
    setTxLoading(false);
    setTxError(null);
    setActiveTxHash(undefined);
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: "WEB3_TX_SUCCESS" }, "*");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background relative">
      {txLoading && (
        <div className="absolute inset-0 bg-neutral-950/85 backdrop-blur-md z-50 flex flex-col items-center justify-center text-white p-4">
          <Loader2 className="h-12 w-12 animate-spin text-cyan-500 mb-4" />
          <h2 className="text-2xl font-bold tracking-wider text-cyan-400 animate-pulse font-mono">
            SECURED ANTI-CHEAT VERIFICATION
          </h2>
          {currentLevelData && (
            <p className="text-neutral-400 mt-2 text-sm font-mono bg-white/5 border border-white/10 px-4 py-1.5 rounded">
              Level: {currentLevelData.level} | Kills: {currentLevelData.kills} | Points: {currentLevelData.score !== null ? currentLevelData.score : "Calculating..."}
            </p>
          )}
          <p className="text-xs text-neutral-500 mt-4 font-mono animate-bounce">
            {isConfirming
              ? "Transaction submitted! Waiting for Hemi network block confirmation..."
              : "Please approve and sign the wallet confirmation prompt..."}
          </p>
        </div>
      )}

      {txError && (
        <div className="absolute inset-0 bg-neutral-950/90 backdrop-blur-md z-50 flex flex-col items-center justify-center text-white p-6 max-w-xl mx-auto text-center">
          <AlertCircle className="h-14 w-14 text-rose-500 mb-4" />
          <h2 className="text-xl font-bold tracking-wider text-rose-400 font-mono uppercase">
            Transaction Execution Failed
          </h2>
          <p className="text-sm text-neutral-400 mt-2 bg-rose-500/10 border border-rose-500/20 px-4 py-2 rounded font-mono break-all">
            {txError}
          </p>
          <div className="flex gap-4 mt-6">
            <Button
              variant="destructive"
              onClick={handleManualBypassRetry}
              className="font-mono text-xs uppercase tracking-wider"
            >
              Skip & Continue Game Loop
            </Button>
            <Button
              variant="outline"
              onClick={(() => {
                hasSubmittedRef.current = false;
                setTxError(null);
              })}
              className="font-mono text-xs uppercase tracking-wider"
            >
              Retry Submission
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground font-mono">
            Entry Fee: <span className="text-white">{GAME_COST_ETH} ETH</span>
          </span>
          <span className="text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
            LIVE
          </span>
        </div>
      </div>

      <iframe
        ref={iframeRef}
        src="/SpaceHuggers/index.html"
        className="flex-1 w-full border-none"
        title="Void Striker"
        allow="autoplay"
      />
    </div>
  );
}