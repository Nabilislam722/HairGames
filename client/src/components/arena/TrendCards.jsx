import { ArrowRight, Loader2 } from "lucide-react";
import { formatSessionEth, formatTimeLeft, SESSION_DEFAULT_TOP_UP } from "@/lib/gameSession";

export const TREND_ORANGE = "#ff6b1a";
export const TREND_LIME = "#b8ff3a";

// Smooth line through the points (Catmull-Rom as cubic Béziers) in a 100×40 box.
function smoothPath(points) {
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i - 1] ?? points[i];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const [x3, y3] = points[i + 2] ?? points[i + 1];
    d += ` C${x1 + (x2 - x0) / 6},${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6},${y2 - (y3 - y1) / 6} ${x2},${y2}`;
  }
  return d;
}

function Sparkline({ data, color }) {
  if (!data || data.length < 2) return <div className="sc-spark" />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const points = data.map((v, i) => [(i / (data.length - 1)) * 100, 34 - ((v - min) / (max - min || 1)) * 28]);
  return (
    <div className="sc-spark">
      <svg className="spark" viewBox="0 0 100 40" preserveAspectRatio="none" style={{ "--c": color }} aria-hidden>
        <path d={smoothPath(points)} />
      </svg>
    </div>
  );
}

// A stat with a neon trend line over the last two weeks.
export function TrendCard({ color, label, badge, badgeTone = "flat", value, unit, data, footer }) {
  return (
    <div className="sc" style={{ "--c": color }}>
      <Sparkline data={data} color={color} />
      <p className="sc-lbl">
        {label}
        {badge && <span className={`sc-badge ${badgeTone}`}>{badge}</span>}
      </p>
      <p className="sc-val">{value}{unit && <small>{unit}</small>}</p>
      <div className="sc-foot">{footer}</div>
    </div>
  );
}

// The game session's balance, with its spending trend and a one-click top-up or start.
export function SessionTrendCard({ session, data }) {
  const { status, busy } = session;
  const active = status === "active";
  const amount = SESSION_DEFAULT_TOP_UP;
  const badge = active ? formatTimeLeft(session.expiresAt - session.now) : status === "expired" ? "Ended" : "Off";
  const tone = active ? "up" : status === "expired" ? "down" : "flat";

  return (
    <TrendCard
      color={TREND_LIME}
      label="Session funds"
      badge={badge}
      badgeTone={tone}
      value={formatSessionEth(session.balance)}
      unit="ETH"
      data={data}
      footer={(
        <button
          type="button"
          className="sc-link"
          disabled={Boolean(busy)}
          onClick={() => (active ? session.addFunds(amount) : session.start({ topUpEth: amount, days: 1 }))}
        >
          {busy ? <Loader2 size={12} className="spin" /> : null}
          {active ? `Add ${amount} ETH` : status === "expired" ? "Renew session" : "Start session"} <ArrowRight size={12} />
        </button>
      )}
    />
  );
}
