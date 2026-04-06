import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Beschikbaarheid } from "@/types/app";

export function useBeschikbaarheid(
  medewerker_id: string | null,
  van?: string,
  tot?: string
) {
  const [beschikbaarheid, setBeschikbaarheid] = useState<Beschikbaarheid[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBeschikbaarheid = useCallback(async () => {
    if (!medewerker_id) {
      setBeschikbaarheid([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    let q = supabase
      .from("beschikbaarheid")
      .select("*")
      .eq("medewerker_id", medewerker_id)
      .eq("status", "goedgekeurd");

    if (van && tot) {
      q = q.lte("datum_van", tot).gte("datum_tot", van);
    }

    const { data } = await q;
    setBeschikbaarheid((data ?? []) as Beschikbaarheid[]);
    setLoading(false);
  }, [medewerker_id, van, tot]);

  useEffect(() => {
    fetchBeschikbaarheid();
  }, [fetchBeschikbaarheid]);

  const isNietBeschikbaar = (datum: string): Beschikbaarheid | null => {
    return (
      beschikbaarheid.find(
        (b) => datum >= b.datum_van && datum <= b.datum_tot
      ) ?? null
    );
  };

  return {
    beschikbaarheid,
    loading,
    refetch: fetchBeschikbaarheid,
    isNietBeschikbaar,
  };
}
