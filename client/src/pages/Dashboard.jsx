import { Link } from "wouter";
import { CheckCircle2, Zap, ExternalLink, Loader2, ArrowRight, Gamepad2 } from "lucide-react";
import { useAccount, useReadContract } from "wagmi";
import { formatUnits, parseAbi } from "viem";
import { useState, useEffect, useMemo } from "react";
import { CURRENT_SEASON } from "@/lib/season";
import { VOTING_CONTRACT_ADDRESS, VOTING_CONTRACT_ABI } from "@/lib/votingContract";
import { GAMES } from "@/lib/games";
import { LEVELS, getLevelInfo } from "@/lib/levels";
import { usePlayerActivity } from "@/lib/activity";
import { questProgress } from "@/lib/weeklyQuests";
import { useGameSession } from "@/lib/gameSession";
import { MOCK_DATA, MOCK_POINTS, MOCK_MULTIPLIER, MOCK_HAIR, mockProfile } from "@/lib/mockData";
import { useCompetitions } from "@/lib/competitions";
import { AddressAvatar, shortAddress } from "@/components/arena/AddressAvatar";
import { SectionHead, Segmented, DimNumber } from "@/components/arena/Heads";
import { GameCard } from "@/components/arena/GameCard";
import { SegBar } from "@/components/arena/SegBar";
import { ConnectPrompt } from "@/components/arena/ConnectPrompt";
import { SessionBar } from "@/components/arena/SessionBar";
import { RankBadge } from "@/components/arena/RankBadge";
import { DailyChallengeCard, HolderTournamentCard } from "@/components/arena/Competitions";
import X_logo from "@/assets/images/x.jpg";
import Guild_logo from "@/assets/images/hair.png";
import DISCORD_LOGO from '/discord.jpg';
import "@/styles/globals.css";
import "@/styles/hg.css";
import "@/styles/dashboard.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

const HAIR_TOKEN = "0x5B774f563C902FA7b203FB7029ed6eD4Ce274705";
const MIN_HOLD_USD = 1;
const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

// While votes are being recounted, no game is shown as the community favourite.
const VOTES_CALCULATING = true;

// NFTs raise the multiplier to at most this (see the NFT multiplier indexer in docs/development.md).
const MULTIPLIER_CAP = 1.5;

const QUESTS = [
  {
    id: "twitter_follow",
    title: "Follow on X",
    description: "Join the community to unlock +100 HP.",
    points: 100,
    actionLabel: "Follow @HairMaxToken",
    actionClass: "btn-o",
    url: "https://x.com/intent/follow?screen_name=HairMaxToken",
    icon: <img src={X_logo} alt="X" />,
  },
  {
    id: "hairy_person",
    title: "Join Guild HAIR",
    description: "Become a Hairy Person and unlock +200 HP.",
    points: 200,
    actionLabel: "Join Guild",
    actionClass: "btn-n",
    url: "https://guild.xyz/hair",
    icon: <img src={Guild_logo} alt="Guild" />,
  },
  {
    id: "hairy_holder",
    title: "Buy atleast 1$ worth of HAIR!",
    description: "Buy some hair and unlock +10000 HP.",
    points: 10000,
    actionLabel: "Buy now",
    actionClass: "btn-n",
    url: "https://www.sushi.com/hemi/swap?token0=0xad11a8beb98bbf61dbb1aa0f6d6f2ecd87b35afa&token1=0x5b774f563c902fa7b203fb7029ed6ed4ce274705",
    icon: <img src={Guild_logo} />,
  },
  {
    id: "hair_discord",
    title: "Join Hair discord server",
    description: "join and unlock +2000 HP.",
    points: 2000,
    actionLabel: "Join now",
    actionClass: "btn-n",
    url: "https://discord.gg/uNt4FyWvqP",
    icon: <img src={DISCORD_LOGO} />,
  },
];

const PARTNER_GAMES = [
  {
    id: "bro_town",
    title: "Bro Town",
    studio: "Hemi bros",
    description: "A open world MMORPG game.",
    image: "https://pub-6fd72b146dbb4330a7ad961c7c584367.r2.dev/site_assets/hemibrtos.png",
    logo: "https://pub-6fd72b146dbb4330a7ad961c7c584367.r2.dev/site_assets/hemibros.jpg",
    category: "MMORPG",
    url: "https://brotown.net/",
  },
];

const MOSAIC_GAMES = GAMES.filter(g => g.status === "active").slice(0, 4);
const DIFFICULTY_FILTERS = ["All", "Easy", "Medium", "Hard"];
const SORTS = { featured: "Featured", votes: "Most voted", fee: "Lowest fee" };

const sum = (list) => list.reduce((a, b) => a + b, 0);

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ─── Pieces ─────────────────────────────────────────────────────────── */

function PlayerHeader({ address, points, multiplier, rank }) {
  const level = getLevelInfo(points);
  const boost = Math.min(1, Math.max(0, (multiplier - 1) / (MULTIPLIER_CAP - 1)));
  return (
    <section className="dh" style={{ "--rc": level.color }}>
      <div>
        <div className="dh-id">
          <span className="dh-avatar"><AddressAvatar address={address} /></span>
          <div>
            <h1 className="dh-name">{shortAddress(address)}</h1>
            <p className="dh-sub">Season {CURRENT_SEASON}{rank ? ` · Rank #${rank.toLocaleString()}` : ""}</p>
          </div>
        </div>
        <div className="dh-actions">
          <button type="button" className="btn btn-o" onClick={() => scrollToId("games")}>
            Play now <ArrowRight size={12} />
          </button>
          <Link href="/profile" className="btn btn-n">My profile</Link>
        </div>
      </div>

      <div className="dh-stats">
        <div className="dh-stat">
          <p className="dh-lbl">Hair points</p>
          <p className="dh-val"><DimNumber text={points.toLocaleString()} /></p>
        </div>
        <div className="dh-stat">
          <p className="dh-lbl">Multiplier</p>
          <p className="dh-val"><DimNumber text={Number(multiplier).toFixed(2)} /><small>/ {MULTIPLIER_CAP.toFixed(2)}x max</small></p>
          <div className="dh-bar"><SegBar value={boost} max={1} segments={5} label="NFT boost" /></div>
        </div>
        <div className="dh-level">
          <RankBadge level={level} size={64} />
          <div className="dh-stat">
            <p className="dh-lbl">Level</p>
            <p className="dh-val">{level.level}<span className="dim">/{LEVELS.length}</span><small>{level.title}</small></p>
          </div>
        </div>
      </div>
    </section>
  );
}

function BonusTask({ quest, step, onAction, onClaim }) {
  return (
    <div className={`tkc${step === "completed" ? " done" : ""}`}>
      <div className="tkc-top">
        <span className="tk-ico">{quest.icon}</span>
        <span className="tk-pts">+{quest.points.toLocaleString()} HP</span>
      </div>
      <p className="tk-name">{quest.title}</p>
      <div className="tkc-act">
        {step === "idle" && (
          <button type="button" onClick={onAction} className={`btn btn-sm ${quest.actionClass}`}>{quest.actionLabel}</button>
        )}
        {step === "following" && (
          <button type="button" className="btn btn-sm btn-ghost" disabled>
            <Loader2 size={11} className="spin" /> Waiting…
          </button>
        )}
        {(step === "claimable" || step === "verifying") && (
          <button type="button" onClick={onClaim} disabled={step === "verifying"} className="btn btn-sm btn-g">
            {step === "verifying" ? <><Loader2 size={11} className="spin" /> Verifying…</> : <><Zap size={11} /> Claim</>}
          </button>
        )}
        {step === "completed" && (
          <span className="btn btn-sm btn-claimed"><CheckCircle2 size={12} /> Claimed</span>
        )}
      </div>
    </div>
  );
}

// A quest's game logo; quests for any game show four game logos.
function QuestIcon({ gameId }) {
  const game = GAMES.find(g => g.id === gameId);
  if (game) return <span className="tk-ico" title={game.title}><img src={game.logo} alt="" /></span>;
  return (
    <span className="tk-ico mosaic" title="Any game">
      {MOSAIC_GAMES.map(g => <img key={g.id} src={g.logo} alt="" />)}
    </span>
  );
}

function WeeklyQuest({ quest, claimed, claiming, onClaim }) {
  const complete = quest.done >= quest.goal;
  return (
    <div className={`tkc${claimed ? " done" : ""}`}>
      <div className="tkc-top">
        <QuestIcon gameId={quest.game} />
        <span className="tk-pts">+{quest.reward.toLocaleString()} HP</span>
      </div>
      <p className="tk-name">{quest.title}</p>
      <div className="tk-prog">
        <SegBar value={quest.done} max={quest.goal} segments={quest.goal} label={quest.title} />
        <span className="tk-count">{quest.done}/{quest.goal}</span>
      </div>
      <div className="tkc-act">
        {claimed ? (
          <span className="btn btn-sm btn-claimed"><CheckCircle2 size={12} /> Claimed</span>
        ) : complete ? (
          <button type="button" className="btn btn-sm btn-g" onClick={onClaim} disabled={claiming}>
            {claiming ? <Loader2 size={11} className="spin" /> : <Zap size={11} />} Claim
          </button>
        ) : (
          <span className="btn btn-sm btn-ghost">In progress</span>
        )}
      </div>
    </div>
  );
}

// Tasks in two groups: this week's quests and the one-time bonus tasks. Weekly rewards have no
// backend yet, so the weekly group (and its claim, kept in local state) only appears with dev mock data.
function TasksPanel({ plays, questSteps, onAction, onClaim }) {
  const weekly = MOCK_DATA ? questProgress(plays) : [];
  const [tab, setTab] = useState(weekly.length ? "week" : "bonus");
  const [claimed, setClaimed] = useState({});
  const [claiming, setClaiming] = useState(null);

  const claimWeekly = (quest) => {
    setClaiming(quest.id);
    setTimeout(() => {
      setClaimed(c => ({ ...c, [quest.id]: true }));
      setClaiming(null);
    }, 900);
  };

  const openWeekly = weekly.filter(q => !claimed[q.id]);
  const openBonus = QUESTS.filter(q => questSteps[q.id] !== "completed");
  const hpToEarn = sum(openWeekly.map(q => q.reward)) + sum(openBonus.map(q => q.points));
  const tabs = [
    weekly.length > 0 && { value: "week", label: "This week" },
    { value: "bonus", label: "Bonus" },
  ].filter(Boolean);
  const showWeek = tab === "week" && weekly.length > 0;

  return (
    <section className="tasks">
      <SectionHead title="Tasks" count={openWeekly.length + openBonus.length}>
        {hpToEarn > 0 && <span className="pill-lime">+{hpToEarn.toLocaleString()} HP to earn</span>}
        {tabs.length > 1 && <Segmented label="Task group" options={tabs} value={tab} onChange={setTab} />}
      </SectionHead>
      <div className="tk-grid hg-stagger" key={showWeek ? "week" : "bonus"}>
        {showWeek
          ? weekly.map(q => (
            <WeeklyQuest key={q.id} quest={q} claimed={!!claimed[q.id]} claiming={claiming === q.id} onClaim={() => claimWeekly(q)} />
          ))
          : QUESTS.map(q => (
            <BonusTask key={q.id} quest={q} step={questSteps[q.id]} onAction={() => onAction(q)} onClaim={() => onClaim(q)} />
          ))}
      </div>
    </section>
  );
}

function GamesSection({ votes, championId }) {
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("featured");

  const shown = useMemo(() => {
    let list = filter === "All" ? GAMES : GAMES.filter(g => g.difficulty.toLowerCase() === filter.toLowerCase());
    if (sort === "votes") list = [...list].sort((a, b) => (votes[b.id] || 0) - (votes[a.id] || 0));
    if (sort === "fee") list = [...list].sort((a, b) => Number(a.entryFee) - Number(b.entryFee));
    return list;
  }, [filter, sort, votes]);

  return (
    <section className="sec">
      <SectionHead id="games" title="Arcade games" count={GAMES.filter(g => g.status === "active").length}>
        <div className="chips">
          {DIFFICULTY_FILTERS.map(f => (
            <button key={f} type="button" className={`chip${filter === f ? " on" : ""}`} onClick={() => setFilter(f)}>
              {f !== "All" && <i className={`chip-dot ${f.toLowerCase()}`} />}
              {f}
            </button>
          ))}
        </div>
        <select className="hg-select" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort games">
          {Object.entries(SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </SectionHead>
      <div className="gc-grid hg-stagger" key={`${filter}-${sort}`}>
        {shown.map(g => <GameCard key={g.id} game={g} champion={g.id === championId} />)}
      </div>
    </section>
  );
}

function PartnerCard({ game }) {
  return (
    <a href={game.url} target="_blank" rel="noopener noreferrer" className="gc" title={game.description}>
      <div className="gc-art">
        <img src={game.image} alt="" loading="lazy" />
        <span className="gc-fee partner">Partner</span>
      </div>
      <div className="gc-body">
        <h3 className="gc-title">{game.title}</h3>
        <div className="gc-foot">
          <img className="gc-logo" src={game.logo} alt="" />
          <span className="gc-cat">{game.studio}</span>
          <span className="diff">Play <ExternalLink size={11} /></span>
        </div>
      </div>
    </a>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const session = useGameSession();
  const activity = usePlayerActivity(address, GAMES);
  const competitions = useCompetitions(address);

  const [points, setPoints] = useState(null);
  const [multiplier, setMultiplier] = useState(1.0);
  const [rank, setRank] = useState(null);
  const hairPrice = 0.000006;

  const [questSteps, setQuestSteps] = useState(
    () => Object.fromEntries(QUESTS.map(q => [q.id, "idle"]))
  );
  const setStep = (id, step) => setQuestSteps(p => ({ ...p, [id]: step }));

  const { data: allTimeVotesData } = useReadContract({
    address: VOTING_CONTRACT_ADDRESS,
    abi: VOTING_CONTRACT_ABI,
    functionName: "getAllTimeVotes",
    query: { refetchInterval: 15000 },
  });

  const { data: hairBalanceRaw } = useReadContract({
    address: HAIR_TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
    query: { enabled: !!address, refetchInterval: 15000 },
  });

  const { data: hairDecimals } = useReadContract({
    address: HAIR_TOKEN,
    abi: ERC20_ABI,
    functionName: "decimals",
  });

  const hairHeld = MOCK_DATA
    ? MOCK_HAIR
    : hairBalanceRaw != null && hairDecimals != null ? Number(formatUnits(hairBalanceRaw, hairDecimals)) : 0;

  const holderEligible = useMemo(() => {
    if (hairBalanceRaw == null || hairDecimals == null || !hairPrice) return false;
    return Number(formatUnits(hairBalanceRaw, hairDecimals)) * hairPrice >= MIN_HOLD_USD;
  }, [hairBalanceRaw, hairDecimals, hairPrice]);

  const gameVotes = useMemo(() => {
    const base = Object.fromEntries(GAMES.map(g => [g.id, 0]));
    if (!allTimeVotesData) return base;
    const [, keys, votes] = allTimeVotesData;
    keys.forEach((key, i) => {
      if (key in base) base[key] = Number(votes[i]);
    });
    return base;
  }, [allTimeVotesData]);

  const championId = useMemo(() => {
    if (VOTES_CALCULATING || !allTimeVotesData) return null;
    const [top] = Object.entries(gameVotes).sort((a, b) => b[1] - a[1]);
    return top && top[1] > 0 ? top[0] : null;
  }, [allTimeVotesData, gameVotes]);

  useEffect(() => {
    if (!holderEligible) return;
    setQuestSteps(p =>
      p.hairy_holder === "idle" || p.hairy_holder === "following"
        ? { ...p, hairy_holder: "claimable" }
        : p
    );
  }, [holderEligible]);

  useEffect(() => {
    if (!address) return;

    fetch(`${API_BASE}/api/points/get?wallet=${address}`)
      .then(r => r.json())
      .then(d => {
        setPoints(d.points);
        QUESTS.forEach(q => { if (d.tasks?.includes(q.id)) setStep(q.id, "completed"); });
      })
      .catch(err => {
        if (MOCK_DATA) setPoints(MOCK_POINTS);
        else console.error(err);
      });

    fetch(`${API_BASE}/api/profile/${address}`)
      .then(r => r.json())
      .then(d => {
        if (d.multiplier != null) setMultiplier(d.multiplier);
        if (d.rank != null) setRank(d.rank);
      })
      .catch(err => {
        if (MOCK_DATA) {
          setMultiplier(MOCK_MULTIPLIER);
          setRank(mockProfile().rank);
        } else console.error(err);
      });
  }, [address]);

  const handleAction = q => {
    window.open(q.url, "_blank");
    setStep(q.id, "following");
    if (q.id !== "hairy_holder") setTimeout(() => setStep(q.id, "claimable"), 10000);
  };

  const handleClaim = async q => {
    if (!address) return;
    if (q.id === "hairy_holder" && !holderEligible) { setStep(q.id, "idle"); return; }
    setStep(q.id, "verifying");
    try {
      const r = await fetch(`${API_BASE}/api/points/claim`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, task: q.id }),
      });
      const d = await r.json();
      if (r.ok) { setStep(q.id, "completed"); setPoints(d.newTotal); }
      else setStep(q.id, d.alreadyDone ? "completed" : "claimable");
    } catch { setStep(q.id, "claimable"); }
  };

  // wagmi can report connected a render before the address arrives.
  if (!isConnected || !address) return (
    <div className="hg">
      <ConnectPrompt text="Link your wallet to play, earn Hair Points and climb the leaderboard on Hemi." />
    </div>
  );

  return (
    <div className="hg">
      <PlayerHeader address={address} points={points ?? 0} multiplier={multiplier} rank={rank} />

      {/* Tasks and the game session share a row; without game sessions, Tasks take it all. */}
      <div className={`dash-row no-rise hg-seq${session.enabled ? "" : " solo"}`}>
        <TasksPanel plays={activity.plays} questSteps={questSteps} onAction={handleAction} onClaim={handleClaim} />
        <SessionBar />
      </div>

      {competitions && (
        <section className="sec">
          <SectionHead title="Compete" count={2} />
          <div className="cmp-grid hg-stagger">
            <DailyChallengeCard challenge={competitions.daily} address={address} />
            <HolderTournamentCard tournament={competitions.tournament} address={address} hairHeld={hairHeld} />
          </div>
        </section>
      )}

      <GamesSection votes={gameVotes} championId={championId} />

      <section className="sec">
        <SectionHead title="Partner games" count={PARTNER_GAMES.length} />
        <div className="gc-grid hg-stagger">
          {PARTNER_GAMES.map(g => <PartnerCard key={g.id} game={g} />)}
        </div>
      </section>

      {MOCK_DATA && (
        <p className="db-mock"><Gamepad2 size={12} /> Local dev: points, quests, competitions and the game session use mock data.</p>
      )}
    </div>
  );
}
