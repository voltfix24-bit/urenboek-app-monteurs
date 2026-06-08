import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useNavBadges } from "@/hooks/useNavBadges";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";

interface MobileHeaderProps {
  /** Show brand logo instead of custom title */
  showBrand?: boolean;
  /** Custom title (used when showBrand is false) */
  title?: string;
  /** Extra action buttons to render before the notification bell */
  actions?: ReactNode;
  /** Override user initials. If omitted, derived from logged-in profile/email. */
  initials?: string;
}

function deriveInitials(fullName?: string | null, email?: string | null): string {
  const name = (fullName || "").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const init = parts.slice(0, 2).map((p) => p[0]).join("");
    if (init) return init.toUpperCase();
  }
  if (email) return email.charAt(0).toUpperCase();
  return "U";
}

export function MobileHeader({ showBrand = true, title, actions, initials }: MobileHeaderProps) {
  const navigate = useNavigate();
  const { badges } = useNavBadges();
  const { profile } = useProfile();
  const { user } = useAuth();
  const unread = badges.ongelezen;

  const computedInitials = initials ?? deriveInitials(profile?.full_name, user?.email);
  const profileLabel = profile?.full_name || user?.email || "Profiel";

  return (
    <header
      className="lg:hidden"
      style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(3,14,32,0.9)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        paddingTop: "calc(12px + env(safe-area-inset-top, 44px))",
        paddingBottom: 12,
        paddingLeft: "calc(20px + env(safe-area-inset-left, 0px))",
        paddingRight: "calc(20px + env(safe-area-inset-right, 0px))",
        display: "flex", alignItems: "center", justifyContent: "space-between",
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
          type="button"
          onClick={() => navigate("/mededelingen")}
          aria-label="Mededelingen"
          style={{ background: "none", border: "none", cursor: "pointer", color: "#a0abc3", display: "flex", position: "relative" }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 24 }}>notifications</span>
          {unread > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -4,
              minWidth: 16, height: 16,
              borderRadius: 9999,
              background: "#ff716c",
              border: "2px solid var(--app-navy)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 800, color: "#fff",
              padding: "0 3px",
            }}>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => navigate("/profiel")}
          aria-label={`Profiel openen — ${profileLabel}`}
          title={profileLabel}
          style={{
            width: 36, height: 36, borderRadius: "50%", background: "#142640",
            border: "1px solid rgba(63,255,139,0.3)", display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "Manrope", fontWeight: 700, fontSize: 13, color: "#3fff8b",
            cursor: "pointer", padding: 0,
          }}
        >
          {computedInitials}
        </button>
      </div>
    </header>
  );
}
