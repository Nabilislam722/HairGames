// The title block at the top of a page.
export function PageHead({ eyebrow, title, accent, sub, children }) {
  return (
    <header className="ph">
      <div>
        {eyebrow && <p className="ph-eyebrow">{eyebrow}</p>}
        <h1 className="ph-title">{title}{accent && <> <em>{accent}</em></>}</h1>
        {sub && <p className="ph-sub">{sub}</p>}
      </div>
      {children && <div className="ph-tools">{children}</div>}
    </header>
  );
}

// Two or three exclusive choices as one pill, the selected one filled orange.
export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segc" role="tablist" aria-label={label}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={value === o.value ? "on" : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// A number with its last group dimmed, like 182,400 or 1.20.
export function DimNumber({ text }) {
  const cut = Math.max(text.lastIndexOf(","), text.lastIndexOf("."));
  if (cut <= 0) return text;
  return <>{text.slice(0, cut)}<span className="dim">{text.slice(cut)}</span></>;
}

// A section's title row, with an optional count and tools on the right.
export function SectionHead({ id, title, count, children }) {
  return (
    <div className="sh" id={id}>
      <h2 className="sh-title">
        {title}
        {count != null && <span className="sh-count">{count}</span>}
      </h2>
      {children && <div className="sh-tools">{children}</div>}
    </div>
  );
}
