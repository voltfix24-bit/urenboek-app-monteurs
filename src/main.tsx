import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Theme initialization — ondersteunt: "dark" (default), "emerald" (licht), "system"
const saved = localStorage.getItem("terrevolt_theme") || "emerald";
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
let themeToApply: string | null = null;
if (saved === "emerald") themeToApply = "emerald";
else if (saved === "dark") themeToApply = "dark";
else if (saved === "system") themeToApply = prefersDark ? "dark" : "emerald";
else themeToApply = "emerald";
document.documentElement.dataset.theme = themeToApply;

// PWA: prevent service worker issues in preview/iframe
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
}

createRoot(document.getElementById("root")!).render(<App />);
