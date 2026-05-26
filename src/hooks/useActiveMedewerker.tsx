import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

export interface TeamLid {
  id: string;
  full_name: string;
  is_self: boolean;
}

interface Ctx {
  isOnderaannemer: boolean;
  team: TeamLid[];                 // [self, ...monteurs]
  activeProfileId: string | null;  // profileId van geselecteerde monteur (of self)
  activeLid: TeamLid | null;
  setActiveProfileId: (id: string) => void;
  loading: boolean;
}

const ActiveMedewerkerContext = createContext<Ctx>({
  isOnderaannemer: false,
  team: [],
  activeProfileId: null,
  activeLid: null,
  setActiveProfileId: () => {},
  loading: true,
});

const STORAGE_KEY = "active_medewerker_profile_id";

export function ActiveMedewerkerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { profileId, profile } = useProfile();
  const [isOnderaannemer, setIsOnderaannemer] = useState(false);
  const [team, setTeam] = useState<TeamLid[]>([]);
  const [activeProfileId, setActiveIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user || !profileId || !profile) {
        setTeam([]); setIsOnderaannemer(false); setActiveIdState(null); setLoading(false);
        return;
      }
      // Check eigen profiel: is_onderaannemer?
      const { data: me } = await supabase
        .from("profiles")
        .select("is_onderaannemer")
        .eq("id", profileId)
        .maybeSingle();
      if (cancelled) return;
      const oa = !!me?.is_onderaannemer;
      setIsOnderaannemer(oa);
      const self: TeamLid = { id: profileId, full_name: profile.full_name + " (jij)", is_self: true };
      if (!oa) {
        setTeam([self]);
        setActiveIdState(profileId);
        setLoading(false);
        return;
      }
      // Laad monteurs onder mij
      const { data: monteurs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("onderaannemer_id", profileId)
        .order("full_name");
      if (cancelled) return;
      const lijst: TeamLid[] = [
        self,
        ...(monteurs ?? []).map((m) => ({ id: m.id, full_name: m.full_name, is_self: false })),
      ];
      setTeam(lijst);
      const stored = localStorage.getItem(STORAGE_KEY);
      const valid = stored && lijst.some((l) => l.id === stored) ? stored : profileId;
      setActiveIdState(valid);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [user, profileId, profile]);

  const setActiveProfileId = (id: string) => {
    setActiveIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const activeLid = useMemo(
    () => team.find((t) => t.id === activeProfileId) ?? null,
    [team, activeProfileId]
  );

  return (
    <ActiveMedewerkerContext.Provider
      value={{ isOnderaannemer, team, activeProfileId, activeLid, setActiveProfileId, loading }}
    >
      {children}
    </ActiveMedewerkerContext.Provider>
  );
}

export const useActiveMedewerker = () => useContext(ActiveMedewerkerContext);
