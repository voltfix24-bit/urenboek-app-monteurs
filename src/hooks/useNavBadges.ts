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
  openOveruren: number;
  nieuweOrders: number;
  openOrders: number;
  nieuweKandidaten: number;
  verlopendeContracten: number;
  correctieGevraagd: number;
}

const defaultBadges: NavBadges = {
  openGoedkeuringen: 0, ongelezen: 0, verlofAanvragen: 0,
  afgekeurdeUren: 0, openOveruren: 0, nieuweOrders: 0, openOrders: 0,
  nieuweKandidaten: 0, verlopendeContracten: 0, correctieGevraagd: 0,
};

interface NavBadgesContextValue {
  badges: NavBadges;
  isManager: boolean;
  profileId: string | null;
}

const NavBadgesContext = createContext<NavBadgesContextValue>({
  badges: defaultBadges, isManager: false, profileId: null,
});

export function NavBadgesProvider({ children }: { children: ReactNode }) {
  const { user, isManager } = useAuth();
  const { profileId } = useProfile();
  const [badges, setBadges] = useState<NavBadges>(defaultBadges);

  const fetchBadges = useCallback(async () => {
    if (!user || !profileId) return;
    const next: Partial<NavBadges> = {};

    if (isManager) {
      const dertig = new Date();
      dertig.setDate(dertig.getDate() + 30);

      const [{ count: c1 }, { count: c2 }, { count: c3 }, { count: c4 }, { count: c5 }, { count: c6 }, { count: c7 }] = await Promise.all([
        supabase.from("uren_boekingen").select("id", { count: "exact", head: true }).eq("status", "ingediend"),
        supabase.from("beschikbaarheid").select("id", { count: "exact", head: true }).eq("status", "aangevraagd"),
        supabase.from("overuren_meldingen").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("inkooporders").select("id", { count: "exact", head: true }).eq("status", "factuur_ontvangen"),
        supabase.from("kandidaten").select("id", { count: "exact", head: true }).eq("status", "tarief_afgesproken"),
        supabase.from("contracten").select("id", { count: "exact", head: true }).eq("status", "ondertekend_beiden").lte("einddatum", dertig.toISOString().split("T")[0]),
        supabase.from("contracten").select("id", { count: "exact", head: true }).eq("status", "correctie_gevraagd"),
      ]);
      next.openGoedkeuringen = c1 || 0;
      next.verlofAanvragen = c2 || 0;
      next.openOveruren = c3 || 0;
      next.openOrders = c4 || 0;
      next.nieuweKandidaten = c5 || 0;
      next.verlopendeContracten = c6 || 0;
      next.correctieGevraagd = c7 || 0;
    } else {
      const [{ count: afgekeurd }, { count: nieuw }] = await Promise.all([
        supabase.from("uren_boekingen").select("id", { count: "exact", head: true }).eq("medewerker_id", profileId).eq("status", "afgekeurd"),
        supabase.from("inkooporders").select("id", { count: "exact", head: true }).eq("medewerker_id", profileId).eq("status", "verzonden"),
      ]);
      next.afgekeurdeUren = afgekeurd || 0;
      next.nieuweOrders = nieuw || 0;
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

  const instanceId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    if (!user) return;
    const uid = instanceId.current;
    const chUb = supabase.channel(`nb-ub-${uid}`).on("postgres_changes", { event: "*", schema: "public", table: "uren_boekingen" }, fetchBadges).subscribe();
    const chLs = supabase.channel(`nb-ls-${uid}`).on("postgres_changes", { event: "*", schema: "public", table: "mededeling_leesstatus" }, fetchBadges).subscribe();
    const chOu = supabase.channel(`nb-ou-${uid}`).on("postgres_changes", { event: "*", schema: "public", table: "overuren_meldingen" }, fetchBadges).subscribe();
    const chIo = supabase.channel(`nb-io-${uid}`).on("postgres_changes", { event: "*", schema: "public", table: "inkooporders" }, fetchBadges).subscribe();
    const chKa = supabase.channel(`nb-ka-${uid}`).on("postgres_changes", { event: "*", schema: "public", table: "kandidaten" }, fetchBadges).subscribe();
    const chCo = supabase.channel(`nb-co-${uid}`).on("postgres_changes", { event: "*", schema: "public", table: "contracten" }, fetchBadges).subscribe();
    return () => {
      supabase.removeChannel(chUb); supabase.removeChannel(chLs);
      supabase.removeChannel(chOu); supabase.removeChannel(chIo);
      supabase.removeChannel(chKa); supabase.removeChannel(chCo);
    };
  }, [user, fetchBadges]);

  return React.createElement(NavBadgesContext.Provider, { value: { badges, isManager, profileId } }, children);
}

export function useNavBadges() {
  return useContext(NavBadgesContext);
}
