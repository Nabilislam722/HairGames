import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import {
  Crown, Copy, Check, Gift, Vault, HelpCircle, Lock, BadgeCheck, TriangleAlert, RotateCw, ChevronDown, Clock3,
  ArrowRight, ArrowUpRight,
} from "lucide-react";
import { FaXTwitter, FaDiscord } from "react-icons/fa6";
import { LEVELS, levelIndex, getLevelInfo } from "@/lib/levels";
import { GAMES } from "@/lib/games";
import { usePlayerActivity, perDay, EXPLORER_URL } from "@/lib/activity";
import { useGameSession } from "@/lib/gameSession";
import { MOCK_DATA, mockProfile } from "@/lib/mockData";
import { AddressAvatar, shortAddress } from "@/components/arena/AddressAvatar";
import { SectionHead } from "@/components/arena/Heads";
import { ConnectPrompt } from "@/components/arena/ConnectPrompt";
import { SegBar } from "@/components/arena/SegBar";
import { RankBadge } from "@/components/arena/RankBadge";
import { TrendCard, SessionTrendCard, TREND_ORANGE, TREND_LIME } from "@/components/arena/TrendCards";
import { RecentPlays } from "@/components/arena/RecentPlays";
import "@/styles/hg.css";
import "@/styles/profile.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

// NFT Image Map
// Key   = contract address (lowercase)
// Value = public image URL (Cloudflare R2 or any CDN)
const NFT_IMAGE_FALLBACK = "https://amaranth-imperial-otter-134.mypinata.cloud/ipfs/bafybeicdxf6wh2i7jtkinytziitfhv4nagmkvmzaraoy5b2ris27jiu7ae";

// How many NFTs show before the "Show all" toggle kicks in.
const NFT_PREVIEW_COUNT = 12;

const STATUS_LABEL = {
  complete: "Unlocked",
  active: "Current",
  next: "Up next",
  locked: "Locked",
};

const sum = (list) => list.reduce((a, b) => a + b, 0);

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

// Hours until a newly received NFT starts counting toward the multiplier.
const hoursUntil = (date) => Math.max(1, Math.ceil((new Date(date).getTime() - Date.now()) / 3_600_000));

/*  Sub-components  */

function SocialButton({ icon: Icon, label, handle, onConnect }) {
  if (handle) {
    return (
      <span className="social on" title={`${label} connected`}>
        <Icon size={13} /> <span>{handle}</span> <Check size={12} />
      </span>
    );
  }
  return (
    <button type="button" className="social" onClick={onConnect}>
      <Icon size={13} /> Connect {label}
    </button>
  );
}

function NFTCard({ nft }) {
  const counting = nft.active !== false;
  return (
    <div className="nft">
      <div className="nft-art">
        <img
          src={nft.imageUrl || NFT_IMAGE_FALLBACK}
          alt={nft.name}
          loading="lazy"
          onError={(e) => {
            if (e.currentTarget.src !== NFT_IMAGE_FALLBACK) e.currentTarget.src = NFT_IMAGE_FALLBACK;
          }}
        />
        {counting ? (
          <span className="pill-lime" title="Counts toward your multiplier"><BadgeCheck size={11} /> Verified</span>
        ) : (
          <span className="pill" title="New NFTs count toward your multiplier after a holding period">
            <Clock3 size={11} /> Counts in {hoursUntil(nft.countsFrom)}h
          </span>
        )}
      </div>
      <div className="nft-body">
        <p className="nft-name">{nft.name}</p>
        <p className="nft-coll">{nft.collectionName}</p>
        {nft.gameBonus?.moto_rush > 0 && (
          <p className="nft-bonus" title="Added in Moto Rush when you ride the #27 Venom">
            +{nft.gameBonus.moto_rush}× in Moto Rush on the Venom
          </p>
        )}
      </div>
    </div>
  );
}

function RankStep({ item, points }) {
  const { level, title, min, color, status, pct } = item;
  const state = status === "complete" ? "reached" : status;
  return (
    <li className={`step ${state}`} style={{ "--sc": color }}>
      <RankBadge level={item} size={52} className="step-badge" />
      <p className="step-title">{title}</p>
      <p className="step-min">Level {level} · {min === 0 ? "Starting rank" : `${min.toLocaleString()} HP`}</p>
      <div className="step-status">
        {status === "next" ? (
          <>
            <SegBar value={pct} max={100} segments={8} label={`Progress to ${title}`} />
            <p className="step-togo">{pct}% · {(min - points).toLocaleString()} HP to go</p>
          </>
        ) : (
          <span className={status === "complete" ? "pill-lime" : "pill"} style={status === "active" ? { color } : undefined}>
            {status === "complete" && <Check size={10} />}
            {status === "locked" && <Lock size={10} />}
            {STATUS_LABEL[status]}
          </span>
        )}
      </div>
    </li>
  );
}

function ComingSoon({ icon: Icon, title, text, color }) {
  return (
    <div className="soon-item" style={{ "--c": color }}>
      <span className="soon-icon"><Icon size={18} /></span>
      <div>
        <p className="soon-title">{title}</p>
        <p className="soon-text">{text}</p>
      </div>
      <span className="pill">Coming soon</span>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="hg" aria-busy="true" aria-label="Loading profile">
      <div className="ptop">
        <div className="skel" style={{ height: 300 }} />
        <div className="trends">
          {[0, 1, 2].map(i => <div key={i} className="skel" style={{ height: 230 }} />)}
        </div>
      </div>
      <div className="skel" style={{ height: 320 }} />
    </div>
  );
}

export default function Profile() {
  const { address, isConnected } = useAccount();
  const session = useGameSession();
  const activity = usePlayerActivity(address, GAMES);
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
          motoRushVenomMultiplier: data.motoRushVenomMultiplier ?? null,
          completedTasks: data.completedTasks || [],
          rank: data.rank ?? null,
          twitter: xStatus.connected ? xStatus.handle : null,
          discord: discordStatus.connected ? discordStatus.handle : null
        });
        setLoadError(false);
      } catch (error) {
        if (MOCK_DATA) {
          setProfile(mockProfile());
          setLoadError(false);
        } else {
          console.error("Failed syncing profile metadata parameters:", error);
          setLoadError(true);
        }
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
  if (!isConnected || !address) {
    return (
      <div className="hg">
        <ConnectPrompt title="Your profile awaits" text="Connect your wallet to see your Hair Points, global rank and NFT multiplier.">
          <div>
            <p className="ph-eyebrow" style={{ justifyContent: "center", marginBottom: 12 }}>{LEVELS.length} ranks to climb</p>
            <div className="ranks-row">
              {LEVELS.map(l => <RankBadge key={l.level} level={l} size={44} labelled />)}
            </div>
          </div>
        </ConnectPrompt>
      </div>
    );
  }

  /*  Loading  */
  if (loading) return <ProfileSkeleton />;

  const { points, nftHoldings, multiplier, pendingMultiplier, motoRushVenomMultiplier, rank, twitter, discord } = profile;
  const multiplierNote = [
    pendingMultiplier > multiplier
      ? `Rises to ${Number(pendingMultiplier).toFixed(2)}× as new NFTs settle in`
      : nftHoldings.length > 0 ? `${Number(multiplier).toFixed(2)}× applied to every score` : "Hold NFTs to boost your multiplier",
    motoRushVenomMultiplier ? `${Number(motoRushVenomMultiplier).toFixed(2)}× in Moto Rush on the Venom` : null,
  ].filter(Boolean).join(" · ");
  const lvlInfo = getLevelInfo(points);
  const roadmap = getRoadmap(points);
  const visibleNfts = showAllNfts ? nftHoldings : nftHoldings.slice(0, NFT_PREVIEW_COUNT);

  const playsByDay = perDay(activity.plays.filter(p => p.kind === "start"));
  const playsThisWeek = sum(playsByDay.slice(7));
  const playsLastWeek = sum(playsByDay.slice(0, 7));
  const playsChange = playsLastWeek ? ((playsThisWeek - playsLastWeek) / playsLastWeek) * 100 : null;
  const spendByDay = perDay(activity.plays, p => Number(formatEther(p.cost)));

  return (
    <div className="hg">

      {loadError && (
        <div role="alert" className="alert">
          <TriangleAlert size={16} />
          <p>We couldn't load your profile. The numbers below may be out of date.</p>
          <button type="button" className="btn btn-ghost" onClick={retryLoad}>
            <RotateCw size={12} /> Retry
          </button>
        </div>
      )}

      {/* ══ Identity, rank and trends ══════════════════════════════════ */}
      <section className="ptop" style={{ "--rc": lvlInfo.color }}>
        <div className="pid">
          <p className="pid-hey">Hey <b>{address.slice(0, 6)}</b>, here's your season so far.</p>

          <div className="pid-row">
            <span className="pid-avatar"><AddressAvatar address={address} /></span>
            <div className="pid-who">
              <h1 className="pid-name">{shortAddress(address)}</h1>
              <div className="pid-tags">
                {rank && <span className="pill">#{rank.toLocaleString()} global</span>}
                {rank && rank <= 10 && <span className="pill-lime"><Crown size={11} /> Top 10</span>}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={copyAddr}
              aria-label={copied ? "Address copied" : "Copy wallet address"}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="pid-socials">
            <SocialButton icon={FaDiscord} label="Discord" handle={discord} onConnect={connectDiscord} />
            <SocialButton icon={FaXTwitter} label="X" handle={twitter && `@${twitter}`} onConnect={connectTwitter} />
          </div>

          <div className="pid-rank">
            <RankBadge level={lvlInfo} size={64} />
            <div className="pid-rank-body">
              <p className="pid-rank-name">{lvlInfo.title} <span className="pill-lime">Level {lvlInfo.level}</span></p>
              <SegBar
                value={lvlInfo.isMaxed ? 1 : points - lvlInfo.min}
                max={lvlInfo.isMaxed ? 1 : lvlInfo.max - lvlInfo.min}
                segments={12}
                label={`Level ${lvlInfo.level} progress`}
              />
              <p className="pid-next">
                {lvlInfo.isMaxed
                  ? "Top rank reached"
                  : `${(lvlInfo.max - points).toLocaleString()} HP to ${lvlInfo.next.title} · ${lvlInfo.pct}%`}
              </p>
            </div>
          </div>
        </div>

        <div className="trends hg-stagger">
          <TrendCard
            color={TREND_ORANGE}
            label="Total points"
            badge={`${Number(multiplier).toFixed(2)}x`}
            badgeTone={multiplier > 1 ? "up" : "flat"}
            value={points.toLocaleString()}
            unit="HP"
            data={activity.hpByDay}
            footer={<Link href="/leaderboard" className="sc-link">Leaderboard <ArrowRight size={12} /></Link>}
          />
          <TrendCard
            color={TREND_ORANGE}
            label="Plays this week"
            badge={playsChange == null ? null : `${playsChange >= 0 ? "+" : ""}${playsChange.toFixed(1)}%`}
            badgeTone={playsChange >= 0 ? "up" : "down"}
            value={playsThisWeek}
            data={playsByDay}
            footer={<Link href="/dashboard" className="sc-link">Play a game <ArrowRight size={12} /></Link>}
          />
          {session.enabled ? (
            <SessionTrendCard session={session} data={spendByDay} />
          ) : (
            <TrendCard
              color={TREND_LIME}
              label="Spent this week"
              value={sum(spendByDay.slice(7)).toFixed(6).replace(/\.?0+$/, "")}
              unit="ETH"
              data={spendByDay}
              footer={(
                <a className="sc-link" href={`${EXPLORER_URL}/address/${address}`} target="_blank" rel="noopener noreferrer">
                  Explorer <ArrowUpRight size={12} />
                </a>
              )}
            />
          )}
        </div>
      </section>

      {/* ══ Recent plays ═══════════════════════════════════════════════ */}
      <RecentPlays activity={activity} address={address} />

      {/* ══ Rank roadmap ═══════════════════════════════════════════════ */}
      <section className="sec">
        <SectionHead title="Rank roadmap">
          <button type="button" className="btn btn-ghost" onClick={() => setShowHelp(v => !v)} aria-expanded={showHelp}>
            <HelpCircle size={12} /> How it works
          </button>
        </SectionHead>
        {showHelp && (
          <p className="help">
            Every game you submit on-chain adds Hair Points to your total. Your multiplier, raised by
            verified NFTs, is applied to each score before it's added. A newly received NFT starts
            counting after a short holding period. Ranks unlock automatically as your total grows.
          </p>
        )}
        <ol className="track hg-stagger">
          {roadmap.map(item => <RankStep key={item.level} item={item} points={points} />)}
        </ol>
      </section>

      {/* ══ NFTs ═══════════════════════════════════════════════════════ */}
      <section className="sec">
        <SectionHead title="NFT holdings" count={nftHoldings.length}>
          <span className="sh-note">{multiplierNote}</span>
          {nftHoldings.length > NFT_PREVIEW_COUNT && (
            <button type="button" className="btn btn-ghost" onClick={() => setShowAllNfts(v => !v)} aria-expanded={showAllNfts}>
              {showAllNfts ? "Show less" : `Show all ${nftHoldings.length}`}
              <ChevronDown size={12} style={{ transform: showAllNfts ? "rotate(180deg)" : undefined }} />
            </button>
          )}
        </SectionHead>
        {nftHoldings.length > 0 ? (
          <div className="nft-grid hg-stagger">
            {visibleNfts.map(nft => <NFTCard key={`${nft.contractAddress}-${nft.tokenId}`} nft={nft} />)}
          </div>
        ) : (
          <div className="tbl-empty">
            No supported NFTs yet. Hold an NFT from an ecosystem collection to raise your scoring multiplier.
          </div>
        )}
      </section>

      {/* ══ Coming soon ════════════════════════════════════════════════ */}
      <section className="sec">
        <SectionHead title="Coming soon" />
        <div className="soon hg-stagger">
          <ComingSoon icon={Gift} title="Hairdrop" text="Claim points" color="#ec4899" />
          <ComingSoon icon={Vault} title="Vault" text="Staking" color="#10b981" />
        </div>
      </section>
    </div>
  );
}
