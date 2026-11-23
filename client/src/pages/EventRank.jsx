import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { Clock, RefreshCw, Loader2 } from "lucide-react";
import { PageHead, SectionHead } from "@/components/arena/Heads";
import { Standing, Podium, RankTable } from "@/components/arena/Rankings";
import { ConnectPrompt } from "@/components/arena/ConnectPrompt";
import "@/styles/hg.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

//  Glitch clock: the reset time is kept a mystery on purpose.
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
              className="font-tech font-bold text-xl pb-2.5 leading-none select-none"
              style={{
                color: intensity >= 2 ? "#ff6b1a" : "rgba(255,107,26,0.35)",
                textShadow: chromatic ? "3px 0 rgba(255,0,68,0.85), -3px 0 rgba(0,230,255,0.85)" : "none",
              }}
            >
              :
            </span>
          )}
          <div
            className="font-tech font-bold text-2xl sm:text-3xl leading-none tabular-nums px-2.5 py-2 rounded-lg"
            style={{
              color:      intensity >= 3 ? "#ffffff" : "#ff6b1a",
              background: intensity >= 2 ? "rgba(255,107,26,0.14)" : "rgba(255,107,26,0.06)",
              border:     `1px solid rgba(255,107,26,${intensity >= 2 ? 0.45 : 0.16})`,
              minWidth:   "3rem",
              textAlign:  "center",
              textShadow: chromatic
                ? `4px 0 rgba(255,0,68,0.8), -4px 0 rgba(0,230,255,0.8), 0 0 ${glowSize}px rgba(255,107,26,0.6)`
                : `0 0 ${glowSize}px rgba(255,107,26,0.45)`,
            }}
          >
            {group.join("")}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function EventRank() {
  const { address, isConnected } = useAccount();
  const [board, setBoard] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const userIndex = board.findIndex(e => e.wallet?.toLowerCase() === address?.toLowerCase());
  const userEntry = userIndex >= 0 ? board[userIndex] : null;

  if (loading && board.length === 0) {
    return <div className="hg"><div className="loader"><Loader2 size={28} className="spin" /></div></div>;
  }

  return (
    <div className="hg">
      <PageHead
        eyebrow={<><span className="live-dot" /> Live · Weekly event</>}
        title="Weekly"
        accent="event"
        sub="Top scores reset each week. Play any game to climb this week's board."
      >
        <div>
          <p className="ph-eyebrow" style={{ marginBottom: 10 }}><Clock size={12} /> Resets in</p>
          <GlitchClock />
        </div>
        <button type="button" className="btn btn-ghost btn-icon" onClick={fetchBoard} title="Refresh" aria-label="Refresh">
          <RefreshCw size={14} className={loading ? "spin" : undefined} />
        </button>
      </PageHead>

      {isConnected && address ? (
        <Standing address={address} rank={userEntry ? userIndex + 1 : null} points={userEntry?.points ?? 0} label="Your standing this week" showLevel={false} />
      ) : (
        <ConnectPrompt compact title="Track your event rank" text="Connect your wallet to find yourself on this week's board." />
      )}

      {board.length === 0 ? (
        <div className="tbl-empty">No scores this week yet. Be the first on the board.</div>
      ) : (
        <>
          <Podium entries={board} me={address} showLevel={false} />
          {board.length > 3 && (
            <section className="sec">
              <SectionHead title="This week" count={board.length} />
              <RankTable entries={board} me={address} from={4} label="Weekly rankings" showLevel={false} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
