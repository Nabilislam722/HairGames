import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, RotateCcw, Scissors, Trophy, ChevronRight, Sparkles } from "lucide-react";
import GameCanvas from "../game/fruit_ninja/GameCanvas";
import HUD, { BombLegend } from "../game/fruit_ninja/HUD";
import {
  createInitialState,
  resetForPlay,
  continueAfterLevelUp,
  getLevelConfig,
  getTotalLevels,
} from "../game/fruit_ninja/engine";

const BEST_KEY = "fruit-slash-best";

// Shared bento grid motion — tiles pop in with a light stagger.
const bentoContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const bentoItem = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1 },
};
const CTA_FOCUS = "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70";

export default function fruitninja() {
  const [phase, setPhase] = useState("menu");
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  const stateRef = useRef(
    createInitialState(Number(localStorage.getItem(BEST_KEY) || 0)),
  );

  const start = useCallback(() => {
    stateRef.current = resetForPlay(stateRef.current);
    setPhase("playing");
    rerender();
  }, [rerender]);

  const nextLevel = useCallback(() => {
    stateRef.current = continueAfterLevelUp(stateRef.current);
    setPhase("playing");
    rerender();
  }, [rerender]);

  const onFrame = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== phase) {
      setPhase(s.phase);
      if (s.phase === "over" && s.score > s.best) {
        s.best = s.score;
        localStorage.setItem(BEST_KEY, String(s.best));
      }
    }
    if (s.phase === "playing") rerender();
  }, [phase, rerender]);

  const s = stateRef.current;
  const cfg = getLevelConfig(s.level);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black font-sans text-[#2d3436]">
      {/* play field */}
      <div className="absolute inset-0">
        <GameCanvas stateRef={stateRef} onFrame={onFrame} />
      </div>

      <AnimatePresence>
        {phase === "playing" && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <HUD
              score={s.score}
              best={s.best}
              lives={s.lives}
              combo={s.combo}
              level={s.level}
              levelLabel={cfg.label}
              levelScore={s.levelScore}
              levelTarget={cfg.targetScore}
              activeAbilities={s.activeAbilities}
            />
            <BombLegend />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {phase === "menu" && (
          <MenuScreen key="menu" best={s.best} onStart={start} />
        )}
        {phase === "levelup" && (
          <LevelUpScreen
            key="levelup"
            level={s.level}
            score={s.score}
            onNext={nextLevel}
          />
        )}
        {phase === "over" && (
          <GameOverScreen
            key="over"
            score={s.score}
            best={s.best}
            level={s.level}
            onRestart={start}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuScreen({ best, onStart }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
    >
      <motion.div
        variants={bentoContainer}
        initial="hidden"
        animate="show"
        className="grid w-full max-w-xl grid-cols-2 sm:grid-cols-4 auto-rows-[90px] gap-3"
      >
        {/* Hero tile */}
        <motion.div
          variants={bentoItem}
          className="relative col-span-2 row-span-2 flex flex-col justify-between overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_0_40px_-15px_rgba(255,107,107,0.35)] backdrop-blur-xl"
        >
          <div className="pointer-events-none absolute -bottom-8 -right-6 select-none text-[120px] leading-none opacity-15">
            🍓
          </div>

          <div className="relative z-10 flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ff6b6b]/15 text-[#ff6b6b]">
              <Scissors className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#ff6b6b]/40 bg-[#ff6b6b]/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[#ff9494]">
              <Sparkles className="h-3 w-3" /> Reflex
            </span>
          </div>

          <div className="relative z-10">
            <h1 className="text-4xl font-black leading-none tracking-tight text-white">
              FRUIT
              <br />
              <span className="text-[#ff6b6b]">SLASH</span>
            </h1>
            <p className="mt-3 text-sm font-medium leading-relaxed text-white/50">
              Slice fruit mid-air, chain combos in one swipe, dodge the bombs.
            </p>
          </div>
        </motion.div>

        {/* Slice tile */}
        <motion.div
          variants={bentoItem}
          className="col-span-1 row-span-1 flex flex-col justify-center gap-1 rounded-[28px] border border-[#ff6b6b]/25 bg-[#ff6b6b]/10 p-4 backdrop-blur-xl transition-transform hover:scale-[1.03]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-base">
            🔪
          </div>
          <p className="text-sm font-black text-white">Slice</p>
          <p className="text-[11px] font-medium text-white/45">Swipe to cut</p>
        </motion.div>

        {/* Combo tile */}
        <motion.div
          variants={bentoItem}
          className="col-span-1 row-span-1 flex flex-col justify-center gap-1 rounded-[28px] border border-[#ff9f43]/30 bg-[#ff9f43]/10 p-4 backdrop-blur-xl transition-transform hover:scale-[1.03]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-base">
            ⚡
          </div>
          <p className="text-sm font-black text-white">Combo</p>
          <p className="text-[11px] font-medium text-white/45">Chain a swipe</p>
        </motion.div>

        {/* Bombs tile — deliberately neutral, it's the one to avoid */}
        <motion.div
          variants={bentoItem}
          className="col-span-1 row-span-1 flex flex-col justify-center gap-1 rounded-[28px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl transition-transform hover:scale-[1.03]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-base">
            💣
          </div>
          <p className="text-sm font-black text-white">Bombs</p>
          <p className="text-[11px] font-medium text-white/40">Never touch one</p>
        </motion.div>

        {/* Best score tile */}
        <motion.div
          variants={bentoItem}
          className="col-span-1 row-span-1 flex flex-col justify-center gap-1 rounded-[28px] border border-[#ffd93d]/30 bg-[#ffd93d]/10 p-4 backdrop-blur-xl transition-transform hover:scale-[1.03]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-base">
            🏆
          </div>
          <p className="text-lg font-black tabular-nums text-[#ffd93d]">
            {best > 0 ? best : "—"}
          </p>
          <p className="text-[11px] font-medium text-white/45">Best score</p>
        </motion.div>

        {/* CTA */}
        <motion.button
          variants={bentoItem}
          onClick={onStart}
          className={`cursor-pointer col-span-2 sm:col-span-4 flex items-center justify-center gap-2 rounded-full bg-[#ff6b6b] py-4 text-lg font-black text-white shadow-[0_6px_0_#ee5253] transition-colors hover:bg-[#ee5253] active:translate-y-1 active:shadow-[0_2px_0_#ee5253] ${CTA_FOCUS}`}
        >
          <Play className="h-5 w-5 fill-white" />
          Play
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

function LevelUpScreen({ level, score, onNext }) {
  const nextCfg = getLevelConfig(level + 1);
  const isFinal = level >= getTotalLevels();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
    >
      <motion.div
        variants={bentoContainer}
        initial="hidden"
        animate="show"
        className="grid w-full max-w-xl grid-cols-2 sm:grid-cols-4 auto-rows-[90px] gap-3"
      >
        {/* Hero tile — solid, celebratory */}
        <motion.div
          variants={bentoItem}
          className="relative col-span-2 row-span-2 flex flex-col justify-between overflow-hidden rounded-[28px] border border-[#58943f] bg-[#6ab04c] p-6 text-white shadow-sm"
        >
          <div className="pointer-events-none absolute -bottom-8 -right-6 select-none text-[120px] leading-none opacity-15">
            {isFinal ? "🏆" : "✨"}
          </div>
          <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div className="relative z-10">
            <h2 className="text-3xl font-black leading-tight text-white">
              {isFinal ? "YOU WIN!" : "LEVEL COMPLETE"}
            </h2>
            <p className="mt-2 text-sm font-medium text-white/85">
              {isFinal
                ? "Every level cleared. Legendary slicer."
                : `Level ${level} cleared — next up: ${nextCfg.label}.`}
            </p>
          </div>
        </motion.div>

        {/* Score tile */}
        <motion.div
          variants={bentoItem}
          className="col-span-2 row-span-1 flex flex-col justify-center rounded-[28px] border border-[#e0e4d0] bg-white p-4 shadow-sm transition-transform hover:scale-[1.02]"
        >
          <p className="text-[11px] font-black uppercase tracking-widest text-[#a0a590]">Score</p>
          <p className="text-3xl font-black tabular-nums text-[#2d3436]">{score}</p>
        </motion.div>

        {/* Next up / final level count tile */}
        <motion.div
          variants={bentoItem}
          className="col-span-2 row-span-1 flex flex-col justify-center rounded-[28px] border border-[#ffd93d]/40 bg-[#ffd93d]/15 p-4 transition-transform hover:scale-[1.02]"
        >
          <p className="text-[11px] font-black uppercase tracking-widest text-[#a0a590]">
            {isFinal ? "Levels" : "Next Up"}
          </p>
          <p className="text-3xl font-black tabular-nums text-[#e6a800]">
            {isFinal ? `${getTotalLevels()}/${getTotalLevels()}` : nextCfg.label}
          </p>
        </motion.div>

        {/* CTA */}
        <motion.button
          variants={bentoItem}
          onClick={onNext}
          className={`col-span-2 sm:col-span-4 flex items-center justify-center gap-2 rounded-full py-4 text-lg font-black text-white transition-colors active:translate-y-1 ${CTA_FOCUS} ${
            isFinal
              ? "bg-[#ff6b6b] shadow-[0_6px_0_#ee5253] hover:bg-[#ee5253] active:shadow-[0_2px_0_#ee5253]"
              : "bg-[#6ab04c] shadow-[0_6px_0_#58943f] hover:bg-[#5c9941] active:shadow-[0_2px_0_#58943f]"
          }`}
        >
          {isFinal ? (
            <>
              <RotateCcw className="h-5 w-5" />
              Play Again
            </>
          ) : (
            <>
              Next Level
              <ChevronRight className="h-5 w-5" />
            </>
          )}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

function GameOverScreen({ score, best, level, onRestart }) {
  const isNewBest = score >= best && score > 0;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
    >
      <motion.div
        variants={bentoContainer}
        initial="hidden"
        animate="show"
        className="grid w-full max-w-xl grid-cols-2 sm:grid-cols-4 auto-rows-[90px] gap-3"
      >
        {/* Hero tile */}
        <motion.div
          variants={bentoItem}
          className="relative col-span-2 row-span-2 flex flex-col justify-between overflow-hidden rounded-[28px] border border-[#e0e4d0] bg-white p-6 shadow-sm"
        >
          <div className="pointer-events-none absolute -bottom-8 -right-6 select-none text-[120px] leading-none opacity-10">
            🍉
          </div>
          <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2d3436]/5">
            <Scissors className="h-5 w-5 text-[#2d3436]/50" strokeWidth={2.5} />
          </div>
          <div className="relative z-10">
            <h2 className="text-3xl font-black text-[#2d3436]">GAME OVER</h2>
            {isNewBest ? (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 260, damping: 12 }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#ffd93d] px-3 py-1 text-xs font-black text-[#7a5c00]"
              >
                <Trophy className="h-3.5 w-3.5" /> New best score
              </motion.span>
            ) : (
              <p className="mt-2 text-sm font-medium text-[#636e72]">Nice run — beat it next time.</p>
            )}
          </div>
        </motion.div>

        {/* Score tile */}
        <motion.div
          variants={bentoItem}
          className="col-span-1 row-span-1 flex flex-col justify-center rounded-[28px] border border-[#e0e4d0] bg-white p-4 shadow-sm transition-transform hover:scale-[1.03]"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-[#a0a590]">Score</p>
          <p className="text-2xl font-black tabular-nums text-[#2d3436]">{score}</p>
        </motion.div>

        {/* Best tile */}
        <motion.div
          variants={bentoItem}
          className="col-span-1 row-span-1 flex flex-col justify-center rounded-[28px] border border-[#ffd93d]/40 bg-[#ffd93d]/15 p-4 transition-transform hover:scale-[1.03]"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-[#a0a590]">Best</p>
          <p className="text-2xl font-black tabular-nums text-[#e6a800]">{best}</p>
        </motion.div>

        {/* Level reached tile */}
        <motion.div
          variants={bentoItem}
          className="col-span-2 row-span-1 flex flex-col justify-center rounded-[28px] border border-[#6ab04c]/30 bg-[#6ab04c]/10 p-4 transition-transform hover:scale-[1.02]"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-[#a0a590]">Level reached</p>
          <p className="text-2xl font-black tabular-nums text-[#5c9941]">{level}</p>
        </motion.div>

        {/* CTA */}
        <motion.button
          variants={bentoItem}
          onClick={onRestart}
          className={`col-span-2 sm:col-span-4 flex items-center justify-center gap-2 rounded-full bg-[#ff6b6b] py-4 text-lg font-black text-white shadow-[0_6px_0_#ee5253] transition-colors hover:bg-[#ee5253] active:translate-y-1 active:shadow-[0_2px_0_#ee5253] ${CTA_FOCUS}`}
        >
          <RotateCcw className="h-5 w-5" />
          Play Again
        </motion.button>
      </motion.div>
    </motion.div>
  );
}