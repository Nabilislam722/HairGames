import { Link } from "wouter";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RocketIcon, BrainCircuit, Search, Lock, CheckCircle2 } from "lucide-react";
import { GAME_COST_ETH } from "@/lib/web3";
import { useBalance, useAccount } from "wagmi";
import { useState, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import X_logo from "../assets/x.jpg";
import Guild_logo from "../assets/hair.png";
import { motion } from "framer-motion";
import "../index.css";

const QUESTS = [
  {
    id: "twitter_follow",
    title: "Follow us on X",
    description: "Join the community to unlock +100 PTS.",
    points: 100,
    actionLabel: "Follow @HairMaxToken",
    url: "https://x.com/intent/follow?screen_name=HairMaxToken",
    iconBg: "bg-sky-500/10 border-sky-500/20",
    icon: (
      <img src={X_logo} alt="X" className="w-full h-full object-cover" />
    ),
  },
  {
    id: "hairy_person",
    title: "Join Guild HAIR",
    description: "Become a Hairy Person to unlock +200 PTS.",
    points: 200,
    actionLabel: "Join Guild",
    url: "https://guild.xyz/hair",
    iconBg: "bg-white/90 border-white/20",
    icon: (
      <img src={Guild_logo} alt="Guild" className="w-full h-full object-cover" />
    ),
  },
];

//Game definitions
const GAMES = [
  {
    id: "space_shooter",
    title: "Space Shooter",
    description: "Destroy everything comes on your way",
    entryFee: `${GAME_COST_ETH} ETH (~$0.02)`,
    image: "bg-gradient-to-br from-emerald-600 to-teal-600",
    icon: RocketIcon,
    status: "active",
    difficulty: "Speed",
  },
  {
    id: "find-number",
    title: "Find The Number",
    description: "Use logic to find the hidden 4-digit number within 15 attempts.",
    entryFee: `${GAME_COST_ETH} ETH (~$0.05)`,
    image: "bg-gradient-to-br from-indigo-600 to-purple-600",
    icon: Search,
    status: "closed",
    difficulty: "Logic",
  },
  {
    id: "pattern-match",
    title: "Memory Match",
    description: "Memorize and match complex neural patterns.",
    entryFee: `${GAME_COST_ETH} ETH (~$0.05)`,
    image: "bg-gradient-to-br from-rose-600 to-orange-600",
    icon: BrainCircuit,
    status: "closed",
    difficulty: "Memory",
  },
];

// ─── QuestCard component ──────────────────────────────────────────────────────
function QuestCard({ quest, step, onAction, onClaim }) {
  return (
    <Card className="bg-card border-white/10 overflow-hidden relative group transition-all duration-300">
      <CardContent className="p-5 relative z-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">

          {/* Icon + info */}
          <div className="flex items-center gap-5">
            <div className={`size-14 rounded-2xl ${quest.iconBg} border flex items-center justify-center overflow-hidden`}>
              {quest.icon}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{quest.title}</h3>
              <p className="text-sm text-muted-foreground">{quest.description}</p>
            </div>
          </div>

          {/* Reward + CTA */}
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="flex flex-col items-end mr-2">
              <span className="text-xs font-mono text-primary uppercase font-bold">Reward</span>
              <span className="text-xl font-bold text-white">+{quest.points} PTS</span>
            </div>

            {step === "idle" && (
              <Button
                onClick={onAction}
                className="group relative overflow-hidden bg-white text-black hover:bg-orange-600 hover:text-white p-4 rounded-xl font-bold cursor-pointer transition-all duration-300"
              >
                <span className="absolute top-0 left-13 w-60 h-16 -mt-1 -ml-12 transition-all duration-500 ease-out transform -rotate-45 -translate-x-full bg-white opacity-40 group-hover:translate-x-full" />
                <span className="relative z-10">{quest.actionLabel}</span>
              </Button>
            )}

            {step === "following" && (
              <Button disabled className="bg-white/10 text-white/50 px-8 py-6 rounded-xl font-bold border border-white/5">
                Wait 10s...
              </Button>
            )}

            {(step === "claimable" || step === "verifying") && (
              <Button
                onClick={onClaim}
                disabled={step === "verifying"}
                className="group relative overflow-hidden bg-orange-600 text-white hover:bg-orange-500 px-8 py-6 rounded-xl font-bold animate-pulse cursor-pointer disabled:animate-none disabled:opacity-60"
              >
                <span className="absolute top-0 left-14 w-60 h-16 -mt-1 -ml-12 transition-all duration-500 ease-out transform -rotate-45 -translate-x-full bg-white opacity-30 group-hover:translate-x-full" />
                <span className="relative z-10">
                  {step === "verifying" ? "Verifying..." : "Verify & Claim"}
                </span>
              </Button>
            )}

            {step === "completed" && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-2 text-emerald-400 font-bold px-4 py-2 bg-emerald-400/10 rounded-lg border border-emerald-400/20"
              >
                <CheckCircle2 className="h-6 w-6" /> Claimed
              </motion.div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const { data: ethBalanceData } = useBalance({ address });

  const [points, setPoints] = useState(null);

  const [questSteps, setQuestSteps] = useState(
    () => Object.fromEntries(QUESTS.map((q) => [q.id, "idle"]))
  );

  const setStep = (id, step) =>
    setQuestSteps((prev) => ({ ...prev, [id]: step }));
  useEffect(() => {
    if (!address) return;

    fetch(`https://api.hairtoken.xyz/api/points/get?wallet=${address}`)
      .then((res) => res.json())
      .then((data) => {
        setPoints(data.points);
        QUESTS.forEach((q) => {
          if (data.tasks?.includes(q.id)) setStep(q.id, "completed");
        });
      })
      .catch(console.error);
  }, [address]);

  const handleAction = (quest) => {
    window.open(quest.url, "_blank");
    setStep(quest.id, "following");
    setTimeout(() => setStep(quest.id, "claimable"), 10000);
  };

  const handleClaim = async (quest) => {
    if (!address) return;
    setStep(quest.id, "verifying");

    try {
      const response = await fetch(`https://api.hairtoken.xyz/api/points/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, task: quest.id }),
      });

      if (response.ok) {
        const data = await response.json();
        setStep(quest.id, "completed");
        setPoints(data.newTotal);
      } else {
        const errData = await response.json();
        setStep(quest.id, errData.alreadyDone ? "completed" : "claimable");
      }
    } catch (error) {
      console.error("Claim failed", error);
      setStep(quest.id, "claimable");
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <div className="p-6 rounded-full bg-primary/10 text-primary mb-4">
          <Lock className="h-12 w-12" />
        </div>
        <h2 className="text-3xl font-display font-bold">Wallet Not Connected</h2>
        <p className="text-muted-foreground max-w-md">
          Connect your wallet to access the dashboard and play on Hemi.
        </p>
        <ConnectButton.Custom>
          {({ openConnectModal }) => (
            <Button size="lg" onClick={openConnectModal} className="mt-4 cursor-pointer">
              Connect Wallet
            </Button>
          )}
        </ConnectButton.Custom>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 font-[system-ui]">

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-white">
              {ethBalanceData ? Number(ethBalanceData.formatted).toFixed(6) : "0.000000"} ETH
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Games Played</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-white">0</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Points</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-white">{points ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Quests Section */}
      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2">
          Active Quests
          <span className="text-xs font-sans font-normal text-muted-foreground px-2 py-1 rounded bg-white/5 border border-white/10">
            Earn Rewards
          </span>
        </h2>

        {QUESTS.map((quest) => (
          <QuestCard
            key={quest.id}
            quest={quest}
            step={questSteps[quest.id]}
            onAction={() => handleAction(quest)}
            onClaim={() => handleClaim(quest)}
          />
        ))}
      </div>

      {/* Games Grid */}
      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2">
          Logic Puzzles{" "}
          <span className="text-xs font-sans font-normal text-muted-foreground px-2 py-1 rounded bg-white/5 border border-white/10">
            Season 1
          </span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {GAMES.map((game) => (
            <Card
              key={game.id}
              className="bg-card border-white/10 overflow-hidden group hover:border-primary/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(123,104,238,0.15)]"
            >
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
                        "transition-colors duration-300",
                    })}
                  >
                    Play Game
                  </Link>
                ) : (
                  <Button disabled className="w-full opacity-50 cursor-not-allowed">
                    {game.status === "closed" ? "Closed" : "Coming Soon"}
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