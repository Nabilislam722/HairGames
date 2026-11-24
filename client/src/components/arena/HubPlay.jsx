import { useEffect } from "react";
import { Link } from "wouter";
import { Check, Loader2, AlertCircle, Zap, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGameSession, formatSessionEth, SESSION_DEFAULT_TOP_UP } from "@/lib/gameSession";

// Shared UI for hub games (lib/hub.js): how the player is playing, and the start and save progress.

const START_STEPS = {
  session: [
    { key: "send", label: "Starting on chain with your session key" },
    { key: "session", label: "Getting the game ready" },
  ],
  wallet: [
    { key: "wallet", label: "Confirm the start in your wallet" },
    { key: "session", label: "Getting the game ready" },
  ],
};

const saveSteps = (mode) => [
  { key: "verify", label: "Checking your game" },
  { key: "clock", label: "Waiting for the chain's clock" },
  mode === "session" ? { key: "send", label: "Saving with your session key" } : { key: "wallet", label: "Confirm the save in your wallet" },
  { key: "confirm", label: "Saving on chain" },
  { key: "record", label: "Updating your progress" },
];

// In the page header: session key (no popups) or wallet, with a switch, and the key's balance.
export function PlayWithBadge() {
  const session = useGameSession();
  if (!session.enabled) return null;
  const { status, playWith, usesKey, busy } = session;
  const active = status === "active";

  if (usesKey) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="flex items-center gap-1 font-semibold text-lime-300" title="Your games send their transactions with your session key">
          <Zap className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} /> No popups · {formatSessionEth(session.balance)} ETH
        </span>
        <button type="button" className="text-white/45 underline-offset-2 hover:text-white hover:underline" onClick={() => session.setPlayWith("wallet")}>
          Use wallet
        </button>
      </div>
    );
  }
  if (active && playWith === "wallet") {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="flex items-center gap-1 text-white/60"><Wallet className="h-3.5 w-3.5" /> Wallet</span>
        <button type="button" className="font-semibold text-lime-300 hover:underline underline-offset-2" onClick={() => session.setPlayWith("session")}>
          Use session key
        </button>
      </div>
    );
  }
  if (active) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold text-amber-300">Session low on ETH</span>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={!!busy} onClick={() => session.addFunds(SESSION_DEFAULT_TOP_UP)}>
          {busy === "fund" ? <Loader2 className="h-3 w-3 animate-spin" /> : `Add ${SESSION_DEFAULT_TOP_UP} ETH`}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="flex items-center gap-1 text-white/60"><Wallet className="h-3.5 w-3.5" /> Wallet</span>
      <Link href="/dashboard" className="font-semibold text-lime-300 hover:underline underline-offset-2">
        {status === "expired" ? "Renew your session" : "Start a session"}
      </Link>
    </div>
  );
}

// The start, when it needs the player: their wallet's confirmation, or an error.
export function HubStartOverlay({ starting, title = "Starting", onClose }) {
  if (!starting || (starting.mode === "session" && !starting.error)) return null;
  return (
    <StepsOverlay title={starting.error ? "Couldn't start" : title} steps={START_STEPS[starting.mode]} step={starting.step} error={starting.error}>
      {starting.error && <Button className="w-full" onClick={onClose}>Close</Button>}
    </StepsOverlay>
  );
}

// The save. With the session key it runs in a small pill over the game; it opens up when it needs the
// player (their wallet's confirmation) or fails. `top` goes above the steps (e.g. the game's result).
export function HubSaveStatus({ saving, title = "Saving", doneTitle = "Saved", onRetry, onSkip, onDone, top, autoClose = true }) {
  useEffect(() => {
    if (!autoClose || saving?.step !== "done" || saving.mode !== "session" || top) return undefined;
    const id = setTimeout(onDone, 2200);
    return () => clearTimeout(id);
  }, [autoClose, saving, onDone, top]);
  if (!saving) return null;

  const steps = saveSteps(saving.mode);
  const quiet = saving.mode === "session" && !saving.error && !(saving.step === "done" && top);
  if (quiet) {
    const label = saving.step === "done" ? doneTitle : steps.find((s) => s.key === saving.step)?.label ?? title;
    return (
      <div className="pointer-events-none absolute left-1/2 top-16 z-40 -translate-x-1/2" role="status" aria-live="polite">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/75 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur">
          {saving.step === "done" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
          {label}
        </div>
      </div>
    );
  }
  return (
    <StepsOverlay
      title={saving.step === "done" ? doneTitle : saving.error ? "Couldn't save" : title}
      steps={steps}
      step={saving.step}
      error={saving.error}
      top={top}
    >
      {saving.step === "done" && <Button className="w-full" onClick={onDone}>Continue</Button>}
      {saving.error && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onSkip}>Skip</Button>
          <Button className="flex-1" onClick={onRetry}>Retry</Button>
        </div>
      )}
    </StepsOverlay>
  );
}

// A step list over the game: done steps get a check, the current one spins (or shows the error).
export function StepsOverlay({ title, steps, step, error, top, children }) {
  const activeIndex = step === "done" ? steps.length : steps.findIndex((s) => s.key === step);
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-background p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-white mb-4">{title}</h2>
        {top}
        {step !== "done" && (
          <ol className="space-y-3">
            {steps.map((s, i) => {
              const state = i < activeIndex ? "done" : i === activeIndex ? (error ? "error" : "active") : "todo";
              return (
                <li key={s.key} className="flex items-center gap-3 text-sm">
                  <span className="w-5 h-5 flex items-center justify-center shrink-0">
                    {state === "done" && <Check className="w-4 h-4 text-emerald-400" />}
                    {state === "active" && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                    {state === "error" && <AlertCircle className="w-4 h-4 text-rose-400" />}
                    {state === "todo" && <span className="w-1.5 h-1.5 rounded-full bg-white/20" />}
                  </span>
                  <span className={state === "todo" ? "text-white/35" : state === "error" ? "text-rose-300" : "text-white/85"}>{s.label}</span>
                </li>
              );
            })}
          </ol>
        )}
        {error && (
          <p className="mt-5 text-sm text-white/60 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 wrap-break-word">{error}</p>
        )}
        {children && <div className="mt-5">{children}</div>}
      </div>
    </div>
  );
}
