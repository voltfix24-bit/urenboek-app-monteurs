export interface TimeEntry {
  id: string;
  date: string;
  projectNumber: string;
  description: string;
  hours: number;
  status: string;
}

export interface WeekData {
  startDate: Date;
  entries: TimeEntry[];
}
