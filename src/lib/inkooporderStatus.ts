export const INKOOPORDER_STATUS_CONFIG: Record<string, {
  label: string;
  color: string;
  bg: string;
  border: string;
  hint?: string;
}> = {
  concept: {
    label: "In aanmaak",
    color: "#6b7280",
    bg: "#ffffff",
    border: "#e5e7eb",
  },
  verzonden: {
    label: "Je kunt nu factureren",
    color: "#10b981",
    bg: "#ecfdf5",
    border: "#a7f3d0",
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
    color: "#10b981",
    bg: "#ecfdf5",
    border: "#a7f3d0",
  },
};
