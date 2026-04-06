export const queryKeys = {
  profiel: (userId: string) => ['profiel', userId] as const,
  medewerkers: () => ['medewerkers'] as const,
  medewerker: (id: string) => ['medewerker', id] as const,

  projecten: (filter?: string) => ['projecten', filter] as const,
  project: (id: string) => ['project', id] as const,

  urenWeek: (profileId: string, weekStart: string) => ['uren', 'week', profileId, weekStart] as const,
  urenAlles: (profileId: string) => ['uren', 'alles', profileId] as const,
  goedkeuring: (weekStart: string, filter: string) => ['goedkeuring', weekStart, filter] as const,

  planning: (medewerkerId: string, weekStart: string) => ['planning', medewerkerId, weekStart] as const,
  managerPlanning: (weekStart: string) => ['manager-planning', weekStart] as const,

  overuren: (filter: string) => ['overuren', filter] as const,
  mededelingen: (profileId: string) => ['mededelingen', profileId] as const,
  certificaten: (medewerkerId: string) => ['certificaten', medewerkerId] as const,
  dashboard: () => ['dashboard'] as const,
};
