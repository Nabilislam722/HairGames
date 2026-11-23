// Segmented progress bar: `value` out of `max`, drawn as `segments` blocks. The block in progress fills
// partway, so small progress still shows. `short` keeps blocks short instead of filling the width.
export function SegBar({ value, max = 100, segments = 10, color, short = false, label }) {
  const filled = max > 0 ? Math.min(1, Math.max(0, value / max)) * segments : 0;
  return (
    <span
      className={`seg${short ? " seg-short" : ""}`}
      style={color ? { "--seg": color } : undefined}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
    >
      {Array.from({ length: segments }, (_, i) => {
        const fill = Math.min(1, Math.max(0, filled - i));
        return <i key={i}>{fill > 0 && <b style={{ width: `${fill * 100}%` }} />}</i>;
      })}
    </span>
  );
}
