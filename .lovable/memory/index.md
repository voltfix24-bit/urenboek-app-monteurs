# Project Memory

## Core
TerreVolt BV workforce management platform. Light sage theme default, dark mode via toggle.
Primary #4A7C2F green (light), #22c55e (dark). Light bg #F5F7F0, dark bg #0a0a0f.
DM Sans body, DM Mono for numbers/codes. Mobile-first, max-width 430px.
Supabase Cloud backend. Dutch (nl-NL) locale throughout.
Roles: monteur, schakelmonteur, uitvoerder, wv, manager. Manager sees all.
Bottom nav: monteur (Uren/Planning/Berichten/Profiel), manager (Dashboard/Keuren/Planning/Team/Rapport).
Bottom sheets for all modals with drag handle. FAB green bottom-right for primary actions.
Status badges: concept=grey, ingediend=orange, goedgekeurd=green, afgekeurd=red.
Theme stored in localStorage('terrevolt_theme'), default "light". data-theme="dark" for dark mode.

## Memories
- [Design system](mem://design/tokens) — Full color palette, surfaces, typography, border radii
- [Navigation structure](mem://features/navigation) — Role-based bottom nav tabs and routing
- [Database tables](mem://features/database) — All tables: profiles, projects, time_entries, planning, beschikbaarheid, mededelingen, certificaten
