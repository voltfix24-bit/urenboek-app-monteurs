# Teamplanning herontwerp

## Doel
Het beheerdersscherm Teamplanning wordt één compact en goed scanbaar weekraster. De bestaande planninggegevens, bewerk-/verwijderlogica en database-aanroepen blijven intact.

## Wijzigingen

### Kop en bediening
- Verwijder het groene label boven de titel.
- Toon dynamisch `Week [nummer]` met daaronder de korte periode en `[ingepland] van [totaal] ingepland`.
- Zet vorige/volgende week samen rechtsboven, naast de bestaande twee downloadacties.
- Geef alle vier pictogramknoppen een duidelijke naam, tooltip en zichtbare toetsenbordfocus.
- Voeg `Week kopiëren` toe. Deze kopieert regels van de vorige week naar dezelfde weekdagen in de getoonde week via de bestaande planning-API; bestaande doelcellen worden niet overschreven en worden gemeld als overgeslagen.
- Maak `Overzicht / Per klus` een echte segmented control en plaats de projectfilters in een afzonderlijke rij met het label `Project`.

### Weekraster
- Vervang losse monteurskaarten door één tabelachtig raster met alleen hairline rijscheidingen.
- Gebruik vaste kolommen: `220px` voor medewerker, vijf gelijke dagkolommen en `60px` voor weektotaal.
- Maak de dagkop sticky tijdens verticaal scrollen.
- Sorteer medewerkers eerst op wel/geen zichtbare planning en daarna alfabetisch.
- Toon per rij een avatar van 22px, naam en alleen een functienaam wanneer die afwijkt van monteur.
- Voeg een toegankelijke uitklapknop toe met een naam die de medewerker noemt.

### Cellen en totalen
- Geef gevulde en lege cellen dezelfde hoogte en vorm.
- Gevulde cellen tonen een licht projectvlak, projectnaam met ellipsis en uren; de bestaande project-/activiteitskleur bepaalt de tint.
- Lege cellen krijgen een gestippelde rand en een gedempte plus.
- Beide celtypen blijven volledig klikbaar en krijgen hover- en focusstates.
- Voeg per medewerker een weektotaal toe.
- Voeg onderaan een totaalrij toe met het aantal ingeplande medewerkers per dag en het totale aantal geplande uren.
- Plaats een projectkleur-legenda onder het raster.
- Houd alle tekst minimaal 11px en verwijder hoofdletterlabels binnen dit scherm.

### Responsive en stijl
- Vanaf smalle desktop/tablet wordt het raster horizontaal scrollbaar; onder 900px blijft de medewerkerkolom links sticky.
- Gebruik uitsluitend bestaande of nieuwe semantische CSS-variabelen voor kleuren, inclusief donkere-themawaarden.
- Laat de bestaande detailuitklap, waarschuwingen, modal en `Per klus`-weergave functioneel; pas zichtbare hoofdletterlabels daar waar nodig aan zonder de logica te wijzigen.

## Controle
- Controleer desktop en een viewport onder 900px op kolombreedtes, sticky gedrag, horizontaal scrollen, tekstafkapping en ontbrekende overlap.
- Controleer openen/bewerken van een gevulde cel, openen van een lege cel, filters, weeknavigatie, uitklappen en weekkopie zonder bestaande doelplanning te overschrijven.
- Controleer build, typecontrole en relevante tests.

## Buiten scope
- Geen wijzigingen aan tabellen, rollen, policies, Edge Functions of bestaande planning-API-contracten.
- Geen aanpassing van de onderliggende planningregels of berekening van productieve uren.
