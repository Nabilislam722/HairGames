import { useCallback, useEffect, useRef } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { useKeepAlive } from "@/lib/network";
import { HUB_ADDRESS, friendlyHubError, getJson, useHubRun } from "@/lib/hub";
import { HubSaveStatus, HubStartOverlay, PlayWithBadge } from "@/components/arena/HubPlay";

// Candy Cascade on HairGames Hub V2 (lib/hub.js). The game (client/public/candy-cascade, built from the
// candy-Cascade repo) asks this page to start every attempt on chain, reports its moves as it's played
// (for the checkpoints), and hands over every finished attempt, won or lost, to be replayed and saved.
// Progress (levels, best stars and scores) comes from the backend. Without VITE_GAME_HUB_CONTRACT the
// game runs on its own with local progress.
const GAME_SRC = `${import.meta.env.BASE_URL}candy-cascade/index.html`;

export default function CandyCascadePage() {
  const { address, isConnected } = useAccount();
  const hub = useHubRun("candy_cascade");

  const iframeRef = useRef(null);
  const gameReady = useRef(false);
  const pending = useRef(null); // the game's result request being saved: { requestId }

  const onChain = !!HUB_ADDRESS;
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

  const readProgress = useCallback(() => getJson(`/api/hub/candy-cascade/progress?wallet=${address}`), [address]);

  const sendProgress = useCallback(async () => {
    if (!onChain || !gameReady.current || !address) return;
    try {
      post({ type: "progress", progress: await readProgress() });
    } catch (error) {
      console.error("Candy Cascade: could not read progress", error);
    }
  }, [onChain, address, post, readProgress]);

  // A different wallet means different progress.
  useEffect(() => { sendProgress(); }, [sendProgress]);

  // Waits for a save (or its retry); once it's done the game gets the new progress.
  const finishSave = useCallback(async (saving) => {
    try {
      await saving;
      const current = pending.current;
      pending.current = null;
      if (current) post({ type: "saved", requestId: current.requestId, progress: await readProgress() });
    } catch {
      // Shown by HubSaveStatus, with Retry and Skip.
    }
  }, [post, readProgress]);

  const skipSave = () => {
    const current = pending.current;
    pending.current = null;
    hub.dismissSave();
    if (current) post({ type: "error", requestId: current.requestId, cancelled: true, message: "Not saved." });
  };

  // Messages from the game, always handled with the latest state.
  const handlers = useRef({});
  handlers.current = {
    ready: () => {
      gameReady.current = true;
      sendProgress();
    },
    // Every attempt opens a run on the hub, then gets its board's seed from the backend.
    start: async ({ requestId, levelId }) => {
      try {
        const { sessionId, seed } = await hub.start({ params: levelId, sessionPath: "/api/hub/candy-cascade/session" });
        post({ type: "session", requestId, sessionId, seed });
      } catch (error) {
        hub.dismissStart(); // the game shows the error, with its own Try again
        post({ type: "error", requestId, message: friendlyHubError(error) });
      }
    },
    moves: ({ moves }) => hub.setState(moves),
    result: ({ requestId, moves, rules }) => {
      pending.current = { requestId };
      finishSave(hub.save({ verifyPath: "/api/hub/candy-cascade/verify", body: { moves, rules } }));
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

  return (
    <div className="relative flex flex-col h-dvh bg-background">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 shrink-0">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>
        </Link>
        <div className="flex items-center gap-4">
          {onChain && isConnected && <PlayWithBadge />}
          <span className="hidden sm:inline text-sm font-semibold text-white">Candy Cascade</span>
        </div>
      </div>

      {needsWallet ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <h2 className="text-xl font-bold text-white mb-2">Connect to play</h2>
            <p className="text-sm text-white/55 mb-6">
              Every level is saved on chain and counts toward your daily tasks, so Candy Cascade needs your wallet.
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

      <HubStartOverlay starting={hub.starting} title="Starting the level" onClose={hub.dismissStart} />
      <HubSaveStatus
        saving={hub.saving}
        title="Saving your level"
        doneTitle="Level saved"
        onRetry={() => finishSave(hub.retrySave())}
        onSkip={skipSave}
        onDone={hub.dismissSave}
      />
    </div>
  );
}
