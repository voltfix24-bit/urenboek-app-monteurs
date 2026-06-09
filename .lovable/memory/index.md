# Project Memory

## Core
TerreVolt BV workforce management platform. Emerald Light theme (single theme, geen dark mode).
Achtergrond #f9fafb, surfaces #ffffff, primary emerald #047857 (WCAG AA: 5.6:1 wit op accent), tekst #121c2a, borders #e5e7eb.
Hanken Grotesk overal (headings + body), DM Mono voor cijfers/codes. Mobile-first, max-width 430px.
Supabase Cloud backend. Dutch (nl-NL) locale throughout.
Roles: monteur, schakelmonteur, uitvoerder, wv, manager. Manager sees all.
Bottom nav: monteur (Uren/Planning/Berichten/Profiel), manager (Dashboard/Keuren/Planning/Team/Rapport).
Bottom sheets for all modals with drag handle. FAB green bottom-right for primary actions.
Status badges: concept=grey, ingediend=orange, goedgekeurd=green, afgekeurd=red.
Tonal layering ipv shadows. Geen donkere kleuren meer toevoegen — light theme is enige stijl.
Contrast regels (WCAG AA): tekst-muted = #5a685f, accent = #047857 voor zowel knoppen (wit erop) als links/tekst (op wit). Nooit #10b981 als tekstkleur of als knop-achtergrond met witte tekst — faalt AA (2.5:1).

## Memories
- [Design system](mem://design/tokens) — Full color palette, surfaces, typography, border radii
- [Navigation structure](mem://features/navigation) — Role-based bottom nav tabs and routing
- [Database tables](mem://features/database) — All tables: profiles, projects, time_entries, planning, beschikbaarheid, mededelingen, certificaten
