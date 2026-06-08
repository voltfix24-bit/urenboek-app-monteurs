export function CaseTypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const styles: Record<string, { bg: string; color: string }> = {
    "NSA-case": { bg: "rgba(110,155,255,0.1)", color: "var(--info)" },
    "Compactstation": { bg: "var(--accent-light)", color: "var(--text-primary)" },
    "Provisorium": { bg: "var(--warn-light)", color: "var(--warn-text)" },
  };
  const s = styles[type] || { bg: "var(--bg-surface)", color: "var(--text-muted)" };
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: s.bg, color: s.color }}>{type}</span>;
}
