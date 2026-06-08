import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Emerald Light is de enige stijl
document.documentElement.dataset.theme = "emerald";
try { localStorage.setItem("terrevolt_theme", "emerald"); } catch {}

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
