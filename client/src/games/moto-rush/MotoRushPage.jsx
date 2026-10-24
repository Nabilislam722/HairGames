import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check, Loader2, AlertCircle } from "lucide-react";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatEther } from "viem";
import { Button } from "@/components/ui/button";
import { postJson, useKeepAlive } from "@/lib/network";

const GAME_SRC = `${import.meta.env.BASE_URL}moto-rush/index.html`;
const CONTRACT = import.meta.env.VITE_MOTO_RUSH_CONTRACT;

const VENOM = import.meta.env.VITE_VENOM_CONTRACT;
const BALANCE_OF = [{
  type: "function", name: "balanceOf", stateMutability: "view",
  inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }],
}];

const MOTO_ABI = [
  {
    type: "function", name: "getProgress", stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [
      { name: "completed", type: "uint256" },
      { name: "totalStars", type: "uint256" },
      { name: "totalTimeMs", type: "uint256" },
      { name: "timesMs", type: "uint32[]" },
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
      { name: "timeMs", type: "uint256" },
      { name: "stars", type: "uint256" },
      { name: "sessionId", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
];

const STAR_HP = { 1: 5000, 2: 7000, 3: 10000 };

const START_STEPS = [
  { key: "wallet", label: "Confirm the level start in your wallet" },
  { key: "session", label: "Getting the track ready" },
];

const SAVE_STEPS = [
  { key: "verify", label: "Checking your ride" },
  { key: "clock", label: "Waiting for the chain's clock" },
  { key: "wallet", label: "Confirm in your wallet" },
  { key: "confirm", label: "Saving on chain" },
  { key: "points", label: "Adding Hair Points" },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toGameProgress([completed, , , timesMs, stars]) {
  const n = Number(completed);
  return { completed: n, timesMs: timesMs.slice(0, n).map(Number), stars: stars.slice(0, n).map(Number) };
}

const friendlyError = (error) => {
  const text = `${error?.shortMessage ?? ""} ${error?.message ?? ""}`;
  if (/user (rejected|denied)/i.test(text)) return "You declined the transaction in your wallet.";
  if (/level already completed/i.test(text)) return "You already completed this level. On to the next one!";
  if (/level locked/i.test(text)) return "That level is locked. Complete the one before it first.";
  return error?.shortMessage || error?.message || "Something went wrong.";
};

export default function MotoRushPage() {
  const { address, status, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { data: venomBalance, isSuccess } = useReadContract({
    address: VENOM, abi: BALANCE_OF, functionName: "balanceOf", args: [address],
    query: { enabled: !!VENOM && !!address },
  });
  const { data: fee } = useReadContract({
    address: CONTRACT, abi: MOTO_ABI, functionName: "submissionFee",
    query: { enabled: !!CONTRACT },
  });

  const iframeRef = useRef(null);
  const gameReady = useRef(false);
  const job = useRef(null);
  const pendingStart = useRef(null);
  const [starting, setStarting] = useState(null);
  const [save, setSave] = useState(null);

  const onChain = !!CONTRACT;
  const frameSrc = onChain ? `${GAME_SRC}?chain` : GAME_SRC;

  useKeepAlive(onChain && isConnected);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const post = useCallback((msg) => {
    iframeRef.current?.contentWindow?.postMessage({ source: "hairgames", ...msg }, window.location.origin);
  }, []);

  const holdsVenom = !VENOM ? undefined
    : status === "disconnected" ? false
    : status === "connected" && isSuccess ? venomBalance > 0n
    : undefined;

  const tellGame = useCallback(() => {
    if (holdsVenom === undefined) return;
    post({ type: "nft", venom: holdsVenom });
  }, [holdsVenom, post]);
  useEffect(tellGame, [tellGame]);

  const readProgress = useCallback(async () => {
    const raw = await publicClient.readContract({ address: CONTRACT, abi: MOTO_ABI, functionName: "getProgress", args: [address] });
    return toGameProgress(raw);
  }, [publicClient, address]);

  const sendProgress = useCallback(async () => {
    if (!onChain || !gameReady.current || !address) return;
    try {
      post({ type: "progress", progress: await readProgress() });
    } catch (error) {
      console.error("Moto Rush: could not read progress", error);
    }
  }, [onChain, address, post, readProgress]);

  useEffect(() => { sendProgress(); }, [sendProgress]);

  const waitForChainTime = useCallback(async (unixSeconds) => {
    for (;;) {
      const block = await publicClient.getBlock();
      const behind = unixSeconds - Number(block.timestamp);
      if (behind <= 0) return;
      await sleep(Math.min(12000, Math.max(2000, behind * 1000)));
    }
  }, [publicClient]);

  const runSave = useCallback(async () => {
    const current = job.current;
    if (!current) return;
    let step = "verify";
    try {
      if (!current.verified) {
        setSave({ step });
        current.verified = await postJson("/api/moto-rush/verify", {
          wallet: address,
          sessionId: current.sessionId,
          bike: current.bike,
          inputs: current.inputs,
          reviveStep: current.reviveStep,
          rules: current.rules,
        });
      }
      const { levelId, timeMs, stars, sessionId, signature, submitAfter } = current.verified;
      if (!current.txHash) {
        step = "clock";
        setSave({ step });
        await waitForChainTime(submitAfter);
        step = "wallet";
        setSave({ step });
        const value = await publicClient.readContract({ address: CONTRACT, abi: MOTO_ABI, functionName: "submissionFee" });
        current.txHash = await writeContractAsync({
          address: CONTRACT, abi: MOTO_ABI, functionName: "submitLevel",
          args: [BigInt(levelId), BigInt(timeMs), BigInt(stars), sessionId, signature],
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
        post({ type: "saved", progress: await readProgress() });
      }
      step = "points";
      setSave({ step });
      let added = 0, multiplier = 1;
      try {
        ({ added = 0, multiplierApplied: multiplier = 1 } = await postJson("/api/points/add", {
          wallet: address, txHash: current.txHash, score: STAR_HP[stars] ?? 0, gameId: "moto_rush",
        }));
      } catch (error) {
        if (!/already processed/i.test(error.message)) throw error;
      }
      job.current = null;
      setSave({ step: "done", added, multiplier });
      setTimeout(() => setSave((s) => (s?.step === "done" ? null : s)), 2600);
    } catch (error) {
      console.error("Moto Rush save failed:", error);
      const message = friendlyError(error);
      if ((step === "wallet" || step === "confirm") && !/declined/.test(message)) current.verified = null;
      setSave({ step, error: message });
    }
  }, [address, post, publicClient, readProgress, waitForChainTime, writeContractAsync]);

  const skipSave = () => {
    job.current = null;
    setSave(null);
  };

  const handlers = useRef({});
  handlers.current = {
    ready: () => {
      gameReady.current = true;
      sendProgress();
      tellGame();
    },
    start: async ({ requestId, levelId }) => {
      try {
        let startTxHash;
        if (pendingStart.current?.levelId === levelId) {
          startTxHash = pendingStart.current.hash;
        } else {
          setStarting({ step: "wallet" });
          startTxHash = await writeContractAsync({
            address: CONTRACT, abi: MOTO_ABI, functionName: "startLevel", args: [BigInt(levelId)],
          });
          pendingStart.current = { levelId, hash: startTxHash };
        }
        setStarting({ step: "session" });
        const { sessionId } = await postJson("/api/moto-rush/session", { wallet: address, levelId, startTxHash });
        pendingStart.current = null;
        post({ type: "session", requestId, sessionId });
        setStarting(null);
      } catch (error) {
        post({ type: "error", requestId });
        setStarting((s) => ({ step: s?.step ?? "wallet", error: friendlyError(error) }));
      }
    },
    finished: ({ sessionId, bike, inputs, reviveStep, rules }) => {
      job.current = { sessionId, bike, inputs, reviveStep, rules };
      runSave();
    },
  };

  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== iframeRef.current?.contentWindow || event.origin !== window.location.origin) return;
      const msg = event.data;
      if (msg?.source !== "moto-rush") return;
      handlers.current[msg.type]?.(msg);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const onLoad = () => {
    iframeRef.current?.contentWindow?.focus();
    tellGame();
  };

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
          {VENOM && !onChain && status !== "connected" && (
            <ConnectButton label="Connect to ride your Venom" showBalance={false} chainStatus="none" accountStatus="avatar" />
          )}
          {holdsVenom && <span className="text-xs font-semibold text-lime-300">#27 Venom unlocked</span>}
          {holdsVenom === false && status === "connected" && (
            <Button asChild size="sm" className="bg-lime-400 text-black hover:bg-lime-300 font-semibold">
              <a href="https://mintora.app/collections/venom" target="_blank" rel="noreferrer">Buy the #27 Venom</a>
            </Button>
          )}
          <span className="hidden md:inline text-xs text-white/45">{onChain ? feeLabel : "Free play · no Hair Points yet"}</span>
          <span className="hidden sm:inline text-sm font-semibold text-white">Moto Rush</span>
        </div>
      </div>

      {needsWallet ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <h2 className="text-xl font-bold text-white mb-2">Connect to play</h2>
            <p className="text-sm text-white/55 mb-6">
              Your levels and stars are saved on chain, so Moto Rush needs your wallet.
            </p>
            <div className="flex justify-center"><ConnectButton showBalance={false} /></div>
          </div>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          src={frameSrc}
          onLoad={onLoad}
          className="flex-1 w-full border-none"
          title="Moto Rush"
          allow="autoplay; fullscreen"
        />
      )}

      {starting && (
        <StepsOverlay title={starting.error ? "Couldn't start the level" : "Starting the level"} steps={START_STEPS} step={starting.step} error={starting.error}>
          {starting.error && <Button className="w-full" onClick={() => setStarting(null)}>Close</Button>}
        </StepsOverlay>
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
              {save.added > 0
                ? `+${save.added.toLocaleString()} Hair Points${save.multiplier > 1 ? ` (${Number(save.multiplier).toFixed(2)}× multiplier)` : ""}`
                : "Saved on chain."}
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
