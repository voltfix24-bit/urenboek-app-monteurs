import { useEffect, useState } from "react";
import { endOfISOWeek, format, startOfISOWeek, startOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { formatUren } from "@/lib/formatting";

interface Rij { datum: string; uren: number; medewerker_id: string }

/** Alleen-lezen: geboekte uren voor een uitleen (deze week, deze maand, totaal, per monteur deze maand). */
export function UitleenUrenKaart({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
  const [rijen, setRijen] = useState<Rij[] | null>(null);
  const [namen, setNamen] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let actief = true;
    (async () => {
      const { data } = await supabase.from("uren_boekingen").select("datum, uren, medewerker_id").eq("project_id", projectId);
      const r = (data ?? []).map((d) => ({ datum: d.datum, uren: Number(d.uren) || 0, medewerker_id: d.medewerker_id }));
      const ids = Array.from(new Set(r.map((x) => x.medewerker_id)));
      const { data: prof } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] as { id: string; full_name: string }[] };
      if (!actief) return;
      setRijen(r);
      setNamen(new Map((prof ?? []).map((p) => [p.id, p.full_name])));
    })();
    return () => { actief = false; };
  }, [projectId]);

  const nu = new Date();
  const wVan = format(startOfISOWeek(nu), "yyyy-MM-dd");
  const wTot = format(endOfISOWeek(nu), "yyyy-MM-dd");
  const mVan = format(startOfMonth(nu), "yyyy-MM-dd");
  const lijst = rijen ?? [];
  const week = lijst.filter((r) => r.datum >= wVan && r.datum <= wTot).reduce((s, r) => s + r.uren, 0);
  const maandRijen = lijst.filter((r) => r.datum >= mVan);
  const maand = maandRijen.reduce((s, r) => s + r.uren, 0);
  const totaal = lijst.reduce((s, r) => s + r.uren, 0);
  const perMonteur = Array.from(maandRijen.reduce((m, r) => m.set(r.medewerker_id, (m.get(r.medewerker_id) ?? 0) + r.uren), new Map<string, number>()).entries())
    .sort((a, b) => b[1] - a[1]);

  const blok = (label: string, waarde: number) => (
    <div style={{ flex: 1, padding: 10, borderRadius: 10, background: "var(--bg-surface-2)" }}>
      <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</p>
      <p className="pj-mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{formatUren(waarde)}</p>
    </div>
  );

  return (
    <section className={compact ? "rounded-xl p-3 mb-3" : "pj-card"} style={compact ? { background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" } : undefined}>
      <h3 style={compact ? { fontSize: 13, fontWeight: 700, marginBottom: 8 } : undefined}>Geboekte uren</h3>
      {rijen === null ? <p className="wp-hint">Laden…</p> : (
        <>
          <div style={{ display: "flex", gap: 8 }}>{blok("Deze week", week)}{blok("Deze maand", maand)}{blok("Totaal", totaal)}</div>
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", margin: "12px 0 4px" }}>Per monteur deze maand</p>
          {perMonteur.length === 0 ? <p className="wp-hint">Nog geen uren deze maand.</p> : perMonteur.map(([id, u]) => (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
              <span>{namen.get(id) ?? "Onbekend"}</span><span className="pj-mono">{formatUren(u)}</span>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
