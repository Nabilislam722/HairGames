import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, Zap } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";
import "../index.css";

const NAV_LINKS = [
  { href: "/",            label: "Home"        },
  { href: "/dashboard",   label: "Dashboard"   },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/profile",     label: "Profile"     },
];

const EVENT_LINK = { href: "/eventrank", label: "Event" };

/* ─── Desktop NavLink ─────────────────────────────────────────────────── */
function NavLink({ href, children, hovered, index, setHovered }) {
  const [location] = useLocation();
  const active = location === href;
  const showPill = hovered === index || (active && hovered === null);

  return (
    <Link
      href={href}
      onMouseEnter={() => setHovered(index)}
      onMouseLeave={() => setHovered(null)}
      className={[
        "relative px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-widest rounded-lg transition-colors duration-200 z-10",
        active ? "text-white" : "text-white/40 hover:text-white/80",
      ].join(" ")}
    >
      <AnimatePresence>
        {showPill && (
          <motion.span
            layoutId="nav-pill"
            className="absolute inset-0 rounded-lg bg-primary/10 border border-primary/20 -z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
          />
        )}
      </AnimatePresence>
      {children}
      {active && (
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-3 h-[2px] rounded-full bg-primary" />
      )}
    </Link>
  );
}

/* ─── Event NavLink — same pill pattern, orange-tinted ───────────────── */
function EventNavLink({ hovered, index, setHovered }) {
  const [location] = useLocation();
  const active = location === EVENT_LINK.href;
  const showPill = hovered === index || (active && hovered === null);

  return (
    <Link
      href={EVENT_LINK.href}
      onMouseEnter={() => setHovered(index)}
      onMouseLeave={() => setHovered(null)}
      className="relative flex items-center gap-1.5 px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest rounded-lg transition-colors duration-200 z-10"
      style={{
        color: active || showPill ? "#fb923c" : "rgba(251,146,60,0.45)",
      }}
    >
      {/* Shared pill — separate layoutId keeps it from merging with nav-pill */}
      <AnimatePresence>
        {showPill && (
          <motion.span
            layoutId="event-nav-pill"
            className="absolute inset-0 rounded-lg -z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
            style={{
              background: "rgba(251,146,60,0.08)",
              border: "1px solid rgba(251,146,60,0.22)",
              boxShadow: "0 0 12px rgba(251,146,60,0.15)",
            }}
          />
        )}
      </AnimatePresence>

      {/* Ambient glow always present — subtle so it doesn't shout */}
      <span
        className="absolute inset-0 rounded-lg pointer-events-none"
        style={{ boxShadow: "0 0 6px rgba(251,146,60,0.07)" }}
      />

      {/* Pulsing live dot */}
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse"
        style={{ background: "#fb923c", animationDuration: "2s" }}
      />

      {EVENT_LINK.label}

      {/* WEEKLY badge */}
      <span
        className="px-1 py-px rounded text-[8px] font-black tracking-widest leading-none"
        style={{
          background: "rgba(251,146,60,0.1)",
          color: "rgba(251,146,60,0.6)",
          border: "1px solid rgba(251,146,60,0.18)",
        }}
      >
        WEEKLY
      </span>

      {active && (
        <span
          className="absolute bottom-1 left-1/2 -translate-x-1/2 w-3 h-[2px] rounded-full"
          style={{ background: "#fb923c" }}
        />
      )}
    </Link>
  );
}

/* ─── Layout ─────────────────────────────────────────────────────────── */
export function Layout({ children }) {
  const [hovered, setHovered] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [location] = useLocation();
  const isGamePage = location.startsWith("/game/");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

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
          "sticky top-0 z-50 transition-all duration-300 border-b-1 border-b-white/10",
          scrolled
            ? "border-b border-white/6 bg-background/90 backdrop-blur-xl shadow-[0_1px_24px_rgba(0,0,0,0.3)]"
            : "bg-transparent border-b border-transparent",
        ].join(" ")}
      >
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        <div className="w-full px-6 xl:px-10 h-14 flex justify-between gap-6">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group flex-shrink-0">
            <div className="w-7 h-7 rounded-md overflow-hidden border border-primary/20 flex-shrink-0 group-hover:border-primary/50 transition-colors">
              <img src="/logo.png" alt="Hair Games" className="w-full h-full object-cover" />
            </div>
            <span className="font-display font-extrabold text-[16px] tracking-tight text-white leading-none">
              Hair
              <span className="relative ml-0.5">
                <span className="text-primary transition-all duration-300">GAMES</span>
                <span
                  className="absolute inset-0 text-white transition-all duration-500 [clip-path:inset(0_100%_0_0)] group-hover:[clip-path:inset(0_0%_0_0)]"
                  aria-hidden
                >
                  GAMES
                </span>
              </span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((n, i) => (
              <NavLink key={n.href} href={n.href} index={i} hovered={hovered} setHovered={setHovered}>
                {n.label}
              </NavLink>
            ))}

            {/* Divider before event link */}
            <span className="w-px h-4 bg-white/10 mx-2 flex-shrink-0" />

            {/* Event link gets the next index slot after NAV_LINKS */}
            <EventNavLink hovered={hovered} index={NAV_LINKS.length} setHovered={setHovered} />
          </nav>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-3">
            <ConnectButton chainStatus="icon" showBalance={false} />
          </div>

          {/* Mobile burger */}
          <button
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg bg-white/4 border border-white/10 text-white/50 hover:text-white hover:bg-white/8 transition-all"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Mobile Drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-[200]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div
              className="absolute inset-0 bg-background/70 backdrop-blur-md"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              className="absolute top-0 right-0 bottom-0 w-[min(320px,88vw)] bg-card border-l border-white/8 flex flex-col p-7 gap-8"
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 260 }}
            >
              <div className="flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
                  <div className="w-7 h-7 rounded-md overflow-hidden border border-primary/20">
                    <img src="/logo.png" alt="Hair Games" className="w-full h-full object-cover" />
                  </div>
                  <span className="font-display font-extrabold text-base text-white tracking-tight">
                    Hair<span className="text-primary">GAMES</span>
                  </span>
                </Link>
                <button
                  className="w-8 h-8 rounded-lg bg-white/4 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <nav className="flex flex-col gap-1.5">
                {NAV_LINKS.map(n => {
                  const active = location === n.href;
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      onClick={() => setMobileOpen(false)}
                      className={[
                        "flex items-center gap-3 px-4 py-3.5 rounded-xl font-mono text-[12px] uppercase tracking-widest font-bold border transition-all",
                        active
                          ? "bg-primary/8 text-white border-primary/20"
                          : "text-white/40 border-transparent hover:bg-white/4 hover:text-white/80 hover:border-white/10",
                      ].join(" ")}
                    >
                      <span className={["w-1.5 h-1.5 rounded-full flex-shrink-0", active ? "bg-primary" : "bg-white/15"].join(" ")} />
                      {n.label}
                    </Link>
                  );
                })}

                {/* Separator */}
                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-white/6" />
                  <span className="font-mono text-[8px] uppercase tracking-widest text-white/20">Weekly</span>
                  <div className="flex-1 h-px bg-white/6" />
                </div>

                {/* Event link */}
                {(() => {
                  const active = location === EVENT_LINK.href;
                  return (
                    <Link
                      href={EVENT_LINK.href}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 px-4 py-3.5 rounded-xl font-mono text-[12px] uppercase tracking-widest font-bold border transition-all"
                      style={{
                        background: active ? "rgba(251,146,60,0.08)" : "rgba(251,146,60,0.03)",
                        borderColor: "rgba(251,146,60,0.2)",
                        color: active ? "#fb923c" : "rgba(251,146,60,0.6)",
                        boxShadow: "0 0 10px rgba(251,146,60,0.08)",
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse"
                        style={{ background: "#fb923c", animationDuration: "2s" }}
                      />
                      {EVENT_LINK.label}
                      <span
                        className="ml-auto px-1.5 py-px rounded text-[8px] font-black tracking-widest"
                        style={{
                          background: "rgba(251,146,60,0.1)",
                          color: "rgba(251,146,60,0.6)",
                          border: "1px solid rgba(251,146,60,0.18)",
                        }}
                      >
                        WEEKLY
                      </span>
                    </Link>
                  );
                })()}
              </nav>

              <div className="border-t border-white/6" />

              <div className="flex flex-col gap-3">
                <span className="font-mono text-[9px] uppercase tracking-widest text-white/25">Wallet</span>
                <ConnectButton chainStatus="icon" showBalance={false} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main ── */}
      <main className="flex-1 w-full">
        <div className="w-full px-4 sm:px-6 xl:px-10 py-8 md:py-10">
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