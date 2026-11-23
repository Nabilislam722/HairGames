// The celebration when a reward is claimed: a ring and a burst of sparks from the button, and the reward
// floating up. Render it inside a positioned parent for about 1.2 s (styles in dashboard.css).
const SPARK_COUNT = 16;
const SPARK_COLORS = ["var(--hg-lime)", "var(--hg-orange)", "#fff"];
const SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1);
  const dist = 64 + (i % 3) * 24;
  return {
    "--dx": `${Math.round(Math.cos(angle) * dist)}px`,
    "--dy": `${Math.round(Math.sin(angle) * dist * 0.85 - 12)}px`,
    "--d": `${(i % 4) * 25}ms`,
    "--c": SPARK_COLORS[i % 3],
    "--s": `${5 + (i % 3) * 2}px`,
  };
});

export function ClaimBurst({ reward }) {
  return (
    <span className="cb" aria-hidden>
      <i className="cb-ring" />
      {SPARKS.map((style, i) => <i key={i} className="cb-spark" style={style} />)}
      <b className="cb-gain">+{reward.toLocaleString()} HP</b>
    </span>
  );
}
