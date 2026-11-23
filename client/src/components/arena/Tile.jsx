// A stat tile: label with icon, big value, short note. `color` tints the icon and glow.
export function Tile({ icon: Icon, color, label, value, unit, note }) {
  return (
    <div className="tile" style={color ? { "--c": color } : undefined}>
      <p className="tile-lbl">{Icon && <Icon size={14} />}{label}</p>
      <p className="tile-val">{value}{unit && <small>{unit}</small>}</p>
      {note && <p className="tile-note">{note}</p>}
    </div>
  );
}
