import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { euroDecimals as fmt } from "@/lib/formatting";
import { bepaalVerkooptarief, isActieveDetachering, type VerkooptariefRij } from "@/lib/financien";

const vandaag = () => new Date().toISOString().slice(0, 10);

function statusVan(d: any): "actief" | "gepland" | "verlopen" {
  const nu = vandaag();
  if (d.van > nu) return "gepland";
  if (d.tot && d.tot < nu) return "verlopen";
  return "actief";
}

const STATUS_LABEL: Record<string, string> = { actief: "Actief", gepland: "Gepland", verlopen: "Verlopen" };

/**
 * Kaart "Uitleen" op de Medewerkers-pagina (stap 3): actieve en geplande
 * detacheringen, met een formulier om er een toe te voegen.
 */
export function DetacheringenKaart(p: {
  medewerkerId: string;
  detacheringen: any[];
  opdrachtgevers: { id: string; naam: string }[];
  verkooptarieven: VerkooptariefRij[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [vorm, setVorm] = useState({
    opdrachtgever_id: "", rol: "", van: vandaag(), tot: "", uren_per_week: "40", tarief: "", notitie: "",
  });

  const eigen = p.detacheringen
    .filter((d) => d.medewerker_id === p.medewerkerId)
    .sort((a, b) => b.van.localeCompare(a.van));

  async function toevoegen() {
    if (!vorm.opdrachtgever_id) { toast.error("Kies een opdrachtgever"); return; }
    if (!vorm.rol.trim()) { toast.error("Vul een rol in"); return; }
    if (!vorm.van) { toast.error("Kies een startdatum"); return; }
    const { error } = await supabase.from("detacheringen").insert({
      medewerker_id: p.medewerkerId,
      opdrachtgever_id: vorm.opdrachtgever_id,
      rol: vorm.rol.trim(),
      van: vorm.van,
      tot: vorm.tot || null,
      uren_per_week: parseFloat(vorm.uren_per_week.replace(",", ".")) || 40,
      tarief_override: vorm.tarief ? parseFloat(vorm.tarief.replace(",", ".")) : null,
      notitie: vorm.notitie || null,
    } as any);
    if (error) { toast.error("Toevoegen mislukt"); return; }
    toast.success("Uitleen toegevoegd");
    setOpen(false);
    setVorm({ opdrachtgever_id: "", rol: "", van: vandaag(), tot: "", uren_per_week: "40", tarief: "", notitie: "" });
    p.onRefresh();
  }

  async function beindigen(d: any) {
    const { error } = await supabase.from("detacheringen").update({ tot: vandaag() }).eq("id", d.id);
    if (error) { toast.error("Beëindigen mislukt"); return; }
    toast.success("Uitleen per vandaag beëindigd");
    p.onRefresh();
  }

  return (
    <div className="mw-card">
      <div className="mw-row-between">
        <div>
          <div className="mw-card-title">Uitleen</div>
          <div className="mw-card-sub">Periodes waarin deze professional bij een opdrachtgever werkt.</div>
        </div>
        <button className="mw-btn mw-btn--sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Uitleen toevoegen</button>
      </div>

      {eigen.length === 0 ? (
        <div className="mw-card-sub">Nog geen uitleen vastgelegd.</div>
      ) : (
        <table className="mw-table">
          <thead>
            <tr><th>Opdrachtgever</th><th>Rol</th><th>Periode</th><th className="fn-r">Uren/wk</th><th className="fn-r">Tarief</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {eigen.map((d) => {
              const og = p.opdrachtgevers.find((o) => o.id === d.opdrachtgever_id);
              const status = statusVan(d);
              const tarief = d.tarief_override != null
                ? `${fmt(Number(d.tarief_override))} (afwijkend)`
                : (() => {
                    const t = bepaalVerkooptarief(p.verkooptarieven, d.opdrachtgever_id, d.rol, vandaag());
                    return t ? fmt(t.uurtarief) : "€ ?";
                  })();
              return (
                <tr key={d.id}>
                  <td>{og?.naam || "—"}</td>
                  <td>{d.rol}</td>
                  <td>{d.van}{d.tot ? ` t/m ${d.tot}` : " (doorlopend)"}</td>
                  <td className="fn-r">{d.uren_per_week ?? "—"}</td>
                  <td className="fn-r">{tarief}</td>
                  <td><span className="mw-pill">{STATUS_LABEL[status]}</span></td>
                  <td className="fn-r">
                    {status !== "verlopen" && (
                      <button className="fn-link" onClick={() => beindigen(d)}>Beëindigen</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {open && (
        <div className="fn-dialog-maske" role="dialog" aria-modal="true">
          <div className="fn-dialog">
            <div className="fn-dialog-kop">Uitleen toevoegen</div>
            <div className="fn-dialog-rij">
              <label>Opdrachtgever</label>
              <select className="fn-input" style={{ width: "100%" }} value={vorm.opdrachtgever_id}
                onChange={(e) => setVorm({ ...vorm, opdrachtgever_id: e.target.value })}>
                <option value="">Kies een opdrachtgever</option>
                {p.opdrachtgevers.map((o) => <option key={o.id} value={o.id}>{o.naam}</option>)}
              </select>
            </div>
            <div className="fn-dialog-rij">
              <label>Rol (bijv. WV, monteur, VOP)</label>
              <input className="fn-input" style={{ width: "100%" }} value={vorm.rol}
                onChange={(e) => setVorm({ ...vorm, rol: e.target.value })} />
            </div>
            <div className="fn-dialoog-paar">
              <div className="fn-dialog-rij">
                <label>Vanaf</label>
                <input className="fn-input" type="date" value={vorm.van}
                  onChange={(e) => setVorm({ ...vorm, van: e.target.value })} />
              </div>
              <div className="fn-dialog-rij">
                <label>Tot (leeg = doorlopend)</label>
                <input className="fn-input" type="date" value={vorm.tot}
                  onChange={(e) => setVorm({ ...vorm, tot: e.target.value })} />
              </div>
            </div>
            <div className="fn-dialoog-paar">
              <div className="fn-dialog-rij">
                <label>Uren per week</label>
                <input className="fn-input" value={vorm.uren_per_week}
                  onChange={(e) => setVorm({ ...vorm, uren_per_week: e.target.value })} />
              </div>
              <div className="fn-dialog-rij">
                <label>Afwijkend tarief (optioneel)</label>
                <input className="fn-input" value={vorm.tarief} placeholder="leeg = verkooptarief"
                  onChange={(e) => setVorm({ ...vorm, tarief: e.target.value })} />
              </div>
            </div>
            <div className="fn-dialog-rij">
              <label>Notitie (optioneel)</label>
              <input className="fn-input" style={{ width: "100%" }} value={vorm.notitie}
                onChange={(e) => setVorm({ ...vorm, notitie: e.target.value })} />
            </div>
            <div className="fn-dialog-voet">
              <button className="mw-btn mw-btn--sm" onClick={() => setOpen(false)}>Annuleren</button>
              <button className="mw-btn mw-btn--sm mw-btn--primary" onClick={toevoegen}>Toevoegen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Dossier → Tarief: kostentarieven met ingangsdatum; een wijziging is een nieuwe rij. */
export function TariefKaart(p: {
  medewerkerId: string;
  isEigenaar: boolean;
  kostentarieven: any[];
  onRefresh: () => void;
}) {
  const [vorm, setVorm] = useState<{ bedrag: string; datum: string } | null>(null);

  const eigen = p.kostentarieven
    .filter((k) => k.medewerker_id === p.medewerkerId)
    .sort((a, b) => b.geldig_vanaf.localeCompare(a.geldig_vanaf));
  const huidig = eigen[0];

  async function opslaan() {
    if (!vorm) return;
    const bedrag = parseFloat(vorm.bedrag.replace(",", "."));
    if (isNaN(bedrag) || bedrag < 0) { toast.error("Ongeldig tarief"); return; }
    if (!vorm.datum) { toast.error("Kies een ingangsdatum"); return; }
    const { error } = await supabase.from("kostentarieven").insert({
      medewerker_id: p.medewerkerId, uurtarief: bedrag, geldig_vanaf: vorm.datum,
    } as any);
    if (error) { toast.error("Opslaan mislukt"); return; }
    toast.success("Kostentarief toegevoegd");
    setVorm(null);
    p.onRefresh();
  }

  return (
    <div className="mw-card">
      <div className="mw-row-between">
        <div>
          <div className="mw-card-title">Tarief</div>
          <div className="mw-card-sub">Wat wij betalen per uur. Wijzigen maakt een nieuwe rij met ingangsdatum; de oude blijft staan.</div>
        </div>
        {!p.isEigenaar && (
          <button className="mw-btn mw-btn--sm" onClick={() => setVorm({ bedrag: huidig ? String(huidig.uurtarief) : "", datum: vandaag() })}>
            Tarief wijzigen
          </button>
        )}
      </div>
      {p.isEigenaar ? (
        <div className="mw-card-sub">Eigenaar: kostprijs is altijd € 0,00.</div>
      ) : eigen.length === 0 ? (
        <div className="mw-card-sub">Nog geen kostentarief vastgelegd.</div>
      ) : (
        <table className="mw-table">
          <thead><tr><th>Geldig vanaf</th><th className="fn-r">Tarief</th></tr></thead>
          <tbody>
            {eigen.map((k, i) => (
              <tr key={k.id} className={i === 0 ? "" : "fn-historie-rij"}>
                <td>{k.geldig_vanaf}{i === 0 ? " (huidig)" : ""}</td>
                <td className="fn-r">{fmt(Number(k.uurtarief))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {vorm && (
        <div className="fn-dialog-maske" role="dialog" aria-modal="true">
          <div className="fn-dialog">
            <div className="fn-dialog-kop">Kostentarief wijzigen</div>
            <div className="fn-dialog-rij">
              <label>Nieuw tarief (€ / uur)</label>
              <input className="fn-input" autoFocus value={vorm.bedrag}
                onChange={(e) => setVorm({ ...vorm, bedrag: e.target.value })} />
            </div>
            <div className="fn-dialog-rij">
              <label>Ingangsdatum (verplicht)</label>
              <input className="fn-input" type="date" value={vorm.datum}
                onChange={(e) => setVorm({ ...vorm, datum: e.target.value })} />
            </div>
            <div className="fn-dialog-voet">
              <button className="mw-btn mw-btn--sm" onClick={() => setVorm(null)}>Annuleren</button>
              <button className="mw-btn mw-btn--sm mw-btn--primary" onClick={opslaan}>Opslaan als nieuwe rij</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
