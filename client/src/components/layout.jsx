import React from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Wallet, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect } from 'wagmi';
import "../index.css"


const truncateMiddle = (text, startChars, endChars, separator = "...") => {
  if (!text) return "";


  if (text.length <= startChars + endChars) {
    return text;
  }

  return (
    text.slice(0, startChars) +
    separator +
    text.slice(-endChars)
  );
};
export function Layout({ children }) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  const [location] = useLocation();
  const [isOpen, setIsOpen] = React.useState(false);

  const NavLink = ({ href, children }) => {
    const isActive = location === href;
    return (
      <Link href={href} className={`text-sm font-medium transition-colors hover:text-primary ${isActive ? "text-primary" : "text-muted-foreground"}`}>
        {children}
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur flex justify-center">
        <div className="container flex h-16 items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2">
              <div className="size-8 rounded from-primary to-secondary flex items-center justify-center">
                <img src="/logo.png" alt="logo" className="rounded"/>
              </div>
              <span className="font-display font-bold text-xl tracking-wider text-white">
                Hair<span className="text-primary">GAMES</span>
              </span>
            </Link>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-12 font-display ">
            <NavLink href="/">Home</NavLink>
            <NavLink href="/dashboard">Games</NavLink>
            <NavLink href="/leaderboard">Leaderboard</NavLink>
          </nav>

          {/* Wallet Connection */}
          <div className="hidden md:flex items-center gap-4">
            {isConnected ? (
              <Button variant="outline" onClick={() => disconnect()}>
                <Wallet className="mr-2 h-4 w-4" />
                {truncateMiddle(address, 5, 4)}
              </Button>
            ) : (
              <ConnectButton />
            )}

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
      <main className="flex-1 container mx-auto px-4 py-8 md:py-12">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-background/50 py-8 flex justify-center">
        <div className="container px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="size-6 rounded bg-primary/20 flex items-center justify-center">
              <img src="/logo.png" alt="logo" className="rounded"/>
            </div>
            <span className="font-display font-bold text-sm text-muted-foreground">HEMIGAMES</span>
          </div>
          <div>
            
          </div>
          <p className="text-xs text-muted-foreground text-center md:text-right">
            Built on Hemi Network. Play responsibly. <br />
            $HAIR Contract: 0x5B77...4705
          </p>
        </div>
      </footer>
    </div>
  );
}
