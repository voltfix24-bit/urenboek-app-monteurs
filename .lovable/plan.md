## Doel

Per monteur van een onderaannemer kun je vaste **planning-partners** instellen (collega's binnen hetzelfde onderaannemerteam). Plan je vervolgens in de manager-planning één van die monteurs in, dan worden de partners automatisch met dezelfde planning meegenomen. Wijzigingen en verwijderingen op één entry werken automatisch door op de gekoppelde entries.

## Wijzigingen

### 1. Database (migratie)

- `profiles.planning_partner_ids uuid[]` (default `'{}'`) — wederzijdse lijst met partner-profile-ids binnen het onderaannemerteam.
- `planning.planning_group_id uuid` (nullable) — entries die samen aangemaakt zijn delen één group-id.
- Index op `planning.planning_group_id`.

Geen RLS-wijziging nodig (planning-policies blijven van toepassing).

### 2. UI — Onderaannemers-detailpagina

Per monteur in de lijst onder de onderaannemer een nieuwe knop **"Vaste collega's"** die een mini-dialoog opent met checkboxes van alle ándere teamleden (onderaannemer + zijn monteurs). Bij opslaan wordt de selectie wederzijds bewaard: monteur A krijgt B in zijn lijst, B krijgt A in zijn lijst. Uitvinken werkt ook wederzijds.

### 3. ManagerPlanning — savePlanning / deletePlanning

**Insert (nieuwe planning):**
- Haal partner-ids op van de geselecteerde monteur.
- Genereer één `planning_group_id`.
- Insert één rij voor de monteur zelf en één rij per partner met identieke project/datum/tijden/notitie en dezelfde `planning_group_id`.
- Sla rijen over voor partners die op die datum al een planning hebben (conflict-veilig).
- `collega_ids` wordt automatisch gevuld met de andere monteurs in de groep.

**Update:**
- Als de entry een `planning_group_id` heeft → update alle rijen in de groep met dezelfde project/tijden/notitie (medewerker_id en datum blijven per rij behouden).

**Delete:**
- Als de entry een `planning_group_id` heeft → verwijder alle rijen met die group-id.

### 4. ProjectPlanning publish-flow

Onaangeroerd — partners worden niet automatisch op project-matrix toegevoegd (dat zou cellen overschrijven). Alleen in de losse manager-planning werkt de koppeling.

## Buiten scope

- Auto-doorduwen via realtime naar reeds geopende sessies (entry-mutaties triggeren wel de bestaande realtime-fetch).
- Conflict-resolutie (partner heeft al planning) gaat stil — we slaan die rij over en tonen een toast met aantal overgeslagen.
- Geen koppelingen tussen monteurs van verschillende onderaannemers.

## Technische details

- Migration voegt kolommen toe + index, niets meer.
- `src/integrations/supabase/types.ts` wordt automatisch geregenereerd na approval.
- `src/pages/Onderaannemers.tsx`: extra knopje + bottom-sheet voor koppeling, helper `togglePartner(a, b)` die beide profielen update.
- `src/pages/ManagerPlanning.tsx`: `savePlanning`/`deletePlanning` herschrijven naar groep-aware logica; nieuwe `loadPartners(profileId)` helper.

## Stappen

1. SQL-migratie (kolommen + index).
2. UI in Onderaannemers-detail voor partner-koppeling.
3. ManagerPlanning save/update/delete groep-aware maken.
4. Testen: plan Cevdet → Abdullah krijgt automatisch dezelfde dag; bewerk → beiden updaten; verwijder → beide weg.
