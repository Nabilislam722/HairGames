import { Heart, Bomb, Zap, Layers, Lock, Star, TrendingUp, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ActiveAbility } from "./types";

interface Props {
  score: number;
  best: number;
  lives: number;
  combo: number;
  level: number;
  levelLabel: string;
  levelScore: number;
  levelTarget: number;
  activeAbilities: ActiveAbility[];
}

const ABILITY_META: Record<
  string,
  { label: string; color: string; icon: typeof Sparkles }
> = {
  frenzy: { label: "Frenzy", color: "#ff80ab", icon: Sparkles },
  glitch: { label: "Locked", color: "#7c4dff", icon: Lock },
  multiplier: { label: "2x", color: "#4db6ac", icon: TrendingUp },
  golden: { label: "Golden", color: "#ffca28", icon: Star },
};

export default function HUD({
  score,
  lives,
  combo,
  level,
  levelLabel,
  levelScore,
  levelTarget,
  activeAbilities,
}: Props) {
  const pct = Math.min(100, (levelScore / levelTarget) * 100);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-2 sm:p-3">
      {/* single-line bento bar */}
      <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-1.5 shadow-lg backdrop-blur-md sm:gap-3 sm:p-2">
        {/* level chip */}
        <div className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-400/10 px-2.5 py-1.5 sm:px-3">
          <Layers className="h-3.5 w-3.5 text-emerald-300" />
          <span className="text-sm font-bold text-emerald-200">LEVEL {level}</span>
          <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-emerald-300/50 sm:inline">
            {levelLabel}
          </span>
        </div>

        {/* score + progress chip (flex-1) */}
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-white/5 px-2.5 py-1.5 sm:px-3">
          <span className="shrink-0 text-lg font-black tabular-nums leading-none text-white sm:text-xl">
            {score}
          </span>
          <AnimatePresence>
            {combo >= 2 && (
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                className="flex shrink-0 items-center gap-0.5 rounded-md bg-amber-400/90 px-1.5 py-0.5 text-xs font-bold text-amber-950"
              >
                <Zap className="h-2.5 w-2.5" />
                {combo}x
              </motion.span>
            )}
          </AnimatePresence>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-300"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
            </div>
            <span className="shrink-0 text-[10px] font-semibold tabular-nums text-white/50">
              {levelScore}/{levelTarget}
            </span>
          </div>
        </div>

        {/* lives chip */}
        <div className="flex shrink-0 items-center gap-1 rounded-xl bg-rose-400/10 px-2.5 py-1.5 sm:px-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <motion.div
              key={i}
              animate={{ scale: i < lives ? 1 : 0.7, opacity: i < lives ? 1 : 0.25 }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
            >
              <Heart
                className={`h-4 w-4 ${
                  i < lives ? "fill-rose-500 text-rose-500" : "fill-transparent text-white/20"
                }`}
                strokeWidth={2.5}
              />
            </motion.div>
          ))}
        </div>
      </div>

      {/* active abilities — second row, only when present */}
      <AnimatePresence>
        {activeAbilities.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-auto mt-1.5 flex max-w-3xl flex-wrap gap-1.5"
          >
            {activeAbilities.map((a) => {
              const meta = ABILITY_META[a.type];
              const Icon = meta.icon;
              const tpct = (a.timeLeft / a.duration) * 100;
              return (
                <motion.div
                  key={a.type}
                  layout
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="relative overflow-hidden rounded-lg border px-2 py-1 shadow backdrop-blur-md"
                  style={{ borderColor: meta.color + "55", backgroundColor: meta.color + "15" }}
                >
                  <div className="relative z-10 flex items-center gap-1.5">
                    <Icon className="h-3 w-3" style={{ color: meta.color }} />
                    <span className="text-[11px] font-bold text-white">{meta.label}</span>
                    <span className="text-[11px] font-semibold tabular-nums text-white/70">
                      {a.timeLeft.toFixed(1)}s
                    </span>
                  </div>
                  <div
                    className="absolute bottom-0 left-0 h-0.5"
                    style={{ width: `${tpct}%`, backgroundColor: meta.color }}
                  />
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function BombLegend() {
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 sm:bottom-6">
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm font-medium text-white/80 shadow-lg backdrop-blur-md">
        <Bomb className="h-4 w-4 text-amber-400" />
        Avoid the bombs
      </div>
    </div>
  );
}
