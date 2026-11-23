import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check, Loader2, AlertCircle, Trophy } from "lucide-react";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatEther } from "viem";
import { Button } from "@/components/ui/button";
import { postJson, useKeepAlive } from "@/lib/network";
import { hemi } from "@/lib/hemi";
import { useHemiNetwork } from "@/lib/useHemiNetwork";

// The game is built from the pixel-fighter repo (`npm run build:hairgames`) into public/pixel-fighter/.
// With `?chain` it asks this page to start every match on chain, and hands back the recorded inputs
// when the match ends; the server replays them and signs the result.
const GAME_SRC = `${import.meta.env.BASE_URL}pixel-fighter/index.html`;
const CONTRACT = import.meta.env.VITE_PIXEL_FIGHTER_CONTRACT;
const DIFFICULTIES = ["easy", "normal", "hard"];

const PIXEL_FIGHTER_ABI = [
  {
    type: "function", name: "submissionFee", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "startMatch", stateMutability: "nonpayable",
    inputs: [{ name: "difficulty", type: "uint8" }],
    outputs: [],
  },
  {
    type: "function", name: "submitMatch", stateMutability: "payable",
    inputs: [
      { name: "score", type: "uint256" },
      { name: "won", type: "bool" },
      { name: "durationMs", type: "uint256" },
      { name: "sessionId", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
];

const START_STEPS = [
  { key: "wallet", label: "Confirm the match start in your wallet" },
  { key: "session", label: "Picking your opponent" },
];

const SAVE_STEPS = [
  { key: "verify", label: "Checking your match" },
  { key: "clock", label: "Waiting for the chain's clock" },
  { key: "wallet", label: "Confirm in your wallet" },
  { key: "confirm", label: "Saving on chain" },
  { key: "points", label: "Adding Hair Points" },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const friendlyError = (error) => {
  const text = `${error?.shortMessage ?? ""} ${error?.message ?? ""}`;
  if (error?.name === "SwitchChainError" || /switch(ing)? (the )?(chain|network)|wallet_switchEthereumChain|wallet_addEthereumChain/i.test(text)) {
    return "Switch your wallet to the Hemi network to play.";
  }
  if (/user (rejected|denied)/i.test(text)) return "You declined the transaction in your wallet.";
  if (/no open match/i.test(text)) return "This match is no longer open. You started another one after it.";
  return error?.shortMessage || error?.message || "Something went wrong.";
};

export default function PixelFighterPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { ensureHemi } = useHemiNetwork();
  const { data: fee } = useReadContract({
    address: CONTRACT, abi: PIXEL_FIGHTER_ABI, functionName: "submissionFee",
    query: { enabled: !!CONTRACT },
  });

  const iframeRef = useRef(null);
  const job = useRef(null);
  const pendingStart = useRef(null);
  const [starting, setStarting] = useState(null);
  const [save, setSave] = useState(null);
  const [result, setResult] = useState(null);

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

  const focusGame = () => iframeRef.current?.contentWindow?.focus();

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
        current.verified = await postJson("/api/pixel-fighter/verify", {
          wallet: address,
          sessionId: current.sessionId,
          inputs: current.inputs,
          rules: current.rules,
        });
      }
      const { score, won, durationMs, sessionId, signature, submitAfter } = current.verified;
      setResult((r) => ({ ...r, score, won }));
      if (!current.txHash) {
        step = "clock";
        setSave({ step });
        await waitForChainTime(submitAfter);
        step = "wallet";
        setSave({ step });
        await ensureHemi();
        const value = await publicClient.readContract({ address: CONTRACT, abi: PIXEL_FIGHTER_ABI, functionName: "submissionFee" });
        current.txHash = await writeContractAsync({
          address: CONTRACT, abi: PIXEL_FIGHTER_ABI, functionName: "submitMatch",
          args: [BigInt(score), won, BigInt(durationMs), sessionId, signature],
          value,
          chainId: hemi.id,
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
      }
      step = "points";
      setSave({ step });
      let added = 0, multiplier = 1, already = false;
      try {
        ({ added = 0, multiplierApplied: multiplier = 1 } = await postJson("/api/points/add", {
          wallet: address, txHash: current.txHash, score, gameId: "pixel_fighter",
        }));
      } catch (error) {
        if (!/already processed/i.test(error.message)) throw error;
        already = true;
      }
      job.current = null;
      setResult((r) => ({ ...r, added, multiplier, already }));
      setSave({ step: "done" });
    } catch (error) {
      console.error("Pixel Fighters save failed:", error);
      const message = friendlyError(error);
      if ((step === "wallet" || step === "confirm") && !/declined/.test(message)) current.verified = null;
      setSave({ step, error: message });
    }
  }, [address, ensureHemi, publicClient, waitForChainTime, writeContractAsync]);

  const closeSave = () => {
    job.current = null;
    setSave(null);
    setResult(null);
    focusGame();
  };

  const handlers = useRef({});
  handlers.current = {
    start: async ({ requestId, p1, difficulty }) => {
      const level = DIFFICULTIES.indexOf(difficulty);
      // A new start would replace the run the open save belongs to.
      if (job.current || level < 0) {
        post({ type: "error", requestId });
        return;
      }
      try {
        let startTxHash;
        if (pendingStart.current?.p1 === p1 && pendingStart.current?.level === level) {
          startTxHash = pendingStart.current.hash;
        } else {
          setStarting({ step: "wallet" });
          await ensureHemi();
          startTxHash = await writeContractAsync({
            address: CONTRACT, abi: PIXEL_FIGHTER_ABI, functionName: "startMatch", args: [level], chainId: hemi.id,
          });
          pendingStart.current = { p1, level, hash: startTxHash };
        }
        setStarting({ step: "session" });
        const { sessionId, seed, p2 } = await postJson("/api/pixel-fighter/session", { wallet: address, startTxHash, p1, difficulty });
        pendingStart.current = null;
        post({ type: "session", requestId, sessionId, seed, p2 });
        setStarting(null);
        focusGame();
      } catch (error) {
        post({ type: "error", requestId });
        setStarting((s) => ({ step: s?.step ?? "wallet", error: friendlyError(error) }));
      }
    },
    finished: ({ sessionId, inputs, rules, score, won }) => {
      job.current = { sessionId, inputs, rules };
      setResult({ score, won });
      runSave();
    },
  };

  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== iframeRef.current?.contentWindow || event.origin !== window.location.origin) return;
      const msg = event.data;
      if (msg?.source !== "pixel-fighter") return;
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
          <span className="hidden md:inline text-xs text-white/45">{onChain ? feeLabel : "Free play · no Hair Points yet"}</span>
          <span className="hidden sm:inline text-sm font-semibold text-white">Pixel Fighters</span>
        </div>
      </div>

      {needsWallet ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <h2 className="text-xl font-bold text-white mb-2">Connect to play</h2>
            <p className="text-sm text-white/55 mb-6">
              Every match is started and saved on chain, so Pixel Fighters needs your wallet.
            </p>
            <div className="flex justify-center"><ConnectButton showBalance={false} /></div>
          </div>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          src={frameSrc}
          onLoad={focusGame}
          className="flex-1 w-full border-none"
          title="Pixel Fighters"
          allow="autoplay; fullscreen"
        />
      )}

      {starting && (
        <StepsOverlay title={starting.error ? "Couldn't start the match" : "Starting the match"} steps={START_STEPS} step={starting.step} error={starting.error}>
          {starting.error && <Button className="w-full" onClick={() => { setStarting(null); focusGame(); }}>Close</Button>}
        </StepsOverlay>
      )}
      {save && (
        <StepsOverlay
          title={save.step === "done" ? "Match saved" : save.error ? "Couldn't save the match" : "Saving your match"}
          steps={SAVE_STEPS}
          step={save.step}
          error={save.error}
          top={result && <MatchResult result={result} />}
        >
          {save.step === "done" && <Button className="w-full" onClick={closeSave}>Continue</Button>}
          {save.error && (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={closeSave}>
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

function MatchResult({ result }) {
  const score = result.score ?? 0;
  const multiplier = Number(result.multiplier ?? 1);

  return (
    <div className="mb-5 rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-center">
      <Trophy className={`mx-auto h-10 w-10 ${result.won ? "text-amber-400" : "text-white/20"}`} />
      <p className="mt-1 text-sm font-semibold text-white/70">{result.won ? "You won the match" : "You lost the match"}</p>
      {result.added > 0 ? (
        <>
          <p className="mt-3 text-2xl font-bold text-emerald-300">+{result.added.toLocaleString()} Hair Points</p>
          <p className="text-xs text-white/50">
            {score.toLocaleString()} HP{multiplier > 1 ? ` × ${multiplier.toFixed(2)} multiplier` : ""}
          </p>
        </>
      ) : result.already ? (
        <>
          <p className="mt-3 text-2xl font-bold text-white">{score.toLocaleString()} HP</p>
          <p className="text-xs text-white/50">These Hair Points were already added to your account.</p>
        </>
      ) : (
        <>
          <p className="mt-3 text-2xl font-bold text-white">{score.toLocaleString()} HP</p>
          <p className="text-xs text-white/50">Your multiplier is added when the match is saved.</p>
        </>
      )}
    </div>
  );
}

function StepsOverlay({ title, steps, step, error, top, children }) {
  const activeIndex = step === "done" ? steps.length : steps.findIndex((s) => s.key === step);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-background p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-white mb-4">{title}</h2>
        {top}
        {step !== "done" && <ol className="space-y-3">
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
        </ol>}
        {error && (
          <p className="mt-5 text-sm text-white/60 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 wrap-break-word">{error}</p>
        )}
        {children && <div className="mt-5">{children}</div>}
      </div>
    </div>
  );
}
