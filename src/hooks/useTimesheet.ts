import { useState, useCallback, useEffect } from "react";
import { startOfWeek, addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface TimeEntry {
  id: string;
  date: string;
  projectNumber: string;
  projectId: string;
  description: string;
  hours: number;
  status: string;
}

export function useTimesheet() {
  const { user } = useAuth();
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [allEntries, setAllEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  const weekDates = Array.from({ length: 7 }, (_, i) =>
    addDays(currentWeekStart, i)
  );

  const weekStartStr = format(weekDates[0], "yyyy-MM-dd");
  const weekEndStr = format(weekDates[6], "yyyy-MM-dd");

  // Get profile id on mount
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
      if (data) setProfileId(data.id);
    })();
  }, [user]);

  const fetchEntries = useCallback(async () => {
    if (!user || !profileId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("uren_boekingen")
      .select("id, datum, project_id, beschrijving, uren, status, type")
      .eq("medewerker_id", profileId)
      .gte("datum", weekStartStr)
      .lte("datum", weekEndStr)
      .order("datum");

    if (error) {
      toast.error("Fout bij ophalen uren");
    } else {
      // Fetch project numbers for display
      const projectIds = [...new Set((data ?? []).map(e => e.project_id))];
      let projMap = new Map<string, string>();
      if (projectIds.length > 0) {
        const { data: projs } = await supabase.from("projects").select("id, nummer").in("id", projectIds);
        projMap = new Map(projs?.map(p => [p.id, p.nummer]) ?? []);
      }
      setEntries(
        (data ?? []).map((e) => ({
          id: e.id,
          date: e.datum,
          projectId: e.project_id,
          projectNumber: projMap.get(e.project_id) || "",
          description: e.beschrijving || e.type || "",
          hours: Number(e.uren),
          status: e.status,
        }))
      );
    }
    setLoading(false);
  }, [user, profileId, weekStartStr, weekEndStr]);

  const fetchAllEntries = useCallback(async () => {
    if (!user || !profileId) return;
    const { data, error } = await supabase
      .from("uren_boekingen")
      .select("id, datum, project_id, beschrijving, uren, status, type")
      .eq("medewerker_id", profileId)
      .order("datum", { ascending: false })
      .limit(100);

    if (!error && data) {
      const projectIds = [...new Set(data.map(e => e.project_id))];
      let projMap = new Map<string, string>();
      if (projectIds.length > 0) {
        const { data: projs } = await supabase.from("projects").select("id, nummer").in("id", projectIds);
        projMap = new Map(projs?.map(p => [p.id, p.nummer]) ?? []);
      }
      setAllEntries(
        data.map((e) => ({
          id: e.id,
          date: e.datum,
          projectId: e.project_id,
          projectNumber: projMap.get(e.project_id) || "",
          description: e.beschrijving || e.type || "",
          hours: Number(e.uren),
          status: e.status,
        }))
      );
    }
  }, [user, profileId]);

  useEffect(() => {
    if (profileId) {
      fetchEntries();
      fetchAllEntries();
    }
  }, [profileId, fetchEntries, fetchAllEntries]);

  const addEntry = useCallback(
    async (entry: { date: string; projectId: string; description: string; hours: number }) => {
      if (!user || !profileId) return;
      const { error } = await supabase.from("uren_boekingen").insert({
        medewerker_id: profileId,
        datum: entry.date,
        project_id: entry.projectId,
        beschrijving: entry.description,
        type: entry.description || "monteren",
        uren: entry.hours,
        status: "concept",
      });
      if (error) {
        toast.error("Fout bij toevoegen");
      } else {
        toast.success("Uren opgeslagen als concept");
        fetchEntries();
        fetchAllEntries();
      }
    },
    [user, profileId, fetchEntries, fetchAllEntries]
  );

  const removeEntry = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("uren_boekingen").delete().eq("id", id);
      if (error) {
        toast.error("Fout bij verwijderen");
      } else {
        fetchEntries();
        fetchAllEntries();
      }
    },
    [fetchEntries, fetchAllEntries]
  );

  const submitEntry = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("uren_boekingen")
        .update({ status: "ingediend" })
        .eq("id", id);
      if (error) {
        toast.error("Fout bij indienen");
      } else {
        toast.success("Ingediend ter goedkeuring");
        fetchEntries();
        fetchAllEntries();
      }
    },
    [fetchEntries, fetchAllEntries]
  );

  const revertToConcept = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("uren_boekingen")
        .update({ status: "concept", approved_by: null, afkeur_reden: null })
        .eq("id", id);
      if (error) {
        toast.error("Fout bij terugzetten");
      } else {
        toast.success("Teruggezet als concept — pas aan en dien opnieuw in");
        fetchEntries();
        fetchAllEntries();
      }
    },
    [fetchEntries, fetchAllEntries]
  );

  const goToPreviousWeek = useCallback(() => {
    setCurrentWeekStart((prev) => addDays(prev, -7));
  }, []);

  const goToNextWeek = useCallback(() => {
    setCurrentWeekStart((prev) => addDays(prev, 7));
  }, []);

  const goToCurrentWeek = useCallback(() => {
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  }, []);

  const weekEntries = entries;
  const totalHours = weekEntries.reduce((sum, e) => sum + e.hours, 0);

  const hoursByProject = weekEntries.reduce<Record<string, number>>(
    (acc, e) => {
      acc[e.projectNumber] = (acc[e.projectNumber] || 0) + e.hours;
      return acc;
    },
    {}
  );

  const hoursByDay = weekDates.map((date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return weekEntries
      .filter((e) => e.date === dateStr)
      .reduce((sum, e) => sum + e.hours, 0);
  });

  return {
    currentWeekStart,
    weekDates,
    weekEntries,
    allEntries,
    profileId,
    addEntry,
    removeEntry,
    submitEntry,
    revertToConcept,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
    totalHours,
    hoursByProject,
    hoursByDay,
    loading,
  };
}
