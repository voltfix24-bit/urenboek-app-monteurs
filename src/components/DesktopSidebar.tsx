import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import terrevoltLogo from "@/assets/terrevolt-logo.svg";
import {
  LayoutDashboard,
  CheckCircle,
  CalendarDays,
  FolderOpen,
  Users,
  BarChart3,
  Clock,
  Bell,
  User,
  LogOut,
} from "lucide-react";

const managerItems = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/goedkeuring", icon: CheckCircle, label: "Goedkeuring" },
  { path: "/manager-planning", icon: CalendarDays, label: "Planning" },
  { path: "/projecten", icon: FolderOpen, label: "Projecten" },
  { path: "/medewerkers", icon: Users, label: "Team" },
  { path: "/rapportage", icon: BarChart3, label: "Rapportage" },
];

const monteurItems = [
  { path: "/", icon: Clock, label: "Uren" },
  { path: "/planning", icon: CalendarDays, label: "Mijn planning" },
  { path: "/mededelingen", icon: Bell, label: "Mededelingen" },
  { path: "/profiel", icon: User, label: "Profiel" },
];

export function DesktopSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isManager, profile, signOut } = useAuth();

  const items = isManager ? managerItems : monteurItems;

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <aside
      className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-40"
      style={{
        width: 240,
        background: "#EBF0E4",
        borderRight: "1px solid #C5D4B2",
      }}
    >
      {/* Logo */}
      <div className="px-5 py-5">
        <button onClick={() => navigate("/")} className="focus:outline-none">
          <img src={terrevoltLogo} alt="TerreVolt" className="h-8" />
        </button>
        <div className="mt-2">
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
            style={{ background: "#D4E8C2", color: "#2D4A1E" }}
          >
            {isManager ? "Manager" : "Monteur"}
          </span>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 space-y-0.5">
        {items.map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left"
              style={{
                background: active ? "#D4E8C2" : "transparent",
                color: active ? "#2D4A1E" : "#5A7A42",
                fontWeight: active ? 500 : 400,
                borderLeft: active ? "3px solid #4A7C2F" : "3px solid transparent",
              }}
            >
              <Icon className="h-4.5 w-4.5 shrink-0" style={{ width: 18, height: 18 }} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User info */}
      <div className="px-4 py-4 space-y-3" style={{ borderTop: "1px solid #C5D4B2" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: "#4A7C2F", color: "#fff" }}
          >
            {(profile?.full_name || "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate" style={{ color: "#2D4A1E" }}>
              {profile?.full_name || "Gebruiker"}
            </p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium"
          style={{ border: "1px solid #E8A09A", color: "#C0392B", background: "#FDECEA" }}
        >
          <LogOut className="h-3.5 w-3.5" /> Uitloggen
        </button>
      </div>
    </aside>
  );
}