import { Link } from "wouter";
import { Crown } from "lucide-react";
import { SegBar } from "./SegBar";

const DIFFICULTY = { easy: 1, medium: 2, hard: 3 };

export function DifficultyBar({ level }) {
  return (
    <span className="diff">
      <SegBar value={DIFFICULTY[level?.toLowerCase()] ?? 2} max={3} segments={3} short label={`Difficulty: ${level}`} />
      {level}
    </span>
  );
}

// Title and one meta row keep the card light; the description shows on hover.
export function GameCard({ game, champion = false }) {
  const live = game.status === "active";
  const className = `gc${champion ? " champ" : ""}${live ? "" : " off"}`;
  const body = (
    <>
      <div className="gc-art">
        <img src={game.image} alt="" loading="lazy" />
        <span className="gc-fee">{game.entryFee ? `${game.entryFee} ETH` : "Free"}</span>
        {champion && <span className="gc-top"><Crown size={11} /> Most voted</span>}
      </div>
      <div className="gc-body">
        <h3 className="gc-title">{game.title}</h3>
        <div className="gc-foot">
          <img className="gc-logo" src={game.logo} alt="" />
          <span className="gc-cat">{game.category}</span>
          <DifficultyBar level={game.difficulty} />
        </div>
      </div>
    </>
  );
  return live
    ? <Link href={`/game/${game.id}`} className={className} title={game.description}>{body}</Link>
    : <div className={className} title={game.description}>{body}</div>;
}
