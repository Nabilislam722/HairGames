import { useCallback, useEffect, useRef } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useAccount, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { useKeepAlive } from "@/lib/network";
import { HUB_ADDRESS, getJson, useHubRun } from "@/lib/hub";
import { HubSaveStatus, HubStartOverlay, PlayWithBadge } from "@/components/arena/HubPlay";

// Moto Rush on HairGames Hub V2 (lib/hub.js). With `?chain` the game asks this page to start every
// level on chain and hands back the recorded ride when it finishes; the server replays it and signs the
// result. Levels and stars are kept by the backend. Without VITE_GAME_HUB_CONTRACT it's free play with
// progress in the browser.
const GAME_SRC = `${import.meta.env.BASE_URL}moto-rush/index.html`;

const VENOM = import.meta.env.VITE_VENOM_CONTRACT;
const BALANCE_OF = [{
  type: "function", name: "balanceOf", stateMutability: "view",
  inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }],
}];

// The backend's progress, as the game takes it: per completed level, in order, its time and stars.
function toGameProgress({ completed, levels }) {
  const byLevel = new Map(levels.map((l) => [l.level, l]));
  const done = Array.from({ length: completed }, (_, i) => byLevel.get(i + 1) ?? { timeMs: 0, stars: 0 });
  return { completed, timesMs: done.map((l) => l.timeMs), stars: done.map((l) => l.stars) };
}

export default function MotoRushPage() {
  const { address, status, isConnected } = useAccount();
  const hub = useHubRun("moto_rush");
  const { data: venomBalance, isSuccess } = useReadContract({
    address: VENOM, abi: BALANCE_OF, functionName: "balanceOf", args: [address],
    query: { enabled: !!VENOM && !!address },
  });

  const iframeRef = useRef(null);
  const gameReady = useRef(false);

  const onChain = !!HUB_ADDRESS;
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

  const readProgress = useCallback(
    async () => toGameProgress(await getJson(`/api/hub/moto-rush/progress?wallet=${address}`)),
    [address],
  );

  const sendProgress = useCallback(async () => {
    if (!onChain || !gameReady.current || !address) return;
    try {
      post({ type: "progress", progress: await readProgress() });
    } catch (error) {
      console.error("Moto Rush: could not read progress", error);
    }
  }, [onChain, address, post, readProgress]);

  useEffect(() => { sendProgress(); }, [sendProgress]);

  // Waits for a save (or its retry); once it's done the game gets the new progress.
  const finishSave = useCallback(async (saving) => {
    try {
      await saving;
      post({ type: "saved", progress: await readProgress() });
    } catch {
      // Shown by HubSaveStatus, with Retry and Skip.
    }
  }, [post, readProgress]);

  const handlers = useRef({});
  handlers.current = {
    ready: () => {
      gameReady.current = true;
      sendProgress();
      tellGame();
    },
    start: async ({ requestId, levelId }) => {
      try {
        const { sessionId } = await hub.start({ params: levelId, sessionPath: "/api/hub/moto-rush/session" });
        post({ type: "session", requestId, sessionId });
      } catch {
        post({ type: "error", requestId }); // HubStartOverlay shows why
      }
    },
    finished: ({ bike, inputs, reviveStep, rules }) => {
      finishSave(hub.save({ verifyPath: "/api/hub/moto-rush/verify", body: { bike, inputs, reviveStep, rules } }));
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

  return (
    <div className="relative flex flex-col h-dvh bg-background">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 shrink-0">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>
        </Link>
        <div className="flex items-center gap-4">
          {VENOM && !onChain && status !== "connected" && (
            <ConnectButton label="Connect to ride your Venom" showBalance={false} chainStatus="none" accountStatus="avatar" />
          )}
          {holdsVenom && <span className="hidden sm:inline text-xs font-semibold text-lime-300">#27 Venom unlocked</span>}
          {holdsVenom === false && status === "connected" && (
            <Button asChild size="sm" className="bg-lime-400 text-black hover:bg-lime-300 font-semibold">
              <a href="https://mintora.app/collections/venom" target="_blank" rel="noreferrer">Buy the #27 Venom</a>
            </Button>
          )}
          {onChain && isConnected && <PlayWithBadge />}
          {!onChain && <span className="hidden md:inline text-xs text-white/45">Free play · progress stays in this browser</span>}
          <span className="hidden sm:inline text-sm font-semibold text-white">Moto Rush</span>
        </div>
      </div>

      {needsWallet ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <h2 className="text-xl font-bold text-white mb-2">Connect to play</h2>
            <p className="text-sm text-white/55 mb-6">
              Your levels and stars are saved on chain and count toward your daily tasks, so Moto Rush needs your wallet.
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

      <HubStartOverlay starting={hub.starting} title="Starting the level" onClose={hub.dismissStart} />
      <HubSaveStatus
        saving={hub.saving}
        title="Saving your ride"
        doneTitle="Level saved"
        onRetry={() => finishSave(hub.retrySave())}
        onSkip={hub.dismissSave}
        onDone={hub.dismissSave}
      />
    </div>
  );
}
