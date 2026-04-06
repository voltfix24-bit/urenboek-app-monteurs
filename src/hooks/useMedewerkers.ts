import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ProfielMetRol } from "@/types/app";

interface UseMedewerkersOptions {
  inclusiefManagers?: boolean;
  alleenActief?: boolean;
}

export function useMedewerkers(options: UseMedewerkersOptions = {}) {
  const { inclusiefManagers = true, alleenActief = false } = options;

  const [medewerkers, setMedewerkers] = useState<ProfielMetRol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMedewerkers = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: profielen, error: pErr } = await supabase
      .from("profiles")
      .select("*")
      .order("full_name");

    const { data: rollen, error: rErr } = await supabase
      .from("user_roles")
      .select("user_id, role");

    if (pErr || rErr) {
      setError("Kon medewerkers niet laden");
      setLoading(false);
      return;
    }

    const rolMap = new Map((rollen ?? []).map((r) => [r.user_id, r.role]));

    let result = (profielen ?? []).map((p) => ({
      ...p,
      role: rolMap.get(p.user_id) || "monteur",
    })) as ProfielMetRol[];

    if (!inclusiefManagers) {
      result = result.filter((m) => m.role !== "manager");
    }

    if (alleenActief) {
      result = result.filter((m) => m.account_status === "active");
    }

    setMedewerkers(result);
    setLoading(false);
  }, [inclusiefManagers, alleenActief]);

  useEffect(() => {
    fetchMedewerkers();
  }, [fetchMedewerkers]);

  const getMedewerker = (id: string) => medewerkers.find((m) => m.id === id);

  const getMedewerkerNaam = (id: string) =>
    medewerkers.find((m) => m.id === id)?.full_name ?? "Onbekend";

  return {
    medewerkers,
    loading,
    error,
    refetch: fetchMedewerkers,
    getMedewerker,
    getMedewerkerNaam,
  };
}
