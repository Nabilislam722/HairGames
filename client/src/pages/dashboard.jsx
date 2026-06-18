import { Link } from "wouter";
import {
  RocketIcon, BrainCircuit, Search,
  CheckCircle2, Play, Wallet, Gamepad2,
  Star, Zap, Trophy, ExternalLink, Loader2, TrendingUp
} from "lucide-react";
import { GAME_COST_ETH } from "@/lib/web3";
import { useBalance, useAccount } from "wagmi";
import { useState, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import X_logo from "../assets/x.jpg";
import Guild_logo from "../assets/hair.png";
import { motion } from "framer-motion";
import "../index.css";
import "../components/dashboard.css";

/* ─── Font Injection ─────────────────────────────────────────────────────── */
if (!document.getElementById("dashboard-fonts")) {
  const l = document.createElement("link");
  l.id = "dashboard-fonts"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap";
  document.head.appendChild(l);
}

/* ─── Data ───────────────────────────────────────────────────────────────── */
const QUESTS = [
  {
    id: "twitter_follow",
    title: "Follow on X",
    description: "Join the community to unlock +100 PTS.",
    points: 100,
    actionLabel: "Follow @HairMaxToken",
    url: "https://x.com/intent/follow?screen_name=HairMaxToken",
    accent: "#38bdf8",
    icon: <img src={X_logo} alt="X" style={{ width:"100%",height:"100%",objectFit:"cover" }} />,
  },
  {
    id: "hairy_person",
    title: "Join Guild HAIR",
    description: "Become a Hairy Person and unlock +200 PTS.",
    points: 200,
    actionLabel: "Join Guild",
    url: "https://guild.xyz/hair",
    accent: "#a78bfa",
    icon: <img src={Guild_logo} alt="Guild" style={{ width:"100%",height:"100%",objectFit:"cover" }} />,
  },
];

const GAMES = [
  {
    id: "space_shooter",
    title: "Void Striker",
    description: "Classic 8-bit block mechanics meets high-speed cyber logic.",
    entryFee: `${GAME_COST_ETH} ETH (~$0.05)`,
    image: "bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.3)_2px,rgba(0,0,0,0.3)_4px)] bg-indigo-900",
    icon: Gamepad2,
    status: "active",
    difficulty: "HARD",
  },
  {
    id: "space_huggers",
    title: "Space Huggers",
    description: "Complete the Mission",
    entryFee: `0.00001 ETH (~$0.02)`,
    image: "bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.3)_2px,rgba(0,0,0,0.3)_4px)] bg-purple-900",
    icon: Search,
    status: "active",
    difficulty: "Medium",
  },
  {
    id: "race_car",
    title: "NEED FOR HAIR",
    description: "Use logic to find the hidden 4-digit number within 15 attempts.",
    entryFee: `${GAME_COST_ETH} ETH (~$0.05)`,
    image: "bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.3)_2px,rgba(0,0,0,0.3)_4px)] bg-purple-900",
    icon: Search,
    status: "active",
    difficulty: "Logic",
  },
  {
    id: "pattern-match",
    title: "Memory Match",
    description: "Memorize and match complex neural patterns.",
    entryFee: `${GAME_COST_ETH} ETH (~$0.05)`,
    image: "bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.3)_2px,rgba(0,0,0,0.3)_4px)] bg-rose-900",
    icon: BrainCircuit,
    status: "closed",
    difficulty: "Memory",
  },
];

/* ─── QuestRow ───────────────────────────────────────────────────────────── */
function QuestRow({ quest, step, onAction, onClaim }) {
  return (
    <motion.div
      className={`q-row${step==="completed"?" done":""}`}
      style={{ "--q-accent": quest.accent }}
      initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
    >
      <div className="q-ico">{quest.icon}</div>
      <div className="q-txt">
        <p className="q-name">{quest.title}</p>
        <p className="q-desc">{quest.description}</p>
      </div>
      <div className="q-pts">
        <small>Reward</small>
        +{quest.points} PTS
      </div>
      <div style={{ flexShrink:0 }}>
        {step === "idle" && (
          <button onClick={onAction} className="btn btn-o">
            {quest.actionLabel} <ExternalLink size={11} />
          </button>
        )}
        {step === "following" && (
          <button className="btn btn-ghost" disabled style={{ opacity:.55 }}>
            <Loader2 size={12} className="spin" /> Waiting…
          </button>
        )}
        {(step === "claimable" || step === "verifying") && (
          <button onClick={onClaim} disabled={step==="verifying"} className="btn btn-g">
            {step === "verifying"
              ? <><Loader2 size={12} className="spin" /> Verifying…</>
              : <><Zap size={11} /> Claim Reward</>}
          </button>
        )}
        {step === "completed" && (
          <motion.div initial={{ scale:.85 }} animate={{ scale:1 }} className="btn btn-claimed">
            <CheckCircle2 size={13} /> Claimed
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

/* ─── GameCard ───────────────────────────────────────────────────────────── */
function GameCard({ game, index }) {
  const BIcon = game.icon;
  const live = game.status === "active";

  const inner = (
    <motion.div
      className={`g-card${live?" live":""}`}
      initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
      transition={{ delay: index * 0.07 }}
    >
      <div className="g-banner" style={{ background: game.bannerBg, backgroundSize:"cover", backgroundPosition:"center" }}>
        <div className="g-banner-grad" />
        <span className="g-diff">{game.difficulty}</span>
        {!live && (
          <div className="g-closed-overlay">
            <span style={{ fontFamily:"var(--font-m)", fontSize:"9px", letterSpacing:"0.15em", textTransform:"uppercase",
              padding:"4px 12px", borderRadius:"6px", background:"rgba(8,11,18,.6)", color:"rgba(238,242,255,.3)",
              border:"1px solid rgba(255,255,255,.08)" }}>Closed</span>
          </div>
        )}
        <div className="g-logo" style={{ background: game.logoBg }}>
          <BIcon size={19} color={game.logoColor} />
        </div>
      </div>

      <div className="g-body">
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
          <h3 className="g-title">{game.title}</h3>
          <span className="g-cat" style={{ color: game.accent, background:`${game.accent}12`, border:`1px solid ${game.accent}28` }}>
            {game.category}
          </span>
        </div>
        <p className="g-desc">{game.description}</p>
        <div className="g-fee">
          <span className="g-fee-lbl">Entry Fee</span>
          <span className="g-fee-val">{game.entryFee}</span>
        </div>
        {live ? (
          <button className="btn btn-g" style={{ width:"100%", padding:"12px", borderRadius:"10px" }}>
            <Play size={13} fill="currentColor" stroke="none" /> Play Now
          </button>
        ) : (
          <button className="btn btn-off" style={{ width:"100%", padding:"12px", borderRadius:"10px" }} disabled>
            Closed
          </button>
        )}
      </div>
    </motion.div>
  );

  return live
    ? <Link href={`/game/${game.id}`} style={{ textDecoration:"none" }}>{inner}</Link>
    : inner;
}

/* ─── Stat ───────────────────────────────────────────────────────────────── */
function Stat({ icon: Icon, label, value, suffix, accent, index, note }) {
  return (
    <motion.div className="stat"
      initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
      transition={{ delay: index * 0.06 }}>
      <div className="stat-ico" style={{ background:`${accent}10`, border:`1px solid ${accent}1a` }}>
        <Icon size={16} color={accent} />
      </div>
      <div className="stat-lbl">{label}</div>
      <div className="stat-val">{value}{suffix && <span>{suffix}</span>}</div>
      {note && <div className="stat-note"><TrendingUp size={10} />{note}</div>}
    </motion.div>
  );
}

/* ─── Dashboard ─────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const { data: ethBalanceData } = useBalance({ address });
  const [points, setPoints] = useState(null);
  const [questSteps, setQuestSteps] = useState(
    () => Object.fromEntries(QUESTS.map(q => [q.id, "idle"]))
  );
  const setStep = (id, step) => setQuestSteps(p => ({ ...p, [id]: step }));

  useEffect(() => {
    if (!address) return;
    fetch(`https://api.hairtoken.xyz/api/points/get?wallet=${address}`)
      .then(r => r.json())
      .then(d => {
        setPoints(d.points);
        QUESTS.forEach(q => { if (d.tasks?.includes(q.id)) setStep(q.id, "completed"); });
      }).catch(console.error);
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
      const r = await fetch(`https://api.hairtoken.xyz/api/points/claim`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ wallet:address, task:q.id }),
      });
      const d = await r.json();
      if (r.ok) { setStep(q.id, "completed"); setPoints(d.newTotal); }
      else setStep(q.id, d.alreadyDone ? "completed" : "claimable");
    } catch { setStep(q.id, "claimable"); }
  };

  if (!isConnected) return (
    <>
      <div className="db">
        <div className="db-glow1" /><div className="db-glow2" /><div className="db-noise" />
        <div className="conn">
          <motion.div className="conn-orb"
            initial={{ scale:.8, opacity:0 }} animate={{ scale:1, opacity:1 }}
            transition={{ duration:.5, ease:"backOut" }}>
            <Gamepad2 size={38} color="var(--green)" />
          </motion.div>
          <motion.div style={{ display:"flex", flexDirection:"column", gap:10, alignItems:"center" }}
            initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ delay:.15 }}>
            <h2 className="conn-title">Connect to Play</h2>
            <p className="conn-sub">Link your wallet to access the arena, earn points, and compete on Hemi.</p>
          </motion.div>
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.28 }}>
            <ConnectButton.Custom>
              {({ openConnectModal }) => (
                <button onClick={openConnectModal} className="btn btn-g"
                  style={{ padding:"13px 26px", fontSize:"11px", borderRadius:"11px" }}>
                  <Wallet size={14} /> Connect Wallet
                </button>
              )}
            </ConnectButton.Custom>
          </motion.div>
        </div>
      </div>
    </>
  );

  const ethVal = ethBalanceData ? Number(ethBalanceData.formatted).toFixed(5) : "0.00000";
  const short = address ? `${address.slice(0,6)}…${address.slice(-4)}` : "";

  return (
    <>
      <div className="db">
        <div className="db-glow1" /><div className="db-glow2" /><div className="db-noise" />
        <div className="db-inner">

          {/* Header */}
          <motion.div className="hdr"
            initial={{ opacity:0, y:-14 }} animate={{ opacity:1, y:0 }}>
            <div className="hdr-eye">
              <span className="ldot" />
              Hemi Network · {short}
            </div>
            <h1 className="hdr-title">Your <em>Arena</em></h1>
            <p className="hdr-sub">Compete in on-chain games, complete quests, and accumulate points on the Hemi network.</p>
          </motion.div>

          {/* Stats */}
          <motion.div className="stats"
            initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.1 }}>
            <Stat index={0} icon={Wallet}  label="ETH Balance"  value={ethVal}      suffix="ETH" accent="var(--green)"  note="On Hemi" />
            <Stat index={1} icon={Trophy}  label="Multiplier" value="1x"                        accent="var(--orange)" />
            <Stat index={2} icon={Star}    label="Total Points" value={points ?? 0} suffix="HP" accent="var(--purple)"/>
          </motion.div>

          {/* Quests */}
          <section style={{ marginBottom:52 }}>
            <div className="s-head">
              <h2 className="s-title">Active Quests</h2>
              <span className="s-tag">Earn Rewards</span>
            </div>
            <div className="q-list">
              {QUESTS.map(q => (
                <QuestRow key={q.id} quest={q} step={questSteps[q.id]}
                  onAction={() => handleAction(q)} onClaim={() => handleClaim(q)} />
              ))}
            </div>
          </section>

          {/* Games */}
          <section>
            <div className="s-head">
              <h2 className="s-title">Arcade Games</h2>
              <span className="s-tag">Season 2</span>
            </div>
            <div className="g-grid">
              {GAMES.map((g, i) => <GameCard key={g.id} game={g} index={i} />)}
            </div>
          </section>

        </div>
      </div>
    </>
  );
}