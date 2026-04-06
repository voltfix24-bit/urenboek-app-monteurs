import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays } from "date-fns";
import type { PlanningEntry } from "@/types/app";

export function usePlanning(medewerker_id: string | null, weekStart: Date) {
  const [entries, setEntries] = useState<PlanningEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const startStr = format(weekStart, "yyyy-MM-dd");
  const endStr = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const fetchPlanning = useCallback(async () => {
    if (!medewerker_id) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data } = await supabase
      .from("planning")
      .select("*")
      .eq("medewerker_id", medewerker_id)
      .gte("datum", startStr)
      .lte("datum", endStr)
      .order("datum");

    setEntries((data ?? []) as PlanningEntry[]);
    setLoading(false);
  }, [medewerker_id, startStr, endStr]);

  useEffect(() => {
    fetchPlanning();
  }, [fetchPlanning]);

  // Realtime subscription
  useEffect(() => {
    if (!medewerker_id) return;

    const channel = supabase
      .channel(`planning-${medewerker_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "planning",
          filter: `medewerker_id=eq.${medewerker_id}`,
        },
        fetchPlanning
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [medewerker_id, fetchPlanning]);

  return { entries, loading, refetch: fetchPlanning };
}
