import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import { Trophy, Clock, Shield, RefreshCw } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

function shortenAddr(a) {
  return a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "";
}

const MEDAL = [
  { emoji: "🥇", color: "#fbbf24", rowBg: "rgba(251,191,36,0.04)", avatarBg: "rgba(251,191,36,0.12)", avatarBorder: "rgba(251,191,36,0.25)" },
  { emoji: "🥈", color: "#94a3b8", rowBg: "rgba(148,163,184,0.03)", avatarBg: "rgba(148,163,184,0.1)",  avatarBorder: "rgba(148,163,184,0.2)"  },
  { emoji: "🥉", color: "#fb923c", rowBg: "rgba(251,146,60,0.04)",  avatarBg: "rgba(251,146,60,0.1)",  avatarBorder: "rgba(251,146,60,0.22)"  },
];

// ─── Glitch clock ─────────────────────────────────────────────────────────────
const GLITCH_POOL = "0123456789░▓█?!×≠∞╬#@$%";

function GlitchClock() {
  const [state, setState] = useState({
    chars:     Array(8).fill("?"),
    intensity: 0,   // 0–3
    offsetX:   0,
    chromatic: false,
    glowSize:  8,
  });

  useEffect(() => {
    const tick = setInterval(() => {
      const intensity =
        Math.random() > 0.88 ? 3
        : Math.random() > 0.65 ? 2
        : Math.random() > 0.45 ? 1
        : 0;

      const glitchChance = [0.04, 0.28, 0.65, 1][intensity];

      setState({
        chars: Array(8).fill(null).map(() =>
          Math.random() < glitchChance
            ? GLITCH_POOL[Math.floor(Math.random() * GLITCH_POOL.length)]
            : "?"
        ),
        intensity,
        offsetX:   intensity >= 2 ? Math.random() * 8 - 4 : 0,
        chromatic: intensity >= 3,
        glowSize:  8 + intensity * 10,
      });
    }, 90);

    return () => clearInterval(tick);
  }, []);

  const { chars, intensity, offsetX, chromatic, glowSize } = state;
  const groups = [
    [chars[0], chars[1]],
    [chars[2], chars[3]],
    [chars[4], chars[5]],
    [chars[6], chars[7]],
  ];

  return (
    <div
      className="flex items-end gap-1.5 sm:gap-2"
      style={{ transform: `translateX(${offsetX}px)`, transition: "transform 0.04s linear" }}
    >
      {groups.map((group, i) => (
        <div key={i} className="flex items-end gap-1.5 sm:gap-2">
          {i > 0 && (
            <span
              className="font-mono font-black text-xl pb-4 leading-none select-none"
              style={{
                color: intensity >= 2 ? "#fb923c" : "rgba(251,146,60,0.3)",
                textShadow: chromatic
                  ? "3px 0 rgba(255,0,68,0.85), -3px 0 rgba(0,230,255,0.85)"
                  : "none",
              }}
            >
              :
            </span>
          )}
          <div className="flex flex-col items-center">
            <div
              className="font-mono font-black text-3xl sm:text-4xl leading-none tabular-nums px-2.5 py-1.5 rounded-xl"
              style={{
                color:      intensity >= 3 ? "#ffffff" : "#fb923c",
                background: intensity >= 2 ? "rgba(251,146,60,0.12)" : "rgba(251,146,60,0.06)",
                border:     `1px solid rgba(251,146,60,${intensity >= 2 ? 0.4 : 0.14})`,
                minWidth:   "3.2rem",
                textAlign:  "center",
                textShadow: chromatic
                  ? `4px 0 rgba(255,0,68,0.8), -4px 0 rgba(0,230,255,0.8), 0 0 ${glowSize}px rgba(251,146,60,0.6)`
                  : `0 0 ${glowSize}px rgba(251,146,60,0.45)`,
              }}
            >
              {group.join("")}
            </div>
            <span className="font-mono text-[8px] uppercase tracking-widest text-white/20 mt-1">
              ???
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function EventRank() {
  const { address, isConnected } = useAccount();
  const [board, setBoard]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [hoveredRow, setHoveredRow] = useState(null);

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/event/leaderboard`);
      if (!res.ok) throw new Error();
      setBoard(await res.json());
    } catch {
      setBoard([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBoard(); }, [fetchBoard]);

  const userEntry = board.find(e => e.wallet?.toLowerCase() === address?.toLowerCase());
  const userRank  = userEntry ? board.indexOf(userEntry) + 1 : null;

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: "rgba(251,146,60,0.2)", borderTopColor: "#fb923c" }}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-2 sm:px-4 py-6 space-y-4">

      {/* ── Event header ──────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative rounded-2xl overflow-hidden p-5 sm:p-7"
        style={{
          background:  "rgba(251,146,60,0.03)",
          border:      "1px solid rgba(251,146,60,0.18)",
          boxShadow:   "0 0 40px rgba(251,146,60,0.07), inset 0 0 40px rgba(251,146,60,0.02)",
        }}
      >
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-10 blur-3xl pointer-events-none"
          style={{ background: "#fb923c" }} />

        {/* Title row */}
        <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="px-2 py-px rounded font-mono text-[9px] font-black uppercase tracking-widest"
                style={{
                  background: "rgba(251,146,60,0.1)",
                  color:      "#fb923c",
                  border:     "1px solid rgba(251,146,60,0.22)",
                  animation:  "pulse 2s infinite",
                }}
              >
                LIVE
              </span>
            </div>
            <h1 className="font-display font-black text-2xl sm:text-3xl text-white tracking-tight">
              Weekly Event
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-widest mt-0.5"
              style={{ color: "rgba(251,146,60,0.55)" }}>
              Top scores reset each week
            </p>
          </div>

          <button
            onClick={fetchBoard}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Glitch clock */}
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-white/25 mb-2.5 flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> Resets in
          </p>
          <GlitchClock />
        </div>
      </motion.div>

      {/*  User stats banner  */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
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
                <span className="font-mono text-[9px] uppercase tracking-widest text-white/30 mb-0.5">Your Wallet</span>
                <span className="font-mono font-bold text-white text-sm truncate">{shortenAddr(address)}</span>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex flex-col sm:items-end">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-white/30">Event Rank</span>
                  <span className="font-mono font-black text-xl text-white leading-none">
                    {userRank ? `#${userRank}` : "—"}
                  </span>
                </div>
                <div className="flex flex-col sm:items-end">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-white/30">Event Points</span>
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
              Connect wallet to track your event rank
            </p>
            <ConnectButton chainStatus="icon" showBalance={false} />
          </div>
        )}
      </motion.div>

      {/* ── Leaderboard table ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.015)" }}
      >
        <div
          className="px-4 sm:px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.01)" }}
        >
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-white/45 flex items-center gap-2">
            <Trophy className="w-3.5 h-3.5" style={{ color: "#fb923c" }} />
            Weekly Rankings
            <span
              className="px-1.5 py-px rounded text-[8px] font-mono"
              style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.2)" }}
            >
              {board.length} players
            </span>
          </h2>
        </div>

        {board.length === 0 ? (
          <div className="py-16 text-center">
            <Trophy className="w-8 h-8 text-white/8 mx-auto mb-3" />
            <p className="font-mono text-[11px] uppercase tracking-widest text-white/20">No races this week yet</p>
            <p className="font-mono text-[9px] text-white/12 mt-1">Be the first to set a time</p>
          </div>
        ) : (
          <div>
            {board.map((entry, i) => {
              const isMe  = address && entry.wallet?.toLowerCase() === address.toLowerCase();
              const medal = MEDAL[i];
              const isHov = hoveredRow === i;

              const rowBg = isMe
                ? "rgba(251,146,60,0.06)"
                : isHov
                  ? "rgba(255,255,255,0.025)"
                  : medal ? medal.rowBg : "transparent";

              return (
                <motion.div
                  key={entry._id || entry.wallet}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * Math.min(i, 12), duration: 0.28 }}
                  className="flex items-center px-4 sm:px-6 py-3.5 gap-3 sm:gap-4 transition-colors duration-150"
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    background:   rowBg,
                    boxShadow:    isMe ? "inset 2px 0 0 rgba(251,146,60,0.35)" : "none",
                  }}
                  onMouseEnter={() => setHoveredRow(i)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <div className="w-7 flex-shrink-0 flex items-center justify-center">
                    {medal
                      ? <span className="text-base leading-none">{medal.emoji}</span>
                      : <span className="font-mono font-bold text-[11px] text-white/25">{i + 1}</span>
                    }
                  </div>

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

                  <div className="flex-1 min-w-0">
                    <div className="font-mono font-bold text-[12px] text-white/75 truncate">
                      {shortenAddr(entry.wallet)}
                    </div>
                    {isMe && (
                      <span className="font-mono text-[9px] font-black uppercase tracking-widest" style={{ color: "#fb923c" }}>
                        You
                      </span>
                    )}
                  </div>

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

        <div
          className="px-4 sm:px-6 py-3 flex items-center justify-center"
          style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
        >
          <p className="font-mono text-[9px] uppercase tracking-widest text-white/18">
            Earn more HP to climb
          </p>
        </div>
      </motion.div>

    </div>
  );
}