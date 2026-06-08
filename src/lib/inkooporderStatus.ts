export const INKOOPORDER_STATUS_CONFIG: Record<string, {
  label: string;
  color: string;
  bg: string;
  border: string;
  hint?: string;
}> = {
  concept: {
    label: "In aanmaak",
    color: "var(--text-muted)",
    bg: "var(--bg-surface)",
    border: "rgba(106,118,140,0.15)",
  },
  verzonden: {
    label: "Je kunt nu factureren",
    color: "var(--accent)",
    bg: "rgba(63,255,139,0.1)",
    border: "rgba(63,255,139,0.3)",
    hint: "Gebruik dit document als basis voor je factuur aan TerreVolt BV.",
  },
  factuur_ontvangen: {
    label: "Factuur ontvangen ✓",
    color: "var(--info)",
    bg: "rgba(110,155,255,0.1)",
    border: "rgba(110,155,255,0.3)",
  },
  betaald: {
    label: "Betaald ✓",
    color: "var(--accent)",
    bg: "rgba(63,255,139,0.1)",
    border: "rgba(63,255,139,0.3)",
  },
};
