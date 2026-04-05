import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface NavBadges {
  openGoedkeuringen: number;
  ongelezen: number;
  verlofAanvragen: number;
  afgekeurdeUren: number;
}

export function useNavBadges() {
  const { user, isManager } = useAuth();
  const [badges, setBadges] = useState<NavBadges>({ openGoedkeuringen: 0, ongelezen: 0, verlofAanvragen: 0, afgekeurdeUren: 0 });
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("id").eq("user_id", user.id).single().then(({ data }) => {
      if (data) setProfileId(data.id);
    });
  }, [user]);

  const fetchBadges = useCallback(async () => {
    if (!user || !profileId) return;
    const promises: Promise<any>[] = [];

    if (isManager) {
      // Open goedkeuringen
      promises.push(
        supabase.from("time_entries").select("id", { count: "exact", head: true }).eq("status", "ingediend")
          .then(({ count }) => ({ openGoedkeuringen: count || 0 }))
      );
      // Verlofaanvragen
      promises.push(
        supabase.from("beschikbaarheid").select("id", { count: "exact", head: true }).eq("status", "aangevraagd")
          .then(({ count }) => ({ verlofAanvragen: count || 0 }))
      );
    } else {
      // Afgekeurde uren voor monteur
      promises.push(
        supabase.from("time_entries").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "afgekeurd")
          .then(({ count }) => ({ afgekeurdeUren: count || 0 }))
      );
    }

    // Ongelezen mededelingen
    promises.push(
      supabase.from("mededeling_leesstatus").select("id", { count: "exact", head: true }).eq("medewerker_id", profileId).is("gelezen_op", null)
        .then(({ count }) => ({ ongelezen: count || 0 }))
    );

    const results = await Promise.all(promises);
    const merged = results.reduce((acc, r) => ({ ...acc, ...r }), {});
    setBadges(prev => ({ ...prev, ...merged }));
  }, [user, profileId, isManager]);

  useEffect(() => { fetchBadges(); }, [fetchBadges]);

  // Poll every 60s
  useEffect(() => {
    const interval = setInterval(fetchBadges, 60000);
    return () => clearInterval(interval);
  }, [fetchBadges]);

  // Realtime subscriptions
  useEffect(() => {
    const channels: any[] = [];
    
    const ch1 = supabase.channel("badge-time-entries")
      .on("postgres_changes", { event: "*", schema: "public", table: "time_entries" }, fetchBadges)
      .subscribe();
    channels.push(ch1);

    const ch2 = supabase.channel("badge-leesstatus")
      .on("postgres_changes", { event: "*", schema: "public", table: "mededeling_leesstatus" }, fetchBadges)
      .subscribe();
    channels.push(ch2);

    return () => { channels.forEach(c => supabase.removeChannel(c)); };
  }, [fetchBadges]);

  return { badges, isManager, profileId };
}
