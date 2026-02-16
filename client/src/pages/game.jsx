import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAccount } from "wagmi";
import { useWeb3 } from "@/lib/web3";
import { toast } from "../hooks/use-toast";

const GRID_SIZE = 25;
const GRID_COLS = 5;
const MAX_ROUNDS = 19;
const kmdwbu1 = "NoCheater";

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
    let txHash;

    try {
      setIsProcessing(true);

      const tx = await submitGuess(100);
      if (!tx) throw new Error("Transaction not sent");

      txHash = tx;
    } catch (err) {
      toast({
        title: "Transaction Failed",
        description: err?.shortMessage || err?.message,
        variant: "destructive",
      });
      setIsProcessing(false);
      return;
    }

    try {
      await fetch("https://api.hairtoken.xyz/api/points/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": kmdwbu1,
        },
        body: JSON.stringify({
          wallet: address,
          points: 100,
          txHash,
        }),
      });
    } catch (err) {
      toast({
        title: "Backend Error",
        description: err.message,
        variant: "destructive",
      });
      setIsProcessing(false);
      return;
    }

    setIsProcessing(false);
    setRound(1);
    startGame();
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
    <div className="w-full min-h-screen flex flex-col items-center justify-center">
      <Card className="border-white/10 bg-black w-full h-[70vh] rounded-3xl">
        <CardContent className="p-8 h-full flex flex-col justify-between">
          <div className="flex items-center h-[90%] justify-center overflow-hidden">
            <div
              className="grid w-full gap-3 max-w-[420px]"
              style={{
                gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
              }}
            >
              {Array.from({ length: GRID_SIZE }).map((_, i) => (
                <motion.div
                  key={i}
                  onClick={() => handleClick(i)}
                  whileTap={{ scale: 0.92 }}
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.25 }}
                  className={`relative aspect-square rounded-xl cursor-pointer
          backdrop-blur-xl
          border border-white/20
          overflow-hidden
          transition-all duration-300 ease-out
          hover:bg-amber-600

          ${activeSet.has(i) || selectedSet.has(i)
                      ? `
              bg-indigo-500
              border-indigo-800
              shadow-[ 
                0_0_25px_rgba(255,165,0,0.9),
                0_0_60px_rgba(255,165,0,0.45),
                inset_0_0_20px_rgba(255,200,120,0.35)
              ]
            `
                      : "bg-white/10 shadow-[0_10px_25px_rgba(0,0,0,0.5)]"
                    }

          ${gameState === "showing" ? "pointer-events-none" : ""}
        `}
                >
                  {(activeSet.has(i) || selectedSet.has(i)) && (
                    <div className="absolute inset-0 rounded-xl bg-indigo-400/30 blur-xl" />
                  )}
                </motion.div>
              ))}
            </div>
          </div>

          {/* STATUS */}
          <div className="text-sm font-mono text-center">
            <p className="text-purple-400 font-mono">
              Round {round} / {MAX_ROUNDS}
            </p>
            <p className="text-sky-400">
              Correct: {correctCount} / {pattern.length || 0}
            </p>

            {failed && (
              <p className="text-red-500 animate-pulse">
                Failed ❌
              </p>
            )}

            {showPoints && (
              <p className="text-yellow-400 text-lg font-bold animate-bounce">
                +100 Points Awarded 🏆
              </p>
            )}

            {/* Game Button */}
            <Button
              onClick={handleStartGame}
              size="lg"
              whileHover={{ scale: 1.05 }}
              className="rounded-xl"
            >
              Start Game
            </Button>


          </div>

        </CardContent>
      </Card>
    </div>
  );
}
