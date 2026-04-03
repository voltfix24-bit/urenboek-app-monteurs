export interface TimeEntry {
  id: string;
  date: string; // ISO date string
  projectNumber: string;
  description: string;
  hours: number;
}

export interface WeekData {
  startDate: Date;
  entries: TimeEntry[];
}
