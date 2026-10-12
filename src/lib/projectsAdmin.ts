import { supabase } from "@/integrations/supabase/client";

/**
 * Kolommen van `projects` die elke ingelogde rol (binnen RLS) direct mag lezen.
 * Alle overige kolommen (opdrachtgever, contactpersoon, intake, planner-sync, …)
 * zijn op databaseniveau afgeschermd en alleen via `adminProjects()` leesbaar.
 */
export const PROJECT_SAFE_COLUMNS =
  "id, nummer, naam, active, status, stationsnaam, adres, straat, postcode, stad, case_type";

/** Manager-only toegang tot alle projectkolommen (RPC controleert de rol server-side). */
export function adminProjects(client: any = supabase) {
  return client.rpc("get_projects_admin_v1");
}
