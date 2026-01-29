import React, { useState, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, HelpCircle, CheckCircle2, XCircle, Hash, BrainCircuit } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useWeb3 } from "@/lib/web3";
import "../index.css"
import { useAccount } from 'wagmi';




const GAME_COST_ETH = 0.000014;
const kmdwbu1 = "NoCheater";




export default function Game() {
  const [, params] = useRoute("/game/:id");
  const [, setLocation] = useLocation();
  const { isConnected, submitGuess } = useWeb3();
  const { toast } = useToast();
  const { address } = useAccount()
  const [gameState, setGameState] = useState("initial");
  const [targetNumber, setTargetNumber] = useState(0);
  const [attempts, setAttempts] = useState(15);
  const [currentGuess, setCurrentGuess] = useState("");
  const [guessHistory, setGuessHistory] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const scrollRef = useRef(null);

  if (!params?.id) {
    setLocation("/dashboard");
    return null;
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [guessHistory]);

  const startGame = async () => {
    if (!isConnected) return;

    setIsProcessing(true);
    try {

      setTxHash("0x...");
      // Generate random 4-digit number (1000-9999)
      const newTarget = Math.floor(Math.random() * 9000) + 1000;
      setTargetNumber(newTarget);
      setGameState("playing");
      setAttempts(15);
      setGuessHistory([]);
      setCurrentGuess("");

      toast({
        title: "Game Started",
        description: "Find the 4-digit number. Good luck!",
      });
      console.log("Debug - Target Number:", newTarget); // For testing
    }

    catch (e) {
      console.error(e);
    }

    finally {
      setIsProcessing(false);
    }
  };

  const handleGuess = async (e) => {
    e?.preventDefault();
    if (gameState !== "playing") return;
   
    window.addEventListener("beforeunload", (event)=>{
      
      if (gameState === "playing"){
        event.preventDefault();
        event.returnValue = "Leaving this page will result you Loss of this Game";
      }
    });

    const guessNum = parseInt(currentGuess);
    if (isNaN(guessNum) || currentGuess.length !== 4) {

      return toast({ title: "Invalid Input", variant: "destructive" });
    }

    setIsProcessing(true);
    try {
      const tx = await submitGuess(guessNum);
      setTxHash(tx);
    }
    catch (err) {
      toast({
        title: "Transaction Failed",
        description: err.shortMessage || err.message,
        variant: "destructive",
      });
      setIsProcessing(false);
      return;
    }
    setIsProcessing(false);


    let hint;
    if (guessNum === targetNumber) 
    {
      hint = "Correct";
      setGameState("won");
      const res = await fetch("http://api.hairtoken.xyz/api/points/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": kmdwbu1
        },
        body: JSON.stringify({
          wallet: address,
          points: 100,
        }),
      });

      if (!res.ok) 
      {
        const err = await res.json();
        throw new Error(err.error || "Failed to submit points");
      }

      return res.json();
    }

    else if (guessNum < targetNumber) {
      hint = "Higher";
    }

    else {
      hint = "Lower";
    }

    setGuessHistory([...guessHistory, { value: guessNum, hint }]);
    setAttempts((a) => a - 1);
    setCurrentGuess("");
  };


  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setLocation("/dashboard")} className="text-muted-foreground hover:text-white">
            <ArrowLeft className="mr-2 h-4 w-4 cursor-pointer" /> Back to Dashboard
          </Button>
          <h1 className="text-2xl font-display font-bold">Find The Number</h1>
        </div>
        {txHash && (
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground font-mono bg-white/5 px-3 py-1 rounded-full">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            Tx: {txHash.slice(0, 6)}...{txHash.slice(-4)}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Game Area */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <Card className="bg-card border-white/10 flex-1 min-h-[500px] relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 pointer-events-none" />

            <CardContent className="p-8 flex flex-col h-full items-center justify-center relative z-10 gap-8">
              {gameState === "initial" && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center max-w-md space-y-6"
                >
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 ring-1 ring-primary/50">
                    <Hash className="w-10 h-10 text-primary" />
                  </div>
                  <h2 className="text-3xl font-bold font-display">Ready to Play?</h2>
                  <p className="text-muted-foreground">
                    Find the hidden 4-digit number in 15 attempts.
                    <br />
                    <span className="text-accent font-mono text-sm mt-2 block">Entry Cost: {GAME_COST_ETH} ETH (~$0.02)</span>
                  </p>

                  <Button
                    size="lg"
                    className="w-full text-lg h-14 bg-primary hover:bg-primary/90 cursor-pointer"
                    onClick={startGame}
                    disabled={isProcessing}
                  >
                    {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Start Game"}
                  </Button>

                  <div className="text-xs text-muted-foreground mt-4">
                    Requires wallet signature • 15 Attempts • 100 Points Reward
                  </div>
                </motion.div>
              )}

              {gameState === "playing" && (
                <div className="w-full max-w-md space-y-8">
                  <div className="text-center space-y-2">
                    <div className="text-sm text-muted-foreground uppercase tracking-widest">Attempts Remaining</div>
                    <div className="text-6xl font-mono font-bold text-white text-glow">{attempts}</div>
                  </div>

                  <form onSubmit={handleGuess} className="space-y-4">
                    <Input
                      type="number"
                      placeholder="Enter 4-digit number"
                      className="text-center text-2xl h-16 font-mono tracking-[0.5em] bg-background/50 border-white/20 focus:border-primary/50 focus:ring-primary/20"
                      value={currentGuess}
                      onChange={(e) => {
                        if (e.target.value.length <= 4) setCurrentGuess(e.target.value);
                      }}
                      autoFocus
                    />
                    <Button type="submit" className="w-full h-12 text-lg" disabled={!currentGuess}>
                      Submit Guess
                    </Button>
                  </form>

                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <HelpCircle className="w-4 h-4" />
                    <span>Enter a number between 1000 and 9999</span>
                  </div>
                </div>
              )}

              {(gameState === "won" || gameState === "lost") && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center space-y-6"
                >
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto ring-4 ${gameState === 'won' ? 'bg-green-500/10 ring-green-500/50 text-green-500' : 'bg-red-500/10 ring-red-500/50 text-red-500'}`}>
                    {gameState === 'won' ? <Trophy className="w-12 h-12" /> : <XCircle className="w-12 h-12" />}
                  </div>

                  <div>
                    <h2 className="text-4xl font-bold font-display mb-2">
                      {gameState === "won" ? "YOU WON!" : "GAME OVER"}
                    </h2>
                    <p className="text-muted-foreground text-lg">
                      The number was <span className="text-white font-mono font-bold">{targetNumber}</span>
                    </p>
                    {gameState === "won" && (
                      <p className="text-accent font-bold mt-2">+100 Points Awarded</p>
                    )}
                  </div>

                  <Button size="lg" onClick={startGame} className="min-w-[200px]">
                    Play Again
                  </Button>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* History Sidebar */}
        <div className="lg:col-span-4 flex flex-col h-full">
          <Card className="bg-card border-white/10 h-full max-h-[600px] flex flex-col">
            <CardHeader className="border-b border-white/5 bg-background/30">
              <CardTitle className="text-sm font-medium uppercase tracking-wider flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-primary" />
                Guess History
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-0 scrollbar-hide" ref={scrollRef}>
              {guessHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center opacity-50">
                  <Hash className="w-12 h-12 mb-2" />
                  <p>No guesses yet</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {guessHistory.map((guess, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                    >
                      <span className="text-xs text-muted-foreground font-mono w-8">#{i + 1}</span>
                      <span className="text-lg font-bold font-mono tracking-wider">{guess.value}</span>
                      <span className={`text-xs font-bold px-2 py-1 rounded uppercase ${guess.hint === 'Higher' ? 'bg-yellow-500/20 text-yellow-500' :
                        guess.hint === 'Lower' ? 'bg-blue-500/20 text-blue-500' :
                          'bg-green-500/20 text-green-500'
                        }`}>
                        {guess.hint}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Trophy({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}
