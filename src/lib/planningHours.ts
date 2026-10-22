import { berekenUren } from "./weekPlanning";

/** Behoud de starttijd en de vaste pauze; alleen de netto duur verandert. */
export function urenTijdblok(uren: number, starttijd = "07:00"): [string, string] {
  const [h, m] = starttijd.slice(0, 5).split(":").map(Number);
  const start = h * 60 + m;
  const minuten = Math.min(1439, start + Math.max(0.5, uren) * 60 + 60);
  return [starttijd.slice(0, 5), `${String(Math.floor(minuten / 60)).padStart(2, "0")}:${String(minuten % 60).padStart(2, "0")}`];
}

export function pasPlanningUrenAan(start: string | null, eind: string | null, delta: number): [string, string] {
  return urenTijdblok(Math.max(0.5, berekenUren(start, eind) + delta), start?.slice(0, 5) ?? "07:00");
}

export function boekingsRuimte(gepland: number, overige: number): number {
  return Math.max(0, gepland - overige);
}