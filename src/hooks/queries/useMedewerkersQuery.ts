import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

async function fetchMedewerkers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name");
  if (error) throw error;
  return data ?? [];
}

export function useMedewerkersQuery() {
  return useQuery({
    queryKey: queryKeys.medewerkers(),
    queryFn: fetchMedewerkers,
  });
}
