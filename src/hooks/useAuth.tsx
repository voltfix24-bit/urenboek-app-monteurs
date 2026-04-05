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

// DEV BYPASS: set devBypass to false to re-enable real auth
const devBypass = false;
const mockUser = devBypass ? ({ id: "dev-manager-user", email: "dev@terrevolt.local" } as User) : null;
const mockSession = devBypass ? ({ user: mockUser } as Session) : null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(mockSession);
  const [user, setUser] = useState<User | null>(mockUser);
  const [profile, setProfile] = useState<{ full_name: string } | null>(devBypass ? { full_name: "Dev Manager" } : null);
  const [roles, setRoles] = useState<string[]>(devBypass ? ["manager"] : []);
  const [loading, setLoading] = useState(!devBypass);

  useEffect(() => {
    if (devBypass) {
      setSession(mockSession);
      setUser(mockUser);
      setProfile({ full_name: "Dev Manager" });
      setRoles(["manager"]);
      setLoading(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Use setTimeout to avoid potential deadlock with Supabase auth
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
    if (devBypass) return;
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
