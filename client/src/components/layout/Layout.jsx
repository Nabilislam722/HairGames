import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, House, Gamepad2, Trophy, Gift, UserRound, Wallet, ChevronDown, Zap, Ban, Plus, Loader2, ArrowRight } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { CURRENT_SEASON } from "@/lib/season";
import { GAMES } from "@/lib/games";
import { getLevelInfo } from "@/lib/levels";
import { MOCK_DATA, MOCK_POINTS } from "@/lib/mockData";
import {
  useGameSession, formatSessionEth, formatTimeLeft, topUpLabel, SESSION_TOP_UPS, SESSION_DEFAULT_TOP_UP, SESSION_DAYS,
} from "@/lib/gameSession";
import { AddressAvatar } from "@/components/arena/AddressAvatar";
import logoUrl from "@/assets/images/hairgames-logo.webp";
import "@/styles/globals.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

const NAV_LINKS = [
  { href: "/",            label: "Home",        icon: House     },
  { href: "/dashboard",   label: "Dashboard",   icon: Gamepad2  },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy    },
  { href: "/rewards",     label: "Rewards",     icon: Gift      },
  { href: "/profile",     label: "Profile",     icon: UserRound },
];

const EVENT_LINK = { href: "/eventrank", label: "Weekly Event" };
const LIVE_GAMES = GAMES.filter(g => g.status === "active");

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
        if (cancelled) return;
        if (typeof d?.points === "number") setPoints(d.points);
        else if (MOCK_DATA) setPoints(MOCK_POINTS);
      })
      .catch(() => {
        if (!cancelled && MOCK_DATA) setPoints(MOCK_POINTS);
      });
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
function Logo({ onClick, className = "h-9 lg:h-11" }) {
  return (
    <Link href="/" onClick={onClick} className={`shrink-0 rounded-md transition-[filter] hover:brightness-110 ${FOCUS_RING}`}>
      <img src={logoUrl} alt="HairGames" className={`${className} w-auto`} />
    </Link>
  );
}

// `className` sets the display (e.g. "hidden lg:inline-flex"), so callers can hide it. `compact` says
// just "Event" until the navbar has room for "Weekly Event".
function EventLink({ onClick, className = "inline-flex", compact = false }) {
  return (
    <Link
      href={EVENT_LINK.href}
      onClick={onClick}
      className={`items-center justify-center gap-2 h-9 px-4 rounded-lg bg-[#7b5cff] hover:bg-[#8a6eff] text-white font-tech text-[12px] font-bold uppercase tracking-[0.08em] shadow-[0_8px_22px_-10px_#7b5cff] transition-colors ${FOCUS_RING} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-white motion-safe:animate-pulse" />
      <span className="whitespace-nowrap"><span className={compact ? "hidden min-[1400px]:inline" : undefined}>Weekly </span>Event</span>
    </Link>
  );
}

function WalletButton({ block = false, points = null }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const base = [
          "inline-flex items-center justify-center gap-2 h-10 rounded-lg font-tech text-[13px] font-bold uppercase tracking-[0.06em] transition-colors",
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
            className={`${base} justify-start pl-1 pr-2.5 text-white hover:bg-white/5 ${block ? "ring-1 ring-inset ring-white/8" : ""}`}
          >
            <span className="w-8 h-8 rounded-lg overflow-hidden shrink-0"><AddressAvatar address={account.address} /></span>
            <span className={`${block ? "flex" : "hidden xl:flex"} flex-col items-start leading-tight text-left`}>
              <span className="truncate">{account.displayName}</span>
              <span className="font-ui normal-case tracking-normal text-[11px] font-medium text-white/40 whitespace-nowrap">
                {points === null ? "Hemi" : `${getLevelInfo(points).title} · ${formatPoints(points)} HP`}
              </span>
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-white/40 shrink-0 ml-1" />
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

/* ─── Balance and game session ───────────────────────────────────────── */
// The navbar shows the game session's balance with a "+" to start one or add funds. Without game
// sessions it shows the wallet's ETH balance.
function BalancePill() {
  const session = useGameSession();
  const { address } = useAccount();
  const { data: wallet } = useBalance({ address, query: { enabled: !session.enabled } });
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pill = "inline-flex items-center h-9 rounded-lg bg-white/5 ring-1 ring-inset ring-white/8 font-tech text-[13px] font-semibold text-white tabular-nums";

  if (!session.enabled) {
    return (
      <span className={`${pill} px-3`} title="Wallet balance on Hemi">
        {formatSessionEth(wallet?.value ?? 0n)}<span className="ml-1.5 text-white/40">ETH</span>
      </span>
    );
  }

  const off = session.status === "off";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Game session"
        className={`${pill} gap-2.5 pl-3 pr-1 hover:bg-white/8 transition-colors ${FOCUS_RING}`}
      >
        <span className={off ? "text-white/50" : ""}>
          {off ? "Session" : <>{formatSessionEth(session.balance)}<span className="ml-1.5 text-white/40">ETH</span></>}
        </span>
        <span className="relative w-7 h-7 rounded-md bg-[#b8ff3a] text-[#0b0908] flex items-center justify-center shadow-[0_0_16px_-3px_#b8ff3a]">
          {session.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-4 h-4" strokeWidth={3} />}
          {off && !session.busy && (
            <span className="absolute -top-1 -right-1 flex w-2.5 h-2.5" aria-hidden>
              <span className="absolute inline-flex w-full h-full rounded-full bg-[#b8ff3a] opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-[#b8ff3a] ring-2 ring-[#0b0908]" />
            </span>
          )}
        </span>
      </button>
      <AnimatePresence>{open && <SessionPopover session={session} />}</AnimatePresence>
    </div>
  );
}

function SessionPopover({ session }) {
  const [amount, setAmount] = useState(SESSION_DEFAULT_TOP_UP);
  const [days, setDays] = useState(SESSION_DAYS[0]);
  const { status, busy } = session;
  const active = status === "active";
  const disabled = Boolean(busy);
  const spin = (name) => busy === name && <Loader2 className="w-3.5 h-3.5 animate-spin" />;

  const state = {
    active: { label: "Active", color: "text-[#b8ff3a]" },
    expired: { label: "Ended", color: "text-red-400" },
    off: { label: "Off", color: "text-white/40" },
  }[status];

  const detail = active
    ? `${formatTimeLeft(session.expiresAt - session.now)} left · ≈ ${session.playsLeft} plays`
    : status === "expired"
      ? "Renew to keep playing without wallet popups."
      : "Confirm once, then play every game without wallet popups.";

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.15 }}
      className="absolute right-0 top-[calc(100%+10px)] z-50 w-[290px] rounded-xl bg-[#14100d] ring-1 ring-white/10 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] p-4 font-ui"
    >
      <div className="flex items-center justify-between">
        <p className="font-tech text-[12px] font-bold uppercase tracking-[0.12em] text-white">Game session</p>
        <span className={`font-tech text-[11px] font-bold uppercase tracking-[0.12em] ${state.color}`}>{state.label}</span>
      </div>
      {(active || session.balance > 0n) && (
        <p className="mt-3 font-tech text-[26px] font-bold leading-none text-white tabular-nums">
          {formatSessionEth(session.balance)}<span className="ml-1.5 text-[13px] text-white/40">ETH</span>
        </p>
      )}
      <p className="mt-2 text-[12px] leading-relaxed text-white/50">{detail}</p>

      <div className="mt-4 grid gap-2">
        <select className="hg-select w-full" value={amount} onChange={e => setAmount(e.target.value)} disabled={disabled} aria-label="Amount">
          {SESSION_TOP_UPS.map(v => <option key={v} value={v}>{topUpLabel(v)}</option>)}
        </select>
        {!active && (
          <select className="hg-select w-full" value={days} onChange={e => setDays(Number(e.target.value))} disabled={disabled} aria-label="Length">
            {SESSION_DAYS.map(d => <option key={d} value={d}>{d === 1 ? "1 day" : `${d} days`}</option>)}
          </select>
        )}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => (active ? session.addFunds(amount) : session.start({ topUpEth: amount, days }))}
        className={`mt-2 w-full inline-flex items-center justify-center gap-2 h-10 rounded-lg bg-primary text-white font-tech text-[12px] font-bold uppercase tracking-[0.1em] hover:bg-primary/90 disabled:opacity-60 transition-colors ${FOCUS_RING}`}
      >
        {spin(active ? "fund" : "start")}
        {active ? "Add funds" : status === "expired" ? "Renew session" : "Start session"}
      </button>

      {(active || session.balance > 0n) && (
        <button
          type="button"
          disabled={disabled}
          onClick={session.end}
          className={`mt-2 w-full inline-flex items-center justify-center gap-2 h-9 rounded-lg font-tech text-[11px] font-bold uppercase tracking-[0.1em] text-white/55 hover:text-white hover:bg-white/5 disabled:opacity-60 transition-colors ${FOCUS_RING}`}
        >
          {spin("end")}
          {active ? "End session" : "Withdraw"}
        </button>
      )}

      {session.error && <p className="mt-3 text-[12px] text-orange-300">{session.error}</p>}
    </motion.div>
  );
}

/* ─── Desktop navigation ─────────────────────────────────────────────── */
// The Dashboard tab opens the games menu: on hover, or with its chevron for touch and keyboard.
function DesktopNav({ location, games }) {
  return (
    <nav aria-label="Main" className="hidden lg:flex items-stretch self-stretch">
      {NAV_LINKS.map(({ href, label }) => {
        const active = isActive(location, href);
        const opensGames = href === "/dashboard";
        const link = (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
              "relative flex items-center px-3 min-[1400px]:px-4 font-tech text-[13px] font-bold uppercase tracking-[0.1em] transition-colors",
              active || (opensGames && games.open) ? "text-white" : "text-white/40 hover:text-white/80",
              opensGames ? "pr-1" : "",
              FOCUS_RING,
            ].join(" ")}
          >
            {active && (
              <motion.span
                layoutId="nav-bar"
                className="absolute top-0 inset-x-2 h-[3px] rounded-b bg-primary shadow-[0_0_16px_hsl(var(--primary))]"
                transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
              />
            )}
            {label}
          </Link>
        );
        if (!opensGames) return link;
        return (
          <div key={href} className="flex items-stretch" onMouseEnter={games.show} onMouseLeave={games.hideSoon}>
            {link}
            <button
              type="button"
              onClick={games.toggle}
              aria-label="Games"
              aria-expanded={games.open}
              aria-controls="games-menu"
              className={`self-center w-6 h-6 mr-2 rounded-md flex items-center justify-center text-white/40 hover:text-white hover:bg-white/6 transition ${FOCUS_RING}`}
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${games.open ? "rotate-180 text-white" : ""}`} />
            </button>
          </div>
        );
      })}
    </nav>
  );
}

const sentenceCase = (text) => text.charAt(0) + text.slice(1).toLowerCase();

// Every game under the header, opened from the Dashboard tab.
function GamesMenu({ games }) {
  return (
    <AnimatePresence>
      {games.open && (
        <motion.div
          id="games-menu"
          key="games-menu"
          className="hidden lg:block absolute inset-x-0 top-full border-b border-white/8 bg-[#0b0908] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)]"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          onMouseEnter={games.show}
          onMouseLeave={games.hideSoon}
        >
          <div className="px-[5%] xl:px-[10%] py-7 grid grid-cols-[230px_1fr] gap-10">
            <div>
              <p className="font-tech text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">Arcade games</p>
              <p className="mt-2 font-tech text-[30px] font-bold leading-none text-white">
                {LIVE_GAMES.length}
                <span className="ml-2 text-[12px] uppercase tracking-[0.12em] text-[#b8ff3a]">Live</span>
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-white/45">Pick a game and play. Every saved score earns Hair Points.</p>
              <Link
                href="/dashboard"
                onClick={games.hide}
                className={`mt-5 inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-white font-tech text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-primary/90 transition-colors ${FOCUS_RING}`}
              >
                Open dashboard <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <nav aria-label="Games" className="grid grid-cols-4 gap-2 content-start">
              {LIVE_GAMES.map(g => (
                <Link
                  key={g.id}
                  href={`/game/${g.id}`}
                  onClick={games.hide}
                  className={`group flex items-center gap-3 p-2.5 rounded-xl border border-transparent hover:border-white/10 hover:bg-white/4 transition-colors ${FOCUS_RING}`}
                >
                  <img src={g.logo} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate font-tech text-[13px] font-bold uppercase tracking-[0.06em] text-white/80 group-hover:text-white">{g.short}</span>
                    <span className="block truncate text-[11px] text-white/40">{g.category} · {sentenceCase(g.difficulty)}</span>
                  </span>
                </Link>
              ))}
            </nav>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Open/closed state for the games menu. Leaving the tab or the menu closes it after a short delay,
// so the pointer can travel from one to the other.
function useGamesMenu(location) {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const show = () => { clearTimeout(timer.current); setOpen(true); };
  const hide = () => { clearTimeout(timer.current); setOpen(false); };
  const hideSoon = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 160); };
  const toggle = () => { clearTimeout(timer.current); setOpen(o => !o); };

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { clearTimeout(timer.current); setOpen(false); }, [location]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return { open, show, hide, hideSoon, toggle };
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
            className="absolute top-2 right-2 bottom-2 w-[min(340px,calc(100vw-16px))] flex flex-col rounded-2xl bg-[#0e0b09] border border-white/10 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] overflow-hidden"
            initial={{ x: "105%" }} animate={{ x: 0 }} exit={{ x: "105%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
          >
            <div className="flex items-center justify-between h-16 px-4 border-b border-white/7">
              <Logo onClick={onClose} className="h-8" />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className={`w-10 h-10 rounded-lg flex items-center justify-center bg-white/4 ring-1 ring-inset ring-white/8 text-white/60 hover:text-white transition-colors ${FOCUS_RING}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
              {points !== null && (
                <Link
                  href="/profile"
                  onClick={onClose}
                  className={`flex items-center justify-between h-12 px-4 rounded-lg bg-primary text-white font-tech text-[13px] font-bold uppercase tracking-[0.1em] ${FOCUS_RING}`}
                >
                  <span className="flex items-center gap-2"><Zap className="w-4 h-4" fill="currentColor" strokeWidth={0} />{formatPoints(points)} HP</span>
                  <span className="text-white/70">Season {CURRENT_SEASON}</span>
                </Link>
              )}

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
                        "flex items-center gap-3 h-11 px-3 rounded-lg font-tech text-[14px] font-bold uppercase tracking-[0.08em] transition-colors",
                        active ? "bg-white/6 text-white shadow-[inset_3px_0_0_hsl(var(--primary))]" : "text-white/55 hover:bg-white/4 hover:text-white",
                        FOCUS_RING,
                      ].join(" ")}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </Link>
                  );
                })}
              </nav>

              <EventLink onClick={onClose} className="flex h-11 w-full" />

              <div>
                <p className="px-3 mb-2 font-tech text-[11px] font-bold uppercase tracking-[0.14em] text-white/30">Games</p>
                <nav aria-label="Games" className="flex flex-col">
                  {LIVE_GAMES.map(g => (
                    <Link
                      key={g.id}
                      href={`/game/${g.id}`}
                      onClick={onClose}
                      className={`flex items-center gap-3 h-10 px-3 rounded-lg text-white/60 hover:text-white hover:bg-white/4 transition-colors ${FOCUS_RING}`}
                    >
                      <img src={g.logo} alt="" className="w-5 h-5 rounded-[5px] object-cover" />
                      <span className="text-[14px] font-semibold">{g.title}</span>
                    </Link>
                  ))}
                </nav>
              </div>
            </div>

            <div className="p-4 border-t border-white/7">
              <WalletButton block points={points} />
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
  const games = useGamesMenu(location);

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
    <div className="min-h-screen flex flex-col bg-background overflow-x-hidden">

      {/* ── Navbar ── */}
      <header
        className={[
          "sticky top-0 z-50 font-ui border-b backdrop-blur-xl transition-[background-color,border-color] duration-300",
          scrolled ? "bg-[#0b0908]/92 border-white/8" : "bg-[#0b0908]/70 border-white/5",
        ].join(" ")}
      >
        <div className="h-16 px-[5%] xl:px-[10%] flex items-center gap-4 lg:gap-5 min-[1400px]:gap-8">
          <Logo />
          <DesktopNav location={location} games={games} />

          <div className="ml-auto flex items-center gap-2.5">
            <EventLink compact className="hidden lg:inline-flex" />
            {isConnected && <BalancePill />}
            <div className="hidden lg:block">
              <WalletButton points={points} />
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              aria-expanded={mobileOpen}
              className={`lg:hidden w-10 h-10 rounded-lg flex items-center justify-center bg-white/4 ring-1 ring-inset ring-white/8 text-white/70 hover:text-white hover:bg-white/8 transition-colors ${FOCUS_RING}`}
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </div>
        <GamesMenu games={games} />
      </header>

      <MobileMenu open={mobileOpen} onClose={() => setMobileOpen(false)} location={location} points={points} />

      {/* ── Main ── */}
      <main className="flex-1 w-full">
        <div className="w-full px-[5%] xl:px-[10%] py-8 md:py-10">
          {children}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/6 bg-background/60 mt-auto">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="w-full px-[5%] xl:px-[10%] py-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex flex-col gap-2.5">
              <Link href="/" className="w-fit opacity-70 hover:opacity-100 transition-opacity">
                <img src={logoUrl} alt="HairGames" className="h-7 w-auto" />
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
                Event
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
