import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { format, addDays } from "date-fns";
import type { UrenBoekingWeergave } from "@/types/app";

async function fetchUrenWeek(profileId: string, weekStart: string): Promise<UrenBoekingWeergave[]> {
  const endStr = format(addDays(new Date(weekStart), 6), "yyyy-MM-dd");

  const { data } = await supabase
    .from("uren_boekingen")
    .select("*")
    .eq("medewerker_id", profileId)
    .gte("datum", weekStart)
    .lte("datum", endStr)
    .order("datum");

  if (!data) return [];

  const projIds = [...new Set(data.map((e: any) => e.project_id))];
  const { data: projs } = projIds.length > 0
    ? await supabase.from("projects").select("id, naam, nummer").in("id", projIds)
    : { data: [] };

  const projMap = new Map((projs ?? []).map((p: any) => [p.id, p]));

  return data.map((e: any) => ({
    ...e,
    uren: Number(e.uren),
    full_name: "",
    project_naam: (projMap.get(e.project_id) as any)?.naam ?? "",
    project_nummer: (projMap.get(e.project_id) as any)?.nummer ?? "",
  })) as UrenBoekingWeergave[];
}

export function useUrenWeekQuery(profileId: string | null, weekStart: string) {
  return useQuery({
    queryKey: queryKeys.urenWeek(profileId || "", weekStart),
    queryFn: () => fetchUrenWeek(profileId!, weekStart),
    enabled: !!profileId,
  });
}
