// Deterministic string hash + seeded PRNG — no crypto needed, just needs to
// produce the same pattern for the same address every time.
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic, symmetric pixel-pattern identicon generated from the
// wallet address — same wallet always renders the same pattern, no image
// upload or external avatar service needed.
export function AddressAvatar({ address, className = "" }) {
  const size = 96;
  const grid = 6;
  const cell = size / grid;
  const rand = mulberry32(hashCode((address || "").toLowerCase()));
  const hue = Math.floor(rand() * 360);
  const bg = `hsl(${hue}, 60%, 15%)`;
  const fg = `hsl(${(hue + 45) % 360}, 78%, 58%)`;

  const half = Math.ceil(grid / 2);
  const cells = [];
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < half; x++) {
      if (rand() > 0.58) {
        cells.push([x, y]);
        const mirrorX = grid - 1 - x;
        if (mirrorX !== x) cells.push([mirrorX, y]);
      }
    }
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" className={className} aria-hidden="true">
      <rect width={size} height={size} fill={bg} />
      {cells.map(([x, y], i) => (
        <rect key={i} x={x * cell} y={y * cell} width={cell} height={cell} fill={fg} />
      ))}
    </svg>
  );
}

export const shortAddress = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
