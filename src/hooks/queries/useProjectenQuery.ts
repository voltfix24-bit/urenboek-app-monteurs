import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import { cacheProjecten } from "@/lib/offlineQueue";

interface Project {
  id: string; nummer: string; naam: string; active: boolean; opdrachtgever_id: string | null;
  stationsnaam: string | null; adres: string | null; case_type: string | null;
  contactpersoon_naam: string | null; contactpersoon_tel: string | null; contactpersoon_email: string | null;
  straat: string | null; postcode: string | null; stad: string | null;
  intake_gedaan: boolean; rmu_merk: string | null; rmu_configuratie_id: string | null;
  status: string;
}

async function fetchProjecten(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, nummer, naam, active, opdrachtgever_id, stationsnaam, adres, case_type, contactpersoon_naam, contactpersoon_tel, contactpersoon_email, straat, postcode, stad, intake_gedaan, rmu_merk, rmu_configuratie_id, status")
    .order("nummer");
  if (error) throw error;
  const projects = (data ?? []) as Project[];
  // Cache for offline use
  cacheProjecten(projects).catch(() => {});
  return projects;
}

export function useProjectenQuery() {
  return useQuery({
    queryKey: queryKeys.projecten(),
    queryFn: fetchProjecten,
  });
}

export function useProjectQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.project(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Project;
    },
    enabled: !!id,
  });
}

export function useProjectMutation() {
  const queryClient = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, profileId }: { id: string; status: string; profileId: string }) => {
      const { error } = await supabase
        .from("projects")
        .update({
          status,
          status_gewijzigd_op: new Date().toISOString(),
          status_gewijzigd_door: profileId,
          active: ["gepland", "in_uitvoering", "opgeleverd"].includes(status),
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projecten() });
      toast.success("Status bijgewerkt ✓");
    },
    onError: () => {
      toast.error("Fout bij wijzigen status");
    },
  });

  return { updateStatus };
}
