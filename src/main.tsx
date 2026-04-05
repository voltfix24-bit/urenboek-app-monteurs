import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Theme initialization
const saved = localStorage.getItem("terrevolt_theme") || "system";
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const isDark = saved === "dark" || (saved === "system" && prefersDark);
if (isDark) {
  document.documentElement.dataset.theme = "dark";
}

createRoot(document.getElementById("root")!).render(<App />);
