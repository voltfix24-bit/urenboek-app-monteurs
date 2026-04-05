import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import React from "react";

export interface NavBadges {
  openGoedkeuringen: number;
  ongelezen: number;
  verlofAanvragen: number;
  afgekeurdeUren: number;
}

const defaultBadges: NavBadges = { openGoedkeuringen: 0, ongelezen: 0, verlofAanvragen: 0, afgekeurdeUren: 0 };

interface NavBadgesContextValue {
  badges: NavBadges;
  isManager: boolean;
  profileId: string | null;
}

const NavBadgesContext = createContext<NavBadgesContextValue>({
  badges: defaultBadges,
  isManager: false,
  profileId: null,
});

export function NavBadgesProvider({ children }: { children: ReactNode }) {
  const { user, isManager } = useAuth();
  const { profileId } = useProfile();
  const [badges, setBadges] = useState<NavBadges>(defaultBadges);

  const fetchBadges = useCallback(async () => {
    if (!user || !profileId) return;
    const next: Partial<NavBadges> = {};

    if (isManager) {
      const [{ count: c1 }, { count: c2 }] = await Promise.all([
        supabase.from("uren_boekingen").select("id", { count: "exact", head: true }).eq("status", "ingediend"),
        supabase.from("beschikbaarheid").select("id", { count: "exact", head: true }).eq("status", "aangevraagd"),
      ]);
      next.openGoedkeuringen = c1 || 0;
      next.verlofAanvragen = c2 || 0;
    } else {
      const { count } = await supabase.from("uren_boekingen").select("id", { count: "exact", head: true }).eq("medewerker_id", profileId).eq("status", "afgekeurd");
      next.afgekeurdeUren = count || 0;
    }

    const { count: unread } = await supabase.from("mededeling_leesstatus").select("id", { count: "exact", head: true }).eq("medewerker_id", profileId).is("gelezen_op", null);
    next.ongelezen = unread || 0;

    setBadges(prev => ({ ...prev, ...next }));
  }, [user, profileId, isManager]);

  useEffect(() => { fetchBadges(); }, [fetchBadges]);

  useEffect(() => {
    const interval = setInterval(fetchBadges, 60_000);
    return () => clearInterval(interval);
  }, [fetchBadges]);

  // Single realtime subscription
  const instanceId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    if (!user) return;

    const uid = instanceId.current;
    const chUb = supabase
      .channel(`nb-ub-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "uren_boekingen" }, fetchBadges)
      .subscribe();

    const chLs = supabase
      .channel(`nb-ls-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mededeling_leesstatus" }, fetchBadges)
      .subscribe();

    return () => {
      supabase.removeChannel(chUb);
      supabase.removeChannel(chLs);
    };
  }, [user, fetchBadges]);

  return React.createElement(NavBadgesContext.Provider, { value: { badges, isManager, profileId } }, children);
}

export function useNavBadges() {
  return useContext(NavBadgesContext);
}
