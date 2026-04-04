import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Clock, CheckCircle, BarChart3, Users, LogOut } from "lucide-react";

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isManager, signOut } = useAuth();

  const tabs = [
    { key: "/", icon: Clock, label: "Uren" },
    ...(isManager
      ? [
          { key: "/goedkeuring", icon: CheckCircle, label: "Keuren" },
          { key: "/rapportage", icon: BarChart3, label: "Rapport" },
          { key: "/medewerkers", icon: Users, label: "Team" },
        ]
      : []),
  ];

  const isActive = (key: string) => {
    if (key === "/") return location.pathname === "/";
    return location.pathname.startsWith(key);
  };

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 w-full sm:hidden"
      style={{
        maxWidth: 430,
        background: "rgba(10,10,15,0.95)",
        backdropFilter: "blur(16px)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
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
              className="flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors"
              style={{ background: "none", color: active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-semibold">{t.label}</span>
            </button>
          );
        })}
        <button
          onClick={signOut}
          className="flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors"
          style={{ background: "none", color: "hsl(var(--muted-foreground))" }}
        >
          <LogOut className="h-5 w-5" />
          <span className="text-[10px] font-semibold">Uit</span>
        </button>
      </div>
    </nav>
  );
}
