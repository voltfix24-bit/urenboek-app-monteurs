export function NavBadge({ count, dot }: { count?: number; dot?: boolean }) {
  if (dot && !count) {
    return null;
  }
  if (count !== undefined && count <= 0) return null;
  if (dot) {
    return (
      <span
        className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full animate-pulse"
        style={{ background: "#D4A017" }}
      />
    );
  }
  return (
    <span
      className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full text-white text-[9px] font-bold px-1"
      style={{ background: "#C0392B", animation: "badgePulse 0.3s ease" }}
    >
      {count! > 9 ? "9+" : count}
    </span>
  );
}
