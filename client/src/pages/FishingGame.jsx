import React, { useState, useRef, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import CanvasGame from "../components/CanvasGame";
import HUD from "../components/HUD";
import TouchControls from "../components/TouchControls";
import { initAudio, playClickSound, playHoverSound } from "../game/audio";

// ── Web3 & Endpoint Constants ───────────────────────────────────────────
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const FISHING_CONTRACT_ADDRESS = "0x45cee112Ba2EbDE8224a1fA14D329f6AB190a7eA";
const HEMI_CHAIN_ID = "0xa867";
const GAME_COST_ETH = "0.00001";


const HEMI_CHAIN_DETAILS = {
  chainId: HEMI_CHAIN_ID,
  chainName: "Hemi Network",
  nativeCurrency: {
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: ["https://rpc.hemi.network/rpc"],
  blockExplorerUrls: ["https://explorer.hemi.xyz"],
};

// States: "idle" | "connecting" | "initializing_session" | "waiting_session_confirm" | "error_starting"
//       | "generating" | "signing" | "indexing" | "success" | "error" | "syncFailed"
export default function Mxfishing() {
  const [gameState, setGameState] = useState("START");
  const [isPortrait, setIsPortrait] = useState(false);
  const [stats, setStats] = useState({
    level: 1,
    lives: 3,
    score: 0,
    fishCollected: 0,
    fishRequired: 20,
    totalFish: 0,
    maxLevelReached: 1,
  });

  // ── Web3 Connection States ──────────────────────────────────────────────
  const [walletAddress, setWalletAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [submitError, setSubmitError] = useState("");
  const [pointsAwarded, setPointsAwarded] = useState(0);
  const [txHash, setTxHash] = useState(null);
  const [isDisabled, setIsDisabled] = useState(false);
  // Set when handleStart reverts with "Session already in progress". While
  // true, the Start Game button clears the dangling session instead of
  // retrying startGame() (which would just revert again).
  const [isStuckSession, setIsStuckSession] = useState(false);
  const [clearStatus, setClearStatus] = useState("idle"); // idle | requesting | clearing | error

  const gameRef = useRef(null);
  // Holds everything needed to retry JUST the DB sync after a successful
  // on-chain submission, without ever touching submitGameResult again.
  const lastSubmissionRef = useRef(null);

  // Check for portrait orientation dynamically
  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };

    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);

    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, []);

  // Check if wallet is already connected on page load
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" })
        .then((accounts) => {
          if (accounts && accounts.length > 0) {
            setWalletAddress(accounts[0]);
          }
        })
        .catch((err) => console.error("Error fetching accounts:", err));

      const handleAccountsChanged = (accounts) => {
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
        } else {
          setWalletAddress("");
        }
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);
      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        }
      };
    }
  }, []);

  const handleConnectWallet = async () => {
    if (!window.ethereum) {
      alert("No crypto wallet detected. Please install MetaMask or another compatible wallet.");
      return null;
    }
    try {
      setSubmitStatus("connecting");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const address = accounts[0];
      setWalletAddress(address);
      return address;
    } catch (err) {
      console.error("Wallet connection failed:", err);
      setSubmitError("Failed to connect wallet: " + err.message);
      setSubmitStatus("error_starting");
      return null;
    }
  };

  // ── START GAME: On-Chain Session Initialization ────────────────────────
  const handleStart = async () => {
    initAudio();
    playClickSound();
    setSubmitError("");

    try {
      // 1. Ensure Wallet Connection
      let currentWallet = walletAddress;
      if (!currentWallet) {
        currentWallet = await handleConnectWallet();
        if (!currentWallet) return;
      }

      // 2. Switch/Add Hemi Network
      setSubmitStatus("connecting");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      if (network.chainId !== 43111n && network.chainId !== 43111) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: HEMI_CHAIN_ID }],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [HEMI_CHAIN_DETAILS],
            });
          } else {
            throw switchError;
          }
        }
      }

      // 3. Trigger Game-Start session on-chain
      setSubmitStatus("initializing_session");
      const signer = await provider.getSigner();

      const contract = new ethers.Contract(
        FISHING_CONTRACT_ADDRESS,
        [
          "function startGame() external",
          "function submitGameResult(uint256 finalScore, uint256 totalFish, uint256 nonce, bytes signature) external"
        ],
        signer
      );

      const tx = await contract.startGame();

      setSubmitStatus("waiting_session_confirm");
      await tx.wait();

      // 4. Request Fullscreen
      try {
        const el = document.documentElement;
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        }
      } catch (error) {
        console.warn("Fullscreen denied/unsupported:", error);
      }

      // Reset local gameplay + submission state
      setStats({
        level: 1,
        lives: 3,
        score: 0,
        fishCollected: 0,
        fishRequired: 20,
        totalFish: 0,
        maxLevelReached: 1,
      });

      lastSubmissionRef.current = null;
      setTxHash(null);
      setIsStuckSession(false);
      setClearStatus("idle");
      setSubmitStatus("idle");
      setPointsAwarded(0);
      setGameState("PLAYING");

    } catch (err) {
      console.error("Session Initialization Failed:", err);
      const isStuck = err.reason === "Session already in progress" || err.message?.includes("Session already in progress");
      if (isStuck) {
        setIsStuckSession(true);
        setSubmitError("You have an unresolved session on-chain. Click again to clear it, then start a new game.");
      } else {
        setSubmitError(err.reason || err.message || "Failed to secure an active game session on Hemi Ledger.");
      }
      setSubmitStatus("error_starting");
    }
  };

  // Closes out a dangling on-chain session by submitting a 0-score result.
  // Only reachable from the "stuck session" error state — never called as
  // part of the normal start flow.
  const handleClearStuckSession = async () => {
    setSubmitError("");
    setClearStatus("requesting");

    try {
      let currentWallet = walletAddress;
      if (!currentWallet) {
        currentWallet = await handleConnectWallet();
        if (!currentWallet) {
          setClearStatus("idle");
          return;
        }
      }

      const provider = new ethers.BrowserProvider(window.ethereum);

      const sigResponse = await fetch(`${API_BASE_URL}/api/fishing/signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player: currentWallet,
          finalScore: 0,
          totalFish: 0,
        }),
      });

      if (!sigResponse.ok) {
        const errorData = await sigResponse.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to generate clear-session signature");
      }

      const { finalScore, totalFish, nonce, signature } = await sigResponse.json();

      setClearStatus("clearing");
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        FISHING_CONTRACT_ADDRESS,
        [
          "function submitGameResult(uint256 finalScore, uint256 totalFish, uint256 nonce, bytes signature) external"
        ],
        signer
      );

      // NOTE: submitGameResult is payable — clearing a stuck session still
      // sends the entry fee unless the contract exempts 0-score submissions.
      setIsDisabled(true);
      const tx = await contract.submitGameResult(
        BigInt(finalScore),
        BigInt(totalFish),
        BigInt(nonce),
        signature,
        { value: ethers.parseEther(GAME_COST_ETH) }
      );
      

      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error("Clear-session transaction failed on-chain");
      }

      setIsStuckSession(false);
      setSubmitStatus("idle");
      setSubmitError("");
      setClearStatus("idle");
    } catch (err) {
      console.error("Clear stuck session failed:", err);
      setSubmitError(err.reason || err.message || "Failed to clear the stuck session.");
      setClearStatus("error");
    }
  };

  // Posts an already-confirmed run to the backend. Pulled out on its own so
  // it can be re-run from the "syncFailed" screen WITHOUT calling
  // submitGameResult again — by that point the on-chain session is already
  // closed, so a second submission would just revert.
  const syncScoreToBackend = async ({ wallet, finalScore, txHash: confirmedTxHash }) => {
    const claimResponse = await fetch(`${API_BASE_URL}/api/points/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet,
        txHash: confirmedTxHash,
        score: finalScore,
        gameId: "fishing_party"
      }),
    });

    if (!claimResponse.ok) {
      const errorData = await claimResponse.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to link points to your profile");
    }

    const claimData = await claimResponse.json();
    return claimData.added ?? finalScore;
    setIsDisabled(false);
  };

  // ── SCORE SUBMISSION: End of Game ─────────────────────────────────────
  const handleSubmitScore = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitStatus("generating");
    setSubmitError("");

    let currentWallet = walletAddress;
    let confirmedTxHash;
    let finalScore;
    let totalFish;

    try {
      if (!currentWallet) {
        currentWallet = await handleConnectWallet();
        if (!currentWallet) {
          setIsSubmitting(false);
          setSubmitStatus("idle");
          return;
        }
      }

      const provider = new ethers.BrowserProvider(window.ethereum);

      // Request backend signature
      const sigResponse = await fetch(`${API_BASE_URL}/api/fishing/signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player: currentWallet,
          finalScore: stats.score,
          totalFish: stats.totalFish,
        }),
      });

      if (!sigResponse.ok) {
        const errorData = await sigResponse.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to generate server signature");
      }

      const sigData = await sigResponse.json();
      finalScore = sigData.finalScore;
      totalFish = sigData.totalFish;
      const { nonce, signature } = sigData;

      // Submit on-chain with validated signature
      setSubmitStatus("signing");
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        FISHING_CONTRACT_ADDRESS,
        [
          "function submitGameResult(uint256 finalScore, uint256 totalFish, uint256 nonce, bytes signature) external"
        ],
        signer
      );

      const tx = await contract.submitGameResult(
        BigInt(finalScore),
        BigInt(totalFish),
        BigInt(nonce),
        signature,
        { value: ethers.parseEther(GAME_COST_ETH) }
      );

      confirmedTxHash = tx.hash;
      setTxHash(tx.hash);

      setSubmitStatus("indexing");
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error("On-chain transaction execution failed");
      }
    } catch (err) {
      // Everything up to here happens BEFORE the chain accepts the result,
      // so a plain retry (re-running this function from scratch) is safe.
      console.error("On-chain submission failed:", err);
      setSubmitError(err.reason || err.message || "An unexpected transaction error occurred.");
      setSubmitStatus("error");
      setIsSubmitting(false);
      return;
    }

    // The result is settled on-chain no matter what happens next — keep
    // what's needed to retry just the DB write without resubmitting to chain.
    lastSubmissionRef.current = { wallet: currentWallet, finalScore, txHash: confirmedTxHash };

    try {
      const added = await syncScoreToBackend(lastSubmissionRef.current);
      setPointsAwarded(added);
      setSubmitStatus("success");
    } catch (err) {
      // Chain succeeded, only the DB write failed. Route to a dedicated
      // screen instead of "error" — retrying handleSubmitScore here would
      // call submitGameResult again and revert (session already closed).
      console.error("DB sync failed after successful on-chain submission:", err);
      setSubmitError(err.message || "Your score was confirmed on-chain, but saving it to your profile failed.");
      setSubmitStatus("syncFailed");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Retries ONLY the database write for a score that already succeeded
  // on-chain. Never touches the contract.
  const handleRetrySync = async () => {
    if (!lastSubmissionRef.current) {
      setSubmitError("Nothing to retry — please play a new game.");
      setSubmitStatus("error");
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus("indexing");

    try {
      const added = await syncScoreToBackend(lastSubmissionRef.current);
      setPointsAwarded(added);
      setSubmitStatus("success");
      setIsDisabled(false);
    } catch (err) {
      console.error("Retry sync failed:", err);
      setSubmitError(err.message || "Sync failed again. Your score is still safely recorded on-chain.");
      setSubmitStatus("syncFailed");
      setIsDisabled(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── AUTO-SUBMIT: fire the ledger tx the moment a run ends, no button ────
  useEffect(() => {
    if ((gameState === "GAME_OVER" || gameState === "VICTORY") && submitStatus === "idle" && !isSubmitting) {
      handleSubmitScore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  const handleJoystickMove = useCallback((x, y) => {
    gameRef.current?.setMoveVector(x, y);
  }, []);

  const bottomControlSpace = gameState === "PLAYING" && isPortrait ? 140 : 0;

  const startButtonLabel = () => {
    if (isStuckSession) {
      if (clearStatus === "requesting") return "REQUESTING CLEAR SIGNATURE...";
      if (clearStatus === "clearing") return "CLEARING SESSION...";
      return "CLEAR STUCK SESSION";
    }
    if (submitStatus === "connecting") return "CONNECTING WALLET...";
    if (submitStatus === "initializing_session") return "APPROVE TX...";
    if (submitStatus === "waiting_session_confirm") return "REGISTERING ON HEMI...";
    return "START GAME";
  };

  const startButtonDisabled =
    submitStatus === "connecting" ||
    submitStatus === "initializing_session" ||
    submitStatus === "waiting_session_confirm" ||
    clearStatus === "requesting" ||
    clearStatus === "clearing";

  return (
    <div
      className="relative w-full h-[100dvh] flex flex-col items-center justify-center overflow-hidden bg-zinc-900"
      style={{
        touchAction: "none",
        overscrollBehavior: "none",
        fontFamily: "var(--font-sans, 'Inter', sans-serif)",
      }}
    >
      {/* Global Wallet Info bar */}
      {gameState !== "PLAYING" && (
        <div className="absolute top-4 right-4 z-[60]">
          {walletAddress ? (
            <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 text-xs font-mono text-blue-300 shadow-md">
              Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </div>
          ) : (
            <button
              onClick={handleConnectWallet}
              className="bg-blue-600/30 hover:bg-blue-600/50 backdrop-blur-md px-4 py-2 rounded-full border border-blue-500/30 text-xs font-semibold text-white tracking-wider transition-all duration-300"
            >
              Connect Wallet
            </button>
          )}
        </div>
      )}

      {/* Game Canvas Container */}
      <div
        className="relative shadow-2xl bg-black overflow-hidden shrink-0 rounded-xl border border-white/10 transition-all duration-300 z-0"
        style={{
          aspectRatio: "16/10",
          width: `min(100vw, calc((100vh - ${bottomControlSpace}px) * 1.6))`,
          height: `min(calc(100vh - ${bottomControlSpace}px), 62.5vw)`,
        }}
      >
        <CanvasGame
          ref={gameRef}
          gameState={gameState}
          setGameState={setGameState}
          setStats={setStats}
        />

        {gameState === "PLAYING" && (
          <>
            <HUD stats={stats} />
            {!isPortrait && (
              <div className="absolute inset-0 flex flex-col justify-end items-center pb-6 pointer-events-none z-20">
                <div className="pointer-events-auto">
                  <TouchControls onMove={handleJoystickMove} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Portrait Controls */}
      {gameState === "PLAYING" && isPortrait && (
        <div
          className="relative w-full flex items-center justify-center shrink-0 overflow-hidden"
          style={{ height: `${bottomControlSpace}px` }}
        >
          <div className="relative flex justify-center w-full max-w-sm pt-30 z-20">
            <TouchControls onMove={handleJoystickMove} />
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* START SCREEN (With Stateful Session Start) */}
      {/* ========================================== */}
      {gameState === "START" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-50 text-center overflow-hidden bg-zinc-950">
          <div className="absolute inset-0 z-0 pointer-events-none">
            <div className="absolute top-0 left-0 w-full h-[55%] bg-gradient-to-b from-indigo-900 via-purple-600 to-orange-400"></div>
            <div className="absolute bottom-0 left-0 w-full h-[45%] bg-gradient-to-b from-[#0CA4FF] to-blue-900"></div>
            <div className="absolute top-[55%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 md:w-64 md:h-64 bg-gradient-to-b from-yellow-100 to-yellow-400 rounded-full shadow-[0_0_60px_rgba(250,204,21,0.6)]"></div>
          </div>

          <div className="relative z-20 flex flex-col items-center justify-center px-4 py-2 w-full max-w-2xl h-full">
            <div className="mb-3 md:mb-6 flex flex-col items-center">
              <h1 className="text-4xl sm:text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-blue-100 drop-shadow-lg tracking-tight leading-none mb-1 md:mb-2">
                FISHING
              </h1>
              <h1 className="text-4xl sm:text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-blue-300 to-blue-600 drop-shadow-lg tracking-tight leading-none">
                PARTY
              </h1>
            </div>

            <div className="bg-black/30 backdrop-blur-md p-4 md:p-8 rounded-2xl border border-white/20 mb-4 md:mb-8 w-full shadow-2xl">
              <ul className="space-y-2 md:space-y-4 text-xs md:text-base text-left text-white/90">
                <li className="flex items-start gap-2 md:gap-3">
                  <span className="text-yellow-400 font-bold mt-0.5">❖</span>
                  <span><strong className="text-white">NAVIGATE</strong> using WASD, Arrow Keys, or the Joystick.</span>
                </li>
                <li className="flex items-start gap-2 md:gap-3">
                  <span className="text-blue-400 font-bold mt-0.5">❖</span>
                  <span><strong className="text-white">CATCH</strong> target fish to rack up points.</span>
                </li>
                <li className="flex items-start gap-2 md:gap-3">
                  <span className="text-red-400 font-bold mt-0.5">❖</span>
                  <span><strong className="text-white">AVOID</strong> dangerous deep-sea creatures.</span>
                </li>
                <li className="flex items-start gap-2 md:gap-3">
                  <span className="text-green-400 font-bold mt-0.5">❖</span>
                  <span><strong className="text-white">COMPLETE</strong> all 5 levels to win the game.</span>
                </li>
              </ul>
            </div>

            {submitStatus === "error_starting" && (
              <div className="text-xs text-red-400 font-bold max-w-md bg-red-950/40 p-3 rounded-lg border border-red-500/20 mb-4 text-center">
                🚫 Session Registration Error: {submitError}
              </div>
            )}

            <button
              onClick={isStuckSession ? handleClearStuckSession : handleStart}
              onMouseEnter={playHoverSound}
              disabled={startButtonDisabled}
              className={`px-8 py-3 md:px-12 md:py-4 text-white font-bold rounded-full transition-all duration-300 text-sm md:text-xl tracking-wide hover:-translate-y-1 active:translate-y-0 disabled:opacity-80 ${isStuckSession
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 shadow-[0_0_20px_rgba(245,158,11,0.5)] hover:shadow-[0_0_30px_rgba(245,158,11,0.8)]"
                  : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)] hover:shadow-[0_0_30px_rgba(59,130,246,0.8)]"
                }`}
              style={{ touchAction: "manipulation" }}
            >
              {startButtonLabel()}
            </button>
          </div>
        </div>
      )}

      {/* GAME OVER Overlay */}
      {gameState === "GAME_OVER" && (
        <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-sm flex flex-col items-center justify-center text-white z-50 text-center px-4 overflow-hidden">
          <h2 className="text-4xl md:text-6xl font-black text-red-500 mb-4 tracking-tight drop-shadow-md">
            GAME OVER
          </h2>

          <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl w-full max-w-sm mb-4 shadow-2xl">
            <div className="space-y-3 text-sm md:text-base">
              <div className="flex justify-between items-center border-b border-white/10 pb-2">
                <span className="text-gray-400 uppercase text-xs font-semibold tracking-wider">Final Score</span>
                <span className="text-xl md:text-2xl font-bold text-yellow-400 font-mono">
                  {stats.score}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-white/10 pb-2">
                <span className="text-gray-400 uppercase text-xs font-semibold tracking-wider">Total Fish</span>
                <span className="text-lg md:text-xl text-blue-300 font-mono">
                  {stats.totalFish}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 uppercase text-xs font-semibold tracking-wider">Highest Level</span>
                <span className="text-lg md:text-xl text-green-400 font-mono">
                  {stats.maxLevelReached}
                </span>
              </div>
            </div>
          </div>

          <div className="w-full max-w-sm mb-6">
            {submitStatus === "success" && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 text-center">
                <p className="text-green-400 font-bold text-sm">🎉 SCORE SECURED ON LEDGER!</p>
                <p className="text-xs text-white/80 mt-1">
                  Multiplier applied! Added <strong className="text-yellow-400">+{pointsAwarded}</strong> points to profile.
                </p>
                {txHash && (
                  <a
                    href={`https://explorer.hemi.xyz/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-[10px] font-mono text-blue-300 hover:underline mt-2"
                  >
                    Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}
                  </a>
                )}
              </div>
            )}

            {submitStatus === "syncFailed" && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col items-center gap-3 text-center">
                <p className="text-amber-400 font-bold text-xs uppercase tracking-wider">Score Confirmed, Profile Sync Failed</p>
                <p className="text-xs text-white/70 leading-snug">
                  Your entry fee and score are already final on-chain. Only saving the result to your profile/leaderboard failed.
                  {submitError ? ` (${submitError})` : ""}
                </p>
                {txHash && (
                  <a
                    href={`https://explorer.hemi.xyz/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-mono text-blue-300 hover:underline"
                  >
                    Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}
                  </a>
                )}
                <div className="flex gap-2 w-full mt-1">
                  <button
                    onClick={() => setSubmitStatus("success")}
                    className="flex-1 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[11px] font-semibold uppercase tracking-wide"
                  >
                    Continue Without Syncing
                  </button>
                  <button
                    onClick={handleRetrySync}
                    disabled={isSubmitting}
                    className="flex-1 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-zinc-950 rounded-lg text-[11px] font-bold uppercase tracking-wide"
                  >
                    Retry Sync
                  </button>
                </div>
              </div>
            )}

            {submitStatus !== "success" && submitStatus !== "syncFailed" && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center gap-3">
                {submitStatus === "generating" && <div className="text-xs text-blue-300 animate-pulse font-semibold">Step 1: Requesting Server Signature...</div>}
                {submitStatus === "signing" && <div className="text-xs text-indigo-300 animate-pulse font-semibold">Step 2: Sign score submission tx to Hemi...</div>}
                {submitStatus === "indexing" && <div className="text-xs text-yellow-300 animate-pulse font-semibold">Step 3: Indexing Ledger Confirmation...</div>}
                {submitStatus === "error" && (
                  <>
                    <div className="text-xs text-red-400 font-semibold text-center leading-snug">Error: {submitError}</div>
                    <button
                      onClick={handleSubmitScore}
                      disabled={isSubmitting}
                      className="w-full py-3 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-zinc-950 font-extrabold rounded-xl transition-all duration-300 text-xs uppercase tracking-wider shadow-lg hover:-translate-y-0.5 active:translate-y-0"
                    >
                      Retry Ledger Submission
                    </button>
                  </>
                )}
                {submitStatus === "idle" && (
                  <div className="text-xs text-zinc-400 font-semibold">Preparing to submit score...</div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleStart}
            onMouseEnter={playHoverSound}
            disabled={isDisabled}
            className="px-8 py-3 cursor-pointer bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold rounded-full transition-all duration-300 text-xs uppercase tracking-widest hover:-translate-y-1 active:translate-y-0"
          >
            Try Again
          </button>
        </div>
      )}

      {/* VICTORY Overlay */}
      {gameState === "VICTORY" && (
        <div className="absolute inset-0 bg-blue-950/90 backdrop-blur-sm flex flex-col items-center justify-center text-white z-50 text-center px-4 overflow-hidden">
          <h2 className="text-3xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500 mb-2 tracking-tight">
            CONGRATULATIONS!
          </h2>
          <p className="text-blue-300 mb-4 text-xs uppercase tracking-[0.2em] font-semibold">
            You Finished the Adventure
          </p>

          <div className="bg-black/40 backdrop-blur-md border border-yellow-500/30 p-5 rounded-2xl w-full max-w-sm mb-4 shadow-[0_0_40px_rgba(234,179,8,0.15)]">
            <div className="space-y-3">
              <div className="flex justify-between items-center border-b border-white/10 pb-2">
                <span className="text-blue-200 uppercase text-xs font-semibold tracking-wider">Final Score</span>
                <span className="text-2xl md:text-3xl font-bold text-yellow-400 font-mono">
                  {stats.score}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-blue-200 uppercase text-xs font-semibold tracking-wider">Total Fish</span>
                <span className="text-lg md:text-xl text-white font-mono">
                  {stats.totalFish}
                </span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-white/10">
              <span className="inline-block px-3 py-1 bg-green-500/20 text-green-300 text-[10px] font-bold rounded-full uppercase tracking-wider border border-green-500/30">
                All 5 Levels Cleared
              </span>
            </div>
          </div>

          <div className="w-full max-w-sm mb-6">
            {submitStatus === "success" && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 text-center shadow-md">
                <p className="text-green-400 font-bold text-sm">🎉 SCORE SECURED ON LEDGER!</p>
                <p className="text-xs text-white/80 mt-1">
                  Multiplier applied! Added <strong className="text-yellow-400">+{pointsAwarded}</strong> points to profile.
                </p>
                {txHash && (
                  <a
                    href={`https://explorer.hemi.xyz/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-[10px] font-mono text-blue-300 hover:underline mt-2"
                  >
                    Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}
                  </a>
                )}
              </div>
            )}

            {submitStatus === "syncFailed" && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col items-center gap-3 text-center">
                <p className="text-amber-400 font-bold text-xs uppercase tracking-wider">Score Confirmed, Profile Sync Failed</p>
                <p className="text-xs text-white/70 leading-snug">
                  Your entry fee and score are already final on-chain. Only saving the result to your profile/leaderboard failed.
                  {submitError ? ` (${submitError})` : ""}
                </p>
                {txHash && (
                  <a
                    href={`https://explorer.hemi.xyz/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-mono text-blue-300 hover:underline"
                  >
                    Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}
                  </a>
                )}
                <div className="flex gap-2 w-full mt-1">
                  <button
                    onClick={() => setSubmitStatus("success")}
                    className="flex-1 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[11px] font-semibold uppercase tracking-wide"
                  >
                    Continue Without Syncing
                  </button>
                  <button
                    onClick={handleRetrySync}
                    disabled={isSubmitting}
                    className="flex-1 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-zinc-950 rounded-lg text-[11px] font-bold uppercase tracking-wide"
                  >
                    Retry Sync
                  </button>
                </div>
              </div>
            )}

            {submitStatus !== "success" && submitStatus !== "syncFailed" && (
              <div className="bg-black/20 border border-yellow-500/20 rounded-2xl p-4 flex flex-col items-center justify-center gap-3">
                {submitStatus === "generating" && <div className="text-xs text-blue-300 animate-pulse font-semibold">Step 1: Requesting Server Signature...</div>}
                {submitStatus === "signing" && <div className="text-xs text-indigo-300 animate-pulse font-semibold">Step 2: Sign score submission tx to Hemi...</div>}
                {submitStatus === "indexing" && <div className="text-xs text-yellow-300 animate-pulse font-semibold">Step 3: Indexing Ledger Confirmation...</div>}
                {submitStatus === "error" && (
                  <>
                    <div className="text-xs text-red-400 font-semibold text-center leading-snug">Error: {submitError}</div>
                    <button
                      onClick={handleSubmitScore}
                      disabled={isSubmitting}
                      className="w-full py-3 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-zinc-950 font-black rounded-xl transition-all duration-300 text-xs uppercase tracking-wider shadow-lg hover:-translate-y-0.5 active:translate-y-0"
                    >
                      Retry Ledger Submission
                    </button>
                  </>
                )}
                {submitStatus === "idle" && (
                  <div className="text-xs text-zinc-400 font-semibold">Preparing to submit score...</div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleStart}
            onMouseEnter={playHoverSound}
            className="px-8 py-3 bg-yellow-400 hover:bg-yellow-300 text-blue-950 font-black rounded-full transition-all duration-300 text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(250,204,21,0.4)] hover:shadow-[0_0_30px_rgba(250,204,21,0.6)] hover:-translate-y-1 active:translate-y-0"
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}