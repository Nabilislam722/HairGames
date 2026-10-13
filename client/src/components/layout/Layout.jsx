import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, House, Gamepad2, Trophy, UserRound, Wallet, ChevronDown, Zap, Ban } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { CURRENT_SEASON } from "@/lib/season";
import "@/styles/globals.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

const NAV_LINKS = [
  { href: "/",            label: "Home",        icon: House     },
  { href: "/dashboard",   label: "Dashboard",   icon: Gamepad2  },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy    },
  { href: "/profile",     label: "Profile",     icon: UserRound },
];

const EVENT_LINK = { href: "/eventrank", label: "Event" };

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";

const isActive = (location, href) => (href === "/" ? location === "/" : location.startsWith(href));

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const formatPoints = (n) => (n < 100000 ? n.toLocaleString() : compact.format(n));

/* ─── Hair Points for the connected wallet ───────────────────────────── */
// Refetched on every page change so points from a finished game show up right away.
function useHairPoints(address, location) {
  const [points, setPoints] = useState(null);
  useEffect(() => {
    if (!address) {
      setPoints(null);
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE}/api/points/get?wallet=${address}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && typeof d?.points === "number") setPoints(d.points);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [address, location]);
  return points;
}

/* ─── Ban status for the connected wallet ───────────────────────────── */
// Checked when a wallet connects or changes. If the check itself fails, the site stays usable:
// the backend refuses banned wallets on every game and HP route regardless.
function useBanStatus(address) {
  const [ban, setBan] = useState(null);
  useEffect(() => {
    setBan(null);
    if (!address) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/ban/${address}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.banned) setBan(d);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [address]);
  return ban;
}

function BannedScreen({ ban }) {
  const until = ban.until ? new Date(ban.until) : null;
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 font-ui">
      <div role="alert" className="w-full max-w-md text-center rounded-3xl border border-red-500/25 bg-red-500/6 p-8">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
          <Ban className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">You are banned</h1>
        <p className="text-sm text-white/60 mb-5">
          This wallet can't play HairGames or earn Hair Points
          {until ? ` until ${until.toLocaleString()}` : ""}.
        </p>
        {ban.reason && (
          <p className="text-sm text-red-200/90 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-5">
            Reason: {ban.reason}
          </p>
        )}
        <p className="text-xs text-white/40 mb-6">If you think this is a mistake, contact the HairGames team on Discord.</p>
        <div className="flex justify-center">
          <WalletButton />
        </div>
      </div>
    </div>
  );
}

/* ─── Pieces ─────────────────────────────────────────────────────────── */
function Logo({ onClick }) {
  return (
    <Link href="/" onClick={onClick} className={`group flex items-center gap-2.5 shrink-0 justify-self-start rounded-lg ${FOCUS_RING}`}>
      <span className="w-8 h-8 rounded-lg overflow-hidden ring-1 ring-white/10 group-hover:ring-primary/50 transition">
        <img src="/logo.png" alt="" className="w-full h-full object-cover" />
      </span>
      <span className="font-display font-extrabold text-[17px] tracking-tight text-white leading-none">
        Hair
        <span className="relative ml-0.5">
          <span className="text-primary">GAMES</span>
          <span
            className="absolute inset-0 text-white transition-all duration-500 [clip-path:inset(0_100%_0_0)] group-hover:[clip-path:inset(0_0%_0_0)]"
            aria-hidden
          >
            GAMES
          </span>
        </span>
      </span>
    </Link>
  );
}

function EventLink({ location, onClick, className = "" }) {
  const active = isActive(location, EVENT_LINK.href);
  return (
    <Link
      href={EVENT_LINK.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={[
        "inline-flex items-center gap-2 h-10 px-3.5 rounded-xl border text-[13px] font-semibold transition-colors",
        active
          ? "bg-orange-400/15 border-orange-400/45 text-orange-200"
          : "bg-orange-400/6 border-orange-400/20 text-orange-300 hover:bg-orange-400/10 hover:border-orange-400/35",
        FOCUS_RING,
        className,
      ].join(" ")}
    >
      <span className="relative flex w-2 h-2 shrink-0">
        <span className="absolute inline-flex w-full h-full rounded-full bg-orange-400 opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex w-2 h-2 rounded-full bg-orange-400" />
      </span>
      {EVENT_LINK.label}
      <span className="ml-auto text-[10px] font-bold uppercase tracking-[0.12em] text-orange-300/60">Weekly</span>
    </Link>
  );
}

function SeasonBadge({ className = "" }) {
  return (
    <span
      className={`inline-flex items-center h-10 px-3 rounded-xl text-[11px] font-bold uppercase tracking-[0.14em] text-primary bg-primary/10 ring-1 ring-inset ring-primary/25 ${className}`}
    >
      Season {CURRENT_SEASON}
    </span>
  );
}

function PointsChip({ points, onClick, className = "inline-flex" }) {
  return (
    <Link
      href="/profile"
      onClick={onClick}
      title={`${points.toLocaleString()} Hair Points`}
      className={`${className} items-center gap-1.5 h-10 px-3 rounded-xl bg-white/4 ring-1 ring-inset ring-white/8 text-[13px] font-semibold text-white hover:bg-white/8 transition-colors tabular-nums ${FOCUS_RING}`}
    >
      <Zap className="w-4 h-4 text-primary" fill="currentColor" strokeWidth={0} />
      {formatPoints(points)}
      <span className="text-white/45 font-medium">HP</span>
    </Link>
  );
}

// A small gradient dot derived from the address, standing in for an avatar.
function AddressDot({ address }) {
  let h = 0;
  for (const ch of address ?? "") h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden
      className="w-7 h-7 rounded-lg shrink-0"
      style={{ background: `linear-gradient(135deg, hsl(${h} 85% 60%), hsl(${(h + 70) % 360} 85% 45%))` }}
    />
  );
}

function WalletButton({ block = false }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const base = [
          "inline-flex items-center justify-center gap-2 h-10 rounded-xl text-[13px] font-semibold transition-colors",
          block ? "w-full" : "",
          FOCUS_RING,
        ].join(" ");

        if (!mounted) return <span aria-hidden className={`${base} px-4 invisible`}>Connect Wallet</span>;

        if (!account || !chain) {
          return (
            <button
              type="button"
              onClick={openConnectModal}
              className={`${base} px-4 bg-primary text-white hover:bg-primary/90 shadow-[0_8px_24px_-10px_hsl(var(--primary))]`}
            >
              <Wallet className="w-4 h-4" /> Connect Wallet
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              type="button"
              onClick={openChainModal}
              className={`${base} px-4 bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/40 hover:bg-red-500/20`}
            >
              Wrong network
            </button>
          );
        }

        return (
          <button
            type="button"
            onClick={openAccountModal}
            className={`${base} pl-1.5 pr-3 bg-white/4 ring-1 ring-inset ring-white/8 text-white hover:bg-white/8`}
          >
            <AddressDot address={account.address} />
            <span className="truncate">{account.displayName}</span>
            <ChevronDown className="w-3.5 h-3.5 text-white/40 shrink-0" />
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

/* ─── Desktop navigation ─────────────────────────────────────────────── */
function DesktopNav({ location }) {
  return (
    <nav aria-label="Main" className="hidden lg:flex items-center gap-2">
      <div className="flex items-center gap-0.5 p-1 rounded-xl bg-white/4 ring-1 ring-inset ring-white/7">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
          const active = isActive(location, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={[
                "relative flex items-center gap-2 h-8 px-3.5 rounded-lg text-[13px] font-semibold transition-colors",
                active ? "text-white" : "text-white/55 hover:text-white hover:bg-white/5",
                FOCUS_RING,
              ].join(" ")}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-lg bg-primary/20 ring-1 ring-inset ring-primary/40 shadow-[0_0_20px_-6px_hsl(var(--primary))]"
                  transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
                />
              )}
              <Icon className="relative w-4 h-4 hidden xl:block" />
              <span className="relative">{label}</span>
            </Link>
          );
        })}
      </div>
      <EventLink location={location} />
    </nav>
  );
}

/* ─── Mobile menu ────────────────────────────────────────────────────── */
function MobileMenu({ open, onClose, location, points }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] lg:hidden font-ui"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

          <motion.aside
            className="absolute top-2 right-2 bottom-2 w-[min(340px,calc(100vw-16px))] flex flex-col rounded-2xl bg-background/95 border border-white/10 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] overflow-hidden"
            initial={{ x: "105%" }} animate={{ x: 0 }} exit={{ x: "105%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
          >
            <div className="flex items-center justify-between h-16 px-4 border-b border-white/7">
              <Logo onClick={onClose} />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className={`w-10 h-10 rounded-xl flex items-center justify-center bg-white/4 ring-1 ring-inset ring-white/8 text-white/60 hover:text-white transition-colors ${FOCUS_RING}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
              <div className="flex items-center gap-2">
                <SeasonBadge />
                {points !== null && <PointsChip points={points} onClick={onClose} />}
              </div>

              <nav aria-label="Main" className="flex flex-col gap-1">
                {NAV_LINKS.map(({ href, label, icon: Icon }) => {
                  const active = isActive(location, href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={[
                        "flex items-center gap-3 h-12 px-2 rounded-xl text-[15px] font-semibold transition-colors",
                        active ? "bg-primary/15 text-white ring-1 ring-inset ring-primary/30" : "text-white/65 hover:bg-white/5 hover:text-white",
                        FOCUS_RING,
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          active ? "bg-primary text-white" : "bg-white/6 text-white/60",
                        ].join(" ")}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                      {label}
                    </Link>
                  );
                })}
              </nav>

              <EventLink location={location} onClick={onClose} className="h-12 w-full text-[15px]" />
            </div>

            <div className="p-4 border-t border-white/7">
              <WalletButton block />
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Layout ─────────────────────────────────────────────────────────── */
export function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [location] = useLocation();
  const { address, isConnected } = useAccount();
  const points = useHairPoints(isConnected ? address : null, location);
  const ban = useBanStatus(isConnected ? address : null);
  const isGamePage = location.startsWith("/game/");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  // Close the menu whenever the route changes.
  useEffect(() => setMobileOpen(false), [location]);

  // A banned wallet sees only the ban screen, on every page and game.
  if (ban) return <BannedScreen ban={ban} />;

  if (isGamePage) return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 w-full">{children}</main>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background overflow-x-hidden ">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 px-3 sm:px-4 pt-3 font-ui">
        <div
          className={[
            "mx-auto max-w-7xl h-16 pl-3 pr-2 sm:pl-4 grid grid-cols-[1fr_auto] lg:grid-cols-[1fr_auto_1fr] items-center gap-3",
            "rounded-2xl border backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-300",
            scrolled
              ? "bg-background/85 border-white/10 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.8)]"
              : "bg-white/3 border-white/7",
          ].join(" ")}
        >
          <Logo />

          <DesktopNav location={location} />

          <div className="flex items-center justify-end gap-2">
            <SeasonBadge className="hidden xl:inline-flex" />
            {points !== null && <PointsChip points={points} className="hidden sm:inline-flex" />}
            <div className="hidden lg:block">
              <WalletButton />
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              aria-expanded={mobileOpen}
              className={`lg:hidden w-10 h-10 rounded-xl flex items-center justify-center bg-white/4 ring-1 ring-inset ring-white/8 text-white/70 hover:text-white hover:bg-white/8 transition-colors ${FOCUS_RING}`}
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <MobileMenu open={mobileOpen} onClose={() => setMobileOpen(false)} location={location} points={points} />

      {/* ── Main ── */}
      <main className="flex-1 w-full">
        <div className="w-full px-4 sm:px-6 xl:px-10 py-8 md:py-10 justify-center flex">
          {children}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/6 bg-background/60 mt-auto">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="w-full px-6 xl:px-10 py-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex flex-col gap-2.5">
              <Link href="/" className="flex items-center gap-2.5 group w-fit">
                <div className="w-6 h-6 rounded-md overflow-hidden border border-white/10 group-hover:border-primary/30 transition-colors">
                  <img src="/logo.png" alt="Hair Games" className="w-full h-full object-cover" />
                </div>
                <span className="font-display font-extrabold text-sm text-white/50 tracking-tight group-hover:text-white/80 transition-colors uppercase">
                  HemiGames
                </span>
              </Link>
              <p className="font-mono text-[9px] uppercase tracking-widest text-white/20 max-w-[180px] leading-relaxed">
                Decentralized gaming on Hemi Network
              </p>
            </div>

            <nav className="hidden md:flex items-center gap-5">
              {NAV_LINKS.map(n => (
                <Link key={n.href} href={n.href} className="font-mono text-[10px] uppercase tracking-widest text-white/30 hover:text-white/70 transition-colors">
                  {n.label}
                </Link>
              ))}
              <Link
                href={EVENT_LINK.href}
                className="font-mono text-[10px] uppercase tracking-widest transition-colors"
                style={{ color: "rgba(251,146,60,0.4)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "rgba(251,146,60,0.75)")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(251,146,60,0.4)")}
              >
                {EVENT_LINK.label}
              </Link>
            </nav>

            <div className="flex flex-col items-start md:items-end gap-3">
              <div className="flex items-center gap-2">
                <a href="https://discord.gg/k2W7g5xR" target="_blank" rel="noopener noreferrer"
                  className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/4 border border-white/8 text-white/35 hover:bg-indigo-500/15 hover:text-indigo-300 hover:border-indigo-500/30 transition-all" title="Discord">
                  <div className="w-3.5 h-3.5" style={{ background:"currentColor", maskImage:"url('/discord.svg')", WebkitMaskImage:"url('/discord.svg')", maskSize:"contain", maskRepeat:"no-repeat", maskPosition:"center" }} />
                </a>
                <a href="https://explorer.hemi.xyz/address/0x61A86E5B2075d0E6ff659a6b29D1E367CAa6a8E5?tab=contract" target="_blank" rel="noopener noreferrer"
                  className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/4 border border-white/8 text-white/35 hover:bg-teal-500/15 hover:text-teal-300 hover:border-teal-500/30 transition-all" title="Block Explorer">
                  <div className="w-3.5 h-3.5" style={{ background:"currentColor", maskImage:"url('/expo.svg')", WebkitMaskImage:"url('/expo.svg')", maskSize:"contain", maskRepeat:"no-repeat", maskPosition:"center" }} />
                </a>
              </div>
              <div className="text-right">
                <p className="font-mono text-[9px] uppercase tracking-widest text-white/20 leading-relaxed">
                  Built on Hemi Network · Play responsibly
                </p>
                <a href="https://explorer.hemi.xyz/token/0x5B774f563C902FA7b203FB7029ed6eD4Ce274705" target="_blank" rel="noopener noreferrer"
                  className="font-mono text-[9px] text-primary/50 hover:text-primary/80 transition-colors uppercase tracking-widest">
                  $HAIR: 0x5B77…4705
                </a>
                <p className="font-mono text-[9px] uppercase tracking-widest text-white/15 mt-0.5">©2026 Hair. All rights reserved.</p>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
