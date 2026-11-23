import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useWeb3 } from "@/lib/web3";
import { ArrowRight, Play, Zap, Shield, Coins, Trophy, Link2, Sparkles } from "lucide-react";
import { useInView } from "framer-motion";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import BackgroundImg from "@/assets/images/bg.jpg";
import { GAMES } from "@/lib/games";
import { SectionHead } from "@/components/arena/Heads";
import { GameCard } from "@/components/arena/GameCard";
import { Tile } from "@/components/arena/Tile";
import "@/styles/hg.css";
import "@/styles/home.css";

const LIVE_GAMES = GAMES.filter(g => g.status === "active");
const HERO_GAMES = ["moto_rush", "candy_cascade", "max_fruitninja", "race_car"]
  .map(id => GAMES.find(g => g.id === id))
  .filter(Boolean);

const INFO = [
  {
    num: "01",
    icon: Link2,
    title: <>Every move. <em>On-chain.</em></>,
    body: <>Fully transparent and verifiable on-chain. A small interaction fee sustains the platform — with a portion used to buy back <b>$HAIR</b>, strengthening the project over time.</>,
    note: "No guarantees of profit or return",
  },
  {
    num: "02",
    icon: Sparkles,
    title: <>What is <em>HP</em>?</>,
    body: <><b>Hair Points</b> are a non-financial participation tracking system. No monetary value. No promises. HP may unlock future features, events, or community rewards as the platform grows.</>,
    note: "Not a gambling site",
  },
  {
    num: "03",
    icon: Shield,
    title: <>Provably <em>fair</em></>,
    body: "Every result is verifiable on-chain. No hidden RNG, no server-side manipulation — results exist on the blockchain, forever.",
  },
  {
    num: "04",
    icon: Coins,
    title: <><em>$HAIR</em> token utility</>,
    body: "A portion of all platform fees is used to buy back $HAIR, creating real demand and sustainable value for token holders.",
  },
];

/* Count-up */
function Counter({ to, suffix = "" }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView) return;
    const num = parseFloat(to), isFloat = String(to).includes(".");
    const start = performance.now();
    const tick = now => {
      const t = Math.min((now - start) / 1500, 1), e = 1 - Math.pow(1 - t, 3);
      setVal(isFloat ? (num * e).toFixed(2) : Math.floor(num * e));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, to]);
  return <span ref={ref}>{val}{suffix}</span>;
}

function PlayButton({ label, connectedLabel, large = true }) {
  const { isConnected } = useWeb3();
  const [, setLocation] = useLocation();
  return (
    <ConnectButton.Custom>
      {({ openConnectModal }) => (
        <button
          type="button"
          onClick={() => (isConnected ? setLocation("/dashboard") : openConnectModal())}
          className={`btn btn-o${large ? " btn-lg" : ""}`}
        >
          <Play size={13} fill="currentColor" strokeWidth={0} />
          {isConnected ? connectedLabel : label}
          <ArrowRight size={13} />
        </button>
      )}
    </ConnectButton.Custom>
  );
}

export default function Home() {
  return (
    <div className="hg">

      {/* Hero */}
      <section className="card hero">
        <div className="hero-bg"><img src={BackgroundImg} alt="" /></div>
        <div>
          <p className="ph-eyebrow"><span className="live-dot" /> Live on Hemi Network</p>
          <h1 className="hero-title">Play. Win.<br /><em>Surprise.</em></h1>
          <p className="hero-sub">
            The first decentralized gaming platform on Hemi Chain. Hold <b>$HAIR</b> to enter. Provably fair games.
          </p>
          <div className="hero-cta">
            <PlayButton label="Connect & Play" connectedLabel="Go to Dashboard" />
            <a href="https://hairtoken.xyz/" target="_blank" rel="noopener noreferrer" className="btn btn-glass btn-lg">
              Learn more
            </a>
          </div>
        </div>
        <div className="hero-art hg-stagger">
          {HERO_GAMES.map(g => (
            <Link key={g.id} href={`/game/${g.id}`} className="shot">
              <img src={g.image} alt="" />
              <span className="pill">{g.title}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Live numbers */}
      <div className="tiles sec hg-stagger">
        <Tile icon={Coins} color="#b8ff3a" label="Total fee collected" value={<Counter to="0.3" />} unit="ETH" />
        <Tile icon={Trophy} color="#ff6b1a" label="Active players" value={<Counter to="55" />} />
        <Tile icon={Zap} color="#7b5cff" label="Games live" value={<Counter to={String(LIVE_GAMES.length)} />} />
      </div>

      {/* Games */}
      <section className="sec">
        <SectionHead title="Arcade games" count={LIVE_GAMES.length}>
          <Link href="/dashboard" className="btn btn-ghost">Open dashboard <ArrowRight size={12} /></Link>
        </SectionHead>
        <div className="gc-grid hg-stagger">
          {GAMES.map(g => <GameCard key={g.id} game={g} />)}
        </div>
      </section>

      {/* Why HairGames */}
      <section className="sec">
        <SectionHead title="Why play on Hemi" />
        <div className="info-grid hg-stagger">
          {INFO.map(item => (
            <div key={item.num} className="card info">
              <div className="info-top">
                <span className="info-num">{item.num}</span>
                <span className="info-icon"><item.icon size={18} /></span>
              </div>
              <h3 className="info-title">{item.title}</h3>
              <p className="info-text">{item.body}</p>
              {item.note && <span className="pill">{item.note}</span>}
            </div>
          ))}
        </div>
      </section>

      {/* Call to action */}
      <section className="cta-band">
        <div>
          <h2 className="cta-title">Ready to play?</h2>
          <p className="cta-text">Connect your wallet and enter the arena. Quests, games, and leaderboard glory await.</p>
        </div>
        <PlayButton label="Connect Wallet" connectedLabel="Enter the Arena" />
      </section>
    </div>
  );
}
