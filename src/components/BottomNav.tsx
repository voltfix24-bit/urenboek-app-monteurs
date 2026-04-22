import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { NavBadges } from "@/hooks/useNavBadges";
import { NavBadge } from "./NavBadge";
import { CheckCircle, CalendarDays, Bell, User, LayoutDashboard, FolderOpen, FileText, Users, type LucideIcon } from "lucide-react";

interface TabDef {
  key: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
  dot?: boolean;
}

interface BottomNavProps {
  badges: NavBadges;
}

export function BottomNav({ badges }: BottomNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { permissies, isManager, isUitvoerder } = useAuth();

  const monteurTabs: TabDef[] = [
    { key: "/planning", icon: CalendarDays, label: "Planning", badge: badges.afgekeurdeUren },
    { key: "/mijn-orders", icon: FileText, label: "Orders", badge: badges.nieuweOrders },
    { key: "/mededelingen", icon: Bell, label: "Berichten", badge: badges.ongelezen },
    { key: "/profiel", icon: User, label: "Profiel" },
  ];

  const uitvoerderTabs: TabDef[] = [
    { key: "/dashboard", icon: LayoutDashboard, label: "Overzicht" },
    { key: "/manager-planning", icon: CalendarDays, label: "Planning" },
    { key: "/projecten", icon: FolderOpen, label: "Projecten" },
    { key: "/mededelingen", icon: Bell, label: "Berichten", badge: badges.ongelezen },
    { key: "/profiel", icon: User, label: "Profiel" },
  ];

  const managerTabs: TabDef[] = [
    { key: "/dashboard", icon: LayoutDashboard, label: "Overzicht" },
    { key: "/goedkeuring", icon: CheckCircle, label: "Keuren", badge: badges.openGoedkeuringen },
    { key: "/manager-planning", icon: CalendarDays, label: "Planning" },
    { key: "/medewerkers", icon: Users, label: "Monteurs" },
    { key: "/projecten", icon: FolderOpen, label: "Projecten" },
  ];

  const tabs = isManager ? managerTabs : isUitvoerder ? uitvoerderTabs : monteurTabs;

  const isActive = (key: string) => {
    if (key === "/") return location.pathname === "/";
    return location.pathname.startsWith(key);
  };

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        right: 0,
        width: "100%",
        maxWidth: 430,
        height: `calc(72px + env(safe-area-inset-bottom, 34px))`,
        background: "rgba(3,14,32,0.9)",
        backdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        borderRadius: "24px 24px 0 0",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
        paddingBottom: "env(safe-area-inset-bottom, 34px)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
      }}
      className="lg:hidden"
    >
      {tabs.map((t) => {
        const active = isActive(t.key);
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            onClick={() => navigate(t.key)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              padding: "6px 4px",
              border: "none",
              cursor: "pointer",
              background: active ? "rgba(63,255,139,0.15)" : "transparent",
              borderRadius: active ? 16 : 0,
              boxShadow: active ? "0 0 15px rgba(63,255,139,0.2)" : "none",
              transition: "all 0.15s",
              position: "relative",
            }}
          >
            <span style={{ position: "relative" }}>
              <Icon
                size={active ? 22 : 20}
                style={{
                  color: active ? "#3fff8b" : "rgba(218,230,255,0.5)",
                  transition: "all 0.15s",
                }}
              />
              {(t.badge ?? 0) > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -4,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 9999,
                    background: "#ff716c",
                    border: "2px solid var(--app-navy)",
                    fontSize: 9,
                    fontWeight: 700,
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 3px",
                  }}
                >
                  {t.badge}
                </span>
              )}
              {t.dot && (
                <span
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -4,
                    width: 8,
                    height: 8,
                    borderRadius: 9999,
                    background: "#ff716c",
                    border: "2px solid var(--app-navy)",
                  }}
                />
              )}
            </span>
            <span
              style={{
                fontSize: 9,
                fontWeight: active ? 700 : 600,
                fontFamily: "Inter",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: active ? "#3fff8b" : "rgba(218,230,255,0.5)",
              }}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
