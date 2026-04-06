import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Project } from "@/types/app";

interface UseProjectenOptions {
  alleenActief?: boolean;
  inclusiefGesloten?: boolean;
}

export function useProjecten(options: UseProjectenOptions = {}) {
  const { alleenActief = false, inclusiefGesloten = false } = options;

  const [projecten, setProjecten] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjecten = useCallback(async () => {
    setLoading(true);

    let q = supabase.from("projects").select("*").order("nummer");

    if (alleenActief) {
      q = q.eq("active", true);
    }

    if (!inclusiefGesloten) {
      q = q.neq("status", "gesloten");
    }

    const { data } = await q;
    setProjecten((data ?? []) as Project[]);
    setLoading(false);
  }, [alleenActief, inclusiefGesloten]);

  useEffect(() => {
    fetchProjecten();
  }, [fetchProjecten]);

  const getProject = (id: string) => projecten.find((p) => p.id === id);

  const getProjectNaam = (id: string) =>
    projecten.find((p) => p.id === id)?.naam ?? "Onbekend project";

  // Backward compat with old useProjects
  const getByNummer = (nummer: string) => projecten.find((p) => p.nummer === nummer);

  return {
    projecten,
    // Alias for backward compat
    projects: projecten,
    loading,
    refetch: fetchProjecten,
    getProject,
    getProjectNaam,
    getByNummer,
  };
}

// Re-export as useProjects for backward compatibility
export const useProjects = useProjecten;
