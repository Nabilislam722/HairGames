import React from "react";
import { useLocation } from "wouter";
import { useWeb3 } from "@/lib/web3";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap, Shield, Coins, Trophy } from "lucide-react";
import { motion } from "framer-motion";
import BackgroundImg from '../assets/bg.png';
import "../index.css"

export default function Home() {

   const { isConnected } = useWeb3();
   const [, setLocation] = useLocation();

  const handlePlayNow = () => {
    if (!isConnected) {
      // optionally open wallet modal here
      return;
    }
    setLocation("/dashboard");
  };


  return (
    <div className="flex flex-col gap-16">
      {/* Hero Section */}
      <section className="relative py-20 md:py-32 overflow-hidden rounded-3xl border border-white/10">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src={BackgroundImg}
            alt="Cyberpunk Background"
            className="w-full h-full object-cover opacity-40"
          />
          <div className="absolute inset-0  from-background via-background/80 to-transparent" />
        </div>

        <div className="container relative z-10 px-4 flex flex-col items-center text-center gap-6 max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium uppercase tracking-wider"
          >
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Live on Hemi Network
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-display text-5xl md:text-7xl font-bold tracking-tight text-white text-glow"
          >
            PLAY. WIN. <br />
            <span className="text-transparent bg-clip-text from-secondary to-primary">
              SURPRISE
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg md:text-xl text-muted-foreground max-w-xl"
          >
            The premier decentralized gaming platform on Hemi Chain.
            Hold <span className="text-accent font-mono">$HAIR</span> to enter.
            Provably fair games.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 mt-4"
          >
            <Button
              size="lg"
              className="text-lg px-8 py-6 bg-orange-600 hover:bg-orange-500 shadow-[0_0_20px_#f54f07] border-0 cursor-pointer"
              onClick={handlePlayNow}
            >
              {isConnected ? "Go to Dashboard" : "Connect Wallet to Play"}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-white/10 hover:bg-white/5 cursor-pointer">
              Learn More
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 container mx-auto px-4">
        {[
          { label: "Total Fee Collected", value: "0.15 ETH", icon: Coins },
          { label: "Active Players", value: "79", icon: Trophy },
          { label: "Soon?", value: "??", icon: Zap },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="flex flex-col items-center p-6 rounded-2xl bg-card border border-white/5 hover:border-primary/30 transition-colors group"
          >
            <div className="p-3 rounded-xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform">
              <stat.icon className="h-6 w-6" />
            </div>
            <h3 className="text-3xl font-display font-bold text-white mb-1">{stat.value}</h3>
            <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Features */}
      <section className="py-20">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">Why Play on Hemi?</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
           Fees collected from this will be for buying back $HAIR
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-8 rounded-3xl from-white/5 to-transparent border border-white/10 hover:border-secondary/50 transition-colors">
            <Shield className="h-10 w-10 text-secondary mb-6" />
            <h3 className="text-xl font-bold mb-3">Provably Fair</h3>
            <p className="text-muted-foreground">Every game result is verifiable on-chain. No manipulation, just pure probability.</p>
          </div>
          <div className="p-8 rounded-3xl  from-white/5 to-transparent border border-white/10 hover:border-accent/50 transition-colors">
            <Coins className="h-10 w-10 text-accent mb-6" />
            <h3 className="text-xl font-bold mb-3">$HAIR Token Utility</h3>
            <p className="text-muted-foreground">Holders get exclusive access to high-stakes rooms and revenue share rewards.</p>
          </div>
          <div className="p-8 rounded-3xl  from-white/5 to-transparent border border-white/10 hover:border-primary/50 transition-colors">
            <Zap className="h-10 w-10 text-primary mb-6" />
            <h3 className="text-xl font-bold mb-3">Instant Settlement</h3>
            <p className="text-muted-foreground">Points are sent directly to your wallet immediately after every game.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
