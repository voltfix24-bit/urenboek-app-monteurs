import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Theme initialization
const saved = localStorage.getItem("terrevolt_theme") || "light";
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const isDark = saved === "dark" || (saved === "system" && prefersDark);
if (isDark) {
  document.documentElement.dataset.theme = "dark";
} else {
  delete document.documentElement.dataset.theme;
}

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
