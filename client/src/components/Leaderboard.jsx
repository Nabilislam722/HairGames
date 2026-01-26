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
        const res = await fetch("http://localhost:5000/api/leaderboard");
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
    <div>
      <div className="bg-emerald-600 rounded-3xl shadow-sm border font-display p-5 border-orange-100 overflow-hidden mb-10 mt-10 flex justify-between items-center">
        {isConnected ? (
          (() => {
            // Find current user in leaderboard
            const userEntry = leaderboard.find(e => e.wallet.toLowerCase() === address?.toLowerCase());
            const rank = userEntry ? leaderboard.indexOf(userEntry) + 1 : "-";
            const points = userEntry ? userEntry.points : 0;

            return (
              <>
                <div className="flex flex-col">
                  <span className="text-sm text-slate-100">Your Wallet</span>
                  <span className="font-bold text-white">{address}</span>
                </div>

                <div className="flex flex-col text-right">
                  <span className="text-sm text-slate-100">Your Rank</span>
                  <span className="font-bold text-white">{rank}</span>
                </div>

                <div className="flex flex-col text-right">
                  <span className="text-sm text-slate-100">Points</span>
                  <span className="font-bold text-white">{points} HP</span>
                </div>
              </>
            );
          })()
        ) : (
          <span className="text-white font-bold">Connect Your Wallet</span>
        )}
      </div>

      <div className="bg-orange-200 rounded-3xl shadow-sm border font-display border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-orange-300 bg-slate-50/50">
          <h2 className="font-heading font-bold text-xl flex items-center gap-2 text-slate-800">
            <Trophy className="w-5 h-5 text-amber-500 " />
            Top Players
          </h2>
        </div>

        <div className="divide-y divide-orange-300">
          {leaderboard.map((entry, index) => (
            <div
              key={entry._id}
              className={cn(
                "flex items-center p-4 hover:bg-indigo-50/30 transition-colors",
                index === 0 ? "bg-amber-50/30" : ""
              )}
            >
              <div className="w-8 text-center font-heading font-bold text-slate-400 mr-4">
                {index + 1}
              </div>

              {/* Placeholder avatar */}
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center font-bold text-indigo-600 mr-4">
                {entry.wallet.slice(-2).toUpperCase()}
                {/*Future NFT HERE*/}
              </div>

              <div className="flex-1">
                <div className="font-bold text-slate-800">
                  {entry.wallet.slice(0, 6)}...{entry.wallet.slice(-4)}
                </div>
              </div>
              <div className="text-xl text-orange-600 font-bold">
                {entry.points} <span className="text-slate-500">HP</span>
              </div>

              <div className="ml-4">
                <Minus className="w-4 h-4 text-slate-300" />
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 text-center border-t border-orange-300">
          <button className="text-sm font-bold text-primary hover:text-indigo-700 transition-colors cursor-pointer">
            View Full Leaderboard
          </button>
        </div>
      </div>
    </div>
  );
}
