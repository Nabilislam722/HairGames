import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, ArrowUpRight, Check, Clock3, Crown, Loader2, Lock } from "lucide-react";
import { GAMES } from "@/lib/games";
import { dateKey, nextDailyReset, tournamentEnd, TOURNAMENT_MIN_HAIR } from "@/lib/competitions";
import { AddressAvatar, shortAddress } from "./AddressAvatar";

const BUY_HAIR_URL = "https://www.sushi.com/hemi/swap?token0=0xad11a8beb98bbf61dbb1aa0f6d6f2ecd87b35afa&token1=0x5b774f563c902fa7b203fb7029ed6ed4ce274705";
const MEDALS = ["#ffc233", "#b8c2d0", "#ff8a4c"];
const SHOWN = 5;

const sameWallet = (a, b) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
const pad = (n) => String(n).padStart(2, "0");
const gameById = (id) => GAMES.find(g => g.id === id);

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  return now;
}

function countdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

const formatScore = (score, lowerIsBetter) => (lowerIsBetter ? `${(score / 1000).toFixed(2)}s` : score.toLocaleString());

// Top five, then the player's own row if they're further down.
function MiniBoard({ entries, me, lowerIsBetter }) {
  const myIndex = entries.findIndex(e => sameWallet(e.wallet, me));
  const rows = entries.slice(0, SHOWN).map((e, i) => ({ ...e, rank: i + 1 }));
  const below = myIndex >= SHOWN;
  return (
    <div className="mb">
      {rows.map(e => <BoardRow key={e.wallet} entry={e} me={me} lowerIsBetter={lowerIsBetter} />)}
      {below && <p className="mb-gap">· · ·</p>}
      {below && <BoardRow entry={{ ...entries[myIndex], rank: myIndex + 1 }} me={me} lowerIsBetter={lowerIsBetter} />}
    </div>
  );
}

function BoardRow({ entry, me, lowerIsBetter }) {
  const isMe = sameWallet(entry.wallet, me);
  return (
    <div className={`mb-row${isMe ? " me" : ""}`}>
      <span className="mb-rank" style={MEDALS[entry.rank - 1] ? { color: MEDALS[entry.rank - 1] } : undefined}>#{entry.rank}</span>
      <span className="who">
        <span className="who-avatar"><AddressAvatar address={entry.wallet} /></span>
        <span className="who-name">{shortAddress(entry.wallet)}</span>
        {isMe && <span className="pill-lime">You</span>}
      </span>
      <span className="mb-score">{formatScore(entry.score, lowerIsBetter)}</span>
    </div>
  );
}

function CardArt({ game, tag, endsIn }) {
  return (
    <div className="cmp-art">
      <img src={game.image} alt="" />
      <span className="cmp-tag">{tag}</span>
      <span className="cmp-clock" title="Time left"><Clock3 size={13} /> {endsIn}</span>
    </div>
  );
}

// One shared board a day for everyone; best score (or fastest time) when the day ends wins.
export function DailyChallengeCard({ challenge, address }) {
  const now = useNow();
  const game = gameById(challenge.gameId);
  const kind = challenge.lowerIsBetter ? "track" : "board";
  const myIndex = challenge.entries.findIndex(e => sameWallet(e.wallet, address));
  const mine = challenge.entries[myIndex];

  return (
    <article className="cmp daily">
      <CardArt game={game} tag="Daily challenge" endsIn={countdown(nextDailyReset(now) - now)} />
      <div className="cmp-body">
        <div className="cmp-head">
          <img className="cmp-logo" src={game.logo} alt="" />
          <div>
            <h3 className="cmp-title">{game.title} · {kind} #{challenge.board}</h3>
            <p className="cmp-sub">
              The same {kind} for everyone today. {challenge.lowerIsBetter ? "Fastest time" : "Highest score"} wins when the day resets.
            </p>
          </div>
        </div>

        <div className="cmp-stats">
          <div>
            <p className="cmp-lbl">Your best</p>
            <p className="cmp-val">{mine ? formatScore(mine.score, challenge.lowerIsBetter) : "—"}</p>
          </div>
          <div>
            <p className="cmp-lbl">Your rank</p>
            <p className="cmp-val">{mine ? `#${myIndex + 1}` : "—"}<small>of {challenge.players}</small></p>
          </div>
          <div>
            <p className="cmp-lbl">Attempts</p>
            <p className="cmp-val">{mine ? challenge.attempts : 0}</p>
          </div>
        </div>

        <MiniBoard entries={challenge.entries} me={address} lowerIsBetter={challenge.lowerIsBetter} />

        <div className="cmp-foot">
          <p className="cmp-prize"><Crown size={13} /> #1 +5,000 HP · Top 10 +1,000 HP</p>
          <Link href={`/game/${game.id}?daily=${dateKey(challenge.day)}`} className="btn btn-o">
            Play today's {kind} <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </article>
  );
}

// A weekly tournament open to wallets holding enough HAIR. Free to enter; you must still hold the
// HAIR when it ends to collect a prize.
export function HolderTournamentCard({ tournament, address, hairHeld }) {
  const now = useNow();
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const game = gameById(tournament.gameId);
  const eligible = hairHeld >= TOURNAMENT_MIN_HAIR;

  const join = () => {
    setJoining(true);
    setTimeout(() => {
      setJoined(true);
      setJoining(false);
    }, 900);
  };

  return (
    <article className="cmp holder">
      <CardArt game={game} tag="Holder tournament" endsIn={countdown(tournamentEnd(now) - now)} />
      <div className="cmp-body">
        <div className="cmp-head">
          <img className="cmp-logo" src={game.logo} alt="" />
          <div>
            <h3 className="cmp-title">{game.title} · Week {tournament.week}</h3>
            <p className="cmp-sub">
              For HAIR holders: your best {game.title} score this week counts. Free to enter. Keep holding until it ends to collect your prize.
            </p>
          </div>
        </div>

        <div className="cmp-stats">
          <div>
            <p className="cmp-lbl">Entrants</p>
            <p className="cmp-val">{tournament.players + (joined ? 1 : 0)}</p>
          </div>
          <div>
            <p className="cmp-lbl">Your rank</p>
            <p className="cmp-val">—<small>{joined ? "play to rank" : "not joined"}</small></p>
          </div>
          <div>
            <p className="cmp-lbl">To enter</p>
            <p className="cmp-val">{TOURNAMENT_MIN_HAIR / 1000}K<small>HAIR</small></p>
          </div>
        </div>

        {eligible ? (
          <div className="cmp-gate ok">
            <Check size={16} /> You hold {Math.floor(hairHeld).toLocaleString()} HAIR, so you're eligible.
          </div>
        ) : (
          <div className="cmp-gate">
            <Lock size={15} />
            Hold {TOURNAMENT_MIN_HAIR.toLocaleString()} HAIR to enter. You have {Math.floor(hairHeld).toLocaleString()}
            {" "}({Math.ceil(TOURNAMENT_MIN_HAIR - hairHeld).toLocaleString()} more).
          </div>
        )}

        <MiniBoard entries={tournament.entries} me={address} lowerIsBetter={false} />

        <div className="cmp-foot">
          <p className="cmp-prize"><Crown size={13} /> #1 badge + 10,000 HP · Top 3 badges</p>
          {joined ? (
            <span className="btn btn-claimed"><Check size={12} /> Joined</span>
          ) : eligible ? (
            <button type="button" className="btn btn-p" onClick={join} disabled={joining}>
              {joining && <Loader2 size={12} className="spin" />} Join tournament
            </button>
          ) : (
            <a className="btn btn-n" href={BUY_HAIR_URL} target="_blank" rel="noopener noreferrer">
              Buy HAIR <ArrowUpRight size={12} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
