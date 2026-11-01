# Passkeys (native Supabase Auth) — activatie

App-code is klaar (`src/lib/passkeys.ts`, `src/hooks/usePasskeyStatus.ts`,
`src/components/PasskeyBeveiliging.tsx`, knop in `src/pages/Auth.tsx`). De functie
verschijnt pas wanneer `GET /auth/v1/settings` `"passkeys_enabled": true` teruggeeft.

Status 2026-11-01: `passkeys_enabled: false`; `/auth/v1/passkeys/*` geeft 404.
Lovable Cloud biedt (nog) geen instelling om dit aan te zetten.

## Benodigde backendinstellingen
- Passkeys inschakelen (Auth → Passkeys / `GOTRUE_PASSKEY_ENABLED`, experimenteel).
- Relying Party ID: `uren-terrevolt.lovable.app`
- Toegestane origin: `https://uren-terrevolt.lovable.app`
- Display name: `TerreVolt Urenboek`

Activatie moet door Lovable Cloud gebeuren (vraag dit aan via Lovable). Daarna zonder
codewijziging testen op een echt iPhone-toestel via de gepubliceerde URL.

## Beperkingen
- Passkeys zijn gebonden aan het RP-domein; ze werken niet in de editor-preview
  (`*.lovableproject.com` / iframe) en niet op een later eigen domein zonder nieuwe registratie.
- Wachtwoordlogin en herstel blijven ongewijzigd.
