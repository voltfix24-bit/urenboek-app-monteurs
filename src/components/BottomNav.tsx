import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useNavBadges } from "@/hooks/useNavBadges";
import { NavBadge } from "./NavBadge";
import { Clock, CheckCircle, BarChart3, Users, CalendarDays, Bell, User, LayoutDashboard } from "lucide-react";

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isManager } = useAuth();
  const { badges } = useNavBadges();

  const monteurTabs = [
    { key: "/", icon: Clock, label: "Uren", badge: badges.afgekeurdeUren },
    { key: "/planning", icon: CalendarDays, label: "Planning" },
    { key: "/mededelingen", icon: Bell, label: "Berichten", badge: badges.ongelezen },
    { key: "/profiel", icon: User, label: "Profiel" },
  ];

  const managerTabs = [
    { key: "/dashboard", icon: LayoutDashboard, label: "Dashboard", dot: badges.verlofAanvragen > 0 },
    { key: "/goedkeuring", icon: CheckCircle, label: "Keuren", badge: badges.openGoedkeuringen },
    { key: "/manager-planning", icon: CalendarDays, label: "Planning" },
    { key: "/medewerkers", icon: Users, label: "Team" },
    { key: "/rapportage", icon: BarChart3, label: "Rapport" },
  ];

  const tabs = isManager ? managerTabs : monteurTabs;

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
        {tabs.map((t: any) => {
          const active = isActive(t.key);
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => navigate(t.key)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors"
              style={{
                background: "none",
                color: active ? "var(--accent)" : "var(--text-muted)",
                borderTop: active ? "2px solid #4A7C2F" : "2px solid transparent",
              }}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                {t.badge > 0 && <NavBadge count={t.badge} />}
                {t.dot && <NavBadge count={1} dot />}
              </span>
              <span className="text-[10px] font-semibold">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
