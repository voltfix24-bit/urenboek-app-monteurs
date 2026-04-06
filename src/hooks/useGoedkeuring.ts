import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import type { UrenBoekingWeergave } from "@/types/app";

export function useGoedkeuring(weekStart: Date, filter: string) {
  const [entries, setEntries] = useState<UrenBoekingWeergave[]>([]);
  const [loading, setLoading] = useState(true);

  const startStr = format(weekStart, "yyyy-MM-dd");
  const endStr = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const fetchEntries = useCallback(async () => {
    setLoading(true);

    let q = supabase
      .from("uren_boekingen")
      .select("*")
      .gte("datum", startStr)
      .lte("datum", endStr)
      .order("datum");

    if (filter !== "alle") {
      q = q.eq("status", filter);
    }

    const { data } = await q;
    if (!data) {
      setLoading(false);
      return;
    }

    // Enrich with names
    const medIds = [...new Set(data.map((e: any) => e.medewerker_id))];
    const projIds = [...new Set(data.map((e: any) => e.project_id))];

    const [{ data: profs }, { data: projs }] = await Promise.all([
      medIds.length > 0
        ? supabase.from("profiles").select("id, full_name").in("id", medIds)
        : { data: [] },
      projIds.length > 0
        ? supabase.from("projects").select("id, naam, nummer").in("id", projIds)
        : { data: [] },
    ]);

    const naamMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
    const projMap = new Map((projs ?? []).map((p: any) => [p.id, p]));

    setEntries(
      data.map((e: any) => ({
        ...e,
        uren: Number(e.uren),
        full_name: naamMap.get(e.medewerker_id) ?? "Onbekend",
        project_naam: (projMap.get(e.project_id) as any)?.naam ?? "",
        project_nummer: (projMap.get(e.project_id) as any)?.nummer ?? "",
      })) as UrenBoekingWeergave[]
    );

    setLoading(false);
  }, [startStr, endStr, filter]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("goedkeuring-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "uren_boekingen" },
        fetchEntries
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchEntries]);

  const keurGoed = async (id: string, profileId: string) => {
    const { error } = await supabase
      .from("uren_boekingen")
      .update({ status: "goedgekeurd", approved_by: profileId } as any)
      .eq("id", id);

    if (error) {
      toast.error("Fout bij goedkeuren");
      return false;
    }
    toast.success("Uren goedgekeurd ✓");
    fetchEntries();
    return true;
  };

  const keurAf = async (id: string, reden: string) => {
    if (!reden.trim()) {
      toast.error("Vul een reden in");
      return false;
    }
    const { error } = await supabase
      .from("uren_boekingen")
      .update({ status: "afgekeurd", afkeur_reden: reden } as any)
      .eq("id", id);

    if (error) {
      toast.error("Fout bij afkeuren");
      return false;
    }
    toast.success("Uren afgekeurd");
    fetchEntries();
    return true;
  };

  return { entries, loading, refetch: fetchEntries, keurGoed, keurAf };
}
