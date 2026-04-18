import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useNavBadges } from "@/hooks/useNavBadges";

interface MobileHeaderProps {
  /** Show brand logo instead of custom title */
  showBrand?: boolean;
  /** Custom title (used when showBrand is false) */
  title?: string;
  /** Extra action buttons to render before the notification bell */
  actions?: ReactNode;
  /** User initials to display in avatar */
  initials?: string;
}

export function MobileHeader({ showBrand = true, title, actions, initials = "U" }: MobileHeaderProps) {
  const navigate = useNavigate();
  const { badges } = useNavBadges();
  const unread = badges.ongelezen;

  return (
    <header
      className="lg:hidden"
      style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(3,14,32,0.9)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
      {showBrand ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="material-symbols-outlined" style={{ color: "#3fff8b", fontSize: 24, fontVariationSettings: "'FILL' 1" }}>bolt</span>
          <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 18, color: "#3fff8b", letterSpacing: "0.1em", textTransform: "uppercase" }}>TERREVOLT UREN</span>
        </div>
      ) : (
        <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 20, color: "#dae6ff" }}>
          {title}
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {actions}
        <button
          onClick={() => navigate("/mededelingen")}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#a0abc3", display: "flex", position: "relative" }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 24 }}>notifications</span>
          {unread > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -4,
              minWidth: 16, height: 16,
              borderRadius: 9999,
              background: "#ff716c",
              border: "2px solid #030e20",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 800, color: "#fff",
              padding: "0 3px",
            }}>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
        <div style={{
          width: 36, height: 36, borderRadius: "50%", background: "#142640",
          border: "1px solid rgba(63,255,139,0.3)", display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "Manrope", fontWeight: 700, fontSize: 13, color: "#3fff8b",
        }}>
          {initials}
        </div>
      </div>
    </header>
  );
}
