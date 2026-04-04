import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Project {
  id: string;
  nummer: string;
  naam: string;
  active: boolean;
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from("projects")
        .select("id, nummer, naam, active")
        .eq("active", true)
        .order("nummer");
      if (data) setProjects(data);
      setLoading(false);
    }
    fetch();
  }, []);

  const getByNummer = (nummer: string) => projects.find((p) => p.nummer === nummer);

  return { projects, loading, getByNummer };
}
