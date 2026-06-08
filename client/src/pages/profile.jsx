import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import {
  Zap, Layers, TrendingUp, Star,
  Shield, Crown, Flame, ChevronRight, Copy, Check
} from "lucide-react";
import { MdLocalFireDepartment } from "react-icons/md";
import { HiMiniTrophy } from "react-icons/hi2";

/* Helpers */
function shortenAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function getLevelInfo(points) {
  const levels = [
    { level: 1, min: 0,     max: 500,   title: "Rookie",    color: "#94a3b8" },
    { level: 2, min: 500,   max: 1500,  title: "Player",    color: "#34d399" },
    { level: 3, min: 1500,  max: 4000,  title: "Veteran",   color: "#38bdf8" },
    { level: 4, min: 4000,  max: 10000, title: "Elite",     color: "#a78bfa" },
    { level: 5, min: 10000, max: 25000, title: "Legend",    color: "#fb923c" },
    { level: 6, min: 25000, max: 99999, title: "Immortal",  color: "#f43f5e" },
  ];
  const current = levels.findLast(l => points >= l.min) ?? levels[0];
  const pct = Math.min(100, Math.round(((points - current.min) / (current.max - current.min)) * 100));
  return { ...current, pct };
}

function getMultiplier(nftCount) {
  if (nftCount >= 10) return 3.0;
  if (nftCount >= 5)  return 2.0;
  if (nftCount >= 2)  return 1.5;
  if (nftCount >= 1)  return 1.25;
  return 1.0;
}

/* ── Sub-components ───────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, sub, color, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: "easeOut" }}
      className="relative group rounded-2xl border border-white/8 bg-white/3 p-5 overflow-hidden"
    >
      {/* glow */}
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
      {/* art placeholder */}
      <div
        className="w-full aspect-square flex items-center justify-center text-4xl relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${nft.color}18, ${nft.color}08)` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle at 30% 30%, ${nft.color}40 0%, transparent 60%)`
          }}
        />
        <span className="relative z-10 text-3xl">{nft.emoji}</span>
        {nft.rare && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40">
            <span className="font-mono text-[8px] uppercase tracking-widest text-amber-400">Rare</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="font-mono font-bold text-[11px] text-white/80 truncate">{nft.name}</p>
        <p className="font-mono text-[9px] text-white/30 mt-0.5 uppercase tracking-wider">{nft.collection}</p>
      </div>
    </motion.div>
  );
}

export default function Profile() {
  const { address, isConnected } = useAccount();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Mock NFTs — replace with real fetch
  const MOCK_NFTS = [
    { id: 1, name: "HairPunk #0042",  collection: "HairPunks",   emoji: "👾", color: "#a78bfa", rare: true  },
    { id: 2, name: "CryptoFur #188",  collection: "CryptoFurs",  emoji: "🦊", color: "#fb923c", rare: false },
    { id: 3, name: "NeonApe #7701",   collection: "NeonApes",    emoji: "🐒", color: "#34d399", rare: true  },
    { id: 4, name: "PixelHair #333",  collection: "PixelHairs",  emoji: "💈", color: "#38bdf8", rare: false },
    { id: 5, name: "DarkWulf #019",   collection: "DarkWulfs",   emoji: "🐺", color: "#f43f5e", rare: false },
  ];

  useEffect(() => {
    if (!isConnected || !address) { setLoading(false); return; }
    async function fetchProfile() {
      try {
        const res = await fetch(`https://api.hairtoken.xyz/api/leaderboard`);
        const data = await res.json();
        const entry = data.find(e => e.wallet.toLowerCase() === address.toLowerCase());
        const rank  = entry ? data.indexOf(entry) + 1 : null;
        setProfile({ points: entry?.points ?? 0, rank, games: entry?.games ?? 0 });
      } catch { setProfile({ points: 0, rank: null, games: 0 }); }
      finally { setLoading(false); }
    }
    fetchProfile();
  }, [address, isConnected]);

  const copyAddr = () => {
    navigator.clipboard.writeText(address ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
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

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  const pts      = profile?.points ?? 0;
  const lvlInfo  = getLevelInfo(pts);
  const multi    = getMultiplier(MOCK_NFTS.length);
  const rank     = profile?.rank;

  return (
    <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-6 space-y-6">

      {/* ══ Hero / Identity Card ══════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative rounded-3xl border border-white/8 bg-white/3 overflow-hidden"
      >
        {/* Background scanline texture */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,1) 2px, rgba(255,255,255,1) 3px)",
            backgroundSize: "100% 3px"
          }}
        />
        {/* Glow blob */}
        <div
          className="absolute top-0 right-0 w-64 h-64 opacity-10 blur-3xl"
          style={{ background: `radial-gradient(circle, ${lvlInfo.color}, transparent 70%)` }}
        />

        <div className="relative p-5 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-5">

          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center text-3xl font-black"
              style={{
                background: `linear-gradient(135deg, ${lvlInfo.color}30, ${lvlInfo.color}10)`,
                border: `2px solid ${lvlInfo.color}50`,
                boxShadow: `0 0 32px ${lvlInfo.color}20`
              }}
            >
              {address.slice(2, 4).toUpperCase()}
            </div>
            {/* Level badge */}
            <div
              className="absolute -bottom-2 -right-2 w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-[11px]"
              style={{ background: lvlInfo.color, color: "#000" }}
            >
              {lvlInfo.level}
            </div>
          </div>

          {/* Identity */}
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

            {/* Level bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-widest text-white/30">
                  Level {lvlInfo.level} Progress
                </span>
                <span className="font-mono text-[9px] text-white/40">
                  {pts.toLocaleString()} / {lvlInfo.max.toLocaleString()} HP
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
                {lvlInfo.pct}% · {(lvlInfo.max - pts).toLocaleString()} HP to Level {lvlInfo.level + 1}
              </p>
            </div>
          </div>

          {/* Multiplier badge */}
          <div className="flex-shrink-0 flex flex-col items-center gap-1.5 px-5 py-4 rounded-2xl border border-white/8 bg-white/3">
            <MdLocalFireDepartment  className="w-7 h-7 text-orange-400"/>
            <span className="font-display font-black text-3xl text-white leading-none">{multi}×</span>
            <span className="font-mono text-[9px] uppercase tracking-widest text-white/30">Multiplier</span>
          </div>
        </div>
      </motion.div>

      {/* ══ Stat Cards ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={HiMiniTrophy}   label="Total Points"  value={pts.toLocaleString()}
          sub="Hair Points"  color="#fb923c"   delay={0.1}
        />
        <StatCard
          icon={Star}     label="Global Rank"   value={rank ? `#${rank}` : "—"}
          sub="All players"  color="#a78bfa"   delay={0.15}
        />
        <StatCard
          icon={Layers}   label="NFTs Owned"    value={MOCK_NFTS.length}
          sub="In wallet"    color="#38bdf8"   delay={0.2}
        />
      </div>

      {/* ══ Multiplier Tiers ══════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="rounded-2xl border border-white/8 bg-white/3 p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-white/50 flex items-center gap-2">
            <MdLocalFireDepartment className="w-3.5 h-3.5 text-orange-400" /> Multiplier Tiers
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { nfts: "0 NFTs",   multi: "1.0×", active: MOCK_NFTS.length === 0, color: "#94a3b8" },
            { nfts: "1 NFT",    multi: "1.25×", active: MOCK_NFTS.length === 1, color: "#34d399" },
            { nfts: "2–4 NFTs", multi: "1.5×",  active: MOCK_NFTS.length >= 2 && MOCK_NFTS.length < 5, color: "#38bdf8" },
            { nfts: "5–9 NFTs", multi: "2.0×",  active: MOCK_NFTS.length >= 5 && MOCK_NFTS.length < 10, color: "#a78bfa" },
            { nfts: "10+ NFTs", multi: "3.0×",  active: MOCK_NFTS.length >= 10, color: "#fb923c" },
          ].map(tier => (
            <div
              key={tier.nfts}
              className="rounded-xl p-3 border transition-all duration-200"
              style={tier.active
                ? { background: `${tier.color}12`, borderColor: `${tier.color}40` }
                : { background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }
              }
            >
              <p className="font-display font-black text-lg leading-none mb-1" style={{ color: tier.active ? tier.color : "rgba(255,255,255,0.25)" }}>
                {tier.multi}
              </p>
              <p className="font-mono text-[9px] uppercase tracking-widest" style={{ color: tier.active ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)" }}>
                {tier.nfts}
              </p>
              {tier.active && (
                <div className="mt-1.5 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: tier.color }} />
                  <span className="font-mono text-[8px] uppercase tracking-widest" style={{ color: tier.color }}>Active</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </motion.div>

      {/* ══ NFT Collection ════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
        className="rounded-2xl border border-white/8 bg-white/3 p-5"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-white/50 flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-sky-400" /> NFT Collection
            <span className="px-1.5 py-0.5 rounded-md bg-white/6 text-white/40 text-[9px] font-mono">
              {MOCK_NFTS.length} owned
            </span>
          </h3>
          <button className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors">
            View all <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {MOCK_NFTS.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {MOCK_NFTS.map((nft, i) => (
              <NFTCard key={nft.id} nft={nft} index={i} />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <Layers className="w-8 h-8 text-white/10 mx-auto mb-3" />
            <p className="font-mono text-[11px] uppercase tracking-widest text-white/25">No NFTs in wallet</p>
            <p className="font-mono text-[10px] text-white/15 mt-1">Hold NFTs to boost your multiplier</p>
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
          {[
            { level: 1, title: "Rookie",   min: 0,     max: 500,   color: "#94a3b8", emoji: "🌱" },
            { level: 2, title: "Player",   min: 500,   max: 1500,  color: "#34d399", emoji: "⚡" },
            { level: 3, title: "Veteran",  min: 1500,  max: 4000,  color: "#38bdf8", emoji: "🔥" },
            { level: 4, title: "Elite",    min: 4000,  max: 10000, color: "#a78bfa", emoji: "💎" },
            { level: 5, title: "Legend",   min: 10000, max: 25000, color: "#fb923c", emoji: "👑" },
            { level: 6, title: "Immortal", min: 25000, max: 99999, color: "#f43f5e", emoji: "🏆" },
          ].map(l => {
            const isActive  = pts >= l.min && pts < l.max;
            const isPassed  = pts >= l.max;
            const rowPct    = isPassed ? 100 : isActive ? Math.round(((pts - l.min) / (l.max - l.min)) * 100) : 0;
            return (
              <div
                key={l.level}
                className="flex items-center gap-3 p-3 rounded-xl border transition-all duration-200"
                style={isActive
                  ? { background: `${l.color}08`, borderColor: `${l.color}25` }
                  : { background: "transparent", borderColor: "rgba(255,255,255,0.04)" }
                }
              >
                <span className="text-base w-6 text-center flex-shrink-0">{l.emoji}</span>
                <div className="w-14 flex-shrink-0">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: isPassed || isActive ? l.color : "rgba(255,255,255,0.25)" }}>
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