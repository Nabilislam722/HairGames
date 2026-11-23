import { useState } from "react";
import { Zap, Loader2, Power } from "lucide-react";
import {
  useGameSession, formatSessionEth, formatTimeLeft, topUpLabel, SESSION_TOP_UPS, SESSION_DEFAULT_TOP_UP, SESSION_DAYS,
} from "@/lib/gameSession";

const LOW_PLAYS = 3;

// The game session, front and center: what it is and a Start button when there's none, its time,
// balance and plays left while it runs. Hidden when game sessions are off.
export function SessionBar() {
  const session = useGameSession();
  const [amount, setAmount] = useState(SESSION_DEFAULT_TOP_UP);
  const [days, setDays] = useState(SESSION_DAYS[0]);
  if (!session.enabled) return null;

  const { status, busy, balance } = session;
  const active = status === "active";
  const expired = status === "expired";
  const low = active && session.playsLeft < LOW_PLAYS;
  const leftover = balance > 0n;
  const disabled = Boolean(busy);
  const spin = (name) => busy === name && <Loader2 size={12} className="spin" />;

  const title = active ? "Game session on" : expired ? "Your session ended" : "Skip wallet popups";
  const tag = active
    ? (low ? <span className="pill" style={{ color: "var(--hg-amber)" }}>Low funds</span> : <span className="pill-lime">Active</span>)
    : expired ? <span className="pill" style={{ color: "var(--hg-red)" }}>Ended</span> : <span className="pill-lime">New</span>;
  const text = active
    ? (low
      ? "Running low. Add funds so a game doesn't stop halfway."
      : "Your games send their transactions with your session key, so there's nothing to confirm.")
    : expired
      ? `Renew to keep playing without popups.${leftover ? ` ${formatSessionEth(balance)} ETH is still on your session key.` : ""}`
      : "Start a session: confirm once in your wallet, then every game plays without popups. End it anytime and the leftover ETH comes back.";

  return (
    <section className={`sb${low ? " low" : ""}${expired ? " expired" : ""}`}>
      <div className="sb-intro">
        <span className="sb-icon"><Zap size={22} fill="currentColor" strokeWidth={0} /></span>
        <div>
          <p className="sb-title">{title} {tag}</p>
          <p className="sb-text">{text}</p>
        </div>
      </div>

      {active && (
        <div className="sb-stats">
          <div>
            <p className="sb-lbl">Time left</p>
            <p className="sb-val">{formatTimeLeft(session.expiresAt - session.now)}</p>
          </div>
          <div>
            <p className="sb-lbl">Balance</p>
            <p className="sb-val">{formatSessionEth(balance)}<small>ETH</small></p>
          </div>
          <div>
            <p className="sb-lbl">Plays left</p>
            <p className="sb-val">≈ {session.playsLeft}</p>
          </div>
        </div>
      )}

      <div className="sb-ctl">
        <select className="hg-select" value={amount} onChange={e => setAmount(e.target.value)} disabled={disabled} aria-label="Amount">
          {SESSION_TOP_UPS.map(v => <option key={v} value={v}>{topUpLabel(v)}</option>)}
        </select>
        {!active && (
          <select className="hg-select" value={days} onChange={e => setDays(Number(e.target.value))} disabled={disabled} aria-label="Length">
            {SESSION_DAYS.map(d => <option key={d} value={d}>{d === 1 ? "1 day" : `${d} days`}</option>)}
          </select>
        )}
        <button
          type="button"
          className="btn btn-g"
          disabled={disabled}
          onClick={() => (active ? session.addFunds(amount) : session.start({ topUpEth: amount, days }))}
        >
          {spin(active ? "fund" : "start")}
          {active ? "Add funds" : expired ? "Renew session" : "Start session"}
        </button>
        {(active || leftover) && (
          <button type="button" className="btn btn-ghost" disabled={disabled} onClick={session.end}>
            {spin("end") || <Power size={12} />} {active ? "End" : "Withdraw"}
          </button>
        )}
      </div>

      {session.error && <p className="sb-err">{session.error}</p>}
    </section>
  );
}
