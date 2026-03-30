import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAccount } from "wagmi";
import { useWeb3 } from "@/lib/web3";
import { toast } from "../hooks/use-toast";
import { Trophy, Zap, Target, RotateCcw, Play } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import DashboardGame from "../games/spaceshooter";

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
        await fetch("https://api.hairtoken.xyz/api/points/add", {
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
   <DashboardGame/>
  );
}
