// Dagelijkse check (via pg_cron): verloop van certificaten, aanwijzingen, overeenkomsten,
// verouderde verklaring betalingsgedrag en DBA-checks ouder dan 1 jaar.
// Elke melding wordt maar één keer verstuurd (medewerker_meldingen_log).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const dag = (d: Date) => d.toISOString().slice(0, 10);
const plus = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const nlDatum = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const vandaag = new Date();
    const v = dag(vandaag), d14 = dag(plus(vandaag, 14)), d60 = dag(plus(vandaag, 60));

    const [{ data: profielen }, { data: certs }, { data: aanw }, { data: contr }, { data: dba }, { data: rollen }] = await Promise.all([
      db.from("profiles").select("id, user_id, full_name, account_status, is_onderaannemer, verklaring_betalingsgedrag_op").neq("account_status", "uit_dienst"),
      db.from("certificaten").select("id, medewerker_id, naam, vervaldatum").gte("vervaldatum", v).lte("vervaldatum", d60),
      db.from("aanwijzingen").select("id, medewerker_id, norm, geldig_tot").gte("geldig_tot", v).lte("geldig_tot", d60),
      db.from("contracten").select("id, profiel_id, contract_nummer, einddatum, status").gte("einddatum", v).lte("einddatum", d60).in("status", ["ondertekend_beiden", "ondertekend_ot", "verstuurd"]),
      db.from("dba_checks").select("medewerker_id, vastgelegd_op"),
      db.from("user_roles").select("user_id, role").eq("role", "manager"),
    ]);

    const actief = new Map((profielen ?? []).map((p) => [p.id, p]));
    const naam = (id: string | null) => actief.get(id ?? "")?.full_name;
    const kandidaten: { sleutel: string; tekst: string }[] = [];
    const drempel = (datum: string) => (datum <= d14 ? 14 : 60);

    (certs ?? []).forEach((c) => { const n = naam(c.medewerker_id); if (n) kandidaten.push({ sleutel: `cert:${c.id}:${c.vervaldatum}:${drempel(c.vervaldatum)}`, tekst: `${n}: certificaat ${c.naam} verloopt op ${nlDatum(c.vervaldatum)}` }); });
    (aanw ?? []).forEach((a) => { const n = naam(a.medewerker_id); if (n) kandidaten.push({ sleutel: `aanw:${a.id}:${a.geldig_tot}:${drempel(a.geldig_tot)}`, tekst: `${n}: aanwijzing ${a.norm} verloopt op ${nlDatum(a.geldig_tot)}` }); });
    (contr ?? []).forEach((c) => { const n = naam(c.profiel_id); if (n && c.einddatum) kandidaten.push({ sleutel: `contract:${c.id}:${c.einddatum}:${drempel(c.einddatum)}`, tekst: `${n}: overeenkomst ${c.contract_nummer} loopt af op ${nlDatum(c.einddatum)}` }); });

    const grens90 = dag(plus(vandaag, -90));
    (profielen ?? []).forEach((p) => {
      if (p.is_onderaannemer && p.verklaring_betalingsgedrag_op && p.verklaring_betalingsgedrag_op < grens90)
        kandidaten.push({ sleutel: `vbg:${p.id}:${p.verklaring_betalingsgedrag_op}`, tekst: `${p.full_name}: verklaring betalingsgedrag is ouder dan 90 dagen` });
    });

    const laatsteDba = new Map<string, string>();
    (dba ?? []).forEach((d) => { const prev = laatsteDba.get(d.medewerker_id); if (!prev || d.vastgelegd_op > prev) laatsteDba.set(d.medewerker_id, d.vastgelegd_op); });
    const grensJaar = dag(plus(vandaag, -365));
    laatsteDba.forEach((op, id) => { const n = naam(id); if (n && op < grensJaar) kandidaten.push({ sleutel: `dba:${id}:${op}`, tekst: `${n}: DBA-check is ouder dan 1 jaar (laatst ${nlDatum(op)})` }); });

    if (!kandidaten.length) return new Response(JSON.stringify({ verstuurd: 0 }), { headers: { ...cors, "Content-Type": "application/json" } });

    const { data: al } = await db.from("medewerker_meldingen_log").select("sleutel").in("sleutel", kandidaten.map((k) => k.sleutel));
    const bekend = new Set((al ?? []).map((r) => r.sleutel));
    const nieuw = kandidaten.filter((k) => !bekend.has(k.sleutel));
    if (!nieuw.length) return new Response(JSON.stringify({ verstuurd: 0 }), { headers: { ...cors, "Content-Type": "application/json" } });

    const managerUsers = new Set((rollen ?? []).map((r) => r.user_id));
    const managers = (profielen ?? []).filter((p) => managerUsers.has(p.user_id));
    if (!managers.length) throw new Error("Geen manager gevonden");

    const inhoud = nieuw.map((k) => `• ${k.tekst}`).join("\n");
    const rows = managers.map((m) => ({
      titel: `Medewerkers: ${nieuw.length} ${nieuw.length === 1 ? "punt" : "punten"} vragen aandacht`,
      inhoud, urgentie: "normaal", ontvanger_type: "persoon", ontvanger_id: m.id, verzonden_door: managers[0].id,
    }));
    const { error } = await db.from("mededelingen").insert(rows);
    if (error) throw error;
    await db.from("medewerker_meldingen_log").insert(nieuw.map((k) => ({ sleutel: k.sleutel })));

    return new Response(JSON.stringify({ verstuurd: nieuw.length, managers: managers.length }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
