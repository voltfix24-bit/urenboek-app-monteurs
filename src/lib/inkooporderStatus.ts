export const INKOOPORDER_STATUS_CONFIG: Record<string, {
  label: string;
  color: string;
  bg: string;
  border: string;
  hint?: string;
}> = {
  concept: {
    label: "Concept",
    color: "var(--text-muted)",
    bg: "var(--bg-surface-2)",
    border: "var(--border)",
  },
  verzonden: {
    label: "Klaar — maak je factuur",
    color: "var(--success)",
    bg: "var(--success-light)",
    border: "var(--success-border)",
    hint: "Gebruik dit document als basis voor je factuur aan TerreVolt BV.",
  },
  factuur_ontvangen: {
    label: "Factuur ontvangen ✓",
    color: "var(--info)",
    bg: "var(--info-light)",
    border: "var(--info-border)",
  },
  betaald: {
    label: "Betaald ✓",
    color: "var(--accent)",
    bg: "var(--accent-light)",
    border: "var(--accent-border)",
  },
};
