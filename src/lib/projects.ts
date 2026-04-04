export interface Project {
  id: number;
  nummer: string;
  naam: string;
}

export const PROJECTS: Project[] = [
  { id: 1, nummer: "CS-2024-001", naam: "Burg. VD Fletzlaan" },
  { id: 2, nummer: "CS-2024-002", naam: "Amstel Energiepark" },
  { id: 3, nummer: "CS-2024-003", naam: "Zuidoost Middenspanning" },
  { id: 4, nummer: "CS-2024-004", naam: "Diemen Noord Substation" },
  { id: 5, nummer: "CS-2024-005", naam: "Weesp Compactstation" },
];

export function getProjectByNummer(nummer: string): Project | undefined {
  return PROJECTS.find((p) => p.nummer === nummer);
}
