import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface RolPermissies {
  zietDashboard: boolean;
  zietUren: boolean;
  zietAlleUren: boolean;
  zietGoedkeuring: boolean;
  zietOveruren: boolean;
  zietPlanning: boolean;
  zietManagerPlanning: boolean;
  zietProjecten: boolean;
  zietProjectFinancien: boolean;
  zietRapportage: boolean;
  zietTeam: boolean;
  zietMededelingen: boolean;
  zietProfiel: boolean;
  zietInkooporders: boolean;
  zietAlleInkooporders: boolean;
  zietBeheer: boolean;
  magPlanningWijzigen: boolean;
  magUrenGoedkeuren: boolean;
  magProjectenWijzigen: boolean;
  magTeamBeheren: boolean;
  magMededelingenVersturen: boolean;
}

const PERMISSIES: Record<string, RolPermissies> = {
  manager: {
    zietDashboard: true, zietUren: true, zietAlleUren: true, zietGoedkeuring: true,
    zietOveruren: true, zietPlanning: true, zietManagerPlanning: true, zietProjecten: true,
    zietProjectFinancien: true, zietRapportage: true, zietTeam: true, zietMededelingen: true,
    zietProfiel: true, zietInkooporders: true, zietAlleInkooporders: true, zietBeheer: true,
    magPlanningWijzigen: true, magUrenGoedkeuren: true, magProjectenWijzigen: true,
    magTeamBeheren: true, magMededelingenVersturen: true,
  },
  uitvoerder: {
    zietDashboard: true, zietUren: true, zietAlleUren: false, zietGoedkeuring: false,
    zietOveruren: false, zietPlanning: true, zietManagerPlanning: true, zietProjecten: true,
    zietProjectFinancien: false, zietRapportage: false, zietTeam: false, zietMededelingen: true,
    zietProfiel: true, zietInkooporders: true, zietAlleInkooporders: false, zietBeheer: false,
    magPlanningWijzigen: true, magUrenGoedkeuren: false, magProjectenWijzigen: false,
    magTeamBeheren: false, magMededelingenVersturen: false,
  },
  wv: {
    zietDashboard: true, zietUren: true, zietAlleUren: false, zietGoedkeuring: false,
    zietOveruren: false, zietPlanning: true, zietManagerPlanning: true, zietProjecten: true,
    zietProjectFinancien: false, zietRapportage: false, zietTeam: false, zietMededelingen: true,
    zietProfiel: true, zietInkooporders: true, zietAlleInkooporders: false, zietBeheer: false,
    magPlanningWijzigen: true, magUrenGoedkeuren: false, magProjectenWijzigen: false,
    magTeamBeheren: false, magMededelingenVersturen: false,
  },
  monteur: {
    zietDashboard: false, zietUren: true, zietAlleUren: false, zietGoedkeuring: false,
    zietOveruren: false, zietPlanning: true, zietManagerPlanning: false, zietProjecten: false,
    zietProjectFinancien: false, zietRapportage: false, zietTeam: false, zietMededelingen: true,
    zietProfiel: true, zietInkooporders: true, zietAlleInkooporders: false, zietBeheer: false,
    magPlanningWijzigen: false, magUrenGoedkeuren: false, magProjectenWijzigen: false,
    magTeamBeheren: false, magMededelingenVersturen: false,
  },
  schakelmonteur: {
    zietDashboard: false, zietUren: true, zietAlleUren: false, zietGoedkeuring: false,
    zietOveruren: false, zietPlanning: true, zietManagerPlanning: false, zietProjecten: false,
    zietProjectFinancien: false, zietRapportage: false, zietTeam: false, zietMededelingen: true,
    zietProfiel: true, zietInkooporders: true, zietAlleInkooporders: false, zietBeheer: false,
    magPlanningWijzigen: false, magUrenGoedkeuren: false, magProjectenWijzigen: false,
    magTeamBeheren: false, magMededelingenVersturen: false,
  },
};

function getPermissies(roles: string[]): RolPermissies {
  if (roles.includes("manager")) return PERMISSIES.manager;
  if (roles.includes("uitvoerder")) return PERMISSIES.uitvoerder;
  if (roles.includes("wv")) return PERMISSIES.wv;
  if (roles.includes("schakelmonteur")) return PERMISSIES.schakelmonteur;
  return PERMISSIES.monteur;
}

function getRolLabel(roles: string[]): string {
  if (roles.includes("manager")) return "Manager";
  if (roles.includes("uitvoerder")) return "Uitvoerder";
  if (roles.includes("wv")) return "Werkvoorbereider";
  if (roles.includes("schakelmonteur")) return "Schakelmonteur";
  return "Monteur";
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: { full_name: string } | null;
  roles: string[];
  isManager: boolean;
  isUitvoerder: boolean;
  canManagePlanning: boolean;
  permissies: RolPermissies;
  rolLabel: string;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null, user: null, profile: null, roles: [],
  isManager: false, isUitvoerder: false, canManagePlanning: false,
  permissies: PERMISSIES.monteur, rolLabel: "Monteur",
  loading: true, signOut: async () => {},
});

export const DEV_MODE = false;

export interface DevUser { id: string; label: string; role: string; fullName: string; }

export const DEV_USERS: DevUser[] = [
  { id: "dev-manager", label: "Manager", role: "manager", fullName: "Dev Manager" },
  { id: "dev-uitvoerder", label: "Uitvoerder", role: "uitvoerder", fullName: "Dev Uitvoerder" },
  { id: "dev-monteur", label: "Monteur", role: "monteur", fullName: "Dev Monteur" },
  { id: "dev-schakelmonteur", label: "Schakelmonteur", role: "schakelmonteur", fullName: "Dev Schakelmonteur" },
  { id: "dev-wv", label: "Werkvoorbereider", role: "wv", fullName: "Dev Werkvoorbereider" },
];

function getStoredDevUser(): DevUser | null {
  if (!DEV_MODE) return null;
  const stored = localStorage.getItem("dev_active_user");
  if (!stored) return null;
  try { return JSON.parse(stored); } catch { return null; }
}

export function setDevUser(user: DevUser | null) {
  if (user) localStorage.setItem("dev_active_user", JSON.stringify(user));
  else localStorage.removeItem("dev_active_user");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const storedDev = getStoredDevUser();
  const [session, setSession] = useState<Session | null>(
    storedDev ? ({ user: { id: storedDev.id, email: `${storedDev.id}@dev.local` } } as Session) : null
  );
  const [user, setUser] = useState<User | null>(
    storedDev ? ({ id: storedDev.id, email: `${storedDev.id}@dev.local` } as User) : null
  );
  const [profile, setProfile] = useState<{ full_name: string } | null>(
    storedDev ? { full_name: storedDev.fullName } : null
  );
  const [roles, setRoles] = useState<string[]>(storedDev ? [storedDev.role] : []);
  const [loading, setLoading] = useState(!DEV_MODE);

  useEffect(() => {
    if (DEV_MODE) { setLoading(false); return; }
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(async () => {
          const { data: profileData } = await supabase.from("profiles").select("full_name").eq("user_id", session.user.id).single();
          setProfile(profileData);
          const { data: rolesData } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id);
          setRoles(rolesData?.map((r) => r.role) ?? []);
          setLoading(false);
        }, 0);
      } else {
        setProfile(null); setRoles([]); setLoading(false);
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => { if (!session) setLoading(false); });
    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (DEV_MODE) { setDevUser(null); setSession(null); setUser(null); setProfile(null); setRoles([]); return; }
    await supabase.auth.signOut();
  };

  const permissies = useMemo(() => getPermissies(roles), [roles]);
  const rolLabel = useMemo(() => getRolLabel(roles), [roles]);
  const isManager = roles.includes("manager");
  const isUitvoerder = roles.includes("uitvoerder") || roles.includes("wv");
  const canManagePlanning = isManager || roles.includes("uitvoerder") || roles.includes("wv");

  return (
    <AuthContext.Provider value={{ session, user, profile, roles, isManager, isUitvoerder, canManagePlanning, permissies, rolLabel, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
