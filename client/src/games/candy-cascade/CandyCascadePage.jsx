import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check, Loader2, AlertCircle, Link2 } from "lucide-react";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatEther } from "viem";
import { Button } from "@/components/ui/button";
import { postJson, useKeepAlive } from "@/lib/network";

const GAME_SRC = `${import.meta.env.BASE_URL}candy-cascade/index.html`;
const CONTRACT = import.meta.env.VITE_CANDY_CASCADE_CONTRACT;

// A cleared level can be replayed once per cooldown, timed from its last clear saved on chain, so
// players move on to new levels instead of replaying one over and over. Only clears this recent
// matter, so the lookback covers the cooldown in Hemi blocks (~12 s each) plus a margin.
const REPLAY_COOLDOWN_HOURS = 24;
const COOLDOWN_LOOKBACK_BLOCKS = BigInt(Math.ceil(((REPLAY_COOLDOWN_HOURS * 3600) / 12) * 1.25));

const LEVEL_CLEARED_EVENT = {
  type: "event", name: "LevelCleared",
  inputs: [
    { name: "player", type: "address", indexed: true },
    { name: "levelId", type: "uint256", indexed: true },
    { name: "score", type: "uint256", indexed: false },
    { name: "stars", type: "uint256", indexed: false },
    { name: "previousBest", type: "uint256", indexed: false },
    { name: "runId", type: "uint256", indexed: false },
    { name: "sessionId", type: "bytes32", indexed: false },
  ],
};

// "5h 12m", "12m" or "a minute".
function formatWait(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  if (!hours) return minutes === 1 ? "a minute" : `${minutes}m`;
  return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
}

const CANDY_ABI = [
  {
    type: "function", name: "getProgress", stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [
      { name: "cleared", type: "uint256" },
      { name: "totalScore", type: "uint256" },
      { name: "totalStars", type: "uint256" },
      { name: "bestScores", type: "uint32[]" },
      { name: "stars", type: "uint8[]" },
    ],
  },
  {
    type: "function", name: "submissionFee", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "startLevel", stateMutability: "nonpayable",
    inputs: [{ name: "levelId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function", name: "submitLevel", stateMutability: "payable",
    inputs: [
      { name: "levelId", type: "uint256" },
      { name: "score", type: "uint256" },
      { name: "stars", type: "uint256" },
      { name: "sessionId", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
];

const START_STEPS = [
  { key: "wallet", label: "Confirm the level start in your wallet" },
  { key: "session", label: "Shuffling the candies" },
];

const SAVE_STEPS = [
  { key: "verify", label: "Checking your moves" },
  { key: "wallet", label: "Confirm in your wallet" },
  { key: "confirm", label: "Saving on chain" },
  { key: "points", label: "Adding Hair Points" },
];

function toGameProgress([cleared, , , bestScores, stars]) {
  const highest = Number(cleared);
  const best = {};
  const starMap = {};
  for (let i = 0; i < highest; i++) {
    if (bestScores[i]) best[i + 1] = Number(bestScores[i]);
    if (stars[i]) starMap[i + 1] = Number(stars[i]);
  }
  // The arrays are as long as the contract's levelCount.
  return { unlocked: Math.min(bestScores.length, highest + 1), best, stars: starMap };
}

const friendlyError = (error) => {
  const text = `${error?.shortMessage ?? ""} ${error?.message ?? ""}`;
  if (/user (rejected|denied)/i.test(text)) return "You declined the transaction in your wallet.";
  if (/already has 3 stars/i.test(text)) return "You already have 3 stars on this level. Try a new one!";
  return error?.shortMessage || error?.message || "Something went wrong.";
};

export default function CandyCascadePage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { data: fee } = useReadContract({
    address: CONTRACT, abi: CANDY_ABI, functionName: "submissionFee",
    query: { enabled: !!CONTRACT },
  });

  const iframeRef = useRef(null);
  const gameReady = useRef(false);
  const job = useRef(null); // the win being saved: request, verified result, tx hash
  const pendingStart = useRef(null); // a start tx whose board request failed: { levelId, hash }
  const cooldowns = useRef({}); // levelId → when it can be replayed (ms)
  const [starting, setStarting] = useState(null); // { step } while a level start is on screen
  const [save, setSave] = useState(null); // { step, error?, added? } while a save is on screen

  const onChain = !!CONTRACT;
  const frameSrc = onChain ? GAME_SRC : `${GAME_SRC}?local`;

  // Phones drop idle connections mid-level; keep it warm while the game is open.
  useKeepAlive(onChain && isConnected);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const post = useCallback((msg) => {
    iframeRef.current?.contentWindow?.postMessage({ source: "hairgames", ...msg }, window.location.origin);
  }, []);

  // When each recently cleared level can be played again: REPLAY_COOLDOWN_HOURS after its last
  // saved clear, timed by the block it landed in.
  const readCooldowns = useCallback(async () => {
    const head = await publicClient.getBlockNumber();
    const logs = await publicClient.getLogs({
      address: CONTRACT, event: LEVEL_CLEARED_EVENT, args: { player: address },
      fromBlock: head > COOLDOWN_LOOKBACK_BLOCKS ? head - COOLDOWN_LOOKBACK_BLOCKS : 0n, toBlock: head,
    });
    const lastClear = new Map(); // levelId → block number of its latest clear
    for (const log of logs) {
      const id = Number(log.args.levelId);
      if (!lastClear.has(id) || log.blockNumber > lastClear.get(id)) lastClear.set(id, log.blockNumber);
    }
    const until = {};
    await Promise.all(
      [...lastClear].map(async ([id, blockNumber]) => {
        const block = await publicClient.getBlock({ blockNumber });
        const replayAt = (Number(block.timestamp) + REPLAY_COOLDOWN_HOURS * 3600) * 1000;
        if (replayAt > Date.now()) until[id] = replayAt;
      })
    );
    return until;
  }, [publicClient, address]);

  const readProgress = useCallback(async () => {
    const [raw, until] = await Promise.all([
      publicClient.readContract({ address: CONTRACT, abi: CANDY_ABI, functionName: "getProgress", args: [address] }),
      // If this read fails the game stays playable; it just can't show cooldowns until the next read.
      readCooldowns().catch((error) => {
        console.error("Candy Cascade: could not read replay cooldowns", error);
        return {};
      }),
    ]);
    cooldowns.current = until;
    return { ...toGameProgress(raw), cooldowns: until };
  }, [publicClient, address, readCooldowns]);

  const sendProgress = useCallback(async () => {
    if (!gameReady.current || !address) return;
    try {
      post({ type: "progress", progress: await readProgress() });
    } catch (error) {
      console.error("Candy Cascade: could not read progress", error);
    }
  }, [address, post, readProgress]);

  // A different wallet means different progress.
  useEffect(() => { sendProgress(); }, [sendProgress]);

  // Runs (or resumes, after a retry) the save of the current win, skipping finished steps.
  const runSave = useCallback(async () => {
    const current = job.current;
    if (!current) return;
    let step = "verify";
    try {
      if (!current.verified) {
        setSave({ step });
        current.verified = await postJson("/api/candy-cascade/verify", {
          wallet: address,
          sessionId: current.sessionId,
          moves: current.moves,
          rules: current.rules,
        });
      }
      const { levelId, score, stars, sessionId, signature } = current.verified;
      if (!current.txHash) {
        step = "wallet";
        setSave({ step });
        const value = await publicClient.readContract({ address: CONTRACT, abi: CANDY_ABI, functionName: "submissionFee" });
        current.txHash = await writeContractAsync({
          address: CONTRACT, abi: CANDY_ABI, functionName: "submitLevel",
          args: [BigInt(levelId), BigInt(score), BigInt(stars), sessionId, signature],
          value,
        });
      }
      if (!current.mined) {
        step = "confirm";
        setSave({ step });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: current.txHash });
        if (receipt.status !== "success") {
          current.txHash = null;
          throw new Error("The transaction failed on chain.");
        }
        current.mined = true;
        post({ type: "saved", requestId: current.requestId, progress: await readProgress() });
      }
      step = "points";
      setSave({ step });
      let added = 0;
      try {
        ({ added = 0 } = await postJson("/api/points/add", {
          wallet: address, txHash: current.txHash, score, gameId: "candy_cascade",
        }));
      } catch (error) {
        // A retry after a dropped reply finds the first attempt already credited: that's a success.
        if (!/already processed/i.test(error.message)) throw error;
      }
      job.current = null;
      setSave({ step: "done", added });
      setTimeout(() => setSave((s) => (s?.step === "done" ? null : s)), 2200);
    } catch (error) {
      console.error("Candy Cascade save failed:", error);
      const message = friendlyError(error);
      // A submit that failed for any reason but the player declining gets a fresh check on retry,
      // which also reports whether this run can still be saved.
      if ((step === "wallet" || step === "confirm") && !/declined/.test(message)) current.verified = null;
      setSave({ step, error: message });
    }
  }, [address, post, publicClient, readProgress, writeContractAsync]);

  const skipSave = () => {
    const current = job.current;
    job.current = null;
    setSave(null);
    // Once mined, the level is already saved; only an unsaved win needs the game told.
    if (current && !current.mined) {
      post({ type: "error", requestId: current.requestId, cancelled: true, message: "Not saved." });
    }
  };

  // Messages from the game, always handled with the latest state.
  const handlers = useRef({});
  handlers.current = {
    ready: () => {
      gameReady.current = true;
      sendProgress();
    },
    // Every attempt opens an on-chain run, then gets its board. Play begins once the wallet has
    // sent the start; the backend checks it was mined when the win is saved.
    start: async ({ requestId, levelId }) => {
      // The game checks this too; this catches a stale map before any transaction is sent.
      const replayAt = cooldowns.current[levelId];
      if (replayAt > Date.now()) {
        post({
          type: "error", requestId,
          message: `You cleared level ${levelId} recently. You can play it again in ${formatWait(replayAt - Date.now())}. Try a new level!`,
        });
        return;
      }
      try {
        let startTxHash;
        if (pendingStart.current?.levelId === levelId) {
          // The last start went out but its board request failed: reuse it, no new transaction.
          startTxHash = pendingStart.current.hash;
        } else {
          setStarting({ step: "wallet" });
          startTxHash = await writeContractAsync({
            address: CONTRACT, abi: CANDY_ABI, functionName: "startLevel", args: [BigInt(levelId)],
          });
          pendingStart.current = { levelId, hash: startTxHash };
        }
        setStarting({ step: "session" });
        const { sessionId, seed } = await postJson("/api/candy-cascade/session", { wallet: address, levelId, startTxHash });
        pendingStart.current = null;
        post({ type: "session", requestId, sessionId, seed });
      } catch (error) {
        post({ type: "error", requestId, message: friendlyError(error) });
      } finally {
        setStarting(null);
      }
    },
    won: ({ requestId, sessionId, moves, rules }) => {
      job.current = { requestId, sessionId, moves, rules };
      runSave();
    },
  };

  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== iframeRef.current?.contentWindow || event.origin !== window.location.origin) return;
      const msg = event.data;
      if (msg?.source !== "candy-cascade") return;
      handlers.current[msg.type]?.(msg);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const needsWallet = onChain && !isConnected;
  const feeLabel = fee ? `${formatEther(fee)} ETH per save` : null;

  return (
    <div className="relative flex flex-col h-dvh bg-background">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 shrink-0">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-sm font-semibold text-white">Candy Cascade</span>
      
        </div>
      </div>

      {needsWallet ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <h2 className="text-xl font-bold text-white mb-2">Connect to play</h2>
            <p className="text-sm text-white/55 mb-6">
              Your levels, stars and best scores are saved on chain, so Candy Cascade needs your wallet.
            </p>
            <div className="flex justify-center"><ConnectButton showBalance={false} /></div>
          </div>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          src={frameSrc}
          className="flex-1 w-full border-none"
          title="Candy Cascade"
          allow="autoplay; fullscreen"
        />
      )}

      {starting && (
        <StepsOverlay title="Starting the level" steps={START_STEPS} step={starting.step} />
      )}
      {save && (
        <StepsOverlay
          title={save.step === "done" ? "Level saved" : save.error ? "Couldn't save the level" : "Saving your level"}
          steps={SAVE_STEPS}
          step={save.step}
          error={save.error}
        >
          {save.step === "done" && (
            <p className="text-sm text-emerald-300">
              {save.added > 0 ? `+${save.added.toLocaleString()} Hair Points` : "No new Hair Points: this didn't beat your best on the level."}
            </p>
          )}
          {save.error && (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={skipSave}>
                {save.step === "points" ? "Continue" : "Skip"}
              </Button>
              <Button className="flex-1" onClick={runSave}>Retry</Button>
            </div>
          )}
        </StepsOverlay>
      )}
    </div>
  );
}

// A step list over the game: done steps get a check, the current one spins (or shows the error).
function StepsOverlay({ title, steps, step, error, children }) {
  const activeIndex = step === "done" ? steps.length : steps.findIndex((s) => s.key === step);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-background p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-white mb-4">{title}</h2>

        <ol className="space-y-3">
          {steps.map((s, i) => {
            const state = i < activeIndex ? "done" : i === activeIndex ? (error ? "error" : "active") : "todo";
            return (
              <li key={s.key} className="flex items-center gap-3 text-sm">
                <span className="w-5 h-5 flex items-center justify-center shrink-0">
                  {state === "done" && <Check className="w-4 h-4 text-emerald-400" />}
                  {state === "active" && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                  {state === "error" && <AlertCircle className="w-4 h-4 text-rose-400" />}
                  {state === "todo" && <span className="w-1.5 h-1.5 rounded-full bg-white/20" />}
                </span>
                <span className={state === "todo" ? "text-white/35" : state === "error" ? "text-rose-300" : "text-white/85"}>
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>

        {error && (
          <p className="mt-5 text-sm text-white/60 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 wrap-break-word">{error}</p>
        )}
        {children && <div className="mt-5">{children}</div>}
      </div>
    </div>
  );
}
