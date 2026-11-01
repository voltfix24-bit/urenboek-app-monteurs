# Passkeys (native Supabase Auth) — status en activatie

## App-kant (klaar)
`src/lib/passkeys.ts`, `src/hooks/usePasskeyStatus.ts`, `src/components/PasskeyBeveiliging.tsx`,
knop in `src/pages/Auth.tsx`; SDK `@supabase/supabase-js` 2.118.0 (passkey-API standaard aan).

Passkeyceremonies worden alleen aangeboden als ALLES klopt:
1. `GET /auth/v1/settings` geeft `"passkeys_enabled": true` (publieke instelling, geen geheimen);
2. de app draait top-level (niet in een iframe) op exact `https://uren-terrevolt.lovable.app`;
3. `isSecureContext === true` en de browser heeft WebAuthn (`PublicKeyCredential`).
   Een ingebouwde biometrische sensor is niet nodig; externe passkeys (telefoon, security key) werken ook.

Elders (editor-preview, localhost, ander domein) staat er alleen een link naar de officiële app.
Wachtwoordlogin en wachtwoordherstel werken overal ongewijzigd.

## Backend-kant (niet geactiveerd)
Gemeten 2026-11-01 op dit project: `passkeys_enabled: false`, `/auth/v1/passkeys/*` → 404.

Dit betekent alleen dat **op deze Lovable Cloud-koppeling de benodigde instelling ontbreekt** en
dat wij die met de beschikbare tools niet kunnen zetten. Het bewijst niet dat native passkeys in
Supabase in het algemeen onmogelijk zijn (zie https://supabase.com/docs/guides/auth/passkeys).

Benodigde instellingen:
- Passkeys inschakelen (experimenteel)
- Relying Party ID: `uren-terrevolt.lovable.app`
- Toegestane origin: `https://uren-terrevolt.lovable.app`
- Weergavenaam: `TerreVolt Urenboek`

### Volledig door Lovable beheerd project (dit project, Lovable Cloud)
Er is geen eigen Supabase-dashboard. Activatie moet via Lovable gebeuren: vraag Lovable om native
passkeys voor dit project aan te zetten met bovenstaande RP ID en origin. Daarna is geen codewijziging
nodig; de knop verschijnt vanzelf.

### Eigen Supabase-project (directe Supabase-toegang)
Projecteigenaar controleert/zet dit in het Supabase-dashboard:
`https://supabase.com/dashboard/project/<project-ref>/auth/providers` → Passkeys
(Authentication → Sign In / Providers), en `.../auth/url-configuration` voor Site URL/redirects.
Volg https://supabase.com/docs/guides/auth/passkeys voor de actuele plek van de RP-instellingen.

## Testen na activatie
Op een echt toestel via `https://uren-terrevolt.lovable.app`: Profiel → Beveiliging → Passkey
toevoegen, uitloggen, "Inloggen met passkey". Een biometrische end-to-endtest is tot nu toe niet
uitgevoerd.

## Beperkingen
- Passkeys zijn gebonden aan het RP-domein; bij een later eigen domein moeten gebruikers opnieuw registreren.
