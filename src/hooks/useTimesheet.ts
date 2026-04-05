import { useState, useCallback, useEffect } from "react";
import { startOfWeek, addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";
import { query, mutate } from "@/lib/supabaseHelpers";

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
  const { profileId } = useProfile();
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [allEntries, setAllEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const weekDates = Array.from({ length: 7 }, (_, i) =>
    addDays(currentWeekStart, i)
  );

  const weekStartStr = format(weekDates[0], "yyyy-MM-dd");
  const weekEndStr = format(weekDates[6], "yyyy-MM-dd");

  const fetchEntries = useCallback(async () => {
    if (!user || !profileId) return;
    setLoading(true);
    const data = await query(supabase
      .from("uren_boekingen")
      .select("id, datum, project_id, beschrijving, uren, status, type")
      .eq("medewerker_id", profileId)
      .gte("datum", weekStartStr)
      .lte("datum", weekEndStr)
      .order("datum"));

    if (data) {
      const projectIds = [...new Set(data.map(e => e.project_id))];
      let projMap = new Map<string, string>();
      if (projectIds.length > 0) {
        const projs = await query(supabase.from("projects").select("id, nummer").in("id", projectIds));
        projMap = new Map(projs?.map(p => [p.id, p.nummer]) ?? []);
      }
      setEntries(
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
    setLoading(false);
  }, [user, profileId, weekStartStr, weekEndStr]);

  const fetchAllEntries = useCallback(async () => {
    if (!user || !profileId) return;
    const data = await query(supabase
      .from("uren_boekingen")
      .select("id, datum, project_id, beschrijving, uren, status, type")
      .eq("medewerker_id", profileId)
      .order("datum", { ascending: false })
      .limit(100));

    if (data) {
      const projectIds = [...new Set(data.map(e => e.project_id))];
      let projMap = new Map<string, string>();
      if (projectIds.length > 0) {
        const projs = await query(supabase.from("projects").select("id, nummer").in("id", projectIds));
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
      if (!await mutate(supabase.from("uren_boekingen").insert({
        medewerker_id: profileId,
        datum: entry.date,
        project_id: entry.projectId,
        beschrijving: entry.description,
        type: entry.description || "monteren",
        uren: entry.hours,
        status: "concept",
      }))) return;
      toast.success("Uren opgeslagen als concept");
      fetchEntries();
      fetchAllEntries();
    },
    [user, profileId, fetchEntries, fetchAllEntries]
  );

  const removeEntry = useCallback(
    async (id: string) => {
      if (!await mutate(supabase.from("uren_boekingen").delete().eq("id", id))) return;
      fetchEntries();
      fetchAllEntries();
    },
    [fetchEntries, fetchAllEntries]
  );

  const submitEntry = useCallback(
    async (id: string) => {
      const { data, error } = await supabase.functions.invoke("uren-indienen", {
        body: { urenIds: [id] },
      });
      if (error || !data?.success) { toast.error("Er ging iets mis. Probeer opnieuw."); return; }
      toast.success("Ingediend ter goedkeuring");
      fetchEntries();
      fetchAllEntries();
    },
    [fetchEntries, fetchAllEntries]
  );

  const submitAll = useCallback(
    async () => {
      const conceptIds = entries.filter(e => e.status === "concept").map(e => e.id);
      if (conceptIds.length === 0) { toast.info("Geen concept-uren om in te dienen"); return 0; }
      const { data, error } = await supabase.functions.invoke("uren-indienen", {
        body: { urenIds: conceptIds },
      });
      if (error || !data?.success) { toast.error("Er ging iets mis. Probeer opnieuw."); return 0; }
      const count = data.updated ?? conceptIds.length;
      toast.success(`${count} uren ingediend ter goedkeuring`);
      fetchEntries();
      fetchAllEntries();
      return count;
    },
    [entries, fetchEntries, fetchAllEntries]
  );

  const revertToConcept = useCallback(
    async (id: string) => {
      if (!await mutate(supabase.from("uren_boekingen").update({ status: "concept", approved_by: null, afkeur_reden: null }).eq("id", id))) return;
      toast.success("Teruggezet als concept — pas aan en dien opnieuw in");
      fetchEntries();
      fetchAllEntries();
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
    submitAll,
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
