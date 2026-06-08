export function CaseTypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const styles: Record<string, { bg: string; color: string }> = {
    "NSA-case": { bg: "rgba(110,155,255,0.1)", color: "#6e9bff" },
    "Compactstation": { bg: "rgba(63,255,139,0.1)", color: "#dae6ff" },
    "Provisorium": { bg: "rgba(254,179,0,0.1)", color: "#feb300" },
  };
  const s = styles[type] || { bg: "rgba(10,26,48,0.7)", color: "#a0abc3" };
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: s.bg, color: s.color }}>{type}</span>;
}
