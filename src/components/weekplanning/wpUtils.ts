export const DAG_KORT = ["Ma", "Di", "Wo", "Do", "Vr"];
export const DAG_LANG = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag"];
export const RECENT_KEY = "terrevolt-recent-planning-projects";

export function initialen(naam: string) {
  return naam.split(" ").filter(Boolean).map((d) => d[0]).slice(0, 2).join("").toUpperCase();
}

export function korteNaam(naam: string) {
  const delen = naam.split(" ").filter(Boolean);
  if (delen.length < 2) return naam;
  return `${delen[0]} ${delen[delen.length - 1][0].toUpperCase()}.`;
}

export interface Kleur { color: string; tint: string }

export function projectKleur(projectId: string | null, volgorde: string[]): Kleur {
  if (!projectId) return { color: "var(--text-muted)", tint: "var(--bg-surface-2)" };
  let index = volgorde.indexOf(projectId);
  if (index < 0) index = Array.from(projectId).reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const n = (index % 6) + 1;
  return { color: `var(--planning-project-${n})`, tint: `var(--planning-project-${n}-tint)` };
}

export function leesRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}

export function bewaarRecent(projectId: string) {
  const next = [projectId, ...leesRecent().filter((id) => id !== projectId)].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function rolLabel(rol: string | null) {
  if (!rol || rol === "monteur") return null;
  if (rol === "wv") return "Werkvoorbereider";
  return rol.charAt(0).toUpperCase() + rol.slice(1);
}
