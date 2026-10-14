import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adminProjects } from "@/lib/projectsAdmin";
import { euroDecimals as fmt } from "@/lib/formatting";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { useProfile } from "@/hooks/useProfile";
import type { DetacheringRij, KostentariefRij, VerkooptariefRij } from "@/lib/financien";

type Tab = "verkoop" | "kost" | "spec";

interface BewerkVorm {
  soort: "verkoop" | "kost";
  /** opdrachtgever_id + rol (verkoop) of medewerker_id (kost) */
  opdrachtgever_id?: string;
  rol?: string | null;
  medewerker_id?: string;
  bedrag: string;
  pct: string;
  datum: string;
}

const vandaag = () => new Date().toISOString().slice(0, 10);

/**
 * Manager-only tarieftabellen (stap 2 van FINANCIEN.md).
 * Een wijziging maakt ALTIJD een nieuwe rij met een ingangsdatum; de oude rij
 * blijft staan zodat bestaande uren op hun oorspronkelijke tarief blijven staan.
 */
export function TarievenDesktop() {
  const { profile } = useProfile();
  const [tab, setTab] = useState<Tab>("verkoop");
  const [verkoop, setVerkoop] = useState<VerkooptariefRij[]>([]);
  const [kost, setKost] = useState<KostentariefRij[]>([]);
  const [namen, setNamen] = useState<Map<string, string>>(new Map());
  const [og, setOg] = useState<{ id: string; naam: string }[]>([]);
  const [projectenPerOg, setProjectenPerOg] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [vorm, setVorm] = useState<BewerkVorm | null>(null);
  const [uitgeklaapt, setUitgeklaapt] = useState<Set<string>>(new Set());
  const [herberekend, setHerberekend] = useState<number | null>(null);

  const laad = useCallback(async () => {
    setLoading(true);
    const [v, k, p, o, pr] = await Promise.all([
      supabase.from("verkooptarieven").select("*").order("geldig_vanaf"),
      supabase.from("kostentarieven").select("*").order("geldig_vanaf"),
      supabase.from("profiles").select("id, full_name").order("full_name"),
      supabase.from("opdrachtgevers").select("id, naam").order("naam"),
      adminProjects().select("id, opdrachtgever_id"),
    ]);
    setVerkoop((v.data || []).map((r: any) => ({
      id: r.id, opdrachtgever_id: r.opdrachtgever_id, rol: r.rol ?? null,
      uurtarief: Number(r.uurtarief), g_rekening_pct: Number(r.g_rekening_pct),
      geldig_vanaf: r.geldig_vanaf, notitie: r.notitie ?? null,
    })));
    setKost((k.data || []).map((r: any) => ({
      id: r.id, medewerker_id: r.medewerker_id, uurtarief: Number(r.uurtarief), geldig_vanaf: r.geldig_vanaf,
    })));
    setNamen(new Map((p.data || []).map((x: any) => [x.id, x.full_name])));
    setOg((o.data || []).map((x: any) => ({ id: x.id, naam: x.naam })));
    const m = new Map<string, string[]>();
    for (const x of pr.data || []) {
      if (!x.opdrachtgever_id) continue;
      m.set(x.opdrachtgever_id, [...(m.get(x.opdrachtgever_id) || []), x.id]);
    }
    setProjectenPerOg(m);
    setLoading(false);
  }, []);

  useEffect(() => { laad(); }, [laad]);

  const huidigeVerkoop = useMemo(() => {
    const perSleutel = new Map<string, VerkooptariefRij>();
    for (const r of verkoop) {
      const sleutel = `${r.opdrachtgever_id}|${r.rol ?? ""}`;
      const bestaand = perSleutel.get(sleutel);
      if (!bestaand || r.geldig_vanaf > bestaand.geldig_vanaf) perSleutel.set(sleutel, r);
    }
    return perSleutel;
  }, [verkoop]);

  const huidigeKost = useMemo(() => {
    const perPersoon = new Map<string, KostentariefRij>();
    for (const r of kost) {
      const bestaand = perPerPersoon(perPersoon, r.medewerker_id);
      if (!bestaand || r.geldig_vanaf > bestaand.geldig_vanaf) perPersoon.set(r.medewerker_id, r);
    }
    return perPersoon;
  }, [kost]);

  function startBewerken(v: BewerkVorm) {
    setVorm(v);
    setHerberekend(null);
    telHerberekend(v);
  }

  async function telHerberekend(v: BewerkVorm) {
    if (v.datum >= vandaag()) { setHerberekend(0); return; }
    let query = supabase.from("uren_boekingen").select("uren").gte("datum", v.datum).neq("status", "afgekeurd");
    if (v.soort === "kost" && v.medewerker_id) {
      query = query.eq("medewerker_id", v.medewerker_id);
    } else if (v.opdrachtgever_id) {
      const ids = projectenPerOg.get(v.opdrachtgever_id) || [];
      if (ids.length === 0) { setHerberekend(0); return; }
      query = query.in("project_id", ids);
    }
    const { data } = await query;
    setHerberekend((data || []).reduce((s: number, r: any) => s + Number(r.uren || 0), 0));
  }

  async function slaOp() {
    if (!vorm) return;
    const bedrag = parseFloat(vorm.bedrag.replace(",", "."));
    if (isNaN(bedrag) || bedrag < 0) { toast.error("Ongeldig tarief"); return; }
    if (!vorm.datum) { toast.error("Kies een ingangsdatum"); return; }
    const created_by = profile?.id || null;

    if (vorm.soort === "verkoop") {
      const pct = parseFloat(vorm.pct.replace(",", "."));
      if (isNaN(pct) || pct < 0 || pct > 100) { toast.error("Ongeldig percentage"); return; }
      const { error } = await supabase.from("verkooptarieven").insert({
        opdrachtgever_id: vorm.opdrachtgever_id,
        rol: vorm.rol ?? null,
        uurtarief: bedrag,
        g_rekening_pct: pct,
        geldig_vanaf: vorm.datum,
        created_by,
      });
      if (error) { toast.error("Opslaan mislukt"); return; }
      toast.success("Verkooptarief toegevoegd");
    } else {
      const { error } = await supabase.from("kostentarieven").insert({
        medewerker_id: vorm.medewerker_id,
        uurtarief: bedrag,
        geldig_vanaf: vorm.datum,
      });
      if (error) { toast.error("Opslaan mislukt"); return; }
      toast.success("Kostentarief toegevoegd");
    }
    setVorm(null);
    setHerberekend(null);
    laad();
  }

  function klapIn(sleutel: string) {
    const volgende = new Set(uitgeklaapt);
    if (volgende.has(sleutel)) volgende.delete(sleutel); else volgende.add(sleutel);
    setUitgeklaapt(volgende);
  }

  if (loading) return <div className="fn-body"><Spinner padding="py-10" /></div>;

  return (
    <div className="fn-body">
      <div className="fn-mode" role="group" aria-label="Tariefsoort">
        <button aria-pressed={tab === "verkoop"} onClick={() => setTab("verkoop")}>Verkooptarieven</button>
        <button aria-pressed={tab === "kost"} onClick={() => setTab("kost")}>Kostentarieven</button>
        <button aria-pressed={tab === "spec"} onClick={() => setTab("spec")}>Spec codes</button>
      </div>

      {tab === "verkoop" && (
        <div className="fn-stapel">
          {og.map((o) => {
            const rollen = verkoop.filter((r) => r.opdrachtgever_id === o.id)
              .map((r) => r.rol ?? "")
              .filter((v, i, a) => a.indexOf(v) === i)
              .sort();
            return (
              <section key={o.id} className="mw-card">
                <div className="mw-row-between">
                  <div>
                    <div className="mw-card-title">{o.naam}</div>
                    <div className="mw-card-sub">Wat wij faktureren per rol. Wijzigen maakt een nieuwe rij met ingangsdatum.</div>
                  </div>
                  <button
                    className="mw-btn mw-btn--sm"
                    onClick={() => startBewerken({ soort: "verkoop", opdrachtgever_id: o.id, rol: null, bedrag: "", pct: "0", datum: vandaag() })}
                  >
                    <Plus className="h-3.5 w-3.5" /> Rol toevoegen
                  </button>
                </div>
                <table className="mw-table">
                  <thead>
                    <tr><th>Rol</th><th className="fn-r">Tarief</th><th className="fn-r">G-rekening</th><th className="fn-r">Geldig vanaf</th><th></th></tr>
                  </thead>
                  <tbody>
                    {rollen.map((rol) => {
                      const sleutel = `${o.id}|${rol}`;
                      const h = huidigeVerkoop.get(sleutel);
                      const sejarah = verkoop
                        .filter((r) => r.opdrachtgever_id === o.id && (r.rol ?? "") === rol)
                        .sort((a, b) => b.geldig_vanaf.localeCompare(a.geldig_vanaf));
                      const open = uitgeklaapt.has(sleutel);
                      return (
                        <RijGroep
                          key={sleutel}
                          rol={rol === "" ? "(alle rollen)" : rol}
                          tarief={h ? fmt(h.uurtarief) : "—"}
                          pct={h ? `${h.g_rekening_pct}%` : "—"}
                          vanaf={h?.geldig_vanaf || "—"}
                          historie={open ? sejarah : []}
                          kanOpenen={sejarah.length > 1}
                          open={open}
                          opKlikHistorie={() => klapIn(sleutel)}
                          opWijzigen={() => startBewerken({
                            soort: "verkoop", opdrachtgever_id: o.id, rol: rol === "" ? null : rol,
                            bedrag: h ? String(h.uurtarief) : "", pct: h ? String(h.g_rekening_pct) : "0", datum: vandaag(),
                          })}
                        />
                      );
                    })}
                    {rollen.length === 0 && <tr><td colSpan={5} className="fn-leeg">Nog geen tarieven voor deze opdrachtgever.</td></tr>}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      )}

      {tab === "kost" && (
        <section className="mw-card">
          <div className="mw-card-title">Kostentarieven per professional</div>
          <div className="mw-card-sub">Wat wij betalen. Ook hier blijft de oude rij staan.</div>
          <table className="mw-table">
            <thead>
              <tr><th>Professional</th><th className="fn-r">Tarief</th><th className="fn-r">Geldig vanaf</th><th></th></tr>
            </thead>
            <tbody>
              {Array.from(namen.entries()).map(([id, naam]) => {
                const h = huidigeKost.get(id);
                const sejarah = kost.filter((r) => r.medewerker_id === id).sort((a, b) => b.geldig_vanaf.localeCompare(a.geldig_vanaf));
                const sleutel = `k|${id}`;
                const open = uitgeklaapt.has(sleutel);
                return (
                  <RijGroep
                    key={id}
                    rol={naam}
                    tarief={h ? fmt(h.uurtarief) : "€ ?"}
                    pct="—"
                    vanaf={h?.geldig_vanaf || "—"}
                    historie={open ? sejarah : []}
                    kanOpenen={sejarah.length > 1}
                    open={open}
                    opKlikHistorie={() => klapIn(sleutel)}
                    opWijzigen={() => startBewerken({
                      soort: "kost", medewerker_id: id,
                      bedrag: h ? String(h.uurtarief) : "", pct: "", datum: vandaag(),
                    })}
                  />
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {tab === "spec" && <SpecCodesTab />}

      {vorm && (
        <div className="fn-dialog-maske" role="dialog" aria-modal="true">
          <div className="fn-dialog">
            <div className="fn-dialog-kop">
              {vorm.soort === "verkoop"
                ? `Verkooptarief — ${og.find((o) => o.id === vorm.opdrachtgever_id)?.naam || ""}${vorm.rol ? ` · ${vorm.rol}` : " · (alle rollen)"}`
                : `Kostentarief — ${namen.get(vorm.medewerker_id || "") || ""}`}
            </div>
            <div className="fn-dialog-rij">
              <label>Nieuw tarief (€ / uur)</label>
              <input className="fn-input" autoFocus value={vorm.bedrag}
                onChange={(e) => setVorm({ ...vorm, bedrag: e.target.value })} />
            </div>
            {vorm.soort === "verkoop" && (
              <div className="fn-dialog-rij">
                <label>Naar G-rekening (%)</label>
                <input className="fn-input" value={vorm.pct}
                  onChange={(e) => setVorm({ ...vorm, pct: e.target.value })} />
              </div>
            )}
            <div className="fn-dialog-rij">
              <label>Ingangsdatum (verplicht)</label>
              <input className="fn-input" type="date" value={vorm.datum}
                onChange={(e) => { const datum = e.target.value; setVorm({ ...vorm, datum }); telHerberekend({ ...vorm, datum }); }} />
            </div>
            {herberekend !== null && herberekend > 0 && (
              <div className="fn-waarschuwing">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Herberekent {herberekend.toLocaleString("nl-NL")} uren vanaf {vorm.datum}.
              </div>
            )}
            <div className="fn-dialog-voet">
              <button className="mw-btn mw-btn--sm" onClick={() => setVorm(null)}>Annuleren</button>
              <button className="mw-btn mw-btn--sm mw-btn--primary" onClick={slaOp}>Opslaan als nieuwe rij</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function perPerPersoon(map: Map<string, KostentariefRij>, id: string) {
  return map.get(id);
}

function RijGroep(p: {
  rol: string; tarief: string; pct: string; vanaf: string;
  historie: { geldig_vanaf: string; uurtarief: number; g_rekening_pct?: number }[];
  kanOpenen: boolean; open: boolean;
  opKlikHistorie: () => void; opWijzigen: () => void;
}) {
  return (
    <>
      <tr>
        <td>
          <button className="fn-historie-knop" disabled={!p.kanOpenen} onClick={p.opKlikHistorie}>
            {p.kanOpenen ? (p.open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="fn-historie-punt" />}
            <span>{p.rol}</span>
          </button>
        </td>
        <td className="fn-r">{p.tarief}</td>
        <td className="fn-r">{p.pct}</td>
        <td className="fn-r">{p.vanaf}</td>
        <td className="fn-r">
          <button className="mw-btn mw-btn--sm" onClick={p.opWijzigen}><Pencil className="h-3 w-3" /> Tarief wijzigen</button>
        </td>
      </tr>
      {p.open && p.historie.map((h, i) => (
        <tr key={`${h.geldig_vanaf}-${i}`} className="fn-historie-rij">
          <td className="fn-cel-sub">geldig vanaf</td>
          <td className="fn-r">{euroDecimalsUit(h.uurtarief)}</td>
          <td className="fn-r">{h.g_rekening_pct != null ? `${h.g_rekening_pct}%` : "—"}</td>
          <td className="fn-r">{h.geldig_vanaf}</td>
          <td></td>
        </tr>
      ))}
    </>
  );
}

function euroDecimalsUit(n: number) {
  return n.toLocaleString("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
}

/** De bestaande spec-codetabel blijft bereikbaar, maar staat nu op een tabblad. */
function SpecCodesTab() {
  const [tarieven, setTarieven] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from("spec_code_tarieven").select("*").order("code").then(({ data }) => {
      setTarieven(data || []);
      setLoading(false);
    });
  }, []);
  if (loading) return <Spinner padding="py-8" />;
  return (
    <section className="mw-card">
      <div className="mw-card-title">Spec codes (Van Gelder prijslijst)</div>
      <div className="mw-card-sub">Bestekcodes voor cases. Verkoop- en kostentarieven staan op de andere tabbladen.</div>
      <table className="mw-table">
        <thead><tr><th>Code</th><th>Omschrijving</th><th>Eenheid</th><th className="fn-r">Tarief</th></tr></thead>
        <tbody>
          {tarieven.map((t) => (
            <tr key={t.id}>
              <td className="fn-mono">{t.code}</td>
              <td>{t.omschrijving}</td>
              <td>{t.eenheid}</td>
              <td className="fn-r">{euroDecimalsUit(Number(t.tarief))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
