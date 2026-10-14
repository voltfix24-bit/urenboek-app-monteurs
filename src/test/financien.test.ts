import { describe, it, expect } from "vitest";
import {
  berekenFinannen,
  bepaalKostentarief,
  bepaalVerkooptarief,
  type AanwijzingRol,
  type CaseForecast,
  type DetacheringRij,
  type FinancienInput,
  type KostentariefRij,
  type PersoonInfo,
  type ProjectInfo,
  type UrenRij,
  type VerkooptariefRij,
} from "@/lib/financien";

/** Startwaarden uit FINANCIEN.md — hier alleen als testmateriaal, nooit als bron van waarheid. */
const verkoop: VerkooptariefRij[] = [
  { opdrachtgever_id: "og-hanab", rol: "WV", uurtarief: 110, g_rekening_pct: 20, geldig_vanaf: "2026-01-01" },
  { opdrachtgever_id: "og-hanab", rol: "monteur", uurtarief: 97.5, g_rekening_pct: 20, geldig_vanaf: "2026-01-01" },
  { opdrachtgever_id: "og-hanab", rol: null, uurtarief: 90, g_rekening_pct: 0, geldig_vanaf: "2026-01-01" },
  { opdrachtgever_id: "og-vangelder", rol: null, uurtarief: 95, g_rekening_pct: 0, geldig_vanaf: "2026-01-01" },
];

const kost: KostentariefRij[] = [
  { medewerker_id: "m-wv", uurtarief: 80, geldig_vanaf: "2026-01-01" },
  { medewerker_id: "m-monteur", uurtarief: 70, geldig_vanaf: "2026-01-01" },
];

const projecten: ProjectInfo[] = [
  { id: "p-hanab", naam: "HANAB", nummer: "0020", soort: "uitleen", opdrachtgever_id: "og-hanab" },
  { id: "p-klus", naam: "Station X", nummer: "0001", soort: "project", opdrachtgever_id: "og-vangelder" },
];

const personen: PersoonInfo[] = [
  { id: "m-wv", full_name: "Mohammed Himmi", is_eigenaar: false, fictief_uurtarief: null },
  { id: "m-monteur", full_name: "Yazan Jaber", is_eigenaar: false, fictief_uurtarief: null },
  { id: "m-eigenaar", full_name: "Hassan el Garrat", is_eigenaar: true, fictief_uurtarief: 65 },
];

const detacheringen: DetacheringRij[] = [
  {
    id: "d1", medewerker_id: "m-wv", opdrachtgever_id: "og-hanab", project_id: "p-hanab",
    rol: "WV", van: "2026-01-01", tot: null, uren_per_week: 40, tarief_override: null,
  },
];

const input = (extra: Partial<FinancienInput> = {}): FinancienInput => ({
  van: "2026-10-12",
  tot: "2026-10-18",
  uren: [],
  projecten,
  personen,
  verkooptarieven: verkoop,
  kostentarieven: kost,
  detacheringen,
  aanwijzingsrollen: [],
  caseForecasts: [],
  reiskosten: 0,
  vasteKosten: 0,
  opdrachtgevers: [
    { id: "og-hanab", naam: "Hanab" },
    { id: "og-vangelder", naam: "van Gelder" },
  ],
  ...extra,
});

describe("verkooptarief bepalen", () => {
  it("pakt eerst de exacte rol", () => {
    const t = bepaalVerkooptarief(verkoop, "og-hanab", "WV", "2026-10-14");
    expect(t?.uurtarief).toBe(110);
    expect(t?.g_rekening_pct).toBe(20);
  });

  it("valt terug op 'alle rollen' als de rol ontbreekt", () => {
    const t = bepaalVerkooptarief(verkoop, "og-hanab", "uitvoerder", "2026-10-14");
    expect(t?.uurtarief).toBe(90);
  });

  it("neemt het nieuwste tarief dat op die datum geldig is", () => {
    const metNieuw: VerkooptariefRij[] = [
      ...verkoop,
      { opdrachtgever_id: "og-hanab", rol: "WV", uurtarief: 120, g_rekening_pct: 20, geldig_vanaf: "2026-10-01" },
    ];
    expect(bepaalVerkooptarief(metNieuw, "og-hanab", "WV", "2026-10-14")?.uurtarief).toBe(120);
    expect(bepaalVerkooptarief(metNieuw, "og-hanab", "WV", "2026-09-01")?.uurtarief).toBe(110);
  });

  it("geeft null als er geen enkel tarief geldig is", () => {
    expect(bepaalVerkooptarief(verkoop, "og-onbekend", "WV", "2026-10-14")).toBeNull();
    expect(bepaalVerkooptarief(verkoop, null, "WV", "2026-10-14")).toBeNull();
  });
});

describe("kostentarief bepalen", () => {
  it("is altijd €0 voor eigenaren", () => {
    expect(bepaalKostentarief(kost, true, "m-eigenaar", "2026-10-14")).toBe(0);
  });

  it("neemt het laatst geldende tarief", () => {
    const metNieuw: KostentariefRij[] = [...kost, { medewerker_id: "m-monteur", uurtarief: 80, geldig_vanaf: "2026-10-01" }];
    expect(bepaalKostentarief(metNieuw, false, "m-monteur", "2026-10-14")).toBe(80);
    expect(bepaalKostentarief(metNieuw, false, "m-monteur", "2026-09-01")).toBe(70);
  });

  it("geeft null zonder tariefrij", () => {
    expect(bepaalKostentarief(kost, false, "m-nieuw", "2026-10-14")).toBeNull();
  });
});

describe("financieel overzicht", () => {
  const uren: UrenRij[] = [
    { medewerker_id: "m-wv", project_id: "p-hanab", datum: "2026-10-14", uren: 8, verwachte: false },
    { medewerker_id: "m-monteur", project_id: "p-hanab", datum: "2026-10-14", uren: 8, verwachte: true },
  ];

  it("rekent uitleen-uren tegen het verkooptarief van de detachering", () => {
    const r = berekenFinannen(input({ uren }));
    // WV via detachering: 8 × 110 = 880 (20% G-rekening).
    // Monteur zonder detachering én zonder aanwijzing: rol onbekend → tarief "alle rollen" 8 × 90 = 720 (0%).
    expect(r.omzet_uitleen).toBeCloseTo(1600, 2);
    expect(r.omzet).toBeCloseTo(1600, 2);
    expect(r.g_rekening).toBeCloseTo(176, 2);
    // Kosten: 8 × 80 + 8 × 70 = 1200.
    expect(r.kosten).toBeCloseTo(1200, 2);
    expect(r.marge).toBeCloseTo(400, 2);
  });

  it("neemt het roltarief zodra de rol uit de detachering komt", () => {
    const r = berekenFinannen(input({
      uren: [{ medewerker_id: "m-monteur", project_id: "p-hanab", datum: "2026-10-14", uren: 8, verwachte: false }],
      detacheringen: [
        ...detacheringen,
        {
          id: "d2", medewerker_id: "m-monteur", opdrachtgever_id: "og-hanab", project_id: "p-hanab",
          rol: "monteur", van: "2026-01-01", tot: null, uren_per_week: 40, tarief_override: null,
        },
      ],
    }));
    expect(r.omzet_uitleen).toBeCloseTo(8 * 97.5, 2);
    expect(r.g_rekening).toBeCloseTo(8 * 97.5 * 0.2, 2);
  });

  it("markeert geplande uren apart en telt ze mee", () => {
    const r = berekenFinannen(input({ uren }));
    const monteur = r.personen.find((p) => p.medewerker_id === "m-monteur");
    expect(monteur?.uren).toBe(8);
    expect(monteur?.verwachte_uren).toBe(8);
    const hanab = r.regels.find((x) => x.project_id === "p-hanab");
    expect(hanab?.verwachte_uren).toBe(8);
  });

  it("waarschuwt en laat € ? zien zonder geldig verkooptarief", () => {
    const r = berekenFinannen(input({
      uren: [{ medewerker_id: "m-monteur", project_id: "p-hanab", datum: "2026-10-14", uren: 8, verwachte: false }],
      verkooptarieven: [],
    }));
    expect(r.omzet).toBe(0);
    expect(r.regels.find((x) => x.project_id === "p-hanab")?.tarief_onbekend).toBe(true);
    expect(r.waarschuwingen.some((w) => w.type === "geen_verkooptarief")).toBe(true);
  });

  it("waarschuwt voor een professional zonder kostentarief", () => {
    const r = berekenFinannen(input({
      uren: [{ medewerker_id: "m-nieuw", project_id: "p-hanab", datum: "2026-10-14", uren: 8, verwachte: false }],
    }));
    expect(r.waarschuwingen.some((w) => w.type === "geen_kostentarief")).toBe(true);
    expect(r.eigenaren.length).toBe(0);
  });

  it("verdeelt de forecastopbrengst van een klus naar rato van de uren", () => {
    const caseForecasts: CaseForecast[] = [{ project_id: "p-klus", omzet: 1000, totaal_uren: 100 }];
    const r = berekenFinannen(input({
      uren: [{ medewerker_id: "m-monteur", project_id: "p-klus", datum: "2026-10-14", uren: 10, verwachte: false }],
      caseForecasts,
    }));
    expect(r.omzet_cases).toBeCloseTo(100, 2);
    expect(r.regels.find((x) => x.project_id === "p-klus")?.omzet).toBeCloseTo(100, 2);
  });

  it("telt reiskosten en vaste kosten mee in de ruimte voor eigen uitbetaling", () => {
    const r = berekenFinannen(input({
      uren: [{ medewerker_id: "m-wv", project_id: "p-hanab", datum: "2026-10-14", uren: 8, verwachte: false }],
      reiskosten: 50,
      vasteKosten: 100,
    }));
    // omzet 880, kosten 8×80 + 50 = 690, marge 190, G-rekening 176, vaste kosten 100.
    expect(r.kosten).toBeCloseTo(690, 2);
    expect(r.marge).toBeCloseTo(190, 2);
    expect(r.uitbetaling.ruimte).toBeCloseTo(190 - 176 - 100, 2);
  });

  it("houdt bij welke uren geen prijs gevonden is", () => {
    // Hanab heeft hier geen "alle rollen"-rij: de monteur zonder detachering
    // en zonder aanwijzing blijft dus zonder prijs, de WV niet.
    const r = berekenFinannen(input({
      uren: [
        { medewerker_id: "m-wv", project_id: "p-hanab", datum: "2026-10-14", uren: 8, verwachte: false },
        { medewerker_id: "m-monteur", project_id: "p-hanab", datum: "2026-10-14", uren: 6, verwachte: false },
      ],
      verkooptarieven: verkoop.filter((v) => !(v.opdrachtgever_id === "og-hanab" && v.rol === null)),
    }));
    const hanab = r.regels.find((x) => x.project_id === "p-hanab")!;
    expect(hanab.uren_zonder_tarief).toBe(6);
    expect(hanab.omzet).toBeCloseTo(880, 2);
    expect(hanab.tarief_onbekend).toBe(true);
  });

  it("toont eigenaren apart met €0 kostprijs", () => {
    const r = berekenFinannen(input({
      uren: [{ medewerker_id: "m-eigenaar", project_id: "p-hanab", datum: "2026-10-14", uren: 10, verwachte: false }],
    }));
    expect(r.personen.find((p) => p.medewerker_id === "m-eigenaar")).toBeUndefined();
    const eigenaar = r.eigenaren.find((p) => p.medewerker_id === "m-eigenaar");
    expect(eigenaar?.kosten).toBe(0);
    expect(eigenaar?.uren).toBe(10);
  });

  it("berekent de kosten van een fictief eigenarentarief", () => {
    const r = berekenFinannen(input({
      uren: [{ medewerker_id: "m-eigenaar", project_id: "p-hanab", datum: "2026-10-14", uren: 10, verwachte: false }],
    }));
    expect(r.uitbetaling.fictief_tarief).toBe(65);
    expect(r.uitbetaling.fictief_kosten).toBeCloseTo(650, 2);
  });

  it("gebruikt de BEI-aanwijzingsrol als er geen detachering is", () => {
    const aanwijzingsrollen: AanwijzingRol[] = [
      { medewerker_id: "m-monteur", opdrachtgever_id: "og-hanab", rol: "monteur", geldig_tot: "2026-12-31" },
    ];
    const r = berekenFinannen(input({
      uren: [{ medewerker_id: "m-monteur", project_id: "p-hanab", datum: "2026-10-14", uren: 8, verwachte: false }],
      detacheringen: [],
      aanwijzingsrollen,
    }));
    expect(r.omzet_uitleen).toBeCloseTo(8 * 97.5, 2);
  });
});
