// A rank's emblem (LEVELS[].badge). It's decorative where the rank's name is shown beside it;
// pass `labelled` where it stands alone, so it gets alt text.
export function RankBadge({ level, size = 48, labelled = false, className = "" }) {
  return (
    <img
      src={level.badge}
      alt={labelled ? `${level.title} rank` : ""}
      title={labelled ? level.title : undefined}
      width={size}
      height={size}
      className={`rank-badge ${className}`}
      draggable={false}
    />
  );
}
