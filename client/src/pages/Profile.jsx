import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, MotionConfig } from "framer-motion";
import {
  Layers, Trophy, Shield, Crown, Copy, Check, Sprout, Play, Gem, Gift, Vault,
  HelpCircle, Lock, BadgeCheck, TriangleAlert, RotateCw, ChevronDown, Map as MapIcon, Clock3
} from "lucide-react";
import { MdLocalFireDepartment } from "react-icons/md";
import { RiCopperCoinFill } from "react-icons/ri";
import { FaXTwitter, FaDiscord } from "react-icons/fa6";


const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

// NFT Image Map
// Key   = contract address (lowercase)
// Value = public image URL (Cloudflare R2 or any CDN)
const NFT_IMAGE_FALLBACK = "https://amaranth-imperial-otter-134.mypinata.cloud/ipfs/bafybeicdxf6wh2i7jtkinytziitfhv4nagmkvmzaraoy5b2ris27jiu7ae";

// How many NFTs show before the "Show all" toggle kicks in.
const NFT_PREVIEW_COUNT = 6;

// Single source of truth for level thresholds. Each level's ceiling is the
// next level's min (so the header/level bars always agree), and rank order
// here also drives the roadmap render order.
const LEVELS = [
  { level: 1, title: "Rookie",   min: 0,        color: "#94a3b8", icon: Sprout },
  { level: 2, title: "Player",   min: 50000,    color: "#10b981", icon: Play },
  { level: 3, title: "Veteran",  min: 150000,   color: "#3b82f6", icon: Shield },
  { level: 4, title: "Elite",    min: 4000000,  color: "#a855f7", icon: Gem },
  { level: 5, title: "Legend",   min: 10000000, color: "#fb923c", icon: Crown },
  { level: 6, title: "Immortal", min: 25000000, color: "#f43f5e", icon: Trophy },
];

const LABEL = "font-mono text-[11px] uppercase tracking-[0.14em] text-white/50";
const PANEL = "rounded-2xl border border-white/8 bg-white/3";

/* Helpers */
function shortenAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function levelIndex(points) {
  return Math.max(0, LEVELS.findLastIndex(l => points >= l.min));
}

function getLevelInfo(points) {
  const idx = levelIndex(points);
  const current = LEVELS[idx];
  const next = LEVELS[idx + 1];
  const max = next ? next.min : current.min;
  const pct = next ? Math.min(100, Math.round(((points - current.min) / (max - current.min)) * 100)) : 100;
  return { ...current, max, pct, next, isMaxed: !next };
}

function getRoadmap(points) {
  const activeIdx = levelIndex(points);
  const base = LEVELS[activeIdx].min;
  return LEVELS.map((l, i) => {
    if (i < activeIdx) return { ...l, status: "complete", pct: 100 };
    if (i === activeIdx) return { ...l, status: "active", pct: 100 };
    // Same formula as the header bar, so both always show the same %.
    if (i === activeIdx + 1) return { ...l, status: "next", pct: Math.min(100, Math.round(((points - base) / (l.min - base)) * 100)) };
    return { ...l, status: "locked", pct: 0 };
  });
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

/*  Sub-components  */

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

function SocialPill({ icon: Icon, label, handle, onConnect }) {
  if (handle) {
    return (
      <span
        title={`${label} connected`}
        className="inline-flex items-center gap-2 h-8 pl-2.5 pr-3 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-medium"
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="max-w-40 truncate">{handle}</span>
        <Check className="w-3 h-3 shrink-0" />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onConnect}
      className="inline-flex items-center gap-2 h-8 px-3 rounded-full border border-white/10 bg-white/5 text-white/70 text-xs font-medium transition-colors hover:bg-white/10 hover:text-white hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <Icon className="w-3.5 h-3.5" />
      Connect {label}
    </button>
  );
}

function StatCard({ icon: Icon, label, value, sub, color, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: "easeOut" }}
      className={`relative group overflow-hidden ${PANEL} p-4 sm:p-5 flex items-center gap-4`}
    >
      <div
        className="absolute -top-8 -right-8 w-28 h-28 rounded-full opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-20"
        style={{ background: color }}
      />
      <div
        className="relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}1a`, border: `1px solid ${color}33` }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="relative min-w-0">
        <p className={LABEL}>{label}</p>
        <p className="font-display font-black text-2xl text-white leading-tight truncate tabular-nums">{value}</p>
        {sub && <p className="text-xs text-white/45 truncate">{sub}</p>}
      </div>
    </motion.div>
  );
}

// Hours until a newly received NFT starts counting toward the multiplier.
const hoursUntil = (date) => Math.max(1, Math.ceil((new Date(date).getTime() - Date.now()) / 3_600_000));

function NFTCard({ nft, index }) {
  const tint = nft.color || "#a78bfa";
  const counting = nft.active !== false;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.04 * Math.min(index, 8), duration: 0.3, ease: "easeOut" }}
      className="group relative rounded-xl border border-white/8 bg-white/3 overflow-hidden transition-colors duration-300 hover:border-white/20"
    >
      <div
        className="w-full aspect-square relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${tint}18, ${tint}08)` }}
      >
        <img
          src={nft.imageUrl || NFT_IMAGE_FALLBACK}
          alt={nft.name}
          loading="lazy"
          onError={(e) => {
            if (e.currentTarget.src !== NFT_IMAGE_FALLBACK) e.currentTarget.src = NFT_IMAGE_FALLBACK;
          }}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span
          className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-white"
          title={counting ? "Counts toward your multiplier" : "New NFTs count toward your multiplier after a holding period"}
        >
          {counting
            ? <><BadgeCheck className="w-3 h-3 text-emerald-400" /> Verified</>
            : <><Clock3 className="w-3 h-3 text-amber-300" /> Counts in {hoursUntil(nft.countsFrom)}h</>}
        </span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-sm font-semibold text-white truncate">{nft.name}</p>
        <p className="text-xs text-white/45 truncate">{nft.collectionName}</p>
      </div>
    </motion.div>
  );
}

const STATUS_LABEL = {
  complete: "Unlocked",
  active: "Current",
  next: "Up next",
  locked: "Locked",
};

function RoadmapStep({ item, points, lineLit, isLast }) {
  const { level, title, min, color, icon: Icon, status, pct } = item;
  const litUp = status === "complete" || status === "active";
  // Rookie is the base rank — its node is a fixed dark badge rather than
  // tinted with its own (deliberately muted) color.
  const nodeColor = title === "Rookie" ? "#0f172a" : color;

  const statusColor = status === "complete" ? "#34d399"
    : status === "active" ? color
    : status === "next" ? "rgba(255,255,255,0.6)"
    : "rgba(255,255,255,0.35)";

  return (
    <li className="relative flex gap-3.5">
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute left-[17px] top-10 -bottom-1 w-0.5 rounded-full"
          style={{ background: lineLit ? `${color}99` : "rgba(255,255,255,0.08)" }}
        />
      )}

      <div
        className="relative z-10 w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={litUp
          ? { background: nodeColor, border: `1px solid ${color}80`, boxShadow: status === "active" ? `0 0 0 4px ${color}26, 0 0 18px ${color}55` : undefined }
          : { background: "#17110b", border: `1px solid ${status === "next" ? `${color}66` : "rgba(255,255,255,0.1)"}` }
        }
      >
        <Icon className="w-4 h-4" style={{ color: litUp ? "#fff" : status === "next" ? color : "rgba(255,255,255,0.3)" }} />
      </div>

      <div
        className={`flex-1 min-w-0 rounded-xl px-3 py-2 mb-3 ${status === "active" ? "border" : ""}`}
        style={status === "active" ? { background: `${color}10`, borderColor: `${color}40` } : undefined}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="font-display font-bold text-sm" style={{ color: litUp ? "#fff" : "rgba(255,255,255,0.6)" }}>
            {title}
          </p>
          <span
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] shrink-0"
            style={{ color: statusColor }}
          >
            {status === "complete" && <Check className="w-3 h-3" />}
            {status === "locked" && <Lock className="w-3 h-3" />}
            {STATUS_LABEL[status]}
          </span>
        </div>
        <p className="text-xs text-white/40 mt-0.5">
          Level {level} · {min === 0 ? "Starting rank" : `${min.toLocaleString()} HP`}
        </p>

        {status === "next" && (
          <div className="mt-2.5">
            <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }}
              />
            </div>
            <p className="text-[11px] text-white/50 mt-1.5">
              {pct}% · {(min - points).toLocaleString()} HP to go
            </p>
          </div>
        )}
      </div>
    </li>
  );
}

function ComingSoonTile({ icon: Icon, title, text, color }) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-dashed border-white/12 bg-white/2 p-4">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}14`, border: `1px solid ${color}26` }}
      >
        <Icon className="w-4.5 h-4.5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-display font-bold text-sm text-white/80">{title}</p>
        <p className="text-xs text-white/40 truncate">{text}</p>
      </div>
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/45 bg-white/6 border border-white/10 px-2 py-1 rounded-md shrink-0">
        Coming soon
      </span>
    </div>
  );
}

function ProfileSkeleton() {
  const block = "rounded-2xl bg-white/4 border border-white/6";
  return (
    <div className="w-full max-w-6xl mx-auto space-y-5 animate-pulse" aria-busy="true" aria-label="Loading profile">
      <div className={`${block} rounded-3xl h-72 sm:h-64`} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[0, 1, 2].map(i => <div key={i} className={`${block} h-24`} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className={`${block} lg:col-span-3 h-80`} />
        <div className={`${block} lg:col-span-2 h-80`} />
      </div>
    </div>
  );
}

export default function Profile() {
  const { address, isConnected } = useAccount();
  const [profile, setProfile] = useState({
    points: 0,
    nftHoldings: [],
    multiplier: 1.0,
    pendingMultiplier: 1.0,
    completedTasks: [],
    rank: null,
    twitter: null,
    discord: null
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showAllNfts, setShowAllNfts] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

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
          pendingMultiplier: data.pendingMultiplier ?? data.multiplier ?? 1.0,
          completedTasks: data.completedTasks || [],
          rank: data.rank ?? null,
          twitter: xStatus.connected ? xStatus.handle : null,
          discord: discordStatus.connected ? discordStatus.handle : null
        });
        setLoadError(false);
      } catch (error) {
        console.error("Failed syncing profile metadata parameters:", error);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [address, isConnected, reloadKey]);

  const retryLoad = () => {
    setLoading(true);
    setReloadKey(k => k + 1);
  };

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
      <div className="w-full min-h-[65vh] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/3 p-8 text-center overflow-hidden"
        >
          <div
            aria-hidden="true"
            className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 opacity-20 blur-3xl"
            style={{ background: "radial-gradient(circle, hsl(var(--primary)), transparent 70%)" }}
          />
          <div className="relative">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center">
              <Shield className="w-7 h-7 text-primary" />
            </div>
            <h2 className="font-display font-black text-2xl text-white mb-2">Your profile awaits</h2>
            <p className="text-sm text-white/55 mb-6 leading-relaxed">
              Connect your wallet to see your Hair Points, global rank and NFT multiplier.
            </p>
            <div className="flex justify-center">
              <ConnectButton chainStatus="icon" showBalance={false} />
            </div>

            <div className="mt-8 pt-6 border-t border-white/8">
              <p className={LABEL}>{LEVELS.length} ranks to climb</p>
              <div className="flex justify-center gap-2 mt-3">
                {LEVELS.map(({ level, title, color, icon: Icon }) => (
                  <span
                    key={level}
                    title={title}
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: `${color}1a`, border: `1px solid ${color}40` }}
                  >
                    <Icon className="w-4 h-4" style={{ color }} />
                  </span>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  /*  Loading  */
  if (loading) return <ProfileSkeleton />;

  const { points, nftHoldings, multiplier, pendingMultiplier, rank, twitter, discord } = profile;
  const multiplierNote = pendingMultiplier > multiplier
    ? `Rises to ${Number(pendingMultiplier).toFixed(2)}× as new NFTs settle in`
    : nftHoldings.length > 0 ? "Applied to every score" : "Hold NFTs to boost it";
  const lvlInfo = getLevelInfo(points);
  const roadmap = getRoadmap(points);
  const LevelIcon = lvlInfo.icon;
  const visibleNfts = showAllNfts ? nftHoldings : nftHoldings.slice(0, NFT_PREVIEW_COUNT);

  return (
    <MotionConfig reducedMotion="user">
      <div className="w-full max-w-6xl mx-auto space-y-5">

        {loadError && (
          <div role="alert" className="flex items-center gap-3 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3">
            <TriangleAlert className="w-4 h-4 text-red-400 shrink-0" />
            <p className="flex-1 text-sm text-red-100/85">
              We couldn't load your profile. The numbers below may be out of date.
            </p>
            <button
              type="button"
              onClick={retryLoad}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/10 text-xs font-medium text-white hover:bg-white/15 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        )}

        {/* ══ Identity Card ══════════════════════════════════════════════ */}
        <motion.section
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="relative rounded-3xl border border-white/10 bg-white/3 overflow-hidden"
        >
          <div
            aria-hidden="true"
            className="absolute -top-20 -right-20 w-80 h-80 opacity-15 blur-3xl"
            style={{ background: `radial-gradient(circle, ${lvlInfo.color}, transparent 70%)` }}
          />

          <div className="relative p-5 sm:p-8 flex flex-col md:flex-row md:items-center gap-6">

            <div className="flex items-start sm:items-center gap-4 sm:gap-5 flex-1 min-w-0">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden"
                  style={{ border: `2px solid ${lvlInfo.color}66`, boxShadow: `0 0 32px ${lvlInfo.color}26` }}
                >
                  <AddressAvatar address={address} />
                </div>
                <div
                  className="absolute -bottom-2 -right-2 w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-[11px] ring-4 ring-background"
                  style={{ background: lvlInfo.color, color: "#000" }}
                  title={`Level ${lvlInfo.level}`}
                >
                  {lvlInfo.level}
                </div>
              </div>

              {/* Identity Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span
                    className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] font-bold px-2.5 py-1 rounded-full"
                    style={{ background: `${lvlInfo.color}1a`, color: lvlInfo.color, border: `1px solid ${lvlInfo.color}40` }}
                  >
                    <LevelIcon className="w-3.5 h-3.5" /> {lvlInfo.title}
                  </span>
                  {rank && rank <= 10 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 font-mono text-[11px] uppercase tracking-[0.12em] font-bold text-amber-400">
                      <Crown className="w-3.5 h-3.5" /> Top 10
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <h1 className="font-display font-black text-2xl sm:text-3xl text-white tracking-tight truncate">
                    {shortenAddr(address)}
                  </h1>
                  <button
                    type="button"
                    onClick={copyAddr}
                    aria-label={copied ? "Address copied" : "Copy wallet address"}
                    className="inline-flex cursor-pointer items-center gap-1.5 h-8 px-2.5 rounded-lg bg-white/6 border border-white/10 text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  <SocialPill icon={FaDiscord} label="Discord" handle={discord} onConnect={connectDiscord} />
                  <SocialPill icon={FaXTwitter} label="X" handle={twitter && `@${twitter}`} onConnect={connectTwitter} />
                </div>
              </div>
            </div>

            {/* Points */}
            <div className="shrink-0 pt-5 md:pt-0 md:pl-8 border-t md:border-t-0 md:border-l border-white/8 md:text-right">
              <p className={`${LABEL} flex items-center gap-1.5 md:justify-end`}>
                <RiCopperCoinFill className="w-3.5 h-3.5 text-orange-400" /> Hair Points
              </p>
              <p className="font-display font-black text-4xl sm:text-5xl text-white leading-none mt-2 tabular-nums">
                {points.toLocaleString()}
              </p>
              <p className="text-xs text-white/45 mt-2">Lifetime total</p>
            </div>
          </div>

          {/* Level Progress */}
          <div className="relative border-t border-white/8 px-5 sm:px-8 py-5 bg-black/10">
            <div className="flex items-end justify-between gap-4 mb-3">
              <div className="min-w-0">
                <p className={LABEL}>Level {lvlInfo.level} progress</p>
                <p className="text-sm text-white/65 mt-1">
                  {lvlInfo.isMaxed ? (
                    <>Top rank reached: <span className="font-semibold" style={{ color: lvlInfo.color }}>{lvlInfo.title}</span></>
                  ) : (
                    <>
                      <span className="font-semibold text-white tabular-nums">{(lvlInfo.max - points).toLocaleString()} HP</span>
                      {" "}to <span className="font-semibold" style={{ color: lvlInfo.next.color }}>{lvlInfo.next.title}</span>
                    </>
                  )}
                </p>
              </div>
              <p className="font-display font-black text-2xl leading-none tabular-nums" style={{ color: lvlInfo.color }}>
                {lvlInfo.pct}%
              </p>
            </div>
            <div className="h-2.5 rounded-full bg-white/8 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${lvlInfo.pct}%` }}
                transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${lvlInfo.color}80, ${lvlInfo.color})`, boxShadow: `0 0 12px ${lvlInfo.color}66` }}
              />
            </div>
            {!lvlInfo.isMaxed && (
              <div className="flex justify-between mt-2 font-mono text-[11px] text-white/40 tabular-nums">
                <span>{lvlInfo.min.toLocaleString()} HP</span>
                <span>{lvlInfo.max.toLocaleString()} HP</span>
              </div>
            )}
          </div>
        </motion.section>

        {/* ══ Stat Cards ═════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            icon={Trophy} label="Global Rank" value={rank ? `#${rank.toLocaleString()}` : "—"}
            sub={!rank ? "Play a game to get ranked" : rank <= 10 ? "Top 10 player" : "Across all players"}
            color="#a855f7" delay={0.08}
          />
          <StatCard
            icon={MdLocalFireDepartment} label="Multiplier" value={`${Number(multiplier).toFixed(2)}×`}
            sub={multiplierNote}
            color="#f97316" delay={0.12}
          />
          <StatCard
            icon={Layers} label="NFTs Owned" value={nftHoldings.length}
            sub="Verified holdings" color="#3b82f6" delay={0.16}
          />
        </div>

        {/* ══ NFT Holdings + Level Roadmap ═══════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">

          {/* NFT Collection Grid */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className={`lg:col-span-3 ${PANEL} p-5`}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-display font-bold text-base text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-400" /> NFT Holdings
                <span className="px-2 py-0.5 rounded-full bg-white/8 text-white/60 text-[11px] font-mono">
                  {nftHoldings.length}
                </span>
              </h2>
              {nftHoldings.length > NFT_PREVIEW_COUNT && (
                <button
                  type="button"
                  onClick={() => setShowAllNfts(v => !v)}
                  aria-expanded={showAllNfts}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-orange-300 transition-colors"
                >
                  {showAllNfts ? "Show less" : `Show all ${nftHoldings.length}`}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllNfts ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>

            {nftHoldings.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {visibleNfts.map((nft, i) => (
                  <NFTCard key={`${nft.contractAddress}-${nft.tokenId}`} nft={nft} index={i} />
                ))}
              </div>
            ) : (
              <div className="py-12 px-4 text-center rounded-xl border border-dashed border-white/10">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-white/5 flex items-center justify-center">
                  <Layers className="w-5 h-5 text-white/30" />
                </div>
                <p className="text-sm font-semibold text-white/70">No supported NFTs yet</p>
                <p className="text-xs text-white/45 mt-1 max-w-xs mx-auto leading-relaxed">
                  Hold an NFT from an ecosystem collection to raise your scoring multiplier.
                </p>
              </div>
            )}
          </motion.section>

          {/* Level Roadmap */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.26, duration: 0.4 }}
            className={`lg:col-span-2 ${PANEL} p-5`}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-display font-bold text-base text-white flex items-center gap-2">
                <MapIcon className="w-4 h-4 text-yellow-400" /> Rank Roadmap
              </h2>
              <button
                type="button"
                onClick={() => setShowHelp(v => !v)}
                aria-expanded={showHelp}
                className="inline-flex items-center gap-1 text-xs font-medium text-white/50 hover:text-white transition-colors"
              >
                <HelpCircle className="w-3.5 h-3.5" /> How it works
              </button>
            </div>

            {showHelp && (
              <p className="mb-4 rounded-xl bg-white/4 border border-white/8 p-3 text-xs text-white/60 leading-relaxed">
                Every game you submit on-chain adds Hair Points to your total. Your multiplier, raised by
                verified NFTs, is applied to each score before it's added. A newly received NFT starts
                counting after a short holding period. Ranks unlock automatically as your total grows.
              </p>
            )}

            <ol>
              {roadmap.map((item, i) => (
                <RoadmapStep
                  key={item.level}
                  item={item}
                  points={points}
                  lineLit={item.status === "complete"}
                  isLast={i === roadmap.length - 1}
                />
              ))}
            </ol>
          </motion.section>

        </div>

        {/* ══ Coming Soon ════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ComingSoonTile icon={Gift} title="Hairdrop" text="Claim points" color="#ec4899" />
          <ComingSoonTile icon={Vault} title="Vault" text="Staking" color="#10b981" />
        </div>

      </div>
    </MotionConfig>
  );
}
