import { Link } from "wouter";
import {
  Search, CheckCircle2, Play, Gamepad2, Zap, Trophy, ExternalLink, Loader2, TrendingUp
} from "lucide-react";
import { GiCrenelCrown } from "react-icons/gi";
import { MdOutlineWallet } from "react-icons/md";
import { RiCopperCoinFill } from "react-icons/ri";
import { GAME_COST_ETH } from "@/lib/web3";
import { VOTING_CONTRACT_ADDRESS, VOTING_CONTRACT_ABI } from "@/lib/votingContract";
import {
  useAccount, useBalance, usePublicClient, useReadContract, useWriteContract
} from "wagmi";
import { useState, useEffect, useMemo } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import X_logo from "../assets/x.jpg";
import Guild_logo from "../assets/hair.png";
import { motion } from "framer-motion";
import "../index.css";
import "../style/dashboard.css";
import FishingLogo from "/game_assets/fishing.png";
import FruitLogo from "/game_assets/fruitlogo.png";
import FruitBanner from "/game_assets/FruitBanner.png";
import SH_logo from "/game_assets/space-huggers-logo.png";
import SH_banner from "/game_assets/spaceHuggerBanner.png";
import NFH_LOGO from "/game_assets/NeedforHairlogo.png";
import voidStriker_LOGO from "/game_assets/voidStrikerLogo.png";
import needBanner from "/game_assets/needBanner.png";


const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

/*  Font Injection */
if (!document.getElementById("dashboard-fonts")) {
  const l = document.createElement("link");
  l.id = "dashboard-fonts"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&family=Instrument+Sans:wght@400;500;700;900&display=swap";
  document.head.appendChild(l);
}

/*  Data  */
const QUESTS = [
  {
    id: "twitter_follow",
    title: "Follow on X",
    description: "Join the community to unlock +100 PTS.",
    points: 100,
    actionLabel: "Follow @HairMaxToken",
    url: "https://x.com/intent/follow?screen_name=HairMaxToken",
    accent: "#ffb62e",
    icon: <img src={X_logo} alt="X" style={{ width: "100%", height: "100%", objectFit: "cover" }} />,
  },
  {
    id: "hairy_person",
    title: "Join Guild HAIR",
    description: "Become a Hairy Person and unlock +200 PTS.",
    points: 200,
    actionLabel: "Join Guild",
    url: "https://guild.xyz/hair",
    accent: "#9b6bff",
    icon: <img src={Guild_logo} alt="Guild" style={{ width: "100%", height: "100%", objectFit: "cover" }} />,
  },
];

// Game "id" below must exactly match the keys registered on-chain via
// BestGameVoting.addGame(key), in the same order, so the contract's
// getGames()/getAllVotes() results line up with this list.
const GAMES = [
  {
    id: "max_fruitninja",
    title: "Max Fruit Slicer 200",
    description: "Slash some Fruits... But You have to be careful like a ninja",
    entryFee: `${GAME_COST_ETH} ETH`,
    image: FruitBanner,
    logo: FruitLogo,
    icon: Gamepad2,
    category: "Slicer",
    accent: "#ff964f",
    status: "active",
    difficulty: "Easy",
    isHighlighted: true,
  },
  {
    id: "space_shooter",
    title: "Void Striker",
    description: "Classic 8-bit block mechanics meets high-speed cyber logic.",
    entryFee: `${GAME_COST_ETH} ETH`,
    logo: voidStriker_LOGO,
    image: "https://pub-6fd72b146dbb4330a7ad961c7c584367.r2.dev/site_assets/image0.png",
    icon: Gamepad2,
    category: "Shooter",
    accent: "#49d9ec",
    status: "active",
    difficulty: "HARD",
    isHighlighted: true,
  },
  {
    id: "space_huggers",
    title: "Space Huggers",
    description: "Complete the Mission",
    entryFee: `0.00001 ETH `,
    image: SH_banner,
    logo: SH_logo,
    icon: Search,
    category: "Adventure",
    accent: "#9b6bff",
    status: "active",
    difficulty: "Medium",
    isHighlighted: true,
  },
  {
    id: "race_car",
    title: "NEED FOR HAIR",
    description: "THREE!!  TWO!!  ONE!!  GO!!!    |  Be careful, don't lose your HP... Slow down!!!",
    entryFee: `${GAME_COST_ETH} ETH `,
    image: needBanner,
    icon: Search,
    logo: NFH_LOGO,
    category: "Racing",
    accent: "#ff4d6d",
    status: "active",
    difficulty: "Easy",
    isHighlighted: true,
  },
  {
    id: "fishing_game",
    title: "Max Prø Fishing 2026",
    description: "Catch fishes and sell them.",
    entryFee: `${GAME_COST_ETH} ETH `,
    image: "/game_assets/fishingbanner.png",
    logo: FishingLogo,
    icon: Gamepad2,
    category: "Fishing",
    accent: "#34d399",
    status: "active",
    difficulty: "HARD",
    isHighlighted: true,
  },
];

const MAX_VOTES_PER_DAY = 10;
const VOTE_REWARD = 5000;
const MARQUEE_BULBS = Array.from({ length: 16 });

function formatCountdown(totalSeconds) {
  if (totalSeconds == null) return "—";
  const clamped = Math.max(0, totalSeconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/*  MarqueeLights  */
function MarqueeLights({ className = "" }) {
  return (
    <div className={`marquee-lights ${className}`}>
      {MARQUEE_BULBS.map((_, i) => (
        <span key={i} style={{ animationDelay: `${i * 0.09}s` }} />
      ))}
    </div>
  );
}

/*  QuestRow  */
function QuestRow({ quest, step, onAction, onClaim }) {
  return (
    <motion.div
      className={`t-row${step === "completed" ? " done" : ""}`}
      style={{ "--t-accent": quest.accent }}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
    >
      <div className="t-stub">
        <div className="t-ico">{quest.icon}</div>
      </div>
      <div className="t-txt">
        <p className="t-name">{quest.title}</p>
        <p className="t-desc">{quest.description}</p>
      </div>
      <div className="t-pts">
        <small>Reward</small>
        +{quest.points} PTS
      </div>
      <div style={{ flexShrink: 0 }}>
        {step === "idle" && (
          <button onClick={onAction} className="btn btn-o">
            {quest.actionLabel} <ExternalLink size={11} />
          </button>
        )}
        {step === "following" && (
          <button className="btn btn-ghost" disabled style={{ opacity: .55 }}>
            <Loader2 size={12} className="spin" /> Waiting…
          </button>
        )}
        {(step === "claimable" || step === "verifying") && (
          <button onClick={onClaim} disabled={step === "verifying"} className="btn btn-g">
            {step === "verifying"
              ? <><Loader2 size={12} className="spin" /> Verifying…</>
              : <><Zap size={11} /> Claim Reward</>}
          </button>
        )}
        {step === "completed" && (
          <motion.div initial={{ scale: .85 }} animate={{ scale: 1 }} className="btn btn-claimed">
            <CheckCircle2 size={13} /> Claimed
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

/*  GameCard  */
function GameCard({ game, index, isLeader }) {
  const BIcon = game.icon;
  const live = game.status === "active";
  const accent = game.accent || "var(--marquee)";
  const highlighted = game.isHighlighted;

  return (
    <motion.div
      className={`g-card${live ? " live" : ""}${highlighted ? " highlighted" : ""}`}
      style={{ "--g-accent": accent, "--g-accent-glow": `${accent}15` }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      whileHover={live ? { y: -6, scale: 1.01 } : {}}
    >
      {highlighted && (
        <div className="g-highlight-badge">
          <Zap size={10} fill="currentColor" />
          <span>FEATURED</span>
        </div>
      )}

      <div className="g-banner-container">
        <div className="g-banner" style={{ backgroundImage: `url(${game.image})` }} />
        <div className="g-banner-grad" />
        <span className="g-diff">{game.difficulty}</span>
      </div>

      <div
        className="g-logo"
        style={{
          background: game.logoBg || `linear-gradient(135deg, ${accent}25, ${accent}10)`,
          border: `1.5px solid ${accent}50`,
        }}
      >
        {game.logo ? (
          <img src={game.logo} alt={`${game.title} logo`}
            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
        ) : (
          <BIcon size={18} color={game.logoColor || accent} />
        )}
      </div>

      <div className="g-body">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h3 className="g-title">{game.title}</h3>
          {game.category && (
            <span className="g-cat" style={{ color: accent, background: `${accent}12`, border: `1px solid ${accent}25` }}>
              {game.category}
            </span>
          )}
        </div>

        <p className="g-desc">{game.description}</p>

        <div className="g-fee">
          <span className="g-fee-lbl">Entry Fee</span>
          <span className="g-fee-val">{game.entryFee}</span>
        </div>

        {live ? (
          <Link href={`/game/${game.id}`} style={{ textDecoration: "none" }}>
            <button className="btn btn-g g-play-btn" style={{ width: "100%", marginTop: "12px" }}>
              <Play size={12} fill="currentColor" stroke="none" /> Play Now
            </button>
          </Link>
        ) : (
          <button className="btn btn-off" style={{ width: "100%", marginTop: "12px" }} disabled>
            Closed
          </button>
        )}
      </div>
    </motion.div>
  );
}

/*  VoteRow  */
function VoteRow({ game, rank, votes, totalVotes, onVote, isVoting, canVote }) {
  const accent = game.accent || "var(--marquee)";
  const pct = totalVotes > 0 ? Math.max((votes / totalVotes) * 100, 3) : 3;

  return (
    <motion.div
      className={`v-row${rank === 1 ? " leader" : ""}`}
      style={{ "--v-accent": accent }}
      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.05 }}
    >
      <div className="v-rank">
        {rank === 1 ? <GiCrenelCrown size={26}/> : <span>{rank}</span>}
      </div>

      <div className="v-logo" style={{ border: `1.5px solid ${accent}50` }}>
        {game.logo ? (
          <img src={game.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
        ) : (
          <Gamepad2 size={16} color={accent} />
        )}
      </div>

      <div className="v-info">
        <p className="v-title">{game.title}</p>
        <div className="v-bar-track">
          <motion.div className="v-bar-fill" style={{ background: accent }}
            initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
        </div>
      </div>

      <div className="v-count">
        {votes.toLocaleString()}<small>votes</small>
      </div>

      <button className="btn btn-ticket" onClick={() => onVote(game.id)} disabled={!canVote || isVoting}>
        {isVoting
          ? <Loader2 size={12} className="spin" />
          : <>Vote<span className="v-reward">+5K HP</span></>}
      </button>
    </motion.div>
  );
}

/*  Stat  */
function Stat({ icon: Icon, label, value, suffix, accent, index, note }) {
  return (
    <motion.div className="stat"
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}>
      <div className="stat-ico" style={{ background: `${accent}12`, border: `1px solid ${accent}22` }}>
        <Icon size={16} color={accent} />
      </div>
      <div className="stat-lbl">{label}</div>
      <div className="stat-val">{value}{suffix && <span>{suffix}</span>}</div>
      {note && <div className="stat-note"><TrendingUp size={10} />{note}</div>}
    </motion.div>
  );
}

/*  Dashboard  */
export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const { data: ethBalanceData } = useBalance({ address });
  const publicClient = usePublicClient();

  const [points, setPoints] = useState(null);
  const [multiplier, setMultiplier] = useState(1.0);
  const [votingGameId, setVotingGameId] = useState(null);
  const [resetCountdown, setResetCountdown] = useState(null);

  const [questSteps, setQuestSteps] = useState(
    () => Object.fromEntries(QUESTS.map(q => [q.id, "idle"]))
  );
  const setStep = (id, step) => setQuestSteps(p => ({ ...p, [id]: step }));

  /*  On-chain voting reads  */
  const { data: gamesData } = useReadContract({
    address: VOTING_CONTRACT_ADDRESS,
    abi: VOTING_CONTRACT_ABI,
    functionName: "getGames",
  });

  const { data: allVotesData, refetch: refetchAllVotes } = useReadContract({
    address: VOTING_CONTRACT_ADDRESS,
    abi: VOTING_CONTRACT_ABI,
    functionName: "getAllVotes",
    query: { refetchInterval: 15000 },
  });

  const { data: userVotesData, refetch: refetchUserVotes } = useReadContract({
    address: VOTING_CONTRACT_ADDRESS,
    abi: VOTING_CONTRACT_ABI,
    functionName: "getUserVotes",
    args: [address],
    query: { enabled: Boolean(address), refetchInterval: 15000 },
  });

  const { data: secondsUntilReset } = useReadContract({
    address: VOTING_CONTRACT_ADDRESS,
    abi: VOTING_CONTRACT_ABI,
    functionName: "timeUntilReset",
    query: { refetchInterval: 30000 },
  });

  const { writeContractAsync } = useWriteContract();

  const gameIdByKey = useMemo(() => {
    if (!gamesData) return {};
    const [ids, keys] = gamesData;
    return Object.fromEntries(keys.map((k, i) => [k, Number(ids[i])]));
  }, [gamesData]);

  const gameVotes = useMemo(() => {
    const base = Object.fromEntries(GAMES.map(g => [g.id, 0]));
    if (!allVotesData) return base;
    const [, keys, votes] = allVotesData;
    keys.forEach((key, i) => {
      if (key in base) base[key] = Number(votes[i]);
    });
    return base;
  }, [allVotesData]);

  const votesUsedToday = userVotesData ? Number(userVotesData[3]) : 0;
  const votesLeftToday = userVotesData ? Number(userVotesData[4]) : MAX_VOTES_PER_DAY;

  // Smoothly ticks the reset countdown down each second, resyncing to the
  // on-chain value whenever the underlying read refetches.
  useEffect(() => {
    if (secondsUntilReset == null) return;
    let remaining = Number(secondsUntilReset);
    setResetCountdown(remaining);
    const id = setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      setResetCountdown(remaining);
    }, 1000);
    return () => clearInterval(id);
  }, [secondsUntilReset]);

  /* Points / profile (off-chain)  */
  useEffect(() => {
    if (!address) return;

    fetch(`${API_BASE}/api/points/get?wallet=${address}`)
      .then(r => r.json())
      .then(d => {
        setPoints(d.points);
        QUESTS.forEach(q => { if (d.tasks?.includes(q.id)) setStep(q.id, "completed"); });
      }).catch(console.error);

    fetch(`${API_BASE}/api/profile/${address}`)
      .then(r => r.json())
      .then(d => {
        if (d.multiplier != null) setMultiplier(d.multiplier);
      })
      .catch(console.error);
  }, [address]);

  const handleAction = q => {
    window.open(q.url, "_blank");
    setStep(q.id, "following");
    setTimeout(() => setStep(q.id, "claimable"), 10000);
  };

  const handleClaim = async q => {
    if (!address) return;
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

  const handleVote = async (gameKey) => {
    if (!address) return;
    const onChainId = gameIdByKey[gameKey];
    if (onChainId === undefined || votesLeftToday <= 0) return;

    setVotingGameId(gameKey);
    try {
      const hash = await writeContractAsync({
        address: VOTING_CONTRACT_ADDRESS,
        abi: VOTING_CONTRACT_ABI,
        functionName: "vote",
        args: [onChainId],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await Promise.all([refetchAllVotes(), refetchUserVotes()]);

      const r = await fetch(`${API_BASE}/api/points/vote`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, txHash: hash }),
      });
      const d = await r.json();
      if (r.ok) setPoints(d.points);
    } catch (err) {
      console.error("On-chain vote failed:", err);
    } finally {
      setVotingGameId(null);
    }
  };

  const rankedGames = useMemo(() => {
    return [...GAMES]
      .filter(g => g.status === "active")
      .sort((a, b) => (gameVotes[b.id] || 0) - (gameVotes[a.id] || 0));
  }, [gameVotes]);

  const totalVotes = useMemo(
    () => Object.values(gameVotes).reduce((sum, v) => sum + (v || 0), 0),
    [gameVotes]
  );

  const leaderId = rankedGames[0]?.id;

  if (!isConnected) return (
    <div className="db">
      <div className="db-glow1" /><div className="db-glow2" /><div className="db-noise" />
      <div className="conn">
        <motion.div className="conn-orb"
          initial={{ scale: .8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: .5, ease: "backOut" }}>
          <Gamepad2 size={38} color="var(--marquee)" />
        </motion.div>
        <motion.div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 }}>
          <h2 className="conn-title">Connect to Play</h2>
          <p className="conn-sub">Link your wallet to access the arena, earn points, and compete on Hemi.</p>
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .28 }}>
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button onClick={openConnectModal} className="btn btn-g"
                style={{ padding: "13px 26px", fontSize: "11px", borderRadius: "11px" }}>
                <MdOutlineWallet size={15} /> Connect Wallet
              </button>
            )}
          </ConnectButton.Custom>
        </motion.div>
      </div>
    </div>
  );

  const ethVal = ethBalanceData ? Number(ethBalanceData.formatted).toFixed(5) : "0.00000";
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  return (
    <div className="db">
      <div className="db-glow1" /><div className="db-glow2" /><div className="db-noise" />
      <div className="db-inner">

        {/* Header */}
        <motion.div className="hdr"
          initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }}>
          <div className="hdr-eye">
            <span className="ldot" />
            Hemi Network · {short}
          </div>
          <h1 className="hdr-title">Your <em>Arena</em></h1>
          <p className="hdr-sub">Compete in on-chain games, complete quests, and accumulate points on the Hemi network.</p>
          <MarqueeLights className="hdr-lights" />
        </motion.div>

        {/* Stats */}
        <motion.div className="stats"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .1 }}>
          <Stat index={0} icon={MdOutlineWallet} label="ETH Balance" value={ethVal} suffix="ETH" accent="#49d9ec" note="On Hemi" />
          <Stat index={1} icon={Trophy} label="Multiplier" value={`${Number(multiplier).toFixed(2)}×`} accent="#ff964f" />
          <Stat index={2} icon={RiCopperCoinFill} label="Total Points" value={points ?? 0} suffix="HP" accent="#9b6bff" note={`+${(votesUsedToday * VOTE_REWARD).toLocaleString()} HP from voting`} />
        </motion.div>

        {/* Quests */}
        <section style={{ marginBottom: 52 }}>
          <div className="s-head">
            <h2 className="s-title">Bonus Tasks</h2>
            <span className="s-tag">Earn Rewards</span>
          </div>
          <div className="t-list">
            {QUESTS.map(q => (
              <QuestRow key={q.id} quest={q} step={questSteps[q.id]}
                onAction={() => handleAction(q)} onClaim={() => handleClaim(q)} />
            ))}
          </div>
        </section>

        {/* Games */}
        <section style={{ marginBottom: 52 }}>
          <div className="s-head">
            <h2 className="s-title">Arcade Games</h2>
            <span className="s-tag">5 Live Cabinets</span>
          </div>
          <div className="g-grid">
            {GAMES.map((g, i) => (
              <GameCard key={g.id} game={g} index={i} isLeader={g.id === leaderId && totalVotes > 0} />
            ))}
          </div>
        </section>

        {/* Voting — Best Game Award */}
        <section className="vote-cabinet">
          <MarqueeLights className="cabinet-lights" />
          <div className="vote-head">
            <div>
              <div className="vote-eye">Season 8</div>
              <h2 className="vote-title">Best Game Award</h2>
              <p className="vote-sub">
                Cast a free vote every day. Each vote earns {VOTE_REWARD.toLocaleString()} HP.
                Votes reset daily at 12:00 AM UTC — next reset in <strong className="ml-2 text-yellow-300">{formatCountdown(resetCountdown)}</strong>.
              </p>
            </div>
            <div className={`vote-tally${votesLeftToday > 0 ? "" : " empty"}`}>
              <span className="vote-tally-n">{votesLeftToday}</span>
              <span className="vote-tally-lbl">/ {MAX_VOTES_PER_DAY}<br />votes left today</span>
            </div>
          </div>

          <div className="v-list">
            {rankedGames.map((g, i) => (
              <VoteRow
                key={g.id}
                game={g}
                rank={i + 1}
                votes={gameVotes[g.id] || 0}
                totalVotes={totalVotes}
                onVote={handleVote}
                isVoting={votingGameId === g.id}
                canVote={votesLeftToday > 0}
              />
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}