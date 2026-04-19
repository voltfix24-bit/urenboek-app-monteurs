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
          {
            urlPattern: /\/rest\/v1\/uren_boekingen/,
            handler: "NetworkFirst",
            options: {
              cacheName: "uren-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 },
              networkTimeoutSeconds: 5,
            },
          },
          {
            urlPattern: /\/rest\/v1\/beschikbaarheid/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "beschikbaarheid-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
            },
          },
        ],
      },
      manifest: {
        name: "TerreVolt Urenregistratie",
        short_name: "TerreVolt",
        description: "Urenregistratie en planning voor TerreVolt monteurs",
        theme_color: "#030e20",
        background_color: "#030e20",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        lang: "nl",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
        shortcuts: [
          {
            name: "Uren boeken",
            url: "/",
            description: "Snel uren boeken",
          },
          {
            name: "Mijn planning",
            url: "/planning",
            description: "Bekijk je planning",
          },
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
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-ui": ["lucide-react", "sonner"],
          "vendor-pdf": ["jspdf", "jspdf-autotable"],
          "vendor-dates": ["date-fns"],
        },
      },
    },
  },
}));
