import { useEffect, useState } from "react";
import { Trophy, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccount } from "wagmi";

export default function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const { address, isConnected } = useAccount();

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const res = await fetch("https://api.hairtoken.xyz/api/leaderboard");
        const data = await res.json();
        setLeaderboard(data);
      } catch (err) {
        console.error("Failed to fetch leaderboard:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchLeaderboard();
  }, []);

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-500">
        Loading leaderboard...
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-2 sm:px-0">

      {/* ── User Stats Banner ── */}
      <div className="bg-emerald-600 rounded-2xl shadow-sm border font-display p-4 sm:p-5 border-orange-100 overflow-hidden mb-6 mt-6">
        {isConnected ? (
          (() => {
            const userEntry = leaderboard.find(e => e.wallet.toLowerCase() === address?.toLowerCase());
            const rank = userEntry ? leaderboard.indexOf(userEntry) + 1 : "-";
            const points = userEntry ? userEntry.points : 0;

            return (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0 sm:justify-between">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs text-slate-100">Your Wallet</span>
                  <span className="font-bold text-white text-sm truncate max-w-[200px] sm:max-w-none">
                    {address}
                  </span>
                </div>

                <div className="flex items-center gap-6 sm:gap-0 sm:flex-row sm:space-x-8">
                  <div className="flex flex-col sm:text-right">
                    <span className="text-xs text-slate-100">Rank</span>
                    <span className="font-bold text-white">#{rank}</span>
                  </div>

                  <div className="flex flex-col sm:text-right">
                    <span className="text-xs text-slate-100">Points</span>
                    <span className="font-bold text-white">{points} HP</span>
                  </div>
                </div>
              </div>
            );
          })()
        ) : (
          <div className="flex items-center justify-center py-1">
            <span className="text-white font-bold text-sm">Connect Your Wallet to See Your Stats</span>
          </div>
        )}
      </div>

      {/* ── Leaderboard Table ── */}
      <div className="bg-orange-200 rounded-2xl shadow-sm border font-display border-slate-100 overflow-hidden">

        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-orange-300 bg-slate-50/50">
          <h2 className="font-heading font-bold text-lg sm:text-xl flex items-center gap-2 text-slate-800">
            <Trophy className="w-5 h-5 text-amber-500 flex-shrink-0" />
            Top Players
          </h2>
        </div>

        {/* Rows */}
        <div className="divide-y divide-orange-300">
          {leaderboard.map((entry, index) => {
            const isCurrentUser = address && entry.wallet.toLowerCase() === address.toLowerCase();
            return (
              <div
                key={entry._id}
                className={cn(
                  "flex items-center px-3 sm:px-4 py-3 sm:py-4 hover:bg-indigo-50/30 transition-colors gap-2 sm:gap-4",
                  index === 0 ? "bg-amber-50/30" : "",
                  isCurrentUser ? "bg-emerald-50/40 ring-1 ring-inset ring-emerald-300/40" : ""
                )}
              >
                {/* Rank */}
                <div className="w-6 sm:w-8 text-center font-heading font-bold text-slate-400 flex-shrink-0 text-sm">
                  {index + 1}
                </div>

                {/* Avatar */}
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-indigo-100 flex items-center justify-center font-bold text-indigo-600 flex-shrink-0 text-xs sm:text-sm">
                  {entry.wallet.slice(-2).toUpperCase()}
                </div>

                {/* Wallet */}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-800 text-sm truncate">
                    <span className="hidden sm:inline">
                      {entry.wallet.slice(0, 6)}...{entry.wallet.slice(-4)}
                    </span>
                    <span className="sm:hidden">
                      {entry.wallet.slice(0, 4)}..{entry.wallet.slice(-3)}
                    </span>
                  </div>
                  {isCurrentUser && (
                    <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wide">You</span>
                  )}
                </div>

                {/* Points */}
                <div className="text-base sm:text-xl text-orange-600 font-bold flex-shrink-0">
                  {entry.points}{" "}
                  <span className="text-slate-500 text-xs sm:text-sm font-semibold">HP</span>
                </div>

                {/* Trend icon — hidden on mobile to save space */}
                <div className="hidden sm:block ml-1 flex-shrink-0">
                  <Minus className="w-4 h-4 text-slate-300" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 text-center border-t border-orange-300">
          <button className="text-sm font-bold text-primary hover:text-indigo-700 transition-colors cursor-pointer">
            View Full Leaderboard
          </button>
        </div>
      </div>
    </div>
  );
}