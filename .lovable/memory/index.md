# Project Memory

## Core
TerreVolt BV workforce management platform. Emerald Light theme (single theme, geen dark mode).
Achtergrond #f9fafb, surfaces #ffffff, primary emerald #10b981, accent-dark #006c49, on-accent #052e22 (donkergroene tekst op accent, NIET wit — wit op #10b981 faalt AA). Tekst #121c2a, borders #e5e7eb, text-muted #6c7a71.
Hanken Grotesk overal (headings + body), DM Mono voor cijfers/codes. Mobile-first, max-width 430px.
Supabase Cloud backend. Dutch (nl-NL) locale throughout.
Roles: monteur, schakelmonteur, uitvoerder, wv, manager. Manager sees all.
Bottom nav: monteur (Uren/Planning/Berichten/Profiel), manager (Dashboard/Keuren/Planning/Team/Rapport).
Bottom sheets for all modals with drag handle. FAB green bottom-right for primary actions.
Status badges: concept=grey, ingediend=orange, goedgekeurd=green, afgekeurd=red.
Tonal layering ipv shadows. Geen donkere kleuren meer toevoegen — light theme is enige stijl.
Planning-avatar-bg = #adedd3 (lichtgroen), sidebar-shell-active-bg = #10b981. Knoppen op accent gebruiken altijd var(--on-accent), nooit hardcoded wit.
Onderaannemer view monteurs_voor_onderaannemer is HARD beperkt tot id/full_name/is_onderaannemer/onderaannemer_id/account_status met security_invoker=false. Nooit email/telefoon/adres/bedrijfsnaam/uurtarief/iban/kvk/contract_einddatum toevoegen.

## Memories
- [Design system](mem://design/tokens) — Full color palette, surfaces, typography, border radii
- [Navigation structure](mem://features/navigation) — Role-based bottom nav tabs and routing
- [Database tables](mem://features/database) — All tables: profiles, projects, time_entries, planning, beschikbaarheid, mededelingen, certificaten
