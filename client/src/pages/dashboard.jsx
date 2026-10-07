import { Link } from "wouter";
import {
  CheckCircle2, Play, Gamepad2, Zap, Star, ExternalLink, Loader2, Handshake, Sparkles, Settings
} from "lucide-react";
import { GiCrenelCrown } from "react-icons/gi";
import { MdOutlineWallet } from "react-icons/md";
import { FaEthereum } from "react-icons/fa";
import { GAME_COST_ETH } from "@/lib/web3";
import { VOTING_CONTRACT_ADDRESS, VOTING_CONTRACT_ABI } from "@/lib/votingContract";
import {
  useAccount, useBalance, useReadContract
} from "wagmi";
import { formatUnits, parseAbi } from "viem";
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
import popthumbnail from "/game_assets/popthumbnail.png";
import DISCORD_LOGO from '/discord.jpg';

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

const HAIR_TOKEN = "0x5B774f563C902FA7b203FB7029ed6eD4Ce274705";
const MIN_HOLD_USD = 1;
const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

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

const GAMES = [
  {
    id: "proof_of_patience",
    title: "Proof of Patience",
    description: "A meme game about Midweek Max's Hemi team's long-awaited answers to questions",
    entryFee: 0.000008,
    image: popthumbnail,
    logo: FruitLogo,
    category: "Shooting",
    accent: "#D2042D",
    status: "active",
    difficulty: "Easy",
  },
  {
    id: "max_fruitninja",
    title: "Max Fruit Slicer 200",
    description: "Slash some Fruits... But You have to be careful like a ninja",
    entryFee: GAME_COST_ETH,
    image: FruitBanner,
    logo: FruitLogo,
    category: "Slicer",
    accent: "#2563eb",
    status: "active",
    difficulty: "Easy",
  },
  {
    id: "space_shooter",
    title: "Void Striker",
    description: "Classic 8-bit block mechanics meets high-speed cyber logic.",
    entryFee: GAME_COST_ETH,
    logo: voidStriker_LOGO,
    image: "https://pub-6fd72b146dbb4330a7ad961c7c584367.r2.dev/site_assets/image0.png",
    category: "Shooter",
    accent: "#9b6bff",
    status: "active",
    difficulty: "HARD",
  },
  {
    id: "space_huggers",
    title: "Space Huggers",
    description: "Complete the Mission",
    entryFee: "0.00001",
    image: SH_banner,
    logo: SH_logo,
    category: "Adventure",
    accent: "#16a34a",
    status: "active",
    difficulty: "Medium",
  },
  {
    id: "race_car",
    title: "NEED FOR HAIR",
    description: "THREE!!  TWO!!  ONE!!  GO!!!    |  Be careful, don't lose your HP... Slow down!!!",
    entryFee: GAME_COST_ETH,
    image: needBanner,
    logo: NFH_LOGO,
    category: "Racing",
    accent: "#ff4d6d",
    status: "active",
    difficulty: "Easy",
  },
  {
    id: "fishing_game",
    title: "Max Prø Fishing 2026",
    description: "Catch fishes and sell them.",
    entryFee: GAME_COST_ETH,
    image: "/game_assets/fishingbanner.png",
    logo: FishingLogo,
    category: "Fishing",
    accent: "#0d9488",
    status: "active",
    difficulty: "HARD",
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
    accent: "#64748b",
    url: "https://brotown.net/",
  },
];

function QuestRow({ quest, step, onAction, onClaim }) {
  return (
    <motion.div
      className={`t-row${step === "completed" ? " done" : ""}`}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
    >
      <div className="t-ico">{quest.icon}</div>
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
          <button onClick={onAction} className={`btn ${quest.actionClass}`}>
            {quest.actionLabel}
          </button>
        )}
        {step === "following" && (
          <button className="btn btn-ghost" disabled>
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
          <div className="btn btn-claimed">
            <CheckCircle2 size={13} /> Claimed
          </div>
        )}
      </div>
    </motion.div>
  );
}

function GameCard({ game, index }) {
  const live = game.status === "active";

  return (
    <motion.div
      className="g-card"
      style={{ "--g-accent": game.accent }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      whileHover={live ? { y: -4 } : {}}
    >
      <div className="g-banner-container">
        <div className="g-banner" style={{ backgroundImage: `url(${game.image})` }} />
        <span className="g-diff">{game.difficulty}</span>
      </div>

      <div className="g-body">
        <div className="g-head">
          <h3 className="g-title">{game.title}</h3>
          {game.category && <span className="g-cat">{game.category}</span>}
        </div>

        <p className="g-desc">{game.description}</p>

        <div className="g-foot">
          <div className="g-fee">
            <span className="g-fee-lbl">Entry Fee</span>
            <span className="g-fee-val">{game.entryFee}<small>ETH</small></span>
          </div>
          {live ? (
            <Link href={`/game/${game.id}`} className="btn btn-o">Play Now</Link>
          ) : (
            <button className="btn btn-off" disabled>Closed</button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function PartnerGameCard({ game, index }) {
  return (
    <motion.div
      className="g-card"
      style={{ "--g-accent": game.accent }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      whileHover={{ y: -4 }}
    >
      <div className="g-banner-container">
        <div className="g-banner" style={{ backgroundImage: `url(${game.image})` }} />
        <span className="g-badge"><Handshake size={10} /> Partner</span>
      </div>

      <div className="g-body">
        <div className="g-head">
          <h3 className="g-title">{game.title}</h3>
          {game.category && <span className="g-cat">{game.category}</span>}
        </div>

        <p className="g-desc">{game.description}</p>

        <a href={game.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-block">
          <ExternalLink size={12} /> Play on Partner Site
        </a>
      </div>
    </motion.div>
  );
}

function HallOfFame({ game, totalVotes, isLoading }) {
  if (isLoading) {
    return (
      <motion.section
        className="hof"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          minHeight: "320px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.25rem",
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.05)",
          borderRadius: "24px"
        }}
      >
        <Settings size={44} className="spin" color="rgba(255, 255, 255, 0.2)" style={{ animationDuration: '3.5s' }} />
        <span style={{
          fontFamily: "monospace",
          fontSize: "12px",
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          color: "rgba(255, 255, 255, 0.35)",
          fontWeight: "bold"
        }}>
          Vote Calculating....
        </span>
      </motion.section>
    );
  }

  if (!game) return null;

  const words = game.title.split(" ");
  const cut = Math.ceil(words.length / 2);
  const head = words.slice(0, cut).join(" ");
  const tail = words.slice(cut).join(" ");
  const votes = totalVotes.toLocaleString();

  return (
    <motion.section
      className="hof"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="hof-bg" style={{ backgroundImage: `url(${game.image})` }} />

      <div className="hof-side">
        <div className="hof-medal">
          <div className="hof-avatar" style={{ backgroundImage: `url(${game.logo || game.image})` }} />
          <div className="hof-rank"><GiCrenelCrown size={13} /> Rank #1</div>
        </div>
        <span className="hof-cap">Community Favorite</span>
      </div>

      <div className="hof-main">
        <div className="hof-badges">
          <span className="hof-badge">Hall of Fame</span>
          <span className="hof-sep" />
          <span className="hof-kicker">All-Time Champion</span>
        </div>

        <h2 className="hof-title">{head} {tail && <em>{tail}</em>}</h2>

        <p className="hof-text">
          The undisputed king of the arena. Crowned by over <strong>{votes} community votes</strong>. {game.description}
        </p>

        <div className="hof-stats">
          <div className="hof-stat">
            <span className="hof-stat-lbl">Total Votes</span>
            <span className="hof-stat-val"><Sparkles size={16} />{votes}</span>
          </div>
          {game.category && (
            <div className="hof-stat">
              <span className="hof-stat-lbl">Category</span>
              <span className="hof-stat-val">{game.category}</span>
            </div>
          )}
        </div>

        <div className="hof-actions">
          <Link href={`/game/${game.id}`} className="btn btn-o btn-lg">
            <Play size={13} fill="currentColor" stroke="none" /> Enter the Arena
          </Link>
          <Link href="/leaderboard" className="btn btn-glass btn-lg">View Leaderboard</Link>
        </div>
      </div>
    </motion.section>
  );
}

function Stat({ icon: Icon, label, value, suffix, accent, index, note, highlight, filled }) {
  return (
    <motion.div className="stat"
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}>
      <div className="stat-ico" style={{ background: `${accent}14`, color: accent }}>
        <Icon size={20} {...(filled && { fill: "currentColor" })} />
      </div>
      <div>
        <div className="stat-lbl">{label}</div>
        <div className="stat-val">{value}{suffix && <span>{suffix}</span>}</div>
        {note && <div className={`stat-note${highlight ? " accent" : ""}`}>{note}</div>}
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const { data: ethBalanceData } = useBalance({ address });


  const IS_CALCULATING_EPOCH = true;

  const [points, setPoints] = useState(null);
  const [multiplier, setMultiplier] = useState(1.0);
  const hairPrice = 0.000006;

  const [questSteps, setQuestSteps] = useState(
    () => Object.fromEntries(QUESTS.map(q => [q.id, "idle"]))
  );
  const setStep = (id, step) => setQuestSteps(p => ({ ...p, [id]: step }));

  const { data: allTimeVotesData, isLoading: isVotesLoading } = useReadContract({
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

  const rankedGames = useMemo(() => {
    return [...GAMES]
      .filter(g => g.status === "active")
      .sort((a, b) => (gameVotes[b.id] || 0) - (gameVotes[a.id] || 0));
  }, [gameVotes]);

  const totalVotes = useMemo(
    () => Object.values(gameVotes).reduce((sum, v) => sum + (v || 0), 0),
    [gameVotes]
  );

  const championGame = rankedGames[0];

  if (!isConnected) return (
    <div className="db">
      <div className="conn">
        <motion.div className="conn-orb"
          initial={{ scale: .8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: .5, ease: "backOut" }}>
          <Gamepad2 size={38} color="#f97316" />
        </motion.div>
        <motion.div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 }}>
          <h2 className="conn-title">Connect to Play</h2>
          <p className="conn-sub">Link your wallet to access the arena, earn points, and compete on Hemi.</p>
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .28 }}>
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button onClick={openConnectModal} className="btn btn-o btn-lg">
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
      <div className="db-inner">

        <motion.div className="hdr"
          initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }}>
          <div className="hdr-eye">
            <span className="ldot" />
            Hemi Network • @{short}
          </div>
          <h1 className="hdr-title">Your <em>Arena</em></h1>
          <p className="hdr-sub">
            Compete in on-chain games, complete quests, and accumulate points on the Hemi network. Track your progress and climb the leaderboard.
          </p>
        </motion.div>

        <motion.div className="stats"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .1 }}>
          <Stat index={0} icon={FaEthereum} label="ETH Balance" value={ethVal} suffix="ETH" accent="#2563eb" note="On Hemi" highlight />
          <Stat index={1} icon={Zap} filled label="Multiplier" value={Number(multiplier).toFixed(2)} suffix="x" accent="#f97316" note={multiplier > 1 ? "Boosted" : "Base Rate"} />
          <Stat index={2} icon={Star} filled label="Total Points" value={points ?? 0} suffix="HP" accent="#9333ea" note="Lifetime Earned" />
        </motion.div>

        <section className="sec">
          <div className="s-head inline">
            <h2 className="s-title">Bonus Tasks</h2>
            <span className="s-pill">Earn Rewards</span>
          </div>
          <div className="t-list">
            {QUESTS.map(q => (
              <QuestRow key={q.id} quest={q} step={questSteps[q.id]}
                onAction={() => handleAction(q)} onClaim={() => handleClaim(q)} />
            ))}
          </div>
        </section>

        <HallOfFame 
          game={championGame} 
          totalVotes={totalVotes} 
          isLoading={IS_CALCULATING_EPOCH || isVotesLoading || !allTimeVotesData} 
        />

        <section className="sec">
          <div className="s-head">
            <div>
              <h2 className="s-title">Arcade Games</h2>
              <p className="s-sub">Live cabinets on the Hemi network</p>
            </div>
            <span className="s-tag"><b>{rankedGames.length}</b>Live Cabinets</span>
          </div>
          <div className="g-grid">
            {GAMES.map((g, i) => (
              <GameCard key={g.id} game={g} index={i} />
            ))}
          </div>
        </section>

        <section className="sec">
          <div className="s-head">
            <div>
              <h2 className="s-title">Partner Games</h2>
              <p className="s-sub">Expanding the Hair ecosystem with strategic partners</p>
            </div>
            <span className="s-tag"><b>{PARTNER_GAMES.length}</b>{PARTNER_GAMES.length === 1 ? "Partner" : "Partners"}</span>
          </div>
          <div className="g-grid">
            {PARTNER_GAMES.map((g, i) => (
              <PartnerGameCard key={g.id} game={g} index={i} />
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}