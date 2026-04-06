import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { NavBadges } from "@/hooks/useNavBadges";
import { NavBadge } from "./NavBadge";
import { Clock, CheckCircle, CalendarDays, Bell, User, LayoutDashboard, FolderOpen, FileText, type LucideIcon } from "lucide-react";

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
    { key: "/", icon: Clock, label: "Uren", badge: badges.afgekeurdeUren },
    { key: "/planning", icon: CalendarDays, label: "Planning" },
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
    { key: "/dashboard", icon: LayoutDashboard, label: "Dashboard", dot: badges.verlofAanvragen > 0 },
    { key: "/goedkeuring", icon: CheckCircle, label: "Keuren", badge: badges.openGoedkeuringen },
    { key: "/manager-planning", icon: CalendarDays, label: "Planning" },
    { key: "/projecten", icon: FolderOpen, label: "Projecten" },
    { key: "/mededelingen", icon: Bell, label: "Berichten", badge: badges.ongelezen },
  ];

  const tabs = isManager ? managerTabs : isUitvoerder ? uitvoerderTabs : monteurTabs;

  const isActive = (key: string) => {
    if (key === "/") return location.pathname === "/";
    return location.pathname.startsWith(key);
  };

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 w-full lg:hidden"
      style={{
        maxWidth: 430,
        background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)",
        backdropFilter: "blur(16px)",
        borderTop: "1px solid var(--border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex items-center">
        {tabs.map((t) => {
          const active = isActive(t.key);
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => navigate(t.key)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors"
              style={{ background: "none" }}
            >
              <div
                className="flex items-center justify-center transition-all"
                style={{
                  width: 44, height: 28, borderRadius: 14,
                  background: active ? "var(--accent-light)" : "transparent",
                }}
              >
                <span className="relative">
                  <Icon style={{
                    width: active ? 22 : 20, height: active ? 22 : 20,
                    color: active ? "var(--accent)" : "var(--text-muted)",
                    transition: "all 0.15s",
                  }} />
                  {(t.badge ?? 0) > 0 && <NavBadge count={t.badge!} />}
                  {t.dot && <NavBadge count={1} dot />}
                </span>
              </div>
              <span style={{
                fontSize: 10,
                color: active ? "var(--accent)" : "var(--text-muted)",
                fontWeight: active ? 700 : 400,
                marginTop: 2,
              }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
