import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { cachePlanning, getCachedPlanning } from "@/lib/offlineQueue";
import { volledigAdres } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";

interface PlanningRaw {
  id: string; datum: string; starttijd: string; eindtijd: string; notitie: string;
  project_id: string; activiteit: string | null; activiteit_kleur: string | null;
  collega_ids: string[] | null; week_opmerking: string | null;
}

async function fetchPlanningData(profileId: string, startStr: string, endStr: string) {
  if (!navigator.onLine) {
    const cached = await getCachedPlanning(profileId, startStr);
    if (cached) {
      toast.info("📡 Offline — planning uit cache");
      return cached;
    }
    return null;
  }

  const { data } = await supabase
    .from("planning")
    .select("id, datum, starttijd, eindtijd, notitie, project_id, activiteit, activiteit_kleur, collega_ids, week_opmerking")
    .eq("medewerker_id", profileId)
    .gte("datum", startStr)
    .lte("datum", endStr)
    .order("datum");

  if (data) {
    // Cache for offline
    cachePlanning(profileId, startStr, data).catch(() => {});
  }

  return data;
}

export function usePlanningQuery(profileId: string | null, startStr: string, endStr: string) {
  return useQuery({
    queryKey: queryKeys.planning(profileId || "", startStr),
    queryFn: () => fetchPlanningData(profileId!, startStr, endStr),
    enabled: !!profileId,
    staleTime: 60 * 1000,
  });
}
