## Doel

De onderaannemer logt in met zijn eigen account en gedraagt zich als een "super-monteur": hij ziet en boekt voor zichzelf én voor alle monteurs onder hem. De inkooporder gaat op zijn naam, met regels per monteur.

## Database (RLS uitbreiden)

We voegen een nieuwe security definer functie toe:

```sql
public.is_onderaannemer_van(_user_id uuid, _profile_id uuid) returns boolean
-- true als de monteur (profile_id) hoort bij de onderaannemer van _user_id,
-- of als profile_id het eigen profiel is van een onderaannemer
```

Daarmee breiden we RLS uit op:

- **planning** — extra SELECT policy: onderaannemer ziet planning van zijn monteurs.
- **uren_boekingen** — extra SELECT/INSERT/UPDATE/DELETE policies: onderaannemer mag uren beheren van zijn monteurs (alleen status `concept`/`ingediend`/`afgekeurd`).
- **profiles** — extra SELECT policy: onderaannemer ziet de profielen van zijn eigen monteurs (voor naam/uurtarief).
- **certificaten** & **beschikbaarheid** — extra SELECT zodat hij hun verlof/certs ziet.
- **inkooporders / inkooporder_regels** — blijven op naam van onderaannemer; we voegen alleen toe dat regels mogen verwijzen naar `uren_boekingen` van zijn monteurs.

## App-laag

Nieuwe hook `useActiveMedewerker()`:

- Manager: ongewijzigd.
- Onderaannemer: levert lijst van profielen (zichzelf + monteurs eronder) en een "actieve monteur" via context + localStorage.
- Monteur zonder team: levert alleen zichzelf (geen UI-keuze).

Nieuwe `MonteurSwitcher` (alleen zichtbaar voor onderaannemer):

- Compacte dropdown bovenaan **Uren**, **Planning** en **Inkooporders**.
- Selecteert namens wie hij werkt; alle queries op die pagina's gebruiken dit `profileId`.

## Pagina-wijzigingen

- **src/pages/Profiel.tsx → tab Uren/UrenBoeken** — vervang vaste `profile.id` door `activeProfileId` uit de hook + render `MonteurSwitcher` bovenaan.
- **src/pages/Planning.tsx** — onderaannemer ziet teamweekoverzicht (zichzelf + monteurs), met dezelfde week-navigator. Tap op een monteur → detail van zijn dag.
- **src/pages/Inkooporders.tsx / MijnOrders.tsx** — blijft op naam van onderaannemer, maar bij het aanmaken van regels kan hij `uren_boekingen` selecteren van zichzelf én van zijn monteurs.
- **BottomNav / DesktopSidebar** — voor onderaannemer dezelfde tabs als een monteur (Uren / Planning / Berichten / Profiel); géén manager-tabs.

## Buiten scope (later)

- Uitbetaling per monteur splitsen op de factuur.
- Onderaannemer kan zelf monteurs verwijderen (nu alleen toevoegen via /onderaannemers).
- Onderaannemer goedkeuringen geven op uren (gaat nu nog naar manager).

## Stappen

1. SQL-migratie: security definer + extra RLS policies.
2. `useActiveMedewerker` hook + `MonteurSwitcher` component.
3. Uren-pagina aansluiten.
4. Planning-pagina aansluiten.
5. Inkooporder-wizard aansluiten op uren van team.
6. Navigatie: onderaannemer krijgt monteur-bottomnav i.p.v. niets.
