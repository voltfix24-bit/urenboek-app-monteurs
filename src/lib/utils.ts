import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function volledigAdres(project: {
  straat?: string | null;
  postcode?: string | null;
  stad?: string | null;
  adres?: string | null;
}): string {
  if (project.straat && project.stad) {
    return [project.straat, project.postcode, project.stad].filter(Boolean).join(", ");
  }
  return project.adres || "";
}
