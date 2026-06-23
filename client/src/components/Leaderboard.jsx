import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import { Trophy, Shield, RefreshCw } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

function shortenAddr(a) {
  return a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "";
}

const MEDAL = [
  { emoji: "🥇", color: "#fbbf24", rowBg: "rgba(251,191,36,0.04)", avatarBg: "rgba(251,191,36,0.12)", avatarBorder: "rgba(251,191,36,0.25)" },
  { emoji: "🥈", color: "#94a3b8", rowBg: "rgba(148,163,184,0.03)", avatarBg: "rgba(148,163,184,0.10)", avatarBorder: "rgba(148,163,184,0.20)" },
  { emoji: "🥉", color: "#fb923c", rowBg: "rgba(251,146,60,0.04)",  avatarBg: "rgba(251,146,60,0.10)", avatarBorder: "rgba(251,146,60,0.22)" },
];

export default function Leaderboard() {
  const { address, isConnected } = useAccount();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [hoveredRow, setHoveredRow]   = useState(null);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/api/leaderboard`);
      const data = await res.json();
      setLeaderboard(data);
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  const userEntry = leaderboard.find(e => e.wallet?.toLowerCase() === address?.toLowerCase());
  const userRank  = userEntry ? leaderboard.indexOf(userEntry) + 1 : null;

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: "rgba(251,146,60,0.2)", borderTopColor: "#fb923c" }} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-2 sm:px-4 py-6 space-y-4">

      {/* ── User stats banner ───────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {isConnected ? (
          <div
            className="rounded-2xl p-4 sm:p-5"
            style={{
              background: userEntry ? "rgba(251,146,60,0.05)" : "rgba(255,255,255,0.02)",
              border:     userEntry ? "1px solid rgba(251,146,60,0.18)" : "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-[9px] uppercase tracking-widest text-white/30 mb-0.5">
                  Your Wallet
                </span>
                <span className="font-mono font-bold text-white text-sm truncate">
                  {address}
                </span>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex flex-col sm:items-end">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-white/30">Rank</span>
                  <span className="font-mono font-black text-xl text-white leading-none">
                    {userRank ? `#${userRank}` : "—"}
                  </span>
                </div>
                <div className="flex flex-col sm:items-end">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-white/30">Points</span>
                  <span className="font-mono font-black text-xl leading-none" style={{ color: "#fb923c" }}>
                    {userEntry ? userEntry.points.toLocaleString() : "0"}
                    <span className="text-white/30 text-[10px] font-bold ml-1">HP</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="rounded-2xl p-5 flex flex-col items-center gap-3 text-center"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <Shield className="w-6 h-6 text-white/15" />
            <p className="font-mono text-[11px] uppercase tracking-widest text-white/25">
              Connect wallet to see your stats
            </p>
            <ConnectButton chainStatus="icon" showBalance={false} />
          </div>
        )}
      </motion.div>

      {/* ── Leaderboard table ───────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.015)" }}
      >
        {/* Header */}
        <div
          className="px-4 sm:px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.01)" }}
        >
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-white/45 flex items-center gap-2">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            Top Players
            <span
              className="px-1.5 py-px rounded text-[8px] font-mono"
              style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.2)" }}
            >
              {leaderboard.length} players
            </span>
          </h2>
          <button
            onClick={fetchLeaderboard}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.3)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Rows */}
        {leaderboard.length === 0 ? (
          <div className="py-16 text-center">
            <Trophy className="w-8 h-8 text-white/8 mx-auto mb-3" />
            <p className="font-mono text-[11px] uppercase tracking-widest text-white/20">No players yet</p>
          </div>
        ) : (
          <div>
            {leaderboard.map((entry, i) => {
              const isMe  = address && entry.wallet?.toLowerCase() === address.toLowerCase();
              const medal = MEDAL[i];
              const isHov = hoveredRow === i;

              const rowBg = isMe
                ? "rgba(251,146,60,0.06)"
                : isHov
                  ? "rgba(255,255,255,0.025)"
                  : medal
                    ? medal.rowBg
                    : "transparent";

              return (
                <motion.div
                  key={entry._id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * Math.min(i, 12), duration: 0.28 }}
                  className="flex items-center px-4 sm:px-6 py-3.5 gap-3 sm:gap-4 transition-colors duration-150"
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    background: rowBg,
                    boxShadow: isMe ? "inset 2px 0 0 rgba(251,146,60,0.35)" : "none",
                  }}
                  onMouseEnter={() => setHoveredRow(i)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  {/* Rank */}
                  <div className="w-7 flex-shrink-0 flex items-center justify-center">
                    {medal ? (
                      <span className="text-base leading-none">{medal.emoji}</span>
                    ) : (
                      <span className="font-mono font-bold text-[11px] text-white/25">{i + 1}</span>
                    )}
                  </div>

                  {/* Avatar */}
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center font-mono font-black text-[11px] flex-shrink-0"
                    style={{
                      background: medal ? medal.avatarBg     : "rgba(255,255,255,0.05)",
                      color:      medal ? medal.color        : "rgba(255,255,255,0.35)",
                      border:     `1px solid ${medal ? medal.avatarBorder : "rgba(255,255,255,0.07)"}`,
                    }}
                  >
                    {entry.wallet.slice(-2).toUpperCase()}
                  </div>

                  {/* Wallet */}
                  <div className="flex-1 min-w-0">
                    <div className="font-mono font-bold text-[12px] text-white/75 truncate">
                      <span className="hidden sm:inline">{shortenAddr(entry.wallet)}</span>
                      <span className="sm:hidden">{entry.wallet.slice(0, 4)}..{entry.wallet.slice(-3)}</span>
                    </div>
                    {isMe && (
                      <span className="font-mono text-[9px] font-black uppercase tracking-widest" style={{ color: "#fb923c" }}>
                        You
                      </span>
                    )}
                  </div>

                  {/* Points */}
                  <div className="flex-shrink-0 text-right">
                    <span
                      className="font-mono font-black text-base sm:text-lg"
                      style={{ color: medal ? medal.color : "rgba(255,255,255,0.65)" }}
                    >
                      {entry.points.toLocaleString()}
                    </span>
                    <span className="font-mono text-[9px] text-white/25 ml-1">HP</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div
          className="px-4 sm:px-6 py-3 flex items-center justify-center"
          style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
        >
          <p className="font-mono text-[9px] uppercase tracking-widest text-white/18">
            All-time rankings · Updated on every race
          </p>
        </div>
      </motion.div>

    </div>
  );
}