import { useState, useCallback } from "react";
import { TimeEntry } from "@/types/timesheet";
import { startOfWeek, addDays, format } from "date-fns";

const STORAGE_KEY = "timesheet-entries";

function loadEntries(): TimeEntry[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: TimeEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function useTimesheet() {
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [entries, setEntries] = useState<TimeEntry[]>(loadEntries);

  const weekDates = Array.from({ length: 7 }, (_, i) =>
    addDays(currentWeekStart, i)
  );

  const weekEntries = entries.filter((entry) => {
    const entryDate = new Date(entry.date);
    return entryDate >= weekDates[0] && entryDate <= weekDates[6];
  });

  const addEntry = useCallback(
    (entry: Omit<TimeEntry, "id">) => {
      const newEntry: TimeEntry = { ...entry, id: crypto.randomUUID() };
      const updated = [...entries, newEntry];
      setEntries(updated);
      saveEntries(updated);
    },
    [entries]
  );

  const removeEntry = useCallback(
    (id: string) => {
      const updated = entries.filter((e) => e.id !== id);
      setEntries(updated);
      saveEntries(updated);
    },
    [entries]
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
    removeEntry,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
    totalHours,
    hoursByProject,
    hoursByDay,
  };
}
