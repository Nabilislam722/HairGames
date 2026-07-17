import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { ArrowLeft, Trophy, ShieldAlert, CheckCircle2, Loader2, Flag } from "lucide-react";
import RacingGame from "@/game/RacingGame";
import { Button } from "@/components/ui/button";
import { ethers } from "ethers";

const GAME_COST_ETH = "0.000017";
const CONTRACT_ADDRESS = "0x3E0784ffE4e036bCc1859CA124dF327e8B866E29";
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";


const DEFAULT_POINTS_CONFIG = { initialPoints: 13000, decrementPerSecond: 90 };

// ── FIXED ABI: Matched your contract modifiers exactly ──────────────────
const RACING_GAME_ABI = [
  "function startGame() external",
  "function submitRaceResult(uint256 timeTakenMs, uint256 nonce, bytes calldata signature) external payable"
];

export default function RacingGamePage() {
  const [points, setPoints] = useState(DEFAULT_POINTS_CONFIG.initialPoints);
  const [gameKey, setGameKey] = useState(0);
  const [gameStatus, setGameStatus] = useState("idle");
  const [txHash, setTxHash] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState("");

  const timerRef = useRef(null);
  const startTimeRef = useRef(0);
  const finalTimeRef = useRef(null); // FIX: prevents time inflation on TX retry
  const pointsConfigRef = useRef(DEFAULT_POINTS_CONFIG);
  // Holds everything needed to retry JUST the DB sync after a successful
  // on-chain race, without ever touching submitRaceResult again.
  const lastSubmissionRef = useRef(null);

  // ── Pull the point economy ────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/api/race/config`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Bad config response"))))
      .then((cfg) => {
        pointsConfigRef.current = {
          initialPoints: cfg.initialPoints,
          decrementPerSecond: cfg.decrementPerSecond,
        };
      })
      .catch((err) => {
        console.warn("Points config fetch failed, using defaults:", err);
      });
  }, []);

  // ── 1. Points Countdown Mechanism ──────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (gameStatus === "playing") {
      startTimeRef.current = Date.now();
      finalTimeRef.current = null;
      setPoints(pointsConfigRef.current.initialPoints);

      timerRef.current = setInterval(() => {
        setPoints((prev) => {
          if (prev <= 0) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - pointsConfigRef.current.decrementPerSecond;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameStatus]);

  // ── 2. Handle Game Entry (First TX - No ETH Sent Here anymore) ────────────
  const handleGameStart = async () => {
    setErrorMessage(null);
    setTxHash(null);
    setLoadingMessage("Opening session on-chain...");
    setGameStatus("starting");

    try {
      if (!window.ethereum) throw new Error("No crypto wallet found. Please install Rabby or MetaMask.");

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const gameContract = new ethers.Contract(CONTRACT_ADDRESS, RACING_GAME_ABI, signer);

      const tx = await gameContract.startGame();

      setLoadingMessage("Waiting for block confirmation...");
      await tx.wait();

      setGameKey((prev) => prev + 1);
      setGameStatus("playing");
    } catch (err) {
      console.error("Start Game Tx Failed:", err);

      if (err.message?.includes("Race already in progress")) {
        setErrorMessage("You have an unresolved race on-chain. Play through or clear it.");
      } else {
        setErrorMessage(err.reason || err.message || "Transaction simulation failed.");
      }
      setGameStatus("error");
    }
  };

  // Posts an already-confirmed race to the backend. Pulled out on its own so
  // it can be re-run from the "syncFailed" screen WITHOUT calling
  // submitRaceResult again — by that point activeRaces[...].isActive is
  // already false on-chain, so a second submission would just revert with
  // "No active race".
  const syncRaceToBackend = async ({ wallet, totalTimeMs, txHash }) => {
    const computedScore = Math.max(
      0,
      pointsConfigRef.current.initialPoints - (Math.floor(totalTimeMs / 1000) * pointsConfigRef.current.decrementPerSecond)
    );

    const dbSyncRes = await fetch(`${API_BASE}/api/points/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet,
        txHash,
        score: computedScore,
        gameId: "racing_game"
      })
    });

    if (!dbSyncRes.ok) {
      const errorData = await dbSyncRes.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to sync points to database");
    }
  };

  const handleGameFinish = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setLoadingMessage("Generating cryptographic proof signature...");
    setGameStatus("submitting");

    if (!finalTimeRef.current) {
      finalTimeRef.current = Date.now() - startTimeRef.current;
    }
    const totalTimeMs = finalTimeRef.current;

    let userAddress;
    let confirmedTxHash;

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      userAddress = await signer.getAddress();

      const response = await fetch(`${API_BASE}/api/race/signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player: userAddress,
          timeTakenMs: totalTimeMs
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || "Failed to secure validation signature.");
      }

      const { nonce, signature } = await response.json();
      const gameContract = new ethers.Contract(CONTRACT_ADDRESS, RACING_GAME_ABI, signer);

      setLoadingMessage("Submitting performance result & entry fee...");

      const tx = await gameContract.submitRaceResult(
        totalTimeMs,
        nonce,
        signature,
        { value: ethers.parseEther(GAME_COST_ETH) }
      );

      confirmedTxHash = tx.hash;
      setTxHash(tx.hash);
      await tx.wait(); // On-chain result is now final and irreversible.
    } catch (err) {
      // Everything up to here happens BEFORE the chain accepts the race, so
      // a plain retry (re-running this function from scratch) is safe.
      console.error("On-chain submission failed:", err);
      setErrorMessage(err.reason || err.message || "Result synchronization failed.");
      setGameStatus("error");
      return;
    }

    // The race is settled on-chain no matter what happens next — keep what's
    // needed to retry just the DB write without resubmitting to the chain.
    lastSubmissionRef.current = { wallet: userAddress, totalTimeMs, txHash: confirmedTxHash };

    try {
      setLoadingMessage("Awarding points to profile...");
      await syncRaceToBackend(lastSubmissionRef.current);
      setGameStatus("completed");
    } catch (err) {
      // Chain succeeded, only the DB write failed. Route to a dedicated
      // screen instead of "error" — handleGameFinish would call
      // submitRaceResult again here and revert with "No active race".
      console.error("DB sync failed after successful on-chain race:", err);
      setErrorMessage(err.message || "Your race was confirmed on-chain, but saving it to your profile failed.");
      setGameStatus("syncFailed");
    }
  };

  // Retries ONLY the database write for a race that already succeeded
  // on-chain. Never touches the contract.
  const handleRetrySync = async () => {
    if (!lastSubmissionRef.current) {
      setErrorMessage("Nothing to retry — please start a new race.");
      setGameStatus("error");
      return;
    }

    setLoadingMessage("Retrying profile sync...");
    setGameStatus("submitting");

    try {
      await syncRaceToBackend(lastSubmissionRef.current);
      setGameStatus("completed");
    } catch (err) {
      console.error("Retry sync failed:", err);
      setErrorMessage(err.message || "Sync failed again. Your race is still safely recorded on-chain.");
      setGameStatus("syncFailed");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white overflow-hidden relative selection:bg-orange-500/30">

      {/* Top Navbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0 bg-zinc-950/80 backdrop-blur-md z-10">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground font-mono">
            Entry Fee: <span className="text-white font-semibold">{GAME_COST_ETH} ETH</span>
          </span>
          <span className="text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono tracking-wider animate-pulse">
            LIVE
          </span>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex items-center justify-center p-2 sm:p-4 min-h-0 relative">

        {/* Dynamic HUD Corner Counter */}
        {gameStatus === "playing" && (
          <div className="absolute top-6 right-6 z-20 flex flex-col items-end gap-1 pointer-events-none animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-400">Current Score</div>
            <div className="text-4xl sm:text-5xl font-black font-mono tracking-tighter text-orange-500 drop-shadow-[0_0_15px_rgba(249,115,22,0.4)] transition-all tabular-nums">
              {points.toLocaleString()}
            </div>
          </div>
        )}

        {/* Responsive Game Frame Wrapper */}
        <div className="w-full max-w-7xl max-h-full aspect-video rounded-xl border border-white/10 overflow-hidden bg-zinc-950 shadow-[0_0_50px_rgba(0,0,0,0.8)] flex items-center justify-center relative">

          <RacingGame key={gameKey} onStart={handleGameStart} onFinish={handleGameFinish} status={gameStatus} />

          {/* Native HTML Overlay Shield for Wallet Gestures */}
          {gameStatus === "idle" && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center gap-6 z-40">
              <div className="flex flex-col items-center">
                <Flag className="h-16 w-16 text-orange-500 mb-4" />
                <h2 className="text-3xl font-black tracking-tight uppercase">Ready to Race?</h2>
                <p className="text-zinc-400 font-mono mt-2">Initialize game track session via your wallet.</p>
              </div>

              <Button
                onClick={handleGameStart}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-lg px-10 py-6 h-auto shadow-[0_0_30px_rgba(249,115,22,0.3)] transition-all uppercase tracking-widest"
              >
                Start Match
              </Button>
            </div>
          )}

          {/* Web3 Transaction Blockers */}
          {(gameStatus === "starting" || gameStatus === "submitting") && (
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center gap-4 z-40 animate-in fade-in duration-200">
              <Loader2 className="h-10 w-10 text-orange-500 animate-spin" />
              <div className="text-xl font-bold tracking-tight">
                {gameStatus === "starting" ? "Configuring Session..." : "Submitting Race metrics..."}
              </div>
              <p className="text-sm text-zinc-400 max-w-xs text-center font-mono">
                {loadingMessage}
              </p>
            </div>
          )}

          {gameStatus === "completed" && (
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center gap-4 z-40 animate-in zoom-in-95 duration-200">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                <CheckCircle2 className="h-12 w-12" />
              </div>
              <h2 className="text-2xl font-black tracking-tight uppercase">Race Synchronized!</h2>
              <p className="text-zinc-400 font-mono text-sm max-w-sm text-center">
                Your performance score and points are securely verified and saved on-chain.
              </p>
              {txHash && (
                <a
                  href={`https://explorer.hemi.xyz/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-mono text-orange-400 hover:underline mt-2 bg-orange-500/5 px-3 py-1.5 rounded border border-orange-500/10"
                >
                  Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </a>
              )}
              <Button onClick={() => setGameStatus("idle")} className="mt-4 bg-white text-black hover:bg-zinc-200 font-semibold px-6">
                Race Again
              </Button>
            </div>
          )}

          {gameStatus === "error" && (
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center gap-4 z-40 px-6">
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-full text-red-400">
                <ShieldAlert className="h-12 w-12" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-red-400">Transaction Failed</h2>
              <p className="text-sm text-zinc-400 max-w-md text-center font-mono bg-zinc-900/50 p-3 rounded border border-white/10">
                {errorMessage}
              </p>
              <div className="flex gap-3 mt-2">
                <Button variant="outline" onClick={() => setGameStatus("idle")} className="border-white/10 hover:bg-white/5 text-white">
                  Cancel
                </Button>
                <Button
                  onClick={gameStatus === "starting" ? handleGameStart : handleGameFinish}
                  className="bg-orange-500 text-white hover:bg-orange-600 font-medium"
                >
                  Retry Transaction
                </Button>
              </div>
            </div>
          )}

          {gameStatus === "syncFailed" && (
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center gap-4 z-40 px-6">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400">
                <ShieldAlert className="h-12 w-12" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-amber-400">Race Confirmed, Profile Sync Failed</h2>
              <p className="text-sm text-zinc-400 max-w-md text-center font-mono bg-zinc-900/50 p-3 rounded border border-white/10">
                Your entry fee and time are already final on-chain. Only saving the result to your profile/leaderboard failed.
                {errorMessage ? ` (${errorMessage})` : ""}
              </p>
              {txHash && (
                <a
                  href={`https://explorer.hemi.xyz/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-mono text-orange-400 hover:underline bg-orange-500/5 px-3 py-1.5 rounded border border-orange-500/10"
                >
                  Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </a>
              )}
              <div className="flex gap-3 mt-2">
                <Button variant="outline" onClick={() => setGameStatus("completed")} className="border-white/10 hover:bg-white/5 text-white">
                  Continue Without Syncing
                </Button>
                <Button onClick={handleRetrySync} className="bg-orange-500 text-white hover:bg-orange-600 font-medium">
                  Retry Profile Sync
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}