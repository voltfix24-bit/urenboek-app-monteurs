export const INKOOPORDER_STATUS_CONFIG: Record<string, {
  label: string;
  color: string;
  bg: string;
  border: string;
  hint?: string;
}> = {
  concept: {
    label: "Concept",
    color: "#a0abc3",
    bg: "rgba(10,26,48,0.7)",
    border: "rgba(106,118,140,0.15)",
  },
  verzonden: {
    label: "Klaar — maak je factuur",
    color: "#3fff8b",
    bg: "rgba(63,255,139,0.1)",
    border: "rgba(63,255,139,0.3)",
    hint: "Gebruik dit document als basis voor je factuur aan TerreVolt BV.",
  },
  factuur_ontvangen: {
    label: "Factuur ontvangen ✓",
    color: "#6e9bff",
    bg: "rgba(110,155,255,0.1)",
    border: "rgba(110,155,255,0.3)",
  },
  betaald: {
    label: "Betaald ✓",
    color: "#3fff8b",
    bg: "rgba(63,255,139,0.1)",
    border: "rgba(63,255,139,0.3)",
  },
};
