// ─── Design tokens voor Inkooporders feature ───────────────────────────────
// Gedeeld tussen src/pages/Inkooporders.tsx en src/components/inkooporders/*
// Dit centraliseert de dark-navy styling die de rest van de app ook gebruikt,
// zodat één wijziging volstaat als we straks naar de :root sage-tokens migreren.
export const T = {
  navy: "var(--app-navy)",
  surface: "#ffffff",
  surfaceBlur: "color-mix(in srgb, #ffffff 97%, transparent)",
  border: "#e5e7eb",
  borderActive: "#a7f3d0",
  text: "#1f2937",
  textMuted: "#6b7280",
  primary: "#10b981",
  primaryGradient: "linear-gradient(135deg, #10b981, #047857)",
  primarySoft: "#ecfdf5",
  warn: "#d97706",
  warnSoft: "rgba(254,179,0,0.08)",
  warnBorder: "rgba(254,179,0,0.3)",
  info: "#6e9bff",
  infoSoft: "rgba(110,155,255,0.1)",
  infoBorder: "rgba(110,155,255,0.3)",
  danger: "#dc2626",
  dangerSoft: "rgba(255,113,108,0.1)",
  dangerBorder: "rgba(255,113,108,0.3)",
  mono: "DM Mono, monospace",
  step: "#ffffff",
} as const;
