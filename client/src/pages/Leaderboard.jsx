import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { Trophy, RefreshCw, Loader2 } from "lucide-react";
import { PageHead, SectionHead } from "@/components/arena/Heads";
import { Standing, Podium, RankTable } from "@/components/arena/Rankings";
import { ConnectPrompt } from "@/components/arena/ConnectPrompt";
import "@/styles/hg.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function Leaderboard() {
  const { address, isConnected } = useAccount();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/leaderboard`);
      const data = await res.json();
      setLeaderboard(data);
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  const userIndex = leaderboard.findIndex(e => e.wallet?.toLowerCase() === address?.toLowerCase());
  const userEntry = userIndex >= 0 ? leaderboard[userIndex] : null;

  if (loading && leaderboard.length === 0) {
    return <div className="hg"><div className="loader"><Loader2 size={28} className="spin" /></div></div>;
  }

  return (
    <div className="hg">
      <PageHead
        eyebrow={<><Trophy size={13} /> All-time rankings</>}
        title="Leader"
        accent="board"
        sub="Every Hair Point you earn in any game counts here. Climb the ranks from Rookie to Immortal."
      >
        <button type="button" className="btn btn-ghost btn-icon" onClick={fetchLeaderboard} title="Refresh" aria-label="Refresh">
          <RefreshCw size={14} className={loading ? "spin" : undefined} />
        </button>
      </PageHead>

      {isConnected && address ? (
        <Standing address={address} rank={userEntry ? userIndex + 1 : null} points={userEntry?.points ?? 0} label="Your all-time standing" />
      ) : (
        <ConnectPrompt compact title="See where you rank" text="Connect your wallet to find yourself on the board." />
      )}

      {leaderboard.length === 0 ? (
        <div className="tbl-empty">No players yet.</div>
      ) : (
        <>
          <Podium entries={leaderboard} me={address} />
          {leaderboard.length > 3 && (
            <section className="sec">
              <SectionHead title="Top players" count={leaderboard.length} />
              <RankTable entries={leaderboard} me={address} from={4} label="All-time rankings" />
            </section>
          )}
        </>
      )}
    </div>
  );
}
