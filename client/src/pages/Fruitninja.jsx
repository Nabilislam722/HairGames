import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Contract, ethers } from "ethers";
import {
  Play,
  RotateCcw,
  Scissors,
  Trophy,
  ChevronRight,
  Sparkles,
  Wallet,
  Loader2,
  ExternalLink,
} from "lucide-react";
import GameCanvas from "../game/fruit_ninja/GameCanvas";
import HUD, { BombLegend } from "../game/fruit_ninja/HUD";
import {
  createInitialState,
  resetForPlay,
  continueAfterLevelUp,
  getLevelConfig,
  getTotalLevels,
} from "../game/fruit_ninja/engine";

const BEST_KEY = "fruit-slash-best";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const FRUIT_NINJA_CONTRACT_ADDRESS = "0x1f2a78Ce71aFbac323bEDc3404d206E7F94D8CFd";
const HEMI_CHAIN_ID = "0xa867";
const GAME_COST_ETH = "0.000012";

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

const CONTRACT_ABI = [
  "function startGame() external",
  "function submitGameResult(uint256 finalScore, uint256 levelReached, uint256 fruitsSliced, uint256 nonce, bytes signature) external",
  "function playerBestScore(address) view returns (uint256)"
];

const bentoContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const bentoItem = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1 },
};
const CTA_FOCUS = "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70";

function shortAddr(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function fruitninja() {
  const [phase, setPhase] = useState("menu");
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  const stateRef = useRef(
    createInitialState(Number(localStorage.getItem(BEST_KEY) || 0)),
  );

  const [walletAddress, setWalletAddress] = useState("");
  const [sessionStatus, setSessionStatus] = useState("idle");
  const [sessionError, setSessionError] = useState("");
  const [isStuckSession, setIsStuckSession] = useState(false);
  const [clearStatus, setClearStatus] = useState("idle");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [submitError, setSubmitError] = useState("");
  const [pointsAwarded, setPointsAwarded] = useState(0);
  const [txHash, setTxHash] = useState(null);
  const [scoreSecured, setScoreSecured] = useState(false);

  const lastSubmissionRef = useRef(null);
  const submittedRunRef = useRef(false);

  const fetchOnChainBest = useCallback(async (address) => {
    if (!address) return;
    try {
      const provider = new ethers.JsonRpcProvider(HEMI_CHAIN_DETAILS.rpcUrls[0]);
      const contract = new ethers.Contract(FRUIT_NINJA_CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const onChainBest = Number(await contract.playerBestScore(address));
      if (onChainBest > stateRef.current.best) {
        stateRef.current.best = onChainBest;
        localStorage.setItem(BEST_KEY, String(onChainBest));
        rerender();
      }
    } catch (err) {
      console.error("Failed to fetch on-chain best score:", err);
    }
  }, [rerender]);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum
        .request({ method: "eth_accounts" })
        .then((accounts) => {
          if (accounts && accounts.length > 0) {
            setWalletAddress(accounts[0]);
            fetchOnChainBest(accounts[0]);
          }
        })
        .catch((err) => console.error("Error fetching accounts:", err));

      const handleAccountsChanged = (accounts) => {
        const next = accounts.length > 0 ? accounts[0] : "";
        setWalletAddress(next);
        if (next) fetchOnChainBest(next);
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);
      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        }
      };
    }
  }, [fetchOnChainBest]);

  const handleConnectWallet = async () => {
    if (!window.ethereum) {
      alert("No crypto wallet detected. Please install MetaMask or another compatible wallet.");
      return null;
    }
    try {
      setSessionStatus("connecting");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const address = accounts[0];
      setWalletAddress(address);
      fetchOnChainBest(address);
      return address;
    } catch (err) {
      console.error("Wallet connection failed:", err);
      setSessionError("Failed to connect wallet: " + err.message);
      setSessionStatus("error_starting");
      return null;
    }
  };

  const start = useCallback(async () => {
    setSessionError("");
    try {
      let currentWallet = walletAddress;
      if (!currentWallet) {
        currentWallet = await handleConnectWallet();
        if (!currentWallet) return;
      }

      setSessionStatus("connecting");
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

      setSessionStatus("initializing_session");
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(FRUIT_NINJA_CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const tx = await contract.startGame();
      setSessionStatus("waiting_session_confirm");
      await tx.wait();

      stateRef.current = resetForPlay(stateRef.current);
      submittedRunRef.current = false;
      lastSubmissionRef.current = null;
      setTxHash(null);
      setIsStuckSession(false);
      setClearStatus("idle");
      setSubmitStatus("idle");
      setSubmitError("");
      setPointsAwarded(0);
      setScoreSecured(false);
      setSessionStatus("idle");
      setPhase("playing");
      rerender();
    } catch (err) {
      console.error("Session initialization failed:", err);
      const isStuck =
        err.reason === "Session already in progress" ||
        err.message?.includes("Session already in progress");
      if (isStuck) {
        setIsStuckSession(true);
        setSessionError("You have an unresolved session on-chain. Click again to clear it, then start a new game.");
      } else {
        setSessionError(err.reason || err.message || "Failed to start an on-chain session on Hemi.");
      }
      setSessionStatus("error_starting");
    }
  }, [walletAddress, rerender]);

  const handleClearStuckSession = async () => {
    setSessionError("");
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
      const sigResponse = await fetch(`${API_BASE_URL}/api/fruitninja/signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player: currentWallet,
          finalScore: 0,
          levelReached: 0,
          fruitsSliced: 0,
        }),
      });
      if (!sigResponse.ok) {
        const errorData = await sigResponse.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to generate clear-session signature");
      }
      const { finalScore, levelReached, fruitsSliced, nonce, signature } = await sigResponse.json();

      setClearStatus("clearing");
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(FRUIT_NINJA_CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const tx = await contract.submitGameResult(
        BigInt(finalScore),
        BigInt(levelReached),
        BigInt(fruitsSliced),
        BigInt(nonce),
        signature,
        { value: ethers.parseEther(GAME_COST_ETH) },
      );
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error("Clear-session transaction failed on-chain");
      }

      setIsStuckSession(false);
      setSessionStatus("idle");
      setSessionError("");
      setClearStatus("idle");

      await start();
    } catch (err) {
      console.error("Clear stuck session failed:", err);
      setSessionError(err.reason || err.message || "Failed to clear the stuck session.");
      setClearStatus("error");
    }
  };

  const syncScoreToBackend = async ({ wallet, finalScore, txHash: confirmedTxHash }) => {
    const claimResponse = await fetch(`${API_BASE_URL}/api/points/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet,
        txHash: confirmedTxHash,
        score: finalScore,
        gameId: "fruit_ninja",
      }),
    });
    if (!claimResponse.ok) {
      const errorData = await claimResponse.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to link points to your profile");
    }
    const claimData = await claimResponse.json();
    return claimData.added ?? finalScore;
  };

  const submitRun = useCallback(async () => {
    if (isSubmitting || submittedRunRef.current) return;
    submittedRunRef.current = true;
    setIsSubmitting(true);
    setSubmitStatus("generating");
    setSubmitError("");

    const runState = stateRef.current;
    let currentWallet = walletAddress;
    let confirmedTxHash;
    let finalScore;

    try {
      if (!currentWallet) {
        currentWallet = await handleConnectWallet();
        if (!currentWallet) {
          submittedRunRef.current = false;
          setIsSubmitting(false);
          setSubmitStatus("idle");
          return;
        }
      }

      const provider = new ethers.BrowserProvider(window.ethereum);

      const sigResponse = await fetch(`${API_BASE_URL}/api/fruitninja/signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player: currentWallet,
          finalScore: runState.score,
          levelReached: runState.level,
          fruitsSliced: runState.fruitsSliced,
        }),
      });
      if (!sigResponse.ok) {
        const errorData = await sigResponse.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to generate server signature");
      }
      const sigData = await sigResponse.json();
      finalScore = sigData.finalScore;
      const { levelReached, fruitsSliced, nonce, signature } = sigData;

      setSubmitStatus("signing");
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(FRUIT_NINJA_CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const tx = await contract.submitGameResult(
        BigInt(finalScore),
        BigInt(levelReached),
        BigInt(fruitsSliced),
        BigInt(nonce),
        signature,
        { value: ethers.parseEther(GAME_COST_ETH) },
      );
      confirmedTxHash = tx.hash;
      setTxHash(tx.hash);

      setSubmitStatus("indexing");
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error("On-chain transaction execution failed");
      }
    } catch (err) {
      console.error("On-chain submission failed:", err);
      setSubmitError(err.reason || err.message || "An unexpected transaction error occurred.");
      setSubmitStatus("error");
      setIsSubmitting(false);
      submittedRunRef.current = false;
      return;
    }

    lastSubmissionRef.current = { wallet: currentWallet, finalScore, txHash: confirmedTxHash };
    fetchOnChainBest(currentWallet);

    try {
      const added = await syncScoreToBackend(lastSubmissionRef.current);
      setPointsAwarded(added);
      setSubmitStatus("success");
      setScoreSecured(true);
    } catch (err) {
      console.error("DB sync failed after successful on-chain submission:", err);
      setSubmitError(err.message || "Your score was confirmed on-chain, but saving it to your profile failed.");
      setSubmitStatus("syncFailed");
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, walletAddress, fetchOnChainBest]);

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
      setScoreSecured(true);
    } catch (err) {
      console.error("Retry sync failed:", err);
      setSubmitError(err.message || "Sync failed again. Your score is still safely recorded on-chain.");
      setSubmitStatus("syncFailed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextLevel = useCallback(() => {
    stateRef.current = continueAfterLevelUp(stateRef.current);
    setPhase("playing");
    rerender();
  }, [rerender]);

  const onFrame = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== phase) {
      setPhase(s.phase);
      if (s.phase === "over" && s.score > s.best) {
        s.best = s.score;
        localStorage.setItem(BEST_KEY, String(s.best));
      }
    }
    if (s.phase === "playing") rerender();
  }, [phase, rerender]);

  const s = stateRef.current;
  const cfg = getLevelConfig(s.level);
  const isFinalWin = phase === "levelup" && s.level >= getTotalLevels();
  const runEnded = phase === "over" || isFinalWin;

  useEffect(() => {
    if (runEnded && submitStatus === "idle" && !isSubmitting && !submittedRunRef.current) {
      submitRun();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runEnded]);

  const sessionButtonLabel = (idleLabel = "Play") => {
    if (isStuckSession) {
      if (clearStatus === "requesting") return "Requesting clear signature...";
      if (clearStatus === "clearing") return "Clearing session...";
      return "Clear stuck session";
    }
    if (sessionStatus === "connecting") return "Connecting wallet...";
    if (sessionStatus === "initializing_session") return "Approve tx...";
    if (sessionStatus === "waiting_session_confirm") return "Registering on Hemi...";
    return idleLabel;
  };

  const sessionButtonDisabled =
    sessionStatus === "connecting" ||
    sessionStatus === "initializing_session" ||
    sessionStatus === "waiting_session_confirm" ||
    clearStatus === "requesting" ||
    clearStatus === "clearing";

  const tryAgainDisabled = !scoreSecured || sessionButtonDisabled;

  const onCta = isStuckSession ? handleClearStuckSession : start;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black font-sans text-[#2d3436]">
      {phase !== "playing" && (
        <div className="absolute top-4 right-4 z-[60]">
          {walletAddress ? (
            <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-mono text-white/70 backdrop-blur-md">
              <Wallet className="h-3.5 w-3.5" />
              {shortAddr(walletAddress)}
            </div>
          ) : (
            <button
              onClick={handleConnectWallet}
              className="cursor-pointer rounded-full border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white/80 backdrop-blur-md transition-colors hover:bg-white/20"
            >
              Connect Wallet
            </button>
          )}
        </div>
      )}

      <div className="absolute inset-0">
        <GameCanvas stateRef={stateRef} onFrame={onFrame} />
      </div>

      <AnimatePresence>
        {phase === "playing" && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <HUD
              score={s.score}
              best={s.best}
              lives={s.lives}
              combo={s.combo}
              level={s.level}
              levelLabel={cfg.label}
              levelScore={s.levelScore}
              levelTarget={cfg.targetScore}
              activeAbilities={s.activeAbilities}
            />
            <BombLegend />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {phase === "menu" && (
          <MenuScreen
            key="menu"
            best={s.best}
            onStart={onCta}
            ctaLabel={sessionButtonLabel("Play")}
            ctaDisabled={sessionButtonDisabled}
            isStuckSession={isStuckSession}
            sessionError={sessionError}
          />
        )}
        {phase === "levelup" && (
          <LevelUpScreen
            key="levelup"
            level={s.level}
            score={s.score}
            onNext={nextLevel}
            isFinal={isFinalWin}
            onRestart={onCta}
            restartLabel={sessionButtonLabel("Play Again")}
            restartDisabled={tryAgainDisabled}
            scoreSecured={scoreSecured}
            sessionError={sessionError}
            submitStatus={submitStatus}
            submitError={submitError}
            pointsAwarded={pointsAwarded}
            txHash={txHash}
            isSubmitting={isSubmitting}
            onSubmitRetry={submitRun}
            onSyncRetry={handleRetrySync}
            onContinueWithoutSync={() => {
              setSubmitStatus("success");
              setScoreSecured(true);
            }}
          />
        )}
        {phase === "over" && (
          <GameOverScreen
            key="over"
            score={s.score}
            best={s.best}
            level={s.level}
            onRestart={onCta}
            restartLabel={sessionButtonLabel("Play Again")}
            restartDisabled={tryAgainDisabled}
            scoreSecured={scoreSecured}
            sessionError={sessionError}
            submitStatus={submitStatus}
            submitError={submitError}
            pointsAwarded={pointsAwarded}
            txHash={txHash}
            isSubmitting={isSubmitting}
            onSubmitRetry={submitRun}
            onSyncRetry={handleRetrySync}
            onContinueWithoutSync={() => {
              setSubmitStatus("success");
              setScoreSecured(true);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function SubmitStatusTile({
  submitStatus,
  submitError,
  pointsAwarded,
  txHash,
  isSubmitting,
  onSubmitRetry,
  onSyncRetry,
  onContinueWithoutSync,
}) {
  if (submitStatus === "success") {
    return (
      <motion.div
        variants={bentoItem}
        className="col-span-2 sm:col-span-4 rounded-[24px] border border-[#6ab04c]/30 bg-[#6ab04c]/10 p-4 text-center backdrop-blur-xl"
      >
        <p className="text-sm font-black text-[#6ab04c]">🎉 Score secured on-chain</p>
        <p className="mt-1 text-xs font-medium text-white/60">
          Added <strong className="text-[#ffd93d]">+{pointsAwarded}</strong> points to your profile.
        </p>
        {txHash && (
          <a
            href={`https://explorer.hemi.xyz/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono text-white/40 hover:text-white/70 hover:underline"
          >
            Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)} <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </motion.div>
    );
  }

  if (submitStatus === "syncFailed") {
    return (
      <motion.div
        variants={bentoItem}
        className="col-span-2 sm:col-span-4 flex flex-col items-center gap-3 rounded-[24px] border border-[#ffd93d]/30 bg-[#ffd93d]/10 p-4 text-center backdrop-blur-xl"
      >
        <p className="text-xs font-black uppercase tracking-wider text-[#e6a800]">
          Score confirmed, profile sync failed
        </p>
        <p className="text-xs leading-snug text-white/60">
          Your entry fee and score are already final on-chain — only saving it to your profile failed.
          {submitError ? ` (${submitError})` : ""}
        </p>
        {txHash && (
          <a
            href={`https://explorer.hemi.xyz/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] font-mono text-white/40 hover:underline"
          >
            Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}
          </a>
        )}
        <div className="flex w-full gap-2">
          <button
            onClick={onContinueWithoutSync}
            className="flex-1 cursor-pointer rounded-full bg-white/10 py-2 text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-white/20"
          >
            Continue Without Syncing
          </button>
          <button
            onClick={onSyncRetry}
            disabled={isSubmitting}
            className="flex-1 cursor-pointer rounded-full bg-[#ffd93d] py-2 text-[11px] font-bold uppercase tracking-wide text-[#7a5c00] disabled:opacity-50"
          >
            Retry Sync
          </button>
        </div>
      </motion.div>
    );
  }

  if (submitStatus === "error") {
    return (
      <motion.div
        variants={bentoItem}
        className="col-span-2 sm:col-span-4 flex flex-col items-center gap-3 rounded-[24px] border border-[#ff6b6b]/30 bg-[#ff6b6b]/10 p-4 text-center backdrop-blur-xl"
      >
        <p className="text-xs font-semibold leading-snug text-[#ff9494]">Error: {submitError}</p>
        <button
          onClick={onSubmitRetry}
          disabled={isSubmitting}
          className="w-full cursor-pointer rounded-full bg-[#ff6b6b] py-2.5 text-xs font-black uppercase tracking-wide text-white hover:bg-[#ee5253] disabled:opacity-50"
        >
          Retry Ledger Submission
        </button>
      </motion.div>
    );
  }

  const stepText = {
    generating: "Step 1: Requesting server signature...",
    signing: "Step 2: Sign score submission tx on Hemi...",
    indexing: "Step 3: Indexing ledger confirmation...",
    idle: "Preparing to submit score...",
  }[submitStatus];

  return (
    <motion.div
      variants={bentoItem}
      className="col-span-2 sm:col-span-4 flex items-center justify-center gap-2 rounded-[24px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin text-white/50" />
      <span className="text-xs font-semibold text-white/60">{stepText}</span>
    </motion.div>
  );
}

function SessionErrorNote({ sessionError }) {
  if (!sessionError) return null;
  return (
    <motion.p
      variants={bentoItem}
      className="col-span-2 sm:col-span-4 text-center text-[11px] font-semibold text-[#ff9494]"
    >
      🚫 {sessionError}
    </motion.p>
  );
}

function MenuScreen({ best, onStart, ctaLabel, ctaDisabled, isStuckSession, sessionError }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
    >
      <motion.div
        variants={bentoContainer}
        initial="hidden"
        animate="show"
        className="grid w-full max-w-xl grid-cols-2 sm:grid-cols-4 auto-rows-[90px] gap-3"
      >
        <motion.div
          variants={bentoItem}
          className="relative col-span-2 row-span-2 flex flex-col justify-between overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_0_40px_-15px_rgba(255,107,107,0.35)] backdrop-blur-xl"
        >
          <div className="pointer-events-none absolute -bottom-8 -right-6 select-none text-[120px] leading-none opacity-15">
            🍓
          </div>

          <div className="relative z-10 flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ff6b6b]/15 text-[#ff6b6b]">
              <Scissors className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#ff6b6b]/40 bg-[#ff6b6b]/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[#ff9494]">
              <Sparkles className="h-3 w-3" /> Reflex
            </span>
          </div>

          <div className="relative z-10">
            <h1 className="text-4xl font-black leading-none tracking-tight text-white">
              FRUIT
              <br />
              <span className="text-[#ff6b6b]">SLASH</span>
            </h1>
            <p className="mt-3 text-sm font-medium leading-relaxed text-white/50">
              Slice fruit mid-air, chain combos in one swipe, dodge the bombs.
            </p>
          </div>
        </motion.div>

        <motion.div
          variants={bentoItem}
          className="col-span-1 row-span-1 flex flex-col justify-center gap-1 rounded-[28px] border border-[#ff6b6b]/25 bg-[#ff6b6b]/10 p-4 backdrop-blur-xl transition-transform hover:scale-[1.03]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-base">
            🔪
          </div>
          <p className="text-sm font-black text-white">Slice</p>
          <p className="text-[11px] font-medium text-white/45">Swipe to cut</p>
        </motion.div>

        <motion.div
          variants={bentoItem}
          className="col-span-1 row-span-1 flex flex-col justify-center gap-1 rounded-[28px] border border-[#ff9f43]/30 bg-[#ff9f43]/10 p-4 backdrop-blur-xl transition-transform hover:scale-[1.03]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-base">
            ⚡
          </div>
          <p className="text-sm font-black text-white">Combo</p>
          <p className="text-[11px] font-medium text-white/45">Chain a swipe</p>
        </motion.div>

        <motion.div
          variants={bentoItem}
          className="col-span-1 row-span-1 flex flex-col justify-center gap-1 rounded-[28px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl transition-transform hover:scale-[1.03]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-base">
            💣
          </div>
          <p className="text-sm font-black text-white">Bombs</p>
          <p className="text-[11px] font-medium text-white/40">Never touch one</p>
        </motion.div>

        <motion.div
          variants={bentoItem}
          className="col-span-1 row-span-1 flex flex-col justify-center gap-1 rounded-[28px] border border-[#ffd93d]/30 bg-[#ffd93d]/10 p-4 backdrop-blur-xl transition-transform hover:scale-[1.03]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-base">
            🏆
          </div>
          <p className="text-lg font-black tabular-nums text-[#ffd93d]">
            {best > 0 ? best : "—"}
          </p>
          <p className="text-[11px] font-medium text-white/45">Best score</p>
        </motion.div>

        <motion.button
          variants={bentoItem}
          onClick={onStart}
          disabled={ctaDisabled}
          className={`cursor-pointer col-span-2 sm:col-span-4 flex items-center justify-center gap-2 rounded-full py-4 text-lg font-black text-white shadow-[0_6px_0_#ee5253] transition-colors active:translate-y-1 active:shadow-[0_2px_0_#ee5253] disabled:cursor-not-allowed disabled:opacity-70 ${isStuckSession ? "bg-[#e6a800] shadow-[0_6px_0_#a87a00]" : "bg-[#ff6b6b] hover:bg-[#ee5253]"
            } ${CTA_FOCUS}`}
        >
          {sessionButtonIcon(ctaLabel)}
          {ctaLabel}
        </motion.button>

        <SessionErrorNote sessionError={sessionError} />
      </motion.div>
    </motion.div>
  );
}

function sessionButtonIcon(label) {
  if (label === "Play") return <Play className="h-5 w-5 fill-white" />;
  if (label === "Play Again") return <RotateCcw className="h-5 w-5" />;
  if (label === "Clear stuck session") return null;
  return <Loader2 className="h-5 w-5 animate-spin" />;
}

function LevelUpScreen({
  level,
  score,
  onNext,
  isFinal,
  onRestart,
  restartLabel,
  restartDisabled,
  scoreSecured,
  sessionError,
  submitStatus,
  submitError,
  pointsAwarded,
  txHash,
  isSubmitting,
  onSubmitRetry,
  onSyncRetry,
  onContinueWithoutSync,
}) {
  const nextCfg = getLevelConfig(level + 1);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
    >
      <motion.div
        variants={bentoContainer}
        initial="hidden"
        animate="show"
        className="grid w-full max-w-xl grid-cols-2 sm:grid-cols-4 auto-rows-[90px] gap-3"
      >
        <motion.div
          variants={bentoItem}
          className="relative col-span-2 row-span-2 flex flex-col justify-between overflow-hidden rounded-[28px] border border-[#58943f] bg-[#6ab04c] p-6 text-white shadow-sm"
        >
          <div className="pointer-events-none absolute -bottom-8 -right-6 select-none text-[120px] leading-none opacity-15">
            {isFinal ? "🏆" : "✨"}
          </div>
          <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div className="relative z-10">
            <h2 className="text-3xl font-black leading-tight text-white">
              {isFinal ? "YOU WIN!" : "LEVEL COMPLETE"}
            </h2>
            <p className="mt-2 text-sm font-medium text-white/85">
              {isFinal
                ? "Every level cleared. Legendary slicer."
                : `Level ${level} cleared — next up: ${nextCfg.label}.`}
            </p>
          </div>
        </motion.div>

        <motion.div
          variants={bentoItem}
          className="col-span-2 row-span-1 flex flex-col justify-center rounded-[28px] border border-[#e0e4d0] bg-white p-4 shadow-sm transition-transform hover:scale-[1.02]"
        >
          <p className="text-[11px] font-black uppercase tracking-widest text-[#a0a590]">Score</p>
          <p className="text-3xl font-black tabular-nums text-[#2d3436]">{score}</p>
        </motion.div>

        <motion.div
          variants={bentoItem}
          className="col-span-2 row-span-1 flex flex-col justify-center rounded-[28px] border border-[#ffd93d]/40 bg-[#ffd93d]/15 p-4 transition-transform hover:scale-[1.02]"
        >
          <p className="text-[11px] font-black uppercase tracking-widest text-[#a0a590]">
            {isFinal ? "Levels" : "Next Up"}
          </p>
          <p className="text-3xl font-black tabular-nums text-[#e6a800]">
            {isFinal ? `${getTotalLevels()}/${getTotalLevels()}` : nextCfg.label}
          </p>
        </motion.div>

        {isFinal && (
          <SubmitStatusTile
            submitStatus={submitStatus}
            submitError={submitError}
            pointsAwarded={pointsAwarded}
            txHash={txHash}
            isSubmitting={isSubmitting}
            onSubmitRetry={onSubmitRetry}
            onSyncRetry={onSyncRetry}
            onContinueWithoutSync={onContinueWithoutSync}
          />
        )}

        <motion.button
          variants={bentoItem}
          onClick={isFinal ? onRestart : onNext}
          disabled={isFinal && restartDisabled}
          className={`cursor-pointer col-span-2 sm:col-span-4 flex items-center justify-center gap-2 rounded-full py-4 text-lg font-black text-white transition-colors active:translate-y-1 disabled:cursor-not-allowed disabled:opacity-60 ${CTA_FOCUS} ${isFinal
              ? "bg-[#ff6b6b] shadow-[0_6px_0_#ee5253] hover:bg-[#ee5253] active:shadow-[0_2px_0_#ee5253]"
              : "bg-[#6ab04c] shadow-[0_6px_0_#58943f] hover:bg-[#5c9941] active:shadow-[0_2px_0_#58943f]"
            }`}
        >
          {isFinal ? (
            <>
              {sessionButtonIcon(restartLabel)}
              {restartLabel}
            </>
          ) : (
            <>
              Next Level
              <ChevronRight className="h-5 w-5" />
            </>
          )}
        </motion.button>

        {isFinal && !scoreSecured && (
          <p className="col-span-2 sm:col-span-4 text-center text-[10px] tracking-wide text-white/40">
            Locked until your score finishes submitting
          </p>
        )}
        {isFinal && <SessionErrorNote sessionError={sessionError} />}
      </motion.div>
    </motion.div>
  );
}

function GameOverScreen({
  score,
  best,
  level,
  onRestart,
  restartLabel,
  restartDisabled,
  scoreSecured,
  sessionError,
  submitStatus,
  submitError,
  pointsAwarded,
  txHash,
  isSubmitting,
  onSubmitRetry,
  onSyncRetry,
  onContinueWithoutSync,
}) {
  const isNewBest = score >= best && score > 0;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
    >
      <motion.div
        variants={bentoContainer}
        initial="hidden"
        animate="show"
        className="grid w-full max-w-xl grid-cols-2 sm:grid-cols-4 auto-rows-[90px] gap-3"
      >
        <motion.div
          variants={bentoItem}
          className="relative col-span-2 row-span-2 flex flex-col justify-between overflow-hidden rounded-[28px] border border-[#e0e4d0] bg-white p-6 shadow-sm"
        >
          <div className="pointer-events-none absolute -bottom-8 -right-6 select-none text-[120px] leading-none opacity-10">
            🍉
          </div>
          <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2d3436]/5">
            <Scissors className="h-5 w-5 text-[#2d3436]/50" strokeWidth={2.5} />
          </div>
          <div className="relative z-10">
            <h2 className="text-3xl font-black text-[#2d3436]">GAME OVER</h2>
            {isNewBest ? (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 260, damping: 12 }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#ffd93d] px-3 py-1 text-xs font-black text-[#7a5c00]"
              >
                <Trophy className="h-3.5 w-3.5" /> New best score
              </motion.span>
            ) : (
              <p className="mt-2 text-sm font-medium text-[#636e72]">Nice run — beat it next time.</p>
            )}
          </div>
        </motion.div>

        <motion.div
          variants={bentoItem}
          className="col-span-1 row-span-1 flex flex-col justify-center rounded-[28px] border border-[#e0e4d0] bg-white p-4 shadow-sm transition-transform hover:scale-[1.03]"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-[#a0a590]">Score</p>
          <p className="text-2xl font-black tabular-nums text-[#2d3436]">{score}</p>
        </motion.div>

        <motion.div
          variants={bentoItem}
          className="col-span-1 row-span-1 flex flex-col justify-center rounded-[28px] border border-[#ffd93d]/40 bg-[#ffd93d]/15 p-4 transition-transform hover:scale-[1.03]"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-[#a0a590]">Best</p>
          <p className="text-2xl font-black tabular-nums text-[#e6a800]">{best}</p>
        </motion.div>

        <motion.div
          variants={bentoItem}
          className="col-span-2 row-span-1 flex flex-col justify-center rounded-[28px] border border-[#6ab04c]/30 bg-[#6ab04c]/10 p-4 transition-transform hover:scale-[1.02]"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-[#a0a590]">Level reached</p>
          <p className="text-2xl font-black tabular-nums text-[#5c9941]">{level}</p>
        </motion.div>

        <SubmitStatusTile
          submitStatus={submitStatus}
          submitError={submitError}
          pointsAwarded={pointsAwarded}
          txHash={txHash}
          isSubmitting={isSubmitting}
          onSubmitRetry={onSubmitRetry}
          onSyncRetry={onSyncRetry}
          onContinueWithoutSync={onContinueWithoutSync}
        />

        <motion.button
          variants={bentoItem}
          onClick={onRestart}
          disabled={restartDisabled}
          className={`cursor-pointer col-span-2 sm:col-span-4 flex items-center justify-center gap-2 rounded-full bg-[#ff6b6b] py-4 text-lg font-black text-white shadow-[0_6px_0_#ee5253] transition-colors hover:bg-[#ee5253] active:translate-y-1 active:shadow-[0_2px_0_#ee5253] disabled:cursor-not-allowed disabled:opacity-60 ${CTA_FOCUS}`}
        >
          {sessionButtonIcon(restartLabel)}
          {restartLabel}
        </motion.button>

        {!scoreSecured && (
          <p className="col-span-2 sm:col-span-4 text-center text-[10px] tracking-wide text-white/40">
            Locked until your score finishes submitting
          </p>
        )}
        <SessionErrorNote sessionError={sessionError} />
      </motion.div>
    </motion.div>
  );
}