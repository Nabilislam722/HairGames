import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import RacingGame from "@/game/RacingGame";
import { Button } from "@/components/ui/button";

const GAME_COST_ETH = 0.00001;

export default function RacingGamePage() {
  return (
    <div className="flex flex-col h-screen bg-black overflow-hidden">
      {/* Top Navbar */}
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

      {/* Responsive Game Frame Wrapper */}
      <div className="flex-1 flex items-center justify-center p-2 sm:p-4 min-h-0">
        <div className="w-full max-w-7xl max-h-full aspect-video rounded-xl border border-white/10 overflow-hidden bg-zinc-950 shadow-2xl flex items-center justify-center">
          <RacingGame />
        </div>
      </div>
    </div>
  );
}