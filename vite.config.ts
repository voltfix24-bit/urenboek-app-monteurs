import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: false,
      },
      workbox: {
        navigateFallbackDenylist: [/^\/~oauth/],
        runtimeCaching: [
          {
            urlPattern: /\/rest\/v1\/planning/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "planning-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
            },
          },
          {
            urlPattern: /\/rest\/v1\/projects/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "projects-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
            },
          },
          {
            urlPattern: /\/rest\/v1\/profiles/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "profiles-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 },
            },
          },
        ],
      },
      manifest: {
        name: "TerreVolt Urenregistratie",
        short_name: "TerreVolt",
        theme_color: "#4A7C2F",
        background_color: "#09090f",
        display: "standalone",
        icons: [
          { src: "/placeholder.svg", sizes: "192x192", type: "image/svg+xml" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
