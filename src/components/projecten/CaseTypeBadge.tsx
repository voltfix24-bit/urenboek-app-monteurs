export function CaseTypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const styles: Record<string, { bg: string; color: string }> = {
    "NSA-case": { bg: "rgba(110,155,255,0.1)", color: "#6e9bff" },
    "Compactstation": { bg: "#ecfdf5", color: "#1f2937" },
    "Provisorium": { bg: "rgba(254,179,0,0.1)", color: "#d97706" },
  };
  const s = styles[type] || { bg: "#ffffff", color: "#6b7280" };
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: s.bg, color: s.color }}>{type}</span>;
}
