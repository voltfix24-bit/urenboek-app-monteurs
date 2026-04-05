import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

interface NavBadges {
  openGoedkeuringen: number;
  ongelezen: number;
  verlofAanvragen: number;
  afgekeurdeUren: number;
}

export function useNavBadges() {
  const { user, isManager } = useAuth();
  const { profileId } = useProfile();
  const [badges, setBadges] = useState<NavBadges>({ openGoedkeuringen: 0, ongelezen: 0, verlofAanvragen: 0, afgekeurdeUren: 0 });

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
    const interval = setInterval(fetchBadges, 60000);
    return () => clearInterval(interval);
  }, [fetchBadges]);

  useEffect(() => {
    const ch1 = supabase.channel("badge-ub").on("postgres_changes", { event: "*", schema: "public", table: "uren_boekingen" }, fetchBadges).subscribe();
    const ch2 = supabase.channel("badge-ls").on("postgres_changes", { event: "*", schema: "public", table: "mededeling_leesstatus" }, fetchBadges).subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [fetchBadges]);

  return { badges, isManager, profileId };
}
