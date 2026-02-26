import React from "react";
import { Link } from "wouter";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Binary, BrainCircuit, Search, Lock } from "lucide-react";
import { GAME_COST_ETH } from "@/lib/web3";
import { useBalance, useConnect, useAccount } from "wagmi";
import "../index.css"
import { useState, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";



export default function Dashboard() {
  const { address, isConnected } = useAccount();

  const { data: ethBalanceData } = useBalance({
    address,
  });
  const [points, setPoints] = useState(null);

  useEffect(() => {
    if (!address) return;

    fetch(
      `http://api.hairtoken.xyz/api/points/get?wallet=${address}`
    )
      .then(res => res.json())
      .then(data => setPoints(data.points))
      .catch(console.error);
  }, [address]);

 {/* Game object storage*/}
  const games = [
    {
      id: "find-number",
      title: "Find The Number",
      description: "Use logic to find the hidden 4-digit number within 15 attempts.",
      entryFee: `${GAME_COST_ETH} ETH (~$0.05)`,
      image: "bg-gradient-to-br from-indigo-600 to-purple-600",
      icon: Search,
      status: "closed",
      difficulty: "Logic"
    },
    {
      id: "binary-puzzle",
      title: "Binary Breaker",
      description: "Decode the binary sequence before time runs out.",
      entryFee: `${GAME_COST_ETH} ETH (~$0.02)`,
      image: "bg-gradient-to-br from-emerald-600 to-teal-600",
      icon: Binary,
      status: "coming-soon",
      difficulty: "Speed"
    },
    {
      id: "pattern-match",
      title: "Memory Match",
      description: "Memorize and match complex neural patterns.",
      entryFee: `${GAME_COST_ETH} ETH (~$0.05)`,
      image: "bg-gradient-to-br from-rose-600 to-orange-600",
      icon: BrainCircuit,
      status: "active",
      difficulty: "Memory"
    }
  ];

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <div className="p-6 rounded-full bg-primary/10 text-primary mb-4">
          <Lock className="h-12 w-12" />
        </div>
        <h2 className="text-3xl font-display font-bold">Wallet Not Connected</h2>
        <p className="text-muted-foreground max-w-md">
          You need to connect your wallet to access the dashboard and play games on the Hemi Network.
        </p>
        <ConnectButton.Custom>
          {({ openConnectModal }) => (
            <Button
              size="lg"
              onClick={openConnectModal}
              className="mt-4 hover:scale-115 transition-transform duration-200 cursor-pointer"
            >
              Connect Wallet
            </Button>
          )}
        </ConnectButton.Custom>

      </div>
    );
  }

  return (
    
    <div className="flex flex-col gap-10">
      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/*ETH Balance card*/}
        <Card className="bg-card border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-white">{ethBalanceData ? Number(ethBalanceData.formatted).toFixed(6) : "0.000000"} ETH
            </div>
            <p className="text-xs text-muted-foreground mt-1">≈ ${(ethBalanceData * 3000).toFixed(2)} USD</p>
          </CardContent>
        </Card>

        {/*Game played card*/}
        <Card className="bg-card border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Games Played</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-white">0</div>
            <p className="text-xs text-muted-foreground mt-1">Best Score: -</p>
          </CardContent>
        </Card>

        {/*Points card*/}
        <Card className="bg-card border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Points</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-white">
              {points ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Best Score: 100</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Games Grid */}
      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2">
          Logic Puzzles <span className="text-xs font-sans font-normal text-muted-foreground px-2 py-1 rounded bg-white/5 border border-white/10">Season 1</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {games.map((game) => (
            <Card key={game.id} className="bg-card border-white/10 overflow-hidden group hover:border-primary/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(123,104,238,0.15)]">
              <div className={`h-32 ${game.image} relative flex items-center justify-center`}>
                <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                <game.icon className="h-12 w-12 text-white drop-shadow-lg transform group-hover:scale-110 transition-transform duration-300" />
                {game.status === "coming-soon" && (
                  <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                    <Badge variant="secondary" className="font-mono">Coming Soon</Badge>
                  </div>
                )}
              </div>

              <CardHeader>

                <div className="flex justify-between items-start">
                  <CardTitle className={`text-xl font-bold ${game.status === "coming-soon" ? "blur" : ""}`}>
                    {game.title}
                  </CardTitle>
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                    {game.difficulty}
                  </Badge>
                </div>
                <CardDescription className={`line-clamp-2 h-10 ${game.status === "coming-soon" ? "blur" : ""}`}>
                  {game.description}
                </CardDescription>

              </CardHeader>

              <CardContent>
                <div className="flex items-center justify-between text-sm p-2 rounded bg-background/50 border border-white/5">
                  <span className="text-muted-foreground">Entry Fee</span>
                  <span className="font-mono text-white">{game.entryFee}</span>
                </div>
              </CardContent>

              <CardFooter>
                {game.status === "active" ? (
                  <Link
                    href={`/game/${game.id}`}
                    className={buttonVariants({
                      variant: "outline",
                      className:
                        "w-full font-display font-bold " +
                        "bg-white text-orange-600 border-orange-600 " +
                        "hover:bg-orange-600 hover:text-white " +
                        "transition-colors duration-300"
                    })}
                  >
                    Play Game
                  </Link>
                ) : game.status === "closed" ? (
                  <Button disabled className="w-full opacity-50 cursor-not-allowed">
                    Closed
                  </Button>

                ) : (
                  <Button disabled className="w-full opacity-50 cursor-not-allowed">
                    Coming Soon
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
