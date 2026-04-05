export interface TimeEntry {
  id: string;
  date: string;
  projectNumber: string;  // project nummer (for display)
  projectId: string;       // project UUID
  description: string;
  hours: number;
  status: string;
}

export interface WeekData {
  startDate: Date;
  entries: TimeEntry[];
}
