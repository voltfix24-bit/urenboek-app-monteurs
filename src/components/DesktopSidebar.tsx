import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth, type RolPermissies } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import type { NavBadges } from "@/hooks/useNavBadges";
import { NavBadge } from "./NavBadge";
import { GlobalSearch } from "./GlobalSearch";
import terrevoltLogo from "@/assets/terrevolt-logo.svg";
import {
  LayoutDashboard, CheckCircle, CalendarDays, FolderOpen, Users,
  BarChart3, Bell, LogOut, Search, AlertTriangle, Receipt,
  Building2, Cpu, Euro, UserPlus, type LucideIcon,
} from "lucide-react";

interface NavItem {
  path: string;
  icon: LucideIcon;
  label: string;
  badgeKey?: keyof NavBadges;
}

interface NavGroep {
  label: string;
  items: NavItem[];
}

const MANAGER_GROEPEN: NavGroep[] = [
  {
    label: "Overzicht",
    items: [
      { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard", badgeKey: "verlofAanvragen" },
      { path: "/mededelingen", icon: Bell, label: "Berichten", badgeKey: "ongelezen" },
    ],
  },
  {
    label: "Planning",
    items: [
      { path: "/manager-planning", icon: CalendarDays, label: "Weekplanning" },
      { path: "/projecten", icon: FolderOpen, label: "Projecten" },
      { path: "/opdrachtgevers", icon: Building2, label: "Opdrachtgevers" },
    ],
  },
  {
    label: "Uren",
    items: [
      { path: "/goedkeuring", icon: CheckCircle, label: "Goedkeuring", badgeKey: "openGoedkeuringen" },
      { path: "/overuren", icon: AlertTriangle, label: "Overuren", badgeKey: "openOveruren" },
      { path: "/rapportage", icon: BarChart3, label: "Rapportage" },
    ],
  },
  {
    label: "Financiën",
    items: [
      { path: "/inkooporders", icon: Receipt, label: "Inkooporders", badgeKey: "openOrders" },
      { path: "/beheer/tarieven", icon: Euro, label: "Tarieven" },
    ],
  },
  {
    label: "Team",
    items: [
      { path: "/medewerkers", icon: Users, label: "Medewerkers", badgeKey: "verificatieNodig" },
      { path: "/onderaannemers", icon: Building2, label: "Onderaannemers" },
      { path: "/kandidaten", icon: UserPlus, label: "Kandidaten" },
    ],
  },
];

const BEHEER_ITEMS: NavItem[] = [
  { path: "/beheer/intake-regels", icon: Cpu, label: "Intake-instellingen" },
  { path: "/beheer/bedrijf", icon: Building2, label: "Bedrijfsgegevens" },
];

const PATH_PERMISSION_MAP: Record<string, keyof RolPermissies> = {
  "/dashboard": "zietDashboard",
  "/mededelingen": "zietMededelingen",
  "/goedkeuring": "zietGoedkeuring",
  "/overuren": "zietOveruren",
  "/rapportage": "zietRapportage",
  "/inkooporders": "zietAlleInkooporders",
  "/beheer/tarieven": "zietBeheer",
  "/manager-planning": "zietManagerPlanning",
  "/projecten": "zietProjecten",
  "/opdrachtgevers": "magTeamBeheren",
  "/medewerkers": "zietTeam",
  "/onderaannemers": "zietTeam",
  "/kandidaten": "zietKandidaten",
  "/beheer/intake-regels": "zietBeheer",
  "/beheer/bedrijf": "zietBeheer",
};

function isItemZichtbaar(path: string, p: RolPermissies): boolean {
  const key = PATH_PERMISSION_MAP[path];
  return key ? !!p[key] : false;
}

interface DesktopSidebarProps {
  badges: NavBadges;
}

export function DesktopSidebar({ badges }: DesktopSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { permissies, rolLabel, signOut } = useAuth();
  const { profile: profileCtx } = useProfile();
  const [showSearch, setShowSearch] = useState(false);
  const displayName = profileCtx?.full_name || "Gebruiker";

  const zichtbareGroepen = MANAGER_GROEPEN
    .map(groep => ({ ...groep, items: groep.items.filter(item => isItemZichtbaar(item.path, permissies)) }))
    .filter(groep => groep.items.length > 0);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setShowSearch(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const getBadgeCount = (item: NavItem): number => {
    if (!item.badgeKey) return 0;
    if (item.badgeKey === "verlofAanvragen") return 0;
    return (badges as any)[item.badgeKey] || 0;
  };

  const hasDot = (item: NavItem): boolean => {
    return item.badgeKey === "verlofAanvragen" && badges.verlofAanvragen > 0;
  };

  return (
    <>
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-40" style={{ width: 240, background: "var(--sidebar-shell-bg)", borderRight: "1px solid var(--sidebar-shell-border)" }}>
        {/* Top section — always visible */}
        <div className="shrink-0 px-5 py-5">
          <button onClick={() => navigate(permissies.zietDashboard ? "/dashboard" : "/")} className="focus:outline-none">
            <img src={terrevoltLogo} alt="TerreVolt" className="h-8" style={{ filter: "brightness(1.05) contrast(1.05)" }} />
          </button>
          <div className="mt-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "var(--sidebar-shell-subtle-bg)", color: "var(--sidebar-shell-fg)" }}>
              {rolLabel}
            </span>
          </div>
        </div>

        {/* Search button */}
        <div className="shrink-0 px-3 pb-2">
          <button onClick={() => setShowSearch(true)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors" style={{ background: "#ffffff", border: "1px solid #e5e7eb", color: "#6c7a71" }}>
            <Search className="h-4 w-4" />
            <span className="text-xs">Zoeken...</span>
            <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "#eff4ff", color: "#3c4a42" }}>Ctrl K</span>
          </button>
        </div>

        {/* Scrollable menu area */}
        <div className="flex-1 overflow-y-auto px-3">
          {zichtbareGroepen.map((groep, gi) => (
            <div key={groep.label}>
              {gi > 0 && <div className="my-1.5" style={{ borderTop: "1px solid var(--sidebar-shell-border)" }} />}
              <p className="text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 mt-1" style={{ color: "#c5cbd3" }}>
                {groep.label}
              </p>
              {groep.items.map(item => {
                const active = isActive(item.path);
                const Icon = item.icon;
                const badgeCount = getBadgeCount(item);
                const isDot = hasDot(item);
                return (
                  <button key={item.path} onClick={() => navigate(item.path)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left"
                    style={{
                      background: active ? "var(--sidebar-shell-active-bg)" : "transparent",
                      color: active ? "var(--sidebar-shell-active-fg)" : "var(--sidebar-shell-muted)",
                      fontWeight: active ? 600 : 400,
                    }}>
                    <span className="relative shrink-0">
                      <Icon style={{ width: 18, height: 18 }} />
                      {badgeCount > 0 && <NavBadge count={badgeCount} />}
                      {isDot && <NavBadge count={1} dot />}
                    </span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}

          {/* Beheer section inside scrollable area */}
          {permissies.zietBeheer && (
            <div className="mt-1">
              <div className="my-1.5" style={{ borderTop: "1px solid var(--sidebar-shell-border)" }} />
              <p className="text-[10px] uppercase tracking-wider font-bold px-3 py-1.5" style={{ color: "#c5cbd3" }}>Beheer</p>
              {BEHEER_ITEMS.filter(item => isItemZichtbaar(item.path, permissies)).map(item => (
                <button key={item.path} onClick={() => navigate(item.path)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors text-left"
                  style={{
                    background: isActive(item.path) ? "var(--sidebar-shell-active-bg)" : "transparent",
                    color: isActive(item.path) ? "var(--sidebar-shell-active-fg)" : "var(--sidebar-shell-muted)",
                  }}>
                  <item.icon style={{ width: 14, height: 14 }} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom profile + logout — always visible */}
        <div className="shrink-0 px-4 py-4 space-y-3" style={{ borderTop: "1px solid var(--sidebar-shell-border)" }}>
          <button
            onClick={() => navigate("/profiel")}
            className="w-full flex items-center gap-2.5 px-1 py-1 rounded-lg transition-colors hover:bg-white/5 text-left"
            title="Naar profiel"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "var(--sidebar-shell-active-bg)", color: "var(--sidebar-shell-active-fg)" }}>
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate" style={{ color: "var(--sidebar-shell-fg)" }}>{displayName}</p>
              <p className="text-[10px] truncate" style={{ color: "var(--sidebar-shell-muted)" }}>Mijn profiel</p>
            </div>
          </button>
          <button onClick={signOut} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium" style={{ border: "1px solid var(--danger-border)", color: "var(--danger)", background: "var(--danger-light)" }}>
            <LogOut className="h-3.5 w-3.5" /> Uitloggen
          </button>
        </div>
      </aside>
      {showSearch && <GlobalSearch onClose={() => setShowSearch(false)} />}
    </>
  );
}
