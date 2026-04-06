import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from "date-fns";
import { nl } from "date-fns/locale";

// ─── GELD ─────────────────────────────
export function euro(n: number, decimalen: 0 | 2 = 0): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimalen,
    maximumFractionDigits: decimalen,
  }).format(n);
}

export function euroDecimals(n: number): string {
  return euro(n, 2);
}

// ─── UREN ─────────────────────────────
export function formatUren(n: number): string {
  if (Number.isInteger(n)) return `${n}u`;
  return `${n.toFixed(1)}u`;
}

// ─── DATUMS ───────────────────────────
export function formatDatum(datum: string | Date): string {
  const d = typeof datum === "string" ? parseISO(datum) : datum;
  return format(d, "d MMM yyyy", { locale: nl });
}

export function formatDatumKort(datum: string | Date): string {
  const d = typeof datum === "string" ? parseISO(datum) : datum;
  return format(d, "d MMM", { locale: nl });
}

export function formatDatumLang(datum: string | Date): string {
  const d = typeof datum === "string" ? parseISO(datum) : datum;
  return format(d, "eeee d MMMM yyyy", { locale: nl });
}

export function formatDatumTijd(datum: string | Date): string {
  const d = typeof datum === "string" ? parseISO(datum) : datum;
  return format(d, "d MMM yyyy HH:mm", { locale: nl });
}

export function formatRelatief(datum: string | Date): string {
  const d = typeof datum === "string" ? parseISO(datum) : datum;
  if (isToday(d)) return "Vandaag";
  if (isYesterday(d)) return "Gisteren";
  return formatDistanceToNow(d, { addSuffix: true, locale: nl });
}

export function formatWeek(datum: string | Date): string {
  const d = typeof datum === "string" ? parseISO(datum) : datum;
  return format(d, "'Week' w, yyyy", { locale: nl });
}

export function formatDag(datum: string | Date): string {
  const d = typeof datum === "string" ? parseISO(datum) : datum;
  return format(d, "EEE", { locale: nl });
}

export function formatDagLang(datum: string | Date): string {
  const d = typeof datum === "string" ? parseISO(datum) : datum;
  return format(d, "EEEE d MMMM", { locale: nl });
}

export function formatDagKort(datum: string | Date): string {
  const d = typeof datum === "string" ? parseISO(datum) : datum;
  return format(d, "EEE d/M", { locale: nl });
}

export function formatDatumVolledig(datum: string | Date): string {
  const d = typeof datum === "string" ? parseISO(datum) : datum;
  return format(d, "d MMMM yyyy 'om' HH:mm", { locale: nl });
}

// ─── NAMEN ────────────────────────────
export function voornaam(fullName: string): string {
  return fullName.split(" ")[0];
}

export function initialen(fullName: string): string {
  return fullName
    .split(" ")
    .map((n) => n.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ─── STATUS LABELS ────────────────────
export const UREN_STATUS_LABELS: Record<string, string> = {
  concept: "Concept",
  ingediend: "Ingediend",
  goedgekeurd: "Goedgekeurd",
  afgekeurd: "Afgekeurd",
};

export const UREN_STATUS_KLEUREN: Record<string, { bg: string; color: string; border: string }> = {
  concept: {
    bg: "var(--bg-surface-2)",
    color: "var(--text-muted)",
    border: "var(--border)",
  },
  ingediend: {
    bg: "var(--warn-light)",
    color: "var(--warn-text)",
    border: "var(--warn-border)",
  },
  goedgekeurd: {
    bg: "var(--success-light)",
    color: "var(--success)",
    border: "var(--success-border)",
  },
  afgekeurd: {
    bg: "var(--danger-light)",
    color: "var(--danger)",
    border: "var(--danger-border)",
  },
};
