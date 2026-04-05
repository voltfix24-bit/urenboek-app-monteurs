import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: { full_name: string } | null;
  roles: string[];
  isManager: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  roles: [],
  isManager: false,
  loading: true,
  signOut: async () => {},
});

// ============================================
// DEV MODE: set to true to skip real auth
// and use a role-picker instead of login
// ============================================
export const DEV_MODE = false;

export interface DevUser {
  id: string;
  label: string;
  role: string;
  fullName: string;
}

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
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function setDevUser(user: DevUser | null) {
  if (user) {
    localStorage.setItem("dev_active_user", JSON.stringify(user));
  } else {
    localStorage.removeItem("dev_active_user");
  }
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
    if (DEV_MODE) {
      setLoading(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(async () => {
            const { data: profileData } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("user_id", session.user.id)
              .single();
            setProfile(profileData);

            const { data: rolesData } = await supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", session.user.id);
            setRoles(rolesData?.map((r) => r.role) ?? []);
            setLoading(false);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (DEV_MODE) {
      setDevUser(null);
      setSession(null);
      setUser(null);
      setProfile(null);
      setRoles([]);
      return;
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        roles,
        isManager: roles.includes("manager"),
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
