import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { euroDecimals as fmt } from "@/lib/formatting";
import { bepaalVerkooptarief, type VerkooptariefRij } from "@/lib/financien";

const vandaag = () => new Date().toISOString().slice(0, 10);

/**
 * Detail van een uitleenproject (stap 3): het huidige verkooptarief en de
 * professionals die er nu of straks gedetacheerd zijn. Alles uit de tabellen
 * verkooptarieven / detacheringen; er staat geen tarief in deze code.
 */
export function UitleenDetacheringen({ projectId, opdrachtgeverId }: { projectId: string; opdrachtgeverId: string | null }) {
  const [verkoop, setVerkoop] = useState<VerkooptariefRij[]>([]);
  const [det, setDet] = useState<any[]>([]);
  const [namen, setNamen] = useState<Map<string, string>>(new Map());
  const [laadde, setLaadde] = useState(true);

  useEffect(() => {
    let actief = true;
    (async () => {
      const [v, d] = await Promise.all([
        opdrachtgeverId
          ? supabase.from("verkooptarieven").select("*").eq("opdrachtgever_id", opdrachtgeverId).order("geldig_vanaf")
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("detacheringen").select("*").eq("project_id", projectId).order("van"),
      ]);
      const detRijen = d.data ?? [];
      const ids = Array.from(new Set(detRijen.map((x: any) => x.medewerker_id)));
      const { data: prof } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] as { id: string; full_name: string }[] };
      if (!actief) return;
      setVerkoop((v.data ?? []).map((r: any) => ({
        id: r.id, opdrachtgever_id: r.opdrachtgever_id, rol: r.rol ?? null,
        uurtarief: Number(r.uurtarief), g_rekening_pct: Number(r.g_rekening_pct), geldig_vanaf: r.geldig_vanaf,
      })));
      setDet(detRijen);
      setNamen(new Map((prof ?? []).map((p: any) => [p.id, p.full_name])));
      setLaadde(false);
    })();
    return () => { actief = false; };
  }, [projectId, opdrachtgeverId]);

  const rollen = Array.from(new Set(verkoop.map((r) => r.rol ?? ""))).sort();
  const nu = vandaag();

  return (
    <section className="pj-card">
      <h3>Tarief en detacheringen</h3>
      {laadde ? (
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Laden…</p>
      ) : (
        <>
          {!opdrachtgeverId ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              Geen opdrachtgever gekoppeld. Kies er een bij "Bewerken" om het verkooptarief te kunnen tonen.
            </p>
          ) : rollen.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--warn-text)" }}>
              Nog geen verkooptarief voor deze opdrachtgever.
            </p>
          ) : (
            <table className="mw-table">
              <thead><tr><th>Rol</th><th className="fn-r">Tarief</th><th className="fn-r">G-rekening</th><th className="fn-r">Geldig vanaf</th></tr></thead>
              <tbody>
                {rollen.map((rol) => {
                  const t = bepaalVerkooptarief(verkoop, opdrachtgeverId, rol === "" ? null : rol, nu);
                  if (!t) return null;
                  return (
                    <tr key={rol || "(alle rollen)"}>
                      <td>{rol === "" ? "(alle rollen)" : rol}</td>
                      <td className="fn-r">{fmt(t.uurtarief)}</td>
                      <td className="fn-r">{t.g_rekening_pct}%</td>
                      <td className="fn-r">{t.geldig_vanaf}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="pj-hr" />
          <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Gedetacheerde professionals</p>
          {det.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              Niemand is aan dit project gekoppeld. Voeg een uitleen toe op de Medewerkers-pagina.
            </p>
          ) : (
            <table className="mw-table">
              <thead><tr><th>Naam</th><th>Rol</th><th>Periode</th><th className="fn-r">Uren/wk</th><th className="fn-r">Tarief</th></tr></thead>
              <tbody>
                {det.map((d) => {
                  const actiefNu = d.van <= nu && (!d.tot || d.tot >= nu);
                  const komt = d.van > nu;
                  return (
                    <tr key={d.id}>
                      <td>{namen.get(d.medewerker_id) || "—"}{actiefNu ? "" : komt ? " (gepland)" : " (verlopen)"}</td>
                      <td>{d.rol}</td>
                      <td>{d.van}{d.tot ? ` t/m ${d.tot}` : " (doorlopend)"}</td>
                      <td className="fn-r">{d.uren_per_week ?? "—"}</td>
                      <td className="fn-r">{d.tarief_override != null ? `${fmt(Number(d.tarief_override))} (afwijkend)` : "verkooptarief"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
