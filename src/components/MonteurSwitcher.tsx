import { useActiveMedewerker } from "@/hooks/useActiveMedewerker";
import { Users, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export function MonteurSwitcher() {
  const { isOnderaannemer, team, activeLid, setActiveProfileId } = useActiveMedewerker();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!isOnderaannemer || team.length <= 1 || !activeLid) return null;

  return (
    <div ref={ref} style={{ position: "relative", margin: "0 20px 12px", zIndex: 40 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px", borderRadius: 14,
          background: "linear-gradient(135deg, #ecfdf5, #ecfdf5)",
          border: "1px solid #d1fae5", cursor: "pointer", color: "#1f2937",
        }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: "#ecfdf5", display: "flex",
          alignItems: "center", justifyContent: "center",
        }}>
          <Users size={16} color="#10b981" />
        </div>
        <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#10b981", letterSpacing: "0.15em", textTransform: "uppercase" }}>
            Werk je namens
          </p>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {activeLid.full_name}
          </p>
        </div>
        <ChevronDown size={18} color="#6b7280" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
          background: "#ffffff", border: "1px solid #e5e7eb",
          borderRadius: 14, padding: 6, boxShadow: "0 10px 30px rgba(15,23,42,0.12)",
          maxHeight: 320, overflowY: "auto",
        }}>
          {team.map((t) => {
            const active = t.id === activeLid.id;
            return (
              <button
                key={t.id}
                onClick={() => { setActiveProfileId(t.id); setOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: active ? "#ecfdf5" : "transparent",
                  color: active ? "#10b981" : "#1f2937", textAlign: "left",
                  fontSize: 14, fontWeight: active ? 700 : 500,
                }}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: active ? "#10b981" : "#e5e7eb",
                  color: active ? "#047857" : "#1f2937",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700,
                }}>
                  {t.full_name.charAt(0).toUpperCase()}
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.full_name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
