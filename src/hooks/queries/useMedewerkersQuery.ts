import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

const MEDEWERKER_FIELDS =
  "id, user_id, full_name, email, telefoon, adres, rijbewijs, uurtarief, account_status, invited_at, activated_at, noodcontact_naam, noodcontact_tel, contract_einddatum, kvk_nummer, btw_nummer, iban, bedrijfsnaam" as const;

async function fetchMedewerkers() {
  const { data, error } = await supabase
    .from("profiles")
    .select(MEDEWERKER_FIELDS)
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
