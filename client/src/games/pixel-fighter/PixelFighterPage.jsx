import { useCallback, useEffect, useRef } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { useKeepAlive } from "@/lib/network";
import { HUB_ADDRESS, useHubRun } from "@/lib/hub";
import { HubSaveStatus, HubStartOverlay, PlayWithBadge } from "@/components/arena/HubPlay";

// Pixel Fighters on HairGames Hub V2 (lib/hub.js). The game is built from the pixel-fighter repo
// (`npm run build:hairgames`) into public/pixel-fighter/. With `?chain` it asks this page to start every
// match on chain (the CPU level is the run's params; the server picks the opponent and seed), and hands
// back the recorded inputs when the match ends, won or lost; the server replays them and signs the result.
const GAME_SRC = `${import.meta.env.BASE_URL}pixel-fighter/index.html`;
const DIFFICULTIES = ["easy", "normal", "hard"];

export default function PixelFighterPage() {
  const { isConnected } = useAccount();
  const hub = useHubRun("pixel_fighter");
  const iframeRef = useRef(null);

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

  const focusGame = () => iframeRef.current?.contentWindow?.focus();

  const handlers = useRef({});
  handlers.current = {
    start: async ({ requestId, p1, difficulty }) => {
      const level = DIFFICULTIES.indexOf(difficulty);
      if (level < 0) {
        post({ type: "error", requestId });
        return;
      }
      try {
        const { sessionId, seed, p2 } = await hub.start({ params: level, sessionPath: "/api/hub/pixel-fighter/session", body: { p1 } });
        post({ type: "session", requestId, sessionId, seed, p2 });
        focusGame();
      } catch {
        post({ type: "error", requestId }); // HubStartOverlay shows why
      }
    },
    finished: ({ inputs, rules }) => {
      hub.save({ verifyPath: "/api/hub/pixel-fighter/verify", body: { inputs, rules } }).catch(() => {
        // Shown by HubSaveStatus, with Retry and Skip.
      });
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

  const closeSave = () => {
    hub.dismissSave();
    focusGame();
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
          {onChain && isConnected && <PlayWithBadge />}
          {!onChain && <span className="hidden md:inline text-xs text-white/45">Free play</span>}
          <span className="hidden sm:inline text-sm font-semibold text-white">Pixel Fighters</span>
        </div>
      </div>

      {needsWallet ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <h2 className="text-xl font-bold text-white mb-2">Connect to play</h2>
            <p className="text-sm text-white/55 mb-6">
              Every match is started and saved on chain and counts toward your daily tasks, so Pixel Fighters needs your wallet.
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

      <HubStartOverlay starting={hub.starting} title="Starting the match" onClose={() => { hub.dismissStart(); focusGame(); }} />
      <HubSaveStatus
        saving={hub.saving}
        title="Saving your match"
        doneTitle="Match saved"
        onRetry={() => hub.retrySave().catch(() => {})}
        onSkip={closeSave}
        onDone={closeSave}
      />
    </div>
  );
}
