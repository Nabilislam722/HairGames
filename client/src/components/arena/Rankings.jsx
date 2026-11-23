import { getLevelInfo } from "@/lib/levels";
import { AddressAvatar, shortAddress } from "./AddressAvatar";

const sameWallet = (a, b) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

// Levels come from all-time points, so boards of other points (like the weekly event) pass
// showLevel={false} rather than show a level those points don't decide.

// The connected player's place on a board.
export function Standing({ address, rank, points, label, showLevel = true }) {
  const level = getLevelInfo(points ?? 0);
  return (
    <div className="stand">
      <div className="stand-who">
        <span className="stand-avatar"><AddressAvatar address={address} /></span>
        <div>
          <p className="stand-name">{shortAddress(address)}</p>
          <p className="stand-sub">{label}</p>
        </div>
      </div>
      <div className="stand-stats">
        <div className="stand-stat">
          <p className="stand-lbl">Rank</p>
          <p className="stand-val">{rank ? `#${rank.toLocaleString()}` : "—"}</p>
        </div>
        <div className="stand-stat">
          <p className="stand-lbl">Points</p>
          <p className="stand-val">{(points ?? 0).toLocaleString()}<small>HP</small></p>
        </div>
        {showLevel && (
          <div className="stand-stat">
            <p className="stand-lbl">Level</p>
            <p className="stand-val" style={{ color: level.color }}>{level.title}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// The top three, with first place raised in the middle.
export function Podium({ entries, me, showLevel = true }) {
  return (
    <div className="podium hg-stagger">
      {entries.slice(0, 3).map((entry, i) => (
        <div key={entry._id ?? entry.wallet} className={`pod p${i + 1}${sameWallet(entry.wallet, me) ? " me" : ""}`}>
          <p className="pod-rank">#{i + 1}</p>
          <div className="pod-avatar"><AddressAvatar address={entry.wallet} /></div>
          <p className="pod-name">{shortAddress(entry.wallet)}</p>
          <p className="pod-pts">{entry.points.toLocaleString()}<small>HP</small></p>
          {showLevel && <span className="pill">{getLevelInfo(entry.points).title}</span>}
        </div>
      ))}
    </div>
  );
}

const COLUMNS = {
  level: { "--cols-lg": "72px 2fr 1fr 1fr", "--cols-md": "56px 1.6fr 1fr 1fr", "--cols-sm": "44px 1fr auto" },
  plain: { "--cols-lg": "72px 3fr 1fr", "--cols-md": "56px 2fr 1fr", "--cols-sm": "44px 1fr auto" },
};

// Everyone from `from` (1-based) down.
export function RankTable({ entries, me, from = 1, label = "Rankings", showLevel = true }) {
  const rows = entries.slice(from - 1);
  return (
    <div className="tbl hg-stagger" role="table" aria-label={label} style={COLUMNS[showLevel ? "level" : "plain"]}>
      <div className="tbl-head" role="row">
        <span role="columnheader">Rank</span>
        <span role="columnheader">Player</span>
        {showLevel && <span role="columnheader">Level</span>}
        <span role="columnheader" className="end">Points</span>
      </div>
      {rows.map((entry, i) => {
        const isMe = sameWallet(entry.wallet, me);
        const level = getLevelInfo(entry.points);
        return (
          <div key={entry._id ?? entry.wallet} className={`tbl-row${isMe ? " me" : ""}`} role="row">
            <span className="tbl-num" role="cell">#{from + i}</span>
            <span className="who" role="cell">
              <span className="who-avatar"><AddressAvatar address={entry.wallet} /></span>
              <span className="who-name">{shortAddress(entry.wallet)}</span>
              {isMe && <span className="pill-lime">You</span>}
            </span>
            {showLevel && (
              <span role="cell" className="hide-sm"><span className="pill" style={{ color: level.color }}>{level.title}</span></span>
            )}
            <span className="tbl-num end" role="cell">{entry.points.toLocaleString()} <span className="pill">HP</span></span>
          </div>
        );
      })}
    </div>
  );
}
