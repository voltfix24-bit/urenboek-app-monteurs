import { describe, it, expect } from "vitest";
import { aggregateAudit, type AuditRow } from "@/lib/plannerAudit";

function row(over: Partial<AuditRow>): AuditRow {
  return {
    id: crypto.randomUUID(),
    created_at: "2026-06-19T10:00:00.000Z",
    manager_user_id: "m1",
    manager_naam: "Manager Een",
    external_id: "ext-1",
    datum: "2026-06-20",
    planning_id: null,
    uitkomst: "gesynchroniseerd",
    fout_reden: null,
    project_nummer: null,
    project_naam: null,
    monteur_naam: null,
    ...over,
  };
}

describe("aggregateAudit", () => {
  it("groepeert regels in dezelfde minuut + manager in één bucket", () => {
    const r1 = row({ created_at: "2026-06-19T10:00:10.000Z", uitkomst: "gesynchroniseerd" });
    const r2 = row({ created_at: "2026-06-19T10:00:55.000Z", uitkomst: "gesynchroniseerd" });
    const out = aggregateAudit([r1, r2]);
    expect(out).toHaveLength(1);
    expect(out[0].tellers.aangemaakt).toBe(2);
    expect(out[0].type).toBe("import");
    expect(out[0].status).toBe("geslaagd");
  });

  it("splitst buckets per minuut", () => {
    const out = aggregateAudit([
      row({ created_at: "2026-06-19T10:00:10.000Z" }),
      row({ created_at: "2026-06-19T10:01:10.000Z" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("splitst buckets per manager", () => {
    const out = aggregateAudit([
      row({ manager_user_id: "m1" }),
      row({ manager_user_id: "m2" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("status 'deels' als er zowel succes als fout in zit", () => {
    const out = aggregateAudit([
      row({ uitkomst: "bijgewerkt" }),
      row({ uitkomst: "fout", fout_reden: "x" }),
    ]);
    expect(out[0].status).toBe("deels");
    expect(out[0].type).toBe("update");
  });

  it("status 'mislukt' als alleen fout/geweigerd", () => {
    const out = aggregateAudit([
      row({ uitkomst: "fout" }),
      row({ uitkomst: "geweigerd" }),
    ]);
    expect(out[0].status).toBe("mislukt");
  });

  it("type 'verwijdering' bij verwijderd, 'markering_verwijderd' bij alleen gemarkeerd", () => {
    expect(aggregateAudit([row({ uitkomst: "verwijderd" })])[0].type).toBe("verwijdering");
    expect(aggregateAudit([row({ uitkomst: "gemarkeerd_verwijderd" })])[0].type).toBe("markering_verwijderd");
  });

  it("type 'herstel' bij hersteld", () => {
    expect(aggregateAudit([row({ uitkomst: "hersteld" })])[0].type).toBe("herstel");
  });

  it("type 'keuze' bij conflict-keuze", () => {
    const out = aggregateAudit([row({ uitkomst: "keuze_planner" })]);
    expect(out[0].type).toBe("keuze");
    expect(out[0].tellers.keuze).toBe(1);
    expect(out[0].status).toBe("geslaagd");
  });

  it("reeds_actief telt als overgeslagen, niet als fout", () => {
    const out = aggregateAudit([row({ uitkomst: "reeds_actief" })]);
    expect(out[0].tellers.overgeslagen).toBe(1);
    expect(out[0].status).toBe("geslaagd");
  });

  it("sorteert nieuwste bucket eerst", () => {
    const out = aggregateAudit([
      row({ created_at: "2026-06-19T09:00:00.000Z" }),
      row({ created_at: "2026-06-19T11:00:00.000Z" }),
      row({ created_at: "2026-06-19T10:00:00.000Z" }),
    ]);
    expect(out.map(b => b.ts)).toEqual([
      "2026-06-19T11:00:00.000Z",
      "2026-06-19T10:00:00.000Z",
      "2026-06-19T09:00:00.000Z",
    ]);
  });
});
