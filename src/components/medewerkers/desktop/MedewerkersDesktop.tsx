import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMedewerkersDesktop, type DesktopProfiel } from "@/hooks/useMedewerkersDesktop";
import {
  DESKTOP_CERT_TYPES, DESKTOP_CERT_LABELS, ASBEST_MODULES, ASBEST_MODULE_LABELS,
  vervalStatus, fmtDatum, DBA_VRAGEN, DBA_SIGNALEN_TEKST, volgendeDbaCheck,
  berekenVolleWekenAchtereen, vasteStarttijd, bewaarTotTekst,
} from "@/lib/medewerkersDesktop";
import {
  computeIssues, certsVan, aanwijzingenVan, contractVan, laatsteDbaCheck,
  stipelOntbreektVoorAanwijzing, heeftGeldigeVca, heeftGeldigeAanwijzing, type Issue,
} from "./derive";
import { useProfile } from "@/hooks/useProfile";
import { genereerAanwijsbrievenPdf } from "@/lib/aanwijsbrievenPdf";

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

export default function MedewerkersDesktop() {
  const { profielen, certificaten, aanwijzingen, partijen, dbaChecks, contracten, tarieven, planning, bedrijf, loading, refetch } = useMedewerkersDesktop();
  const { profileId } = useProfile();
  const [chip, setChip] = useState<string>("planbaar");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"overzicht" | "dossier" | "dba" | "bevoegdheden">("overzicht");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showUitDienst, setShowUitDienst] = useState(false);
  const [showAanwijzing, setShowAanwijzing] = useState(false);

  // Onboarding: planbaar gaat automatisch aan zodra alle voorwaarden zijn vervuld.
  const autoPlanbaarVerwerkt = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (loading) return;
    for (const p of profielen) {
      if (p.planbaar || p.planbaar_reden) continue;
      if (p.account_status !== "onboarding" && p.account_status !== "active") continue;
      if (autoPlanbaarVerwerkt.current.has(p.id)) continue;
      if (!p.kvk_nummer || !p.btw_nummer || !p.iban) continue;
      const contract = contractVan(p.id, contracten);
      if (!contract || contract.status !== "ondertekend_beiden") continue;
      if (!heeftGeldigeVca(p.id, certificaten)) continue;
      if (!heeftGeldigeAanwijzing(p.id, aanwijzingen)) continue;
      autoPlanbaarVerwerkt.current.add(p.id);
      supabase.from("profiles").update({ planbaar: true } as any).eq("id", p.id).then(({ error }) => {
        if (!error) { toast.success(`${p.full_name} is automatisch planbaar gezet`); refetch(); }
      });
    }
  }, [loading, profielen, certificaten, aanwijzingen, contracten, refetch]);

  const issuesPerEmp = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const p of profielen) map.set(p.id, computeIssues(p, certificaten, aanwijzingen, contracten));
    return map;
  }, [profielen, certificaten, aanwijzingen, contracten]);

  const planbaarCount = profielen.filter((p) => p.planbaar && p.account_status === "active").length;
  const actieCount = profielen.filter((p) => (issuesPerEmp.get(p.id)?.length || 0) > 0).length;

  const chips = [
    { key: "planbaar", label: "Planbaar", count: profielen.filter((p) => p.planbaar && p.account_status === "active").length },
    { key: "niet_planbaar", label: "Niet planbaar", count: profielen.filter((p) => !p.planbaar && p.account_status === "active").length },
    { key: "onboarding", label: "Onboarding", count: profielen.filter((p) => p.account_status === "onboarding" || p.account_status === "invited").length },
    { key: "onderaannemers", label: "Onderaannemers", count: profielen.filter((p) => p.is_onderaannemer).length },
    { key: "managers", label: "Managers", count: profielen.filter((p) => p.role === "manager").length },
    { key: "uit_dienst", label: "Uit dienst", count: profielen.filter((p) => p.account_status === "uit_dienst").length },
    { key: "actie", label: "Actie nodig", count: actieCount },
  ];

  const actieBlokken: { key: Issue["tab"] | "onderaannemers"; label: string; count: number }[] = [
    { key: "dossier", label: "Dossier", count: profielen.filter((p) => (issuesPerEmp.get(p.id) || []).some((i) => i.tab === "dossier")).length },
    { key: "bevoegdheden", label: "Certificaten & Aanwijzingen", count: profielen.filter((p) => (issuesPerEmp.get(p.id) || []).some((i) => i.tab === "bevoegdheden")).length },
    { key: "dba", label: "DBA-signalen", count: profielen.filter((p) => !p.is_onderaannemer && dbaCheckOud(p.id)).length },
    { key: "onderaannemers", label: "Onderaannemers", count: profielen.filter((p) => p.is_onderaannemer && (issuesPerEmp.get(p.id)?.length || 0) > 0).length },
  ];

  function dbaCheckOud(empId: string) {
    const laatste = laatsteDbaCheck(empId, dbaChecks);
    if (!laatste) return true;
    return (Date.now() - new Date(laatste.vastgelegd_op).getTime()) / 86400000 > 365;
  }

  const filtered = profielen.filter((p) => {
    if (query && !p.full_name.toLowerCase().includes(query.toLowerCase()) && !(p.bedrijfsnaam || "").toLowerCase().includes(query.toLowerCase()) && !(p.kvk_nummer || "").includes(query)) return false;
    switch (chip) {
      case "planbaar": return p.planbaar && p.account_status === "active";
      case "niet_planbaar": return !p.planbaar && p.account_status === "active";
      case "onboarding": return p.account_status === "onboarding" || p.account_status === "invited";
      case "onderaannemers": return p.is_onderaannemer;
      case "managers": return p.role === "manager";
      case "uit_dienst": return p.account_status === "uit_dienst";
      case "actie": return (issuesPerEmp.get(p.id)?.length || 0) > 0;
      default: return true;
    }
  });

  const selected = profielen.find((p) => p.id === selectedId) || null;

  const select = (p: DesktopProfiel) => { setSelectedId(p.id); setTab("overzicht"); setMenuOpen(false); };

  async function togglePlanbaar(p: DesktopProfiel) {
    if (p.account_status !== "active" || p.is_onderaannemer) return;
    const { error } = await supabase.from("profiles").update({ planbaar: !p.planbaar, planbaar_reden: p.planbaar ? "anders" : null } as any).eq("id", p.id);
    if (error) { toast.error("Kon planbaar niet wijzigen"); return; }
    toast.success("Bijgewerkt");
    refetch();
  }

  async function weerInzetten(p: DesktopProfiel) {
    const { error } = await supabase.from("profiles").update({ account_status: "active", uit_dienst_op: null } as any).eq("id", p.id);
    if (error) { toast.error("Mislukt"); return; }
    toast.success(`${p.full_name} is weer actief`);
    refetch();
  }

  return (
    <div className="mw-root">
      <div className="mw-header">
        <div>
          <div className="mw-title">Medewerkers</div>
          <div className="mw-subtitle">{planbaarCount} planbaar · {actieCount} met actie nodig · alle professionals werken als zzp</div>
        </div>
      </div>

      <div className="mw-action-blocks">
        {actieBlokken.map((b) => (
          <button key={b.key} className="mw-action-block" onClick={() => setChip("actie")}>
            <span className="mw-action-num">{b.count}</span>
            <span className="mw-action-label">{b.label}</span>
          </button>
        ))}
      </div>

      <div className="mw-chips">
        {chips.map((c) => (
          <button key={c.key} className={`mw-chip${chip === c.key ? " mw-chip--active" : ""}`} onClick={() => setChip(c.key)}>
            {c.label} <span className="mw-chip-count">{c.count}</span>
          </button>
        ))}
      </div>

      <div className="mw-grid">
        <div className="mw-list">
          <div className="mw-search">
            <input placeholder="Zoek op naam, bedrijf of KvK" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {loading && <div className="mw-list-empty">Laden…</div>}
          {!loading && filtered.length === 0 && <div className="mw-list-empty">Geen medewerkers gevonden</div>}
          {filtered.map((p) => {
            const issues = issuesPerEmp.get(p.id) || [];
            const initialen = p.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
            return (
              <div key={p.id} className={`mw-list-row${selectedId === p.id ? " mw-list-row--active" : ""}`} onClick={() => select(p)}>
                <div className="mw-avatar">{initialen}</div>
                <div className="mw-list-row-naam">{p.full_name}</div>
                <div className="mw-list-row-pill" data-status={p.account_status}>{statusLabel(p)}</div>
                <div className="mw-list-row-sub">{p.is_onderaannemer ? (p.bedrijfsnaam || "Onderaannemer") : "ZZP"}</div>
                <div className="mw-list-row-meta">{issues.length > 0 ? `${issues.length} actie${issues.length > 1 ? "s" : ""}` : ""}</div>
              </div>
            );
          })}
        </div>

        <div className="mw-detail">
          {!selected && <div className="mw-list-empty">Selecteer een medewerker</div>}
          {selected && (
            <DetailPane
              emp={selected}
              tab={tab} setTab={setTab}
              issues={issuesPerEmp.get(selected.id) || []}
              certificaten={certificaten} aanwijzingen={aanwijzingen} partijen={partijen}
              dbaChecks={dbaChecks} contracten={contracten} tarieven={tarieven} planning={planning}
              bedrijf={bedrijf} profielen={profielen} profileId={profileId}
              menuOpen={menuOpen} setMenuOpen={setMenuOpen}
              showUitDienst={showUitDienst} setShowUitDienst={setShowUitDienst}
              showAanwijzing={showAanwijzing} setShowAanwijzing={setShowAanwijzing}
              onRefresh={refetch}
              onTogglePlanbaar={() => togglePlanbaar(selected)}
              onWeerInzetten={() => weerInzetten(selected)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function statusLabel(p: DesktopProfiel) {
  if (p.account_status === "uit_dienst") return "Uit dienst";
  if (p.account_status === "onboarding" || p.account_status === "invited") return "Onboarding";
  if (p.is_onderaannemer) return "Onderaannemer";
  if (!p.planbaar) return "Niet planbaar";
  return "Planbaar";
}

interface DetailProps {
  emp: DesktopProfiel; tab: string; setTab: (t: any) => void; issues: Issue[];
  certificaten: any[]; aanwijzingen: any[]; partijen: any[]; dbaChecks: any[]; contracten: any[];
  tarieven: any[]; planning: any[]; bedrijf: { dba_signaal_weken: number }; profielen: DesktopProfiel[];
  profileId: string | null;
  menuOpen: boolean; setMenuOpen: (b: boolean) => void;
  showUitDienst: boolean; setShowUitDienst: (b: boolean) => void;
  showAanwijzing: boolean; setShowAanwijzing: (b: boolean) => void;
  onRefresh: () => void; onTogglePlanbaar: () => void; onWeerInzetten: () => void;
}

function DetailPane(p: DetailProps) {
  const { emp, tab, setTab, issues } = p;
  const bevoegdhedenCount = issues.filter((i) => i.tab === "bevoegdheden").length;
  const dossierCount = issues.filter((i) => i.tab === "dossier").length;
  const initialen = emp.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="mw-detail-wrap">
      <div className="mw-detail-head">
        <div className="mw-detail-id">
          <div className="mw-avatar mw-avatar--lg">{initialen}</div>
          <div>
            <div className="mw-detail-naam">{emp.full_name} <span className="mw-pill" data-status={emp.account_status}>{statusLabel(emp)}</span></div>
            <div className="mw-detail-sub">{emp.is_onderaannemer ? (emp.bedrijfsnaam || "Onderaannemer") : "ZZP'er"} {emp.ploeg ? `· Ploeg ${emp.ploeg}` : ""}</div>
          </div>
        </div>
        <div className="mw-detail-actions">
          {emp.account_status === "uit_dienst" ? (
            <button className="mw-btn mw-btn--primary" onClick={p.onWeerInzetten}>Weer inzetten</button>
          ) : (
            <div style={{ position: "relative" }}>
              <button className="mw-btn" onClick={() => p.setMenuOpen(!p.menuOpen)}>⋯</button>
              {p.menuOpen && (
                <div className="mw-menu">
                  <button onClick={() => { p.setShowUitDienst(true); p.setMenuOpen(false); }}>Uit dienst melden</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mw-tabs">
        <button className={`mw-tab${tab === "overzicht" ? " mw-tab--active" : ""}`} onClick={() => setTab("overzicht")}>Overzicht</button>
        <button className={`mw-tab${tab === "dossier" ? " mw-tab--active" : ""}`} onClick={() => setTab("dossier")}>Dossier{dossierCount > 0 && <span className="mw-badge">{dossierCount}</span>}</button>
        {!emp.is_onderaannemer && (
          <button className={`mw-tab${tab === "dba" ? " mw-tab--active" : ""}`} onClick={() => setTab("dba")}>DBA-check</button>
        )}
        <button className={`mw-tab${tab === "bevoegdheden" ? " mw-tab--active" : ""}`} onClick={() => setTab("bevoegdheden")}>Bevoegdheden{bevoegdhedenCount > 0 && <span className="mw-badge">{bevoegdhedenCount}</span>}</button>
      </div>

      {tab === "overzicht" && <TabOverzicht {...p} />}
      {tab === "dossier" && <TabDossier {...p} />}
      {tab === "dba" && !emp.is_onderaannemer && <TabDba {...p} />}
      {tab === "bevoegdheden" && <TabBevoegdheden {...p} />}

      {p.showUitDienst && <UitDienstDialog emp={emp} onClose={() => p.setShowUitDienst(false)} onDone={() => { p.setShowUitDienst(false); p.onRefresh(); }} />}
    </div>
  );
}

function TabOverzicht({ emp, issues, setTab, onTogglePlanbaar }: DetailProps) {
  if (emp.account_status === "uit_dienst") {
    return (
      <div className="mw-card">
        <div className="mw-card-title">Uit dienst sinds {fmtDatum(emp.uit_dienst_op)}</div>
        <div className="mw-card-sub">{bewaarTotTekst(emp.uit_dienst_op)}: uren, facturen, overeenkomst, KvK/BTW en het DBA-dossier.</div>
      </div>
    );
  }
  return (
    <div className="mw-stack">
      {issues.length > 0 && (
        <div className="mw-card mw-card--danger">
          <div className="mw-card-title">Actie nodig</div>
          {issues.map((i) => (
            <div className="mw-issue-row" key={i.key}>
              <span className="mw-issue-dot">!</span>
              <div className="mw-issue-body"><span>{i.tekst}</span><span className="mw-issue-where">{i.waar}</span></div>
              <button className="mw-btn mw-btn--sm" onClick={() => setTab(i.tab)}>{i.actie}</button>
            </div>
          ))}
        </div>
      )}
      <div className="mw-cols">
        <div className="mw-card">
          <div className="mw-row-between">
            <div>
              <div className="mw-card-title">Planbaar in weekplanning</div>
              <div className="mw-card-sub">{emp.planbaar ? "Staat in de weekplanning" : `Uit${emp.planbaar_reden ? ` — reden: ${emp.planbaar_reden}` : ""}${emp.planbaar_tot ? ` tot ${fmtDatum(emp.planbaar_tot)}` : ""}`}</div>
            </div>
            <button
              className={`mw-switch${emp.planbaar ? " mw-switch--on" : ""}`}
              disabled={emp.is_onderaannemer || emp.account_status !== "active"}
              onClick={onTogglePlanbaar}
            ><span /></button>
          </div>
          <div className="mw-hr" />
          <div className="mw-kv">
            <div className="mw-kv-label">Vaste vrije dagen</div>
            <div className="mw-vrije-dagen">
              {DAGEN.map((d, i) => (
                <span key={d} className={`mw-vrije-dag${emp.vaste_vrije_dagen?.includes(i) ? " mw-vrije-dag--actief" : ""}`}>{d}</span>
              ))}
            </div>
          </div>
          <div className="mw-kv">
            <div className="mw-kv-label">Vaste ploeg</div>
            <div className="mw-kv-val">{emp.ploeg || "—"}</div>
          </div>
          <div className="mw-kv">
            <div className="mw-kv-label">Planning bevestigd</div>
            <div className="mw-kv-val">—</div>
          </div>
        </div>
        <div className="mw-card">
          <div className="mw-card-title">Contact</div>
          <div className="mw-kv"><div className="mw-kv-label">Telefoon</div><div className="mw-kv-val">{emp.telefoon || "—"}</div></div>
          <div className="mw-kv"><div className="mw-kv-label">E-mail</div><div className="mw-kv-val">{emp.email || "—"}</div></div>
          <div className="mw-kv"><div className="mw-kv-label">Adres</div><div className="mw-kv-val">{emp.adres || "—"}</div></div>
          <div className="mw-kv"><div className="mw-kv-label">Noodcontact</div><div className="mw-kv-val">{emp.noodcontact_naam ? `${emp.noodcontact_naam} (${emp.noodcontact_tel || "—"})` : "—"}</div></div>
        </div>
      </div>
    </div>
  );
}

function TabDossier({ emp, contracten, tarieven, onRefresh }: DetailProps) {
  const contract = contractVan(emp.id, contracten);
  const jaarTarieven = tarieven.filter((t) => t.medewerker_id === emp.id);

  async function addJaar() {
    const jaar = new Date().getFullYear();
    if (jaarTarieven.some((t) => t.jaar === jaar)) { toast.error("Dit jaar bestaat al"); return; }
    const { error } = await supabase.from("tarieven").insert({ medewerker_id: emp.id, jaar, uurtarief: emp.uurtarief || 0 } as any);
    if (error) toast.error("Mislukt"); else { toast.success("Toegevoegd"); onRefresh(); }
  }

  if (emp.is_onderaannemer) {
    const verklaringOud = emp.verklaring_betalingsgedrag_op && (Date.now() - new Date(emp.verklaring_betalingsgedrag_op).getTime()) / 86400000 > 90;
    return (
      <div className="mw-cols">
        <div className="mw-card">
          <div className="mw-card-title">Onderaannemer</div>
          <div className="mw-kv"><div className="mw-kv-label">G-rekening</div><div className="mw-kv-val">{emp.g_rekening || "—"}</div></div>
          <div className="mw-kv"><div className="mw-kv-label">Verklaring betalingsgedrag</div><div className="mw-kv-val" style={verklaringOud ? { color: "var(--warn-text)" } : undefined}>{fmtDatum(emp.verklaring_betalingsgedrag_op)}</div></div>
          <div className="mw-kv"><div className="mw-kv-label">KvK-uittreksel</div><div className="mw-kv-val">{fmtDatum(emp.kvk_uittreksel_op)}</div></div>
          <div className="mw-kv"><div className="mw-kv-label">Raamovereenkomst</div><div className="mw-kv-val">{contract?.status === "ondertekend_beiden" ? "Ondertekend" : "Niet getekend"}</div></div>
        </div>
      </div>
    );
  }

  return (
    <div className="mw-cols">
      <div className="mw-card">
        <div className="mw-card-title">Zzp-gegevens</div>
        <div className="mw-kv"><div className="mw-kv-label">KvK</div><div className="mw-kv-val">{emp.kvk_nummer || "—"}</div></div>
        <div className="mw-kv"><div className="mw-kv-label">BTW</div><div className="mw-kv-val">{emp.btw_nummer || "—"}</div></div>
        <div className="mw-kv"><div className="mw-kv-label">IBAN</div><div className="mw-kv-val">{emp.iban || "—"}</div></div>
        <div className="mw-kv"><div className="mw-kv-label">Overeenkomst van opdracht</div><div className="mw-kv-val">{contract ? `${contract.status}${contract.einddatum ? ` (t/m ${fmtDatum(contract.einddatum)})` : ""}` : "—"}</div></div>
        <div className="mw-kv"><div className="mw-kv-label">AVB-polis tot</div><div className="mw-kv-val">{fmtDatum(emp.avb_polis_tot)}</div></div>
      </div>
      <div className="mw-card">
        <div className="mw-row-between"><div className="mw-card-title">Tariefhistorie</div><button className="mw-btn mw-btn--sm" onClick={addJaar}>+ Jaar toevoegen</button></div>
        {jaarTarieven.length === 0 && <div className="mw-card-sub">Nog geen historie</div>}
        {jaarTarieven.map((t) => (
          <div className="mw-kv" key={t.jaar}><div className="mw-kv-label">{t.jaar}</div><div className="mw-kv-val">€ {Number(t.uurtarief).toFixed(2)}/u</div></div>
        ))}
      </div>
    </div>
  );
}

function TabDba({ emp, dbaChecks, planning, bedrijf, profileId, onRefresh }: DetailProps) {
  const laatste = laatsteDbaCheck(emp.id, dbaChecks);
  const [antwoorden, setAntwoorden] = useState<Record<string, boolean | null>>(() => {
    const init: Record<string, boolean | null> = {};
    for (const q of DBA_VRAGEN) init[q.key] = laatste?.antwoorden?.[q.key] ?? null;
    return init;
  });

  const eigenPlanning = planning.filter((pl) => pl.medewerker_id === emp.id);
  const volleWeken = berekenVolleWekenAchtereen(eigenPlanning.map((pl) => pl.datum));
  const starttijd = vasteStarttijd(eigenPlanning.map((pl) => pl.starttijd));

  async function save() {
    const { error } = await supabase.from("dba_checks").insert({
      medewerker_id: emp.id, vastgelegd_door: profileId, antwoorden: antwoorden as any,
    } as any);
    if (error) toast.error("Opslaan mislukt"); else { toast.success("DBA-check vastgelegd"); onRefresh(); }
  }

  return (
    <div className="mw-stack">
      <div className="mw-info-banner">{DBA_SIGNALEN_TEKST}</div>
      <div className="mw-cols">
        <div className="mw-card">
          <div className="mw-row-between">
            <div className="mw-card-title">Afspraken en werkwijze</div>
            <div className="mw-card-sub">{laatste ? `Laatste check: ${fmtDatum(laatste.vastgelegd_op)} · volgende: ${volgendeDbaCheck(laatste.vastgelegd_op)}` : "Nog geen check vastgelegd"}</div>
          </div>
          {DBA_VRAGEN.map((q) => (
            <div className="mw-dba-row" key={q.key}>
              <span>{q.tekst}</span>
              <div className="mw-segment">
                <button className={antwoorden[q.key] === true ? "mw-segment--active" : ""} onClick={() => setAntwoorden((s) => ({ ...s, [q.key]: true }))}>Ja</button>
                <button className={antwoorden[q.key] === false ? "mw-segment--active" : ""} onClick={() => setAntwoorden((s) => ({ ...s, [q.key]: false }))}>Nee</button>
              </div>
            </div>
          ))}
          <button className="mw-btn mw-btn--primary" onClick={save}>Check vastleggen</button>
        </div>
        <div className="mw-card">
          <div className="mw-card-title">Signalen uit planning en uren</div>
          <div className="mw-card-sub">Automatisch berekend</div>
          <div className="mw-kv"><div className="mw-kv-label">Weken fulltime ingepland</div><div className="mw-kv-val">{volleWeken} / grens {bedrijf.dba_signaal_weken}</div></div>
          <div className="mw-kv"><div className="mw-kv-label">Vaste starttijd</div><div className="mw-kv-val">{starttijd || "wisselend"}</div></div>
          <div className="mw-kv"><div className="mw-kv-label">Planning geweigerd</div><div className="mw-kv-val">—</div></div>
          <div className="mw-kv"><div className="mw-kv-label">Werkt alleen voor ons</div><div className="mw-kv-val">{antwoorden.andere_opdrachtgevers === false ? "Ja" : antwoorden.andere_opdrachtgevers === true ? "Nee" : "—"}</div></div>
        </div>
      </div>
    </div>
  );
}

function TabBevoegdheden({ emp, certificaten, aanwijzingen, partijen, showAanwijzing, setShowAanwijzing, onRefresh }: DetailProps) {
  const eigenAanwijzingen = aanwijzingenVan(emp.id, aanwijzingen);
  const eigenCerts = certsVan(emp.id, certificaten);
  const normen = Array.from(new Set(eigenAanwijzingen.map((a) => a.norm)));

  async function verwijder(id: string) {
    const { error } = await supabase.from("aanwijzingen").delete().eq("id", id);
    if (error) toast.error("Mislukt"); else { toast.success("Verwijderd"); onRefresh(); }
  }

  async function aanwijsbrieven() {
    if (eigenAanwijzingen.length === 0) { toast.error("Geen aanwijzingen om een brief voor te maken"); return; }
    await genereerAanwijsbrievenPdf(emp.full_name, eigenAanwijzingen.map((a) => ({
      norm: a.norm, rol: a.rol, partij: partijen.find((pp) => pp.id === a.partij_id)?.naam || "—",
      aangewezen_door: a.aangewezen_door, aangewezen_op: a.aangewezen_op, geldig_tot: a.geldig_tot,
    })));
  }

  return (
    <div className="mw-stack">
      <div className="mw-card">
        <div className="mw-row-between">
          <div className="mw-card-title">Aanwijzingen</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="mw-btn mw-btn--sm" onClick={aanwijsbrieven}>Aanwijsbrieven (PDF)</button>
            <button className="mw-btn mw-btn--sm" onClick={() => setShowAanwijzing(true)}>+ Aanwijzing toevoegen</button>
          </div>
        </div>
        {eigenAanwijzingen.length === 0 && <div className="mw-card-sub">Nog geen aanwijzingen</div>}
        <table className="mw-table">
          <thead><tr><th>Partij</th><th>Norm</th><th>Rol</th><th>Geldig tot</th><th /></tr></thead>
          <tbody>
            {eigenAanwijzingen.map((a) => {
              const partij = partijen.find((pp) => pp.id === a.partij_id)?.naam || "—";
              const vs = vervalStatus(a.geldig_tot);
              const stipelMist = stipelOntbreektVoorAanwijzing(a, certificaten);
              return (
                <tr key={a.id}>
                  <td>{partij}</td>
                  <td>{a.norm} {stipelMist && <span className="mw-flag">!</span>}</td>
                  <td><span className="mw-rolbadge">{a.rol}</span></td>
                  <td style={{ color: vs.status === "verlopen" ? "var(--danger)" : vs.status === "binnenkort" ? "var(--warn-text)" : undefined }}>{fmtDatum(a.geldig_tot)}</td>
                  <td><button className="mw-icon-btn" onClick={() => verwijder(a.id)}>×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mw-card">
        <div className="mw-card-title">Certificaten</div>
        <DesktopCertRows emp={emp} certificaten={eigenCerts} onRefresh={onRefresh} />
      </div>

      {showAanwijzing && (
        <AanwijzingForm emp={emp} partijen={partijen} onClose={() => setShowAanwijzing(false)} onDone={() => { setShowAanwijzing(false); onRefresh(); }} />
      )}
    </div>
  );
}

function DesktopCertRows({ emp, certificaten, onRefresh }: { emp: DesktopProfiel; certificaten: any[]; onRefresh: () => void }) {
  async function setDatum(type: string, subtype: string | null, datum: string) {
    const bestaand = certificaten.find((c) => c.type === type && (c.subtype || null) === subtype);
    if (bestaand) {
      await supabase.from("certificaten").update({ vervaldatum: datum } as any).eq("id", bestaand.id);
    } else {
      await supabase.from("certificaten").insert({ medewerker_id: emp.id, type, subtype, naam: DESKTOP_CERT_LABELS[type as keyof typeof DESKTOP_CERT_LABELS], vervaldatum: datum } as any);
    }
    onRefresh();
  }

  return (
    <div className="mw-cert-list">
      {DESKTOP_CERT_TYPES.map((type) => {
        if (type === "ASBEST") {
          return (
            <div key={type} className="mw-cert-group">
              <div className="mw-cert-group-title">{DESKTOP_CERT_LABELS[type]}</div>
              {ASBEST_MODULES.map((m) => {
                const row = certificaten.find((c) => c.type === "ASBEST" && c.subtype === m);
                const vs = vervalStatus(row?.vervaldatum);
                return (
                  <div className="mw-cert-row" key={m}>
                    <span>{ASBEST_MODULE_LABELS[m]}</span>
                    <span className="mw-cert-status" data-status={vs.status}>{vs.status === "ontbreekt" ? "Ontbreekt" : fmtDatum(row?.vervaldatum)}</span>
                    <input type="date" defaultValue={row?.vervaldatum || ""} onBlur={(e) => e.target.value && setDatum("ASBEST", m, e.target.value)} />
                  </div>
                );
              })}
            </div>
          );
        }
        const row = certificaten.find((c) => c.type === type);
        const vs = vervalStatus(row?.vervaldatum);
        const verplicht = type === "VCA";
        return (
          <div className="mw-cert-row" key={type}>
            <span>{DESKTOP_CERT_LABELS[type]}{verplicht && <span className="mw-required">*</span>}</span>
            <span className="mw-cert-status" data-status={vs.status}>{vs.status === "ontbreekt" ? "Ontbreekt" : fmtDatum(row?.vervaldatum)}</span>
            <input type="date" defaultValue={row?.vervaldatum || ""} onBlur={(e) => e.target.value && setDatum(type, null, e.target.value)} />
          </div>
        );
      })}
      <div className="mw-cert-overig-hint">Overige certificaten (KBM, LRH, rijbewijs, …) staan onder "Overig" in het bewerkscherm.</div>
    </div>
  );
}

function AanwijzingForm({ emp, partijen, onClose, onDone }: { emp: DesktopProfiel; partijen: any[]; onClose: () => void; onDone: () => void }) {
  const [normen, setNormen] = useState<string[]>([]);
  const [rol, setRol] = useState<string>("VOP");
  const [partijIds, setPartijIds] = useState<string[]>([]);
  const [jaren, setJaren] = useState<1 | 2 | 3>(1);
  const { profileId, profile } = useProfile();
  const alleNormen = ["BEI", "BEI BLS", "BEI BHS"];

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const aantal = normen.length * partijIds.length;

  async function opslaan() {
    if (aantal === 0) { toast.error("Kies minimaal 1 norm en 1 partij"); return; }
    const geldigTot = new Date(); geldigTot.setFullYear(geldigTot.getFullYear() + jaren);
    const rows = [];
    for (const norm of normen) for (const partij_id of partijIds) {
      rows.push({
        medewerker_id: emp.id, norm, rol, partij_id,
        aangewezen_door: profile?.full_name || "Manager", aangewezen_op: new Date().toISOString().slice(0, 10),
        geldig_tot: geldigTot.toISOString().slice(0, 10),
      });
    }
    const { error } = await supabase.from("aanwijzingen").upsert(rows as any, { onConflict: "medewerker_id,norm,partij_id" });
    if (error) toast.error("Opslaan mislukt: " + error.message); else { toast.success(`${rows.length} aanwijzing(en) opgeslagen`); onDone(); }
  }

  return (
    <div className="mw-modal-overlay" onClick={onClose}>
      <div className="mw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mw-card-title">Aanwijzing toevoegen</div>
        <div className="mw-kv-label">Norm</div>
        <div className="mw-chiprow">{alleNormen.map((n) => <button key={n} className={`mw-chip${normen.includes(n) ? " mw-chip--active" : ""}`} onClick={() => toggle(normen, n, setNormen)}>{n}</button>)}</div>
        <div className="mw-kv-label">Rol</div>
        <div className="mw-chiprow">{["VOP", "VP", "AVP", "WV"].map((r) => <button key={r} className={`mw-chip${rol === r ? " mw-chip--active" : ""}`} onClick={() => setRol(r)}>{r}</button>)}</div>
        <div className="mw-kv-label">Partijen</div>
        <div className="mw-chiprow">{partijen.map((pp) => <button key={pp.id} className={`mw-chip${partijIds.includes(pp.id) ? " mw-chip--active" : ""}`} onClick={() => toggle(partijIds, pp.id, setPartijIds)}>{pp.naam}</button>)}</div>
        <div className="mw-kv-label">Geldig</div>
        <div className="mw-chiprow">{[1, 2, 3].map((j) => <button key={j} className={`mw-chip${jaren === j ? " mw-chip--active" : ""}`} onClick={() => setJaren(j as 1 | 2 | 3)}>{j} jaar</button>)}</div>
        <div className="mw-card-sub">Maakt {aantal} aanwijzing{aantal === 1 ? "" : "en"}: {normen.join(", ")} × {partijIds.map((id) => partijen.find((pp) => pp.id === id)?.naam).join(", ")}</div>
        <div className="mw-row-between" style={{ marginTop: 12 }}>
          <button className="mw-btn" onClick={onClose}>Annuleren</button>
          <button className="mw-btn mw-btn--primary" onClick={opslaan}>Opslaan</button>
        </div>
      </div>
    </div>
  );
}

function UitDienstDialog({ emp, onClose, onDone }: { emp: DesktopProfiel; onClose: () => void; onDone: () => void }) {
  const [laatsteDag, setLaatsteDag] = useState(new Date().toISOString().slice(0, 10));
  const [reden, setReden] = useState("opdracht_beeindigd");
  const { profileId } = useProfile();

  async function bevestig() {
    const { error } = await supabase.from("profiles").update({
      account_status: "uit_dienst", planbaar: false, uit_dienst_op: laatsteDag, uit_dienst_reden: reden,
      telefoon: "", adres: "", noodcontact_naam: null, noodcontact_tel: null,
    } as any).eq("id", emp.id);
    if (error) { toast.error("Mislukt: " + error.message); return; }

    await supabase.from("certificaten").update({ bestand_url: null } as any).eq("medewerker_id", emp.id);

    const { data: toekomstig } = await supabase.from("planning").select("*").eq("medewerker_id", emp.id).gt("datum", laatsteDag);
    const rijen = (toekomstig || []).filter((r: any) => r.external_source !== "terrevolt_planner" && !r.sync_locked);
    if (rijen.length > 0) {
      const concepten = rijen.map((r: any) => ({
        planning_id: r.id, medewerker_id: r.medewerker_id, datum: r.datum, actie: "verwijder",
        project_id: r.project_id, created_by: profileId,
      }));
      await supabase.from("planning_concept").upsert(concepten as any, { onConflict: "medewerker_id,datum" });
    }

    toast.success(`${emp.full_name} is uit dienst gemeld`);
    onDone();
  }

  return (
    <div className="mw-modal-overlay" onClick={onClose}>
      <div className="mw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mw-card-title">Uit dienst melden</div>
        <div className="mw-kv-label">Laatste werkdag</div>
        <input type="date" value={laatsteDag} onChange={(e) => setLaatsteDag(e.target.value)} />
        <div className="mw-kv-label">Reden</div>
        <select value={reden} onChange={(e) => setReden(e.target.value)}>
          <option value="opdracht_beeindigd">Opdracht beëindigd</option>
          <option value="zelf_gestopt">Zelf gestopt</option>
          <option value="anders">Anders</option>
        </select>
        <div className="mw-row-between" style={{ marginTop: 12 }}>
          <button className="mw-btn" onClick={onClose}>Annuleren</button>
          <button className="mw-btn mw-btn--primary" onClick={bevestig}>Bevestigen</button>
        </div>
      </div>
    </div>
  );
}
