import { useState } from "react";
import { ArrowUpRight, Check, X as XIcon, Clock3 } from "lucide-react";
import { formatEther } from "viem";
import { GAMES } from "@/lib/games";
import { EXPLORER_URL } from "@/lib/activity";
import { SectionHead, Segmented } from "./Heads";

const PLAY_KIND = { start: "Start", save: "Save score" };
const PLAY_STATUS = {
  ok: { label: "Confirmed", className: "ok", icon: Check },
  failed: { label: "Failed", className: "bad", icon: XIcon },
  pending: { label: "Pending", className: "wait", icon: Clock3 },
};
const KIND_FILTERS = [
  { value: "all", label: "All" },
  { value: "start", label: "Starts" },
  { value: "save", label: "Saves" },
];
const SHOWN = 6;
const COLUMNS = {
  "--cols-lg": "1fr 1.8fr 1fr 1.1fr 1.1fr 0.8fr 76px",
  "--cols-md": "1.6fr 1fr 1fr auto",
  "--cols-sm": "1fr auto",
};

const ethText = (wei) => Number(formatEther(wei)).toFixed(7).replace(/\.?0+$/, "");

function timeAgo(at) {
  const mins = Math.floor((Date.now() - at) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

// The player's game transactions from usePlayerActivity, with filters by action and by game.
export function RecentPlays({ activity, address }) {
  const [kind, setKind] = useState("all");
  const [game, setGame] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const rows = activity.plays.filter(p => (kind === "all" || p.kind === kind) && (game === "all" || p.game.id === game));
  const visible = rows.slice(0, expanded ? 30 : SHOWN);

  let content;
  if (activity.loading) {
    content = Array.from({ length: 4 }, (_, i) => <div key={i} className="tbl-skel" />);
  } else if (activity.error) {
    content = (
      <div className="tbl-empty">
        Couldn't load your recent plays from the explorer.{" "}
        <button type="button" className="pt-retry" onClick={() => activity.retry()}>Try again</button>
      </div>
    );
  } else if (!visible.length) {
    content = <div className="tbl-empty">No plays in the last two weeks.</div>;
  } else {
    content = visible.map(p => {
      const status = PLAY_STATUS[p.status];
      const StatusIcon = status.icon;
      return (
        <div className="tbl-row" role="row" key={p.hash}>
          <span className="tbl-mono hide-md" role="cell">{p.hash.slice(0, 8)}…</span>
          <span className="pt-game" role="cell"><img src={p.game.logo} alt="" /><span>{p.game.title}</span></span>
          <span className="hide-md" role="cell"><em className="tag">{PLAY_KIND[p.kind]}</em></span>
          <span role="cell"><em className={`st ${status.className}`}>{status.label} <StatusIcon size={11} strokeWidth={3} /></em></span>
          <span className="tbl-num hide-sm" role="cell">{p.cost == null ? "—" : `${ethText(p.cost)} ETH`}</span>
          <span className="pt-when hide-md" role="cell">{timeAgo(p.at)}</span>
          <a className="pt-link end hide-sm" role="cell" href={`${EXPLORER_URL}/tx/${p.hash}`} target="_blank" rel="noopener noreferrer">
            View <ArrowUpRight size={11} />
          </a>
        </div>
      );
    });
  }

  return (
    <section className="sec">
      <SectionHead id="plays" title="Recent plays" count={activity.loading ? null : activity.plays.filter(p => p.kind === "start").length}>
        <Segmented label="Filter by action" options={KIND_FILTERS} value={kind} onChange={setKind} />
        <select className="hg-select" value={game} onChange={e => setGame(e.target.value)} aria-label="Filter by game">
          <option value="all">All games</option>
          {GAMES.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
      </SectionHead>
      <div className="tbl hg-stagger" role="table" aria-label="Recent plays" style={COLUMNS} key={`${kind}-${game}`}>
        <div className="tbl-head" role="row">
          <span role="columnheader">Tx</span>
          <span role="columnheader">Game</span>
          <span role="columnheader">Action</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Cost</span>
          <span role="columnheader">When</span>
          <span role="columnheader" />
        </div>
        {content}
      </div>
      <div className="pt-actions">
        {rows.length > SHOWN && (
          <button type="button" className="btn btn-ghost" onClick={() => setExpanded(e => !e)}>
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
        <a className="btn btn-ghost" href={`${EXPLORER_URL}/address/${address}`} target="_blank" rel="noopener noreferrer">
          All transactions <ArrowUpRight size={12} />
        </a>
      </div>
    </section>
  );
}
