import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import {
  Layers, Star, Shield, Crown, ChevronRight, Copy, Check,
  Sprout, Zap, Flame, Gem, Trophy
} from "lucide-react";
import { MdLocalFireDepartment } from "react-icons/md";
import { RiCopperCoinFill } from "react-icons/ri";
import { FaXTwitter, FaDiscord } from "react-icons/fa6";


const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

// ─── NFT Image Map ────────────────────────────────────────────────────────────
// Key   = contract address (lowercase)
// Value = public image URL (Cloudflare R2 or any CDN)
const NFT_IMAGE_MAP = {
  "0xb45bc6d128d284025aabc0ae3159af9c228db16a": "https://pub-6fd72b146dbb4330a7ad961c7c584367.r2.dev/site_assets/Screenshot%202026-06-24%20150809.png",
  // "0x21d494d2f708d418d58908b48b3e80d8e08a8533": "https://your-r2.dev/hemi1y.png",
};
const NFT_IMAGE_FALLBACK = "https://amaranth-imperial-otter-134.mypinata.cloud/ipfs/bafybeicdxf6wh2i7jtkinytziitfhv4nagmkvmzaraoy5b2ris27jiu7ae";
// ─────────────────────────────────────────────────────────────────────────────

// Single source of truth for level thresholds — shared by getLevelInfo() and
// the roadmap list below, instead of keeping two copies in sync by hand.
const LEVELS = [
  { level: 1, title: "Rookie",   min: 0,        max: 5000,     color: "#94a3b8", icon: Sprout },
  { level: 2, title: "Player",   min: 50000,    max: 15000,    color: "#34d399", icon: Zap },
  { level: 3, title: "Veteran",  min: 150000,   max: 400000,   color: "#38bdf8", icon: Flame },
  { level: 4, title: "Elite",    min: 4000000,  max: 1000000,  color: "#a78bfa", icon: Gem },
  { level: 5, title: "Legend",   min: 10000000, max: 25000000, color: "#fb923c", icon: Crown },
  { level: 6, title: "Immortal", min: 25000000, max: 99999999, color: "#f43f5e", icon: Trophy },
];

/* Helpers */
function shortenAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function getLevelInfo(points) {
  const current = LEVELS.findLast(l => points >= l.min) ?? LEVELS[0];
  const pct = Math.min(100, Math.round(((points - current.min) / (current.max - current.min)) * 100));
  return { ...current, pct };
}

// Deterministic string hash + seeded PRNG — no crypto needed, just needs to
// produce the same pattern for the same address every time.
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Sub-components ───────────────────────────────────────────── */

// Deterministic, symmetric pixel-pattern identicon generated from the
// wallet address — same wallet always renders the same pattern, no image
// upload or external avatar service needed.
function AddressAvatar({ address, className = "" }) {
  const size = 96;
  const grid = 6;
  const cell = size / grid;
  const rand = mulberry32(hashCode((address || "").toLowerCase()));
  const hue = Math.floor(rand() * 360);
  const bg = `hsl(${hue}, 60%, 15%)`;
  const fg = `hsl(${(hue + 45) % 360}, 78%, 58%)`;

  const half = Math.ceil(grid / 2);
  const cells = [];
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < half; x++) {
      if (rand() > 0.58) {
        cells.push([x, y]);
        const mirrorX = grid - 1 - x;
        if (mirrorX !== x) cells.push([mirrorX, y]);
      }
    }
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" className={className}>
      <rect width={size} height={size} fill={bg} />
      {cells.map(([x, y], i) => (
        <rect key={i} x={x * cell} y={y * cell} width={cell} height={cell} fill={fg} />
      ))}
    </svg>
  );
}

function StatCard({ icon: Icon, label, value, sub, color, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: "easeOut" }}
      className="relative group rounded-2xl border border-white/8 bg-white/3 p-5 overflow-hidden"
    >
      <div
        className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-20"
        style={{ background: color }}
      />
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: `${color}18`, border: `1px solid ${color}30` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-white/35 mb-1">{label}</p>
      <p className="font-display font-black text-2xl text-white leading-none">{value}</p>
      {sub && <p className="font-mono text-[10px] text-white/30 mt-1">{sub}</p>}
    </motion.div>
  );
}

function NFTCard({ nft, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.05 * index, duration: 0.35, ease: "easeOut" }}
      className="group relative rounded-2xl border border-white/8 bg-white/3 overflow-hidden hover:border-primary/30 transition-colors duration-300"
    >
      <div
        className="w-full aspect-square relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${nft.color || '#a78bfa'}18, ${nft.color || '#a78bfa'}08)` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle at 30% 30%, ${nft.color || '#a78bfa'}40 0%, transparent 60%)`
          }}
        />
        <img
          src={NFT_IMAGE_MAP[nft.contractAddress?.toLowerCase()] ?? NFT_IMAGE_FALLBACK}
          alt={nft.name}
          className="relative z-10 w-full h-full object-cover"
        />
      </div>
      <div className="p-3">
        <p className="font-mono font-bold text-[11px] text-white/80 truncate">{nft.name}</p>
        <p className="font-mono text-[9px] text-white/30 mt-0.5 uppercase tracking-wider truncate">
          {nft.collectionName}
        </p>
      </div>
    </motion.div>
  );
}


export default function Profile() {
  const { address, isConnected } = useAccount();
  const [profile, setProfile] = useState({
    points: 0,
    nftHoldings: [],
    multiplier: 1.0,
    completedTasks: [],
    rank: null,
    twitter: null,
    discord: null
  });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) {
      setLoading(false);
      return;
    }

    async function fetchProfile() {
      try {
        const [profileRes, xRes, discordRes] = await Promise.all([
          fetch(`${API_BASE}/api/profile/${address}`),
          fetch(`${API_BASE}/api/status/x?wallet=${address}`),
          fetch(`${API_BASE}/api/status/discord?wallet=${address}`),
        ]);
        if (!profileRes.ok) throw new Error("Network profile sync failure");

        const data = await profileRes.json();
        const xStatus = xRes.ok ? await xRes.json() : { connected: false, handle: null };
        const discordStatus = discordRes.ok ? await discordRes.json() : { connected: false, handle: null };

        setProfile({
          points: data.points ?? 0,
          nftHoldings: data.nftHoldings || [],
          multiplier: data.multiplier ?? 1.0,
          completedTasks: data.completedTasks || [],
          rank: data.rank ?? null,
          twitter: xStatus.connected ? xStatus.handle : null,
          discord: discordStatus.connected ? discordStatus.handle : null
        });
      } catch (error) {
        console.error("Failed syncing profile metadata parameters:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [address, isConnected]);

  const copyAddr = () => {
    navigator.clipboard.writeText(address ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const connectTwitter = () => {
    window.location.href = ``;
  };

  const connectDiscord = () => {
    window.location.href = `${API_BASE}/api/auth/discord?wallet=${address}`;
  };

  /* ── Not connected ── */
  if (!isConnected) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Shield className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h2 className="font-display font-black text-2xl text-white mb-2">Your Profile Awaits</h2>
          <p className="font-mono text-[11px] uppercase tracking-widest text-white/30">Connect wallet to view your stats</p>
        </div>
        <ConnectButton chainStatus="icon" showBalance={false} />
      </div>
    );
  }

  /*  Loading  */
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  const { points, nftHoldings, multiplier, rank, twitter, discord } = profile;
  const lvlInfo = getLevelInfo(points);

  return (
    <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-6 space-y-6">

      {/* Identity Card  */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative rounded-3xl border border-white/8 bg-white/3 overflow-hidden"
      >
        <div
          className="absolute top-0 right-0 w-64 h-64 opacity-10 blur-3xl"
          style={{ background: `radial-gradient(circle, ${lvlInfo.color}, transparent 70%)` }}
        />

        <div className="relative p-5 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-5">

          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden"
              style={{
                border: `2px solid ${lvlInfo.color}50`,
                boxShadow: `0 0 32px ${lvlInfo.color}20`
              }}
            >
              <AddressAvatar address={address} />
            </div>
            <div
              className="absolute -bottom-2 -right-2 w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-[11px]"
              style={{ background: lvlInfo.color, color: "#000" }}
            >
              {lvlInfo.level}
            </div>
          </div>

          {/* Identity Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="font-display font-black text-xl sm:text-2xl text-white tracking-tight">
                {shortenAddr(address)}
              </h1>
              <button
                onClick={copyAddr}
                className="w-6 h-6 rounded-md bg-white/6 border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>

              <button
                onClick={connectTwitter}
                disabled={!!twitter}
                title={twitter ? `@${twitter} — connected` : "Connect X"}
                className={`w-8 h-8 rounded-md border flex items-center justify-center transition-colors ${
                  twitter
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400 cursor-not-allowed"
                    : "bg-white/6 border-white/10 text-white/40 hover:text-white cursor-pointer"
                }`}
              >
                <FaXTwitter className="w-5 h-5" />
              </button>

              <button
                onClick={connectDiscord}
                disabled={!!discord}
                title={discord ? `${discord} — connected` : "Connect Discord"}
                className={`w-8 h-8 rounded-md border flex items-center justify-center transition-colors ${
                  discord
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400 cursor-not-allowed"
                    : "bg-white/6 border-white/10 text-white/40 hover:text-white cursor-pointer"
                }`}
              >
                <FaDiscord className="w-5 h-5" />
              </button>

              {rank && rank <= 10 && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30">
                  <Crown className="w-3 h-3 text-amber-400" />
                  <span className="font-mono text-[9px] uppercase tracking-widest text-amber-400">Top 10</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mb-4">
              <span
                className="font-mono text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-md"
                style={{ background: `${lvlInfo.color}18`, color: lvlInfo.color, border: `1px solid ${lvlInfo.color}30` }}
              >
                {lvlInfo.title}
              </span>
              {rank && (
                <span className="font-mono text-[10px] uppercase tracking-widest text-white/35">
                  Rank #{rank}
                </span>
              )}
            </div>

            {/* Level Bar Progress */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-widest text-white/30">
                  Level {lvlInfo.level} Progress
                </span>
                <span className="font-mono text-[9px] text-white/40">
                  {points.toLocaleString()} / {lvlInfo.max.toLocaleString()} HP
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/6 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${lvlInfo.pct}%` }}
                  transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
                  className="h-full rounded-full relative overflow-hidden"
                  style={{ background: `linear-gradient(90deg, ${lvlInfo.color}80, ${lvlInfo.color})` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse" style={{ animationDuration: "2s" }} />
                </motion.div>
              </div>
              <p className="font-mono text-[9px] text-white/25">
                {lvlInfo.pct}% · {(lvlInfo.max - points).toLocaleString()} HP to Level {lvlInfo.level + 1}
              </p>
            </div>
          </div>

          {/* Real-time Multiplier Display */}
          <div className="flex-shrink-0 flex flex-col items-center gap-1.5 px-5 py-4 rounded-2xl border border-white/8 bg-white/3 w-full sm:w-auto">
            <MdLocalFireDepartment className="w-7 h-7 text-orange-400" />
            <span className="font-display font-black text-3xl text-white leading-none">
              {Number(multiplier).toFixed(2)}×
            </span>
            <span className="font-mono text-[9px] uppercase tracking-widest text-white/30">Active Multiplier</span>
          </div>
        </div>
      </motion.div>

      {/* ══ Live Stat Cards ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          icon={RiCopperCoinFill} label="Total Points" value={points.toLocaleString()}
          sub="Hair Points" color="#fb923c" delay={0.1}
        />
        <StatCard
          icon={Star} label="Global Rank" value={rank ? `#${rank}` : "—"}
          sub="All players" color="#a78bfa" delay={0.15}
        />
        <StatCard
          icon={Layers} label="NFTs Owned" value={nftHoldings.length}
          sub="Verified collection holdings" color="#38bdf8" delay={0.2}
        />
      </div>

      {/* ══ NFT Collection Grid ════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
        className="rounded-2xl border border-white/8 bg-white/3 p-5"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-white/50 flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-sky-400" /> NFT Holdings
            <span className="px-1.5 py-0.5 rounded-md bg-white/6 text-white/40 text-[9px] font-mono">
              {nftHoldings.length} items
            </span>
          </h3>
          {nftHoldings.length > 0 && (
            <button className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors">
              View all <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {nftHoldings.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {nftHoldings.map((nft, i) => (
              <NFTCard key={`${nft.contractAddress}-${nft.tokenId}`} nft={nft} index={i} />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <Layers className="w-8 h-8 text-white/10 mx-auto mb-3" />
            <p className="font-mono text-[11px] uppercase tracking-widest text-white/25">No supported NFTs found</p>
            <p className="font-mono text-[10px] text-white/15 mt-1">Acquire ecosystem collection NFTs to secure scoring multipliers</p>
          </div>
        )}
      </motion.div>

      {/* ══ Level Roadmap ══════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="rounded-2xl border border-white/8 bg-white/3 p-5"
      >
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-white/50 flex items-center gap-2 mb-5">
          <Zap className="w-3.5 h-3.5 text-yellow-400" /> Level Roadmap
        </h3>
        <div className="space-y-2">
          {LEVELS.map(l => {
            const isActive = points >= l.min && points < l.max;
            const isPassed = points >= l.max;
            const rowPct = isPassed ? 100 : isActive ? Math.round(((points - l.min) / (l.max - l.min)) * 100) : 0;
            const litUp = isPassed || isActive;
            return (
              <div
                key={l.level}
                className="flex items-center gap-3 p-3 rounded-xl border transition-all duration-200"
                style={isActive
                  ? { background: `${l.color}08`, borderColor: `${l.color}255` }
                  : { background: "transparent", borderColor: "rgba(255,255,255,0.04)" }
                }
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: litUp ? `${l.color}18` : "rgba(255,255,255,0.04)",
                    border: `1px solid ${litUp ? `${l.color}30` : "rgba(255,255,255,0.06)"}`,
                  }}
                >
                  <l.icon className="w-3.5 h-3.5" style={{ color: litUp ? l.color : "rgba(255,255,255,0.25)" }} />
                </div>
                <div className="w-14 flex-shrink-0">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: litUp ? l.color : "rgba(255,255,255,0.25)" }}>
                    {l.title}
                  </p>
                  <p className="font-mono text-[8px] text-white/20">{l.min.toLocaleString()} HP</p>
                </div>
                <div className="flex-1 h-1.5 rounded-full bg-white/6 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${rowPct}%`, background: `linear-gradient(90deg, ${l.color}60, ${l.color})` }}
                  />
                </div>
                <span className="font-mono text-[9px] text-white/25 w-8 text-right flex-shrink-0">{rowPct}%</span>
              </div>
            );
          })}
        </div>
      </motion.div>

    </div>
  );
}