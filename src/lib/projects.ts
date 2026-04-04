// Projects are now loaded dynamically from the database via useProjects hook.
// This file is kept for backward compatibility only.

export interface Project {
  id: number;
  nummer: string;
  naam: string;
}

export const PROJECTS: Project[] = [];

export function getProjectByNummer(nummer: string): Project | undefined {
  return PROJECTS.find((p) => p.nummer === nummer);
}
