import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAccount } from "wagmi";
import { useWeb3 } from "@/lib/web3";
import { toast } from "../hooks/use-toast";
import { Trophy, Zap, Target, RotateCcw, Play } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const GRID_SIZE = 25;
const GRID_COLS = 5;
const MAX_ROUNDS = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function PatternMemoryGame() {
  const [gameState, setGameState] = useState("idle");
  const [pattern, setPattern] = useState([]);
  const [activeSet, setActiveSet] = useState(new Set());
  const [selectedSet, setSelectedSet] = useState(new Set());
  const [correctCount, setCorrectCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(1);
  const [showPoints, setShowPoints] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const { isConnected, submitGuess } = useWeb3();
  const { address } = useAccount();

  const generatePattern = (length) => {
    const set = new Set();
    while (set.size < length) {
      set.add(Math.floor(Math.random() * GRID_SIZE));
    }
    return Array.from(set);
  };

  const getPatternSize = (r) => (r === 1 ? 4 : r === 2 ? 6 : 8);

  const showPattern = async (pat) => {
    setGameState("showing");
    setSelectedSet(new Set());
    setActiveSet(new Set(pat));
    await sleep(1200);
    setActiveSet(new Set());
    setGameState("input");
  };

  const handleStartGame = async () => {
    setRound(1);
    setIsProcessing(true);

    try {
      const receipt = await submitGuess(100);

      if (receipt.status === "success") {
        await fetch("http://127.0.0.1:5000/api/points/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: address,
            txHash: receipt.transactionHash,
          }),
        });
        toast({ title: "Success!", description: "Points added!" });

         startGame();
      }
    }

    catch (err) {

      toast({
        title: "Error",
        description: err.shortMessage || "User rejected or Transaction failed",
        variant: "destructive"
      });
    }

    finally {
      setIsProcessing(false);
     
    }

  };


  const startGame = async () => {
    setCorrectCount(0);
    setSelectedSet(new Set());
    setActiveSet(new Set());
    setFailed(false);

    const size = getPatternSize(round);
    const newPattern = generatePattern(size);
    setPattern(newPattern);
    await showPattern(newPattern);
  };

  useEffect(() => {
    if (round > 1 && round <= MAX_ROUNDS) {
      startGame();
    }
  }, [round]);


  const handleClick = async (index) => {
    if (gameState !== "input") return;
    if (selectedSet.has(index)) return;

    const nextSelected = new Set(selectedSet);
    nextSelected.add(index);
    setSelectedSet(nextSelected);

    // handle wrong
    if (!pattern.includes(index)) {
      setFailed(true);
      setRound(1);
      setGameState("idle");
      return;
    }

    // correct
    setCorrectCount((c) => c + 1);
    if (nextSelected.size !== pattern.length) return;

    // round completed
    if (round < MAX_ROUNDS) {
      setTimeout(() => {
        setRound((r) => r + 1);
        setCorrectCount(0);
        setShowPoints(false);
      }, 1200);
      return;
    }

    if (!isConnected || !address) {
      toast({ title: "Wallet not connected", variant: "destructive" });
      return;
    }

    setGameState("finished");
    setShowPoints(true);


  };

  return (
    <div className="w-full min-h-[80vh] flex flex-col items-center justify-center p-4">
      {/* Main Game Container */}
      <Card className="relative overflow-hidden border-white/5 bg-slate-950/50 backdrop-blur-2xl w-full max-w-2xl rounded-[2rem] shadow-2xl">

        {/* Decorative Background Elements */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-orange-500/10 blur-[100px] rounded-full" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-500/10 blur-[100px] rounded-full" />

        <CardContent className="p-8 md:p-12 flex flex-col items-center gap-8">

          {/* TOP HUD: Stats */}
          <div className="w-full grid grid-cols-2 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 transition-all hover:bg-white/10">
              <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
                <Target size={20} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Progress</p>
                <p className="text-lg font-mono font-bold text-white">Round {round}<span className="text-white/30 text-sm">/{MAX_ROUNDS}</span></p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 transition-all hover:bg-white/10">
              <div className="p-2 rounded-lg bg-sky-500/20 text-sky-400">
                <Zap size={20} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Accuracy</p>
                <p className="text-lg font-mono font-bold text-white">{correctCount}<span className="text-white/30 text-sm">/{pattern.length || 0}</span></p>
              </div>
            </div>
          </div>

          {/* THE CORE: Cyber Grid */}
          <div className="relative p-2 rounded-[2.5rem] bg-gradient-to-b from-white/10 to-transparent border border-white/10 shadow-inner">
            <div
              className="grid gap-3 p-4"
              style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)` }}
            >
              {Array.from({ length: GRID_SIZE }).map((_, i) => {
                const isRevealed = activeSet.has(i) || selectedSet.has(i);

                return (
                  <motion.div
                    key={i}
                    onClick={() => handleClick(i)}
                    whileTap={{ scale: 0.9 }}
                    whileHover={gameState !== "showing" ? { scale: 1.05, y: -2 } : {}}
                    className={`
                    relative w-16 h-16 md:w-20 md:h-20 rounded-2xl cursor-pointer
                    transition-all duration-500 overflow-hidden group
                    ${gameState === "showing" ? "pointer-events-none" : "pointer-events-auto"}
                    ${isRevealed
                        ? "bg-orange-500 shadow-[0_0_30px_rgba(249,115,22,0.4)] border-orange-400/50"
                        : "bg-white/5 border border-white/10 hover:border-white/30"}
                  `}
                  >
                    {/* Internal Shimmer for revealed tiles */}
                    <AnimatePresence>
                      {isRevealed && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="absolute inset-0 bg-gradient-to-tr from-orange-600 via-orange-400 to-white/40 opacity-50"
                        />
                      )}
                    </AnimatePresence>

                    {/* Subtle Grid Pattern inside tile */}
                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* FOOTER: Controls & Feedback */}
          <div className="flex flex-col items-center gap-6 w-full">
            <AnimatePresence mode="wait">
              {failed ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-red-400 bg-red-400/10 px-6 py-2 rounded-full border border-red-400/20 font-bold"
                >
                  <RotateCcw size={16} className="animate-spin-slow" /> Sequence Failed
                </motion.div>
              ) : showPoints ? (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center gap-3 text-emerald-400 bg-emerald-400/10 px-6 py-3 rounded-full border border-emerald-400/20 shadow-[0_0_20px_rgba(52,211,153,0.2)]"
                >
                  <Trophy size={20} className="animate-bounce" />
                  <span className="font-bold tracking-tight">+100 Points Awarded</span>
                </motion.div>
              ) : (
                <div className="h-10" /> // Spacer to prevent layout shift
              )}
            </AnimatePresence>

            <Button
              onClick={handleStartGame}
              disabled={isProcessing}
              className={`
              group relative h-16 w-full max-w-xs rounded-2xl font-display text-lg font-bold transition-all duration-300 cursor-pointer
              ${failed || showPoints
                  ? "bg-white text-black hover:bg-orange-500 hover:text-white"
                  : "bg-orange-600 text-white hover:bg-orange-500 shadow-[0_0_20px_rgba(234,88,12,0.3)]"}
            `}
            >
              <span className="flex items-center justify-center gap-2">
                {failed || showPoints ? <RotateCcw size={20} /> : <Play size={20} />}
                {isProcessing ? "Processing..." : (failed || showPoints ? "Try Again" : "Start Game")}
              </span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
