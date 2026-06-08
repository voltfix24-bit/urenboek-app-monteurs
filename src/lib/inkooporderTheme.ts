// ─── Design tokens voor Inkooporders feature ───────────────────────────────
// Gedeeld tussen src/pages/Inkooporders.tsx en src/components/inkooporders/*
// Dit centraliseert de dark-navy styling die de rest van de app ook gebruikt,
// zodat één wijziging volstaat als we straks naar de :root sage-tokens migreren.
export const T = {
  navy: "var(--app-navy)",
  surface: "rgba(10,26,48,0.7)",
  surfaceBlur: "color-mix(in srgb, rgba(10,26,48,0.7) 97%, transparent)",
  border: "rgba(106,118,140,0.15)",
  borderActive: "rgba(63,255,139,0.3)",
  text: "#dae6ff",
  textMuted: "#a0abc3",
  primary: "#3fff8b",
  primaryGradient: "linear-gradient(135deg, #3fff8b, #005d2c)",
  primarySoft: "rgba(63,255,139,0.1)",
  warn: "#feb300",
  warnSoft: "rgba(254,179,0,0.08)",
  warnBorder: "rgba(254,179,0,0.3)",
  info: "#6e9bff",
  infoSoft: "rgba(110,155,255,0.1)",
  infoBorder: "rgba(110,155,255,0.3)",
  danger: "#ff716c",
  dangerSoft: "rgba(255,113,108,0.1)",
  dangerBorder: "rgba(255,113,108,0.3)",
  mono: "DM Mono, monospace",
  step: "#102038",
} as const;
