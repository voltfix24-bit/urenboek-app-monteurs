import { useState, useCallback, useEffect } from "react";
import { startOfWeek, addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface TimeEntry {
  id: string;
  date: string;
  projectNumber: string;
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
  const [loading, setLoading] = useState(false);

  const weekDates = Array.from({ length: 7 }, (_, i) =>
    addDays(currentWeekStart, i)
  );

  const weekStartStr = format(weekDates[0], "yyyy-MM-dd");
  const weekEndStr = format(weekDates[6], "yyyy-MM-dd");

  const fetchEntries = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("time_entries")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", weekStartStr)
      .lte("date", weekEndStr)
      .order("date");

    if (error) {
      toast.error("Fout bij ophalen uren");
    } else {
      setEntries(
        (data ?? []).map((e) => ({
          id: e.id,
          date: e.date,
          projectNumber: e.project_number,
          description: e.description,
          hours: Number(e.hours),
          status: e.status,
        }))
      );
    }
    setLoading(false);
  }, [user, weekStartStr, weekEndStr]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const addEntry = useCallback(
    async (entry: Omit<TimeEntry, "id" | "status">) => {
      if (!user) return;
      const { error } = await supabase.from("time_entries").insert({
        user_id: user.id,
        date: entry.date,
        project_number: entry.projectNumber,
        description: entry.description,
        hours: entry.hours,
        status: "ingediend",
      });
      if (error) {
        toast.error("Fout bij toevoegen");
      } else {
        fetchEntries();
      }
    },
    [user, fetchEntries]
  );

  const addMultipleEntries = useCallback(
    async (entries: Omit<TimeEntry, "id" | "status">[]) => {
      if (!user || entries.length === 0) return;
      const rows = entries.map((entry) => ({
        user_id: user.id,
        date: entry.date,
        project_number: entry.projectNumber,
        description: entry.description,
        hours: entry.hours,
        status: "ingediend",
      }));
      const { error } = await supabase.from("time_entries").insert(rows);
      if (error) {
        toast.error("Fout bij toevoegen");
      } else {
        toast.success(`${entries.length} dagen toegevoegd`);
        fetchEntries();
      }
    },
    [user, fetchEntries]
  );

  const removeEntry = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("time_entries").delete().eq("id", id);
      if (error) {
        toast.error("Fout bij verwijderen");
      } else {
        fetchEntries();
      }
    },
    [fetchEntries]
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
    addEntry,
    addMultipleEntries,
    removeEntry,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
    totalHours,
    hoursByProject,
    hoursByDay,
    loading,
  };
}
