import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import "../index.css"
import { motion, AnimatePresence } from "framer-motion";


const NavLink = ({ href, index, hoveredIndex, setHoveredIndex, children }) => {
  const [location] = useLocation();
  const isActive = location === href;
  const showBackground = (hoveredIndex === index) || (isActive && hoveredIndex === null);

  return (
    <Link
      href={href}
      onMouseEnter={() => setHoveredIndex(index)}
      onMouseLeave={() => setHoveredIndex(null)}
      className={`relative px-4 py-2 text-sm font-medium transition-all duration-300 
        ${isActive 
          ? "text-white drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]" 
          : "text-slate-400 hover:text-white"
        }`}
    >
      <AnimatePresence>
        {showBackground && (
          <motion.span
            layoutId="nav-pill"
            className="absolute inset-0 bg-orange-500/10 rounded-lg -z-10 border border-orange-500/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
          />
        )}
      </AnimatePresence>

      <span className="relative z-10">{children}</span>
    </Link>
  );
};

export function Layout({ children }) {

  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [isOpen, setIsOpen] = React.useState(false);


  return (
    <div className="min-h-screen flex flex-col bg-background font-sans overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur flex justify-center">
        <div className="container flex h-16 items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2">
            <Link href="/" className="group flex items-center gap-2 hover:text-primary">
              {/* Logo Icon */}
              <div className="size-8">
                <img src="/logo.png" alt="logo" className="rounded transition-transform duration-500" />
              </div>

              <span className="font-display font-bold text-xl tracking-wider text-whitetransition-colors duration-300">
                Hair
                <span className="relative inline-block ml-1">
                  <span className="text-primary">GAMES</span>
                  <span
                    className="absolute inset-0 text-white transition-all duration-500 ease-in-out [clip-path:inset(0_100%_0_0)] group-hover:[clip-path:inset(0_0_0_0)]"
                    aria-hidden="true">
                    GAMES
                  </span>
                </span>
              </span>
            </Link>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-4 font-display relative">
            <NavLink
              href="/"
              index={0}
              hoveredIndex={hoveredIndex}
              setHoveredIndex={setHoveredIndex}
            >
              Home
            </NavLink>

            <NavLink
              href="/dashboard"
              index={1}
              hoveredIndex={hoveredIndex}
              setHoveredIndex={setHoveredIndex}
            >
              Dashboard
            </NavLink>

            <NavLink
              href="/leaderboard"
              index={2}
              hoveredIndex={hoveredIndex}
              setHoveredIndex={setHoveredIndex}
            >
              Leaderboard
            </NavLink>
          </nav>

          {/* Wallet Connection */}
          <div className="hidden md:flex items-center gap-4">

            <ConnectButton chainStatus="Hemi" />

          </div>

          {/* Mobile Menu */}
          <div className="md:hidden">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-card border-l-white/10">
                <div className="flex flex-col gap-8 mt-8">
                  <nav className="flex flex-col gap-4">
                    <Link href="/" className="text-lg font-medium" onClick={() => setIsOpen(false)}>Home</Link>
                    <Link href="/dashboard" className="text-lg font-medium" onClick={() => setIsOpen(false)}>Games</Link>
                    <Link href="/leaderboard" className="text-lg font-medium" onClick={() => setIsOpen(false)}>Leaderboard</Link>
                  </nav>

                  <div className="border-t border-white/10 pt-8">
                    <Button onClick={() => setIsOpen(false)}>
                      <ConnectButton />
                    </Button>

                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full">
        <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-background/50 py-8 flex justify-center">
        <div className="container px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="size-6 rounded bg-primary/20 flex items-center justify-center">
              <img src="/logo.png" alt="logo" className="rounded" />
            </div>
            <span className="font-display font-bold text-sm text-muted-foreground">HEMIGAMES</span>

          </div>
          <div className="flex gap-7">
            <a href="https://discord.gg/k2W7g5xR" target="_blank" rel="noopener noreferrer">
              <div className="w-6 h-6 bg-gray-400 mask mask-contain mask-center mask-no-repeat hover:bg-blue-700 transition-colors duration-300"
                style={{ maskImage: "url('/discord.svg')", WebkitMaskImage: "url('/discord.svg')" }}
              />
            </a>
            <a href="https://explorer.hemi.xyz/address/0x61A86E5B2075d0E6ff659a6b29D1E367CAa6a8E5?tab=contract">
              <div className="w-6 h-6 bg-gray-400 mask mask-contain mask-center mask-no-repeat hover:bg-teal-700 transition-colors duration-300"
                style={{ maskImage: "url('/expo.svg')", WebkitMaskImage: "url('/expo.svg')" }}
              />
            </a>
          </div>
          <p className="text-xs text-muted-foreground text-center md:text-right">
            Built on Hemi Network. Play responsibly. <br />
            $HAIR Contract: 0x5B77...4705
            <span className="pl-3.5">©2026 Hair. All rights reserved.</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
