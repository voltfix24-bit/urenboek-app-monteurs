import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { PageShell } from "@/components/PageShell";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { formatDatumKort, euro } from "@/lib/formatting";
import { KANDIDAAT_STATUS_CONFIG, CONTRACT_STATUS_CONFIG } from "@/lib/contractStatus";
import { generateContractPdf } from "@/lib/contractPdf";
import { HandtekeningCanvas } from "@/components/HandtekeningCanvas";
import { toast } from "sonner";
import { UserPlus, MoreHorizontal, ChevronRight, Copy } from "lucide-react";
import type { Kandidaat, ContractData } from "@/types/app";

const STATUSSEN = ["alle", "gesprek", "tarief_afgesproken", "uitgenodigd", "gecontracteerd", "afgewezen"] as const;
const STATUS_LABELS: Record<string, string> = {
  alle: "Alle",
  gesprek: "Gesprek",
  tarief_afgesproken: "Tarief",
  uitgenodigd: "Uitgenodigd",
  gecontracteerd: "Gecontracteerd",
  afgewezen: "Afgewezen",
};

function dataUriToBlob(dataUri: string): Blob {
  const parts = dataUri.split(',');
  const mime = parts[0].split(':')[1].split(';')[0];
  const bytes = atob(parts[1]);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export default function Kandidaten() {
  const { permissies } = useAuth();
  const { profileId, profile: profileCtx } = useProfile();
  const navigate = useNavigate();
  const [kandidaten, setKandidaten] = useState<Kandidaat[]>([]);
  const [contracten, setContracten] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("alle");
  const [showNieuw, setShowNieuw] = useState(false);
  const [showTarief, setShowTarief] = useState<string | null>(null);
  const [nieuwForm, setNieuwForm] = useState({ voornaam: "", achternaam: "", email: "", telefoon: "", notities: "" });
  const [tariefForm, setTariefForm] = useState({ tarief: "", notitie: "" });
  const [saving, setSaving] = useState(false);

  // Manager signing state
  const [signKandidaat, setSignKandidaat] = useState<Kandidaat | null>(null);
  const [signContract, setSignContract] = useState<any>(null);
  const [managerHt, setManagerHt] = useState<string | null>(null);
  const [nieuweHt, setNieuweHt] = useState<string | null>(null);
  const [useOpgeslagen, setUseOpgeslagen] = useState(true);
  const [showCanvas, setShowCanvas] = useState(false);
  const [saveHt, setSaveHt] = useState(true);
  const [signing, setSigning] = useState(false);

  const fetchKandidaten = useCallback(async () => {
    const [{ data: kData }, { data: cData }] = await Promise.all([
      supabase.from("kandidaten").select("*").order("aangemaakt_op", { ascending: false }),
      supabase.from("contracten").select("id, contract_nummer, kandidaat_id, status, contract_data, ot_naam, ot_handtekening, profiel_id").in("status", ["verstuurd", "ondertekend_ot", "ondertekend_beiden"]),
    ]);
    setKandidaten((kData as unknown as Kandidaat[]) || []);
    setContracten(cData || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchKandidaten(); }, [fetchKandidaten]);

  const gefilterd = filter === "alle" ? kandidaten : kandidaten.filter(k => k.status === filter);

  function getContractForKandidaat(kandidaatId: string) {
    return contracten.find(c => c.kandidaat_id === kandidaatId);
  }

  async function openSignModal(k: Kandidaat) {
    const contract = getContractForKandidaat(k.id);
    if (!contract) return;
    setSignKandidaat(k);
    setSignContract(contract);
    setNieuweHt(null);
    setShowCanvas(false);
    setUseOpgeslagen(true);
    setSaveHt(true);

    // Load manager handtekening
    if (profileId) {
      const { data } = await supabase.from("manager_handtekeningen").select("handtekening").eq("profiel_id", profileId).maybeSingle();
      setManagerHt(data?.handtekening || null);
      if (!data?.handtekening) setShowCanvas(true);
    }
  }

  async function voltooiContract() {
    if (!signContract || !signKandidaat || !profileId) return;
    const htToUse = (useOpgeslagen && managerHt && !showCanvas) ? managerHt : nieuweHt;
    if (!htToUse) { toast.error("Teken eerst een handtekening"); return; }

    setSigning(true);
    try {
      // 1. Save handtekening if requested
      if (saveHt && (nieuweHt || showCanvas)) {
        await supabase.from("manager_handtekeningen").upsert({
          profiel_id: profileId,
          handtekening: htToUse,
          updated_op: new Date().toISOString(),
        }, { onConflict: "profiel_id" });
      }

      // 2. Generate PDF
      const managerNaam = profileCtx?.full_name || "";
      const { dataUri, hash } = await generateContractPdf(
        signContract.contract_data as ContractData,
        htToUse,
        signContract.ot_handtekening,
        managerNaam,
        signContract.ot_naam,
      );

      // 3. Upload PDF
      const bestandsnaam = `${signContract.id}.pdf`;
      const blob = dataUriToBlob(dataUri);
      await supabase.storage.from("contracten").upload(bestandsnaam, blob, { contentType: "application/pdf", upsert: true });

      // 4. Update contract
      await supabase.from("contracten").update({
        og_naam: managerNaam,
        og_handtekening: htToUse,
        og_profiel_id: profileId,
        og_timestamp: new Date().toISOString(),
        status: "ondertekend_beiden",
        pdf_path: bestandsnaam,
        pdf_hash: hash,
      }).eq("id", signContract.id);

      // 5. Update kandidaat
      await supabase.from("kandidaten").update({ status: "gecontracteerd" }).eq("id", signKandidaat.id);

      // 6. Link contract to profile + send mededeling
      if (signKandidaat.profiel_id) {
        await supabase.from("contracten").update({ profiel_id: signKandidaat.profiel_id }).eq("id", signContract.id);
        await supabase.from("mededelingen").insert({
          titel: "Jouw contract is getekend ✓",
          inhoud: "TerreVolt heeft ook ondertekend. Download het definitieve contract via je profiel.",
          verzonden_door: profileId,
          ontvanger_type: "persoon",
          ontvanger_id: signKandidaat.profiel_id,
        });
      }

      setSignKandidaat(null);
      setSignContract(null);
      fetchKandidaten();
      toast.success("Contract volledig ondertekend ✓");
    } catch (err) {
      toast.error("Fout bij ondertekenen");
      console.error(err);
    } finally {
      setSigning(false);
    }
  }

  async function opslaan() {
    if (!nieuwForm.voornaam.trim() || !nieuwForm.achternaam.trim() || !nieuwForm.email.trim()) {
      toast.error("Vul verplichte velden in");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("kandidaten").insert({
      voornaam: nieuwForm.voornaam.trim(),
      achternaam: nieuwForm.achternaam.trim(),
      email: nieuwForm.email.trim(),
      telefoon: nieuwForm.telefoon.trim() || null,
      notities: nieuwForm.notities.trim() || null,
      aangemaakt_door: profileId!,
    });
    setSaving(false);
    if (error) { toast.error("Fout bij opslaan"); return; }
    toast.success("Kandidaat toegevoegd ✓");
    setShowNieuw(false);
    setNieuwForm({ voornaam: "", achternaam: "", email: "", telefoon: "", notities: "" });
    fetchKandidaten();
  }

  async function tariefOpslaan(id: string) {
    const tarief = parseFloat(tariefForm.tarief);
    if (isNaN(tarief) || tarief <= 0) { toast.error("Vul een geldig tarief in"); return; }
    setSaving(true);
    const updates: Record<string, unknown> = { status: "tarief_afgesproken", afgesproken_tarief: tarief };
    if (tariefForm.notitie.trim()) {
      const k = kandidaten.find(x => x.id === id);
      updates.notities = (k?.notities ? k.notities + "\n" : "") + tariefForm.notitie.trim();
    }
    await supabase.from("kandidaten").update(updates).eq("id", id);
    setSaving(false);
    toast.success("Tarief opgeslagen ✓");
    setShowTarief(null);
    setTariefForm({ tarief: "", notitie: "" });
    fetchKandidaten();
  }

  async function afwijzen(id: string) {
    await supabase.from("kandidaten").update({ status: "afgewezen" }).eq("id", id);
    toast.success("Kandidaat afgewezen");
    fetchKandidaten();
  }

  return (
    <PageShell>
      <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Kandidaten</h1>
      <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>Werving en contractbeheer</p>
      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {STATUSSEN.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={{
              background: filter === s ? "var(--accent-light)" : "var(--bg-surface-2)",
              color: filter === s ? "var(--accent)" : "var(--text-muted)",
              border: `1px solid ${filter === s ? "var(--accent-border)" : "var(--border)"}`,
            }}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : gefilterd.length === 0 ? (
        <EmptyState icoon="👥" titel="Geen kandidaten" subtitel={filter === "alle" ? "Voeg een kandidaat toe om te beginnen." : `Geen kandidaten met status "${STATUS_LABELS[filter]}".`} />
      ) : (
        <div className="space-y-3">
          {gefilterd.map(k => {
            const sc = KANDIDAAT_STATUS_CONFIG[k.status] || KANDIDAAT_STATUS_CONFIG.gesprek;
            const contract = getContractForKandidaat(k.id);
            const wachtOpManager = k.status === "uitgenodigd" && contract?.status === "ondertekend_ot";
            return (
              <div key={k.id} className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      {k.voornaam} {k.achternaam}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{k.email}</p>
                    {k.telefoon && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{k.telefoon}</p>}
                    {k.notities && (
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                        {k.notities.length > 80 ? k.notities.slice(0, 80) + "..." : k.notities}
                      </p>
                    )}
                    {k.afgesproken_tarief && (
                      <p className="text-xs mt-1 font-mono" style={{ color: "var(--info)" }}>
                        {euro(k.afgesproken_tarief, 2)}/uur
                      </p>
                    )}
                    <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                      {formatDatumKort(k.aangemaakt_op)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                      style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                      {sc.label}
                    </span>
                    {wachtOpManager && (
                      <>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                          style={{ background: "var(--warn-light)", color: "var(--warn-text)", border: "1px solid var(--warn-border)" }}>
                          ⏳ Wacht op jouw handtekening
                        </span>
                        <button onClick={() => openSignModal(k)}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium"
                          style={{ background: "var(--accent)", color: "#fff" }}>
                          Ondertekenen
                        </button>
                      </>
                    )}
                    {k.status === "gesprek" && (
                      <button onClick={() => { setShowTarief(k.id); setTariefForm({ tarief: "", notitie: "" }); }}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{ background: "var(--info-light)", color: "var(--info)", border: `1px solid var(--info-border)` }}>
                        Tarief instellen
                      </button>
                    )}
                    {k.status === "tarief_afgesproken" && (
                      <button onClick={() => navigate(`/kandidaten/${k.id}/contract`)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1"
                        style={{ background: "var(--accent)", color: "#fff" }}>
                        Contract <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                    {!wachtOpManager && k.status === "uitgenodigd" && contract && (
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-medium" style={{ color: "var(--info)" }}>📧 Uitgenodigd</span>
                        {(contract.contract_data as any)?._token && (
                          <button
                            onClick={() => {
                              const link = `${window.location.origin}/contract/ondertekenen/${(contract.contract_data as any)._token}`;
                              navigator.clipboard.writeText(link);
                              toast.success("Link gekopieerd ✓");
                            }}
                            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg font-medium"
                            style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                            <Copy className="w-3 h-3" /> Link kopiëren
                          </button>
                        )}
                      </div>
                    )}
                    {!wachtOpManager && k.status === "gecontracteerd" && (
                      <span className="text-[10px] font-medium" style={{ color: "var(--success)" }}>
                        ✓ Gecontracteerd
                      </span>
                    )}
                    {k.status !== "afgewezen" && k.status !== "gecontracteerd" && !wachtOpManager && (
                      <button onClick={() => afwijzen(k.id)} className="text-[10px]" style={{ color: "var(--danger)" }}>
                        Afwijzen
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline tarief modal */}
                {showTarief === k.id && (
                  <div className="mt-3 pt-3 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
                    <Input type="number" placeholder="Uurtarief (€/uur)" value={tariefForm.tarief}
                      onChange={e => setTariefForm(p => ({ ...p, tarief: e.target.value }))} />
                    <Input placeholder="Notitie (optioneel)" value={tariefForm.notitie}
                      onChange={e => setTariefForm(p => ({ ...p, notitie: e.target.value }))} />
                    <div className="flex gap-2">
                      <button onClick={() => setShowTarief(null)} className="flex-1 py-2 rounded-lg text-xs"
                        style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>Annuleren</button>
                      <button onClick={() => tariefOpslaan(k.id)} disabled={saving}
                        className="flex-1 py-2 rounded-lg text-xs font-medium"
                        style={{ background: "var(--accent)", color: "#fff" }}>
                        {saving ? "Opslaan..." : "Opslaan"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Nieuw modal */}
      {showNieuw && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="w-full max-w-lg rounded-t-2xl p-5 space-y-3 animate-in slide-in-from-bottom" style={{ background: "var(--bg-surface)", maxHeight: "85vh", overflowY: "auto" }}>
            <div className="w-10 h-1 rounded-full mx-auto mb-2" style={{ background: "var(--border)" }} />
            <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Nieuwe kandidaat</h3>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Voornaam *" value={nieuwForm.voornaam} onChange={e => setNieuwForm(p => ({ ...p, voornaam: e.target.value }))} />
              <Input placeholder="Achternaam *" value={nieuwForm.achternaam} onChange={e => setNieuwForm(p => ({ ...p, achternaam: e.target.value }))} />
            </div>
            <Input placeholder="E-mailadres *" type="email" value={nieuwForm.email} onChange={e => setNieuwForm(p => ({ ...p, email: e.target.value }))} />
            <Input placeholder="Telefoonnummer" value={nieuwForm.telefoon} onChange={e => setNieuwForm(p => ({ ...p, telefoon: e.target.value }))} />
            <textarea placeholder="Aantekeningen van het gesprek..." value={nieuwForm.notities}
              onChange={e => setNieuwForm(p => ({ ...p, notities: e.target.value }))}
              className="w-full rounded-lg p-3 text-sm resize-none"
              style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)", minHeight: 80 }} />
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowNieuw(false)} className="flex-1 py-2.5 rounded-xl text-sm"
                style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>Annuleren</button>
              <button onClick={opslaan} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: "var(--accent)", color: "#fff" }}>
                {saving ? "Opslaan..." : "Toevoegen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manager onderteken modal */}
      {signKandidaat && signContract && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => { setSignKandidaat(null); setSignContract(null); }}>
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--text-primary) 35%, transparent)", backdropFilter: "blur(6px)" }} />
          <div className="relative w-full animate-in slide-in-from-bottom rounded-t-3xl p-5 space-y-4" style={{ maxWidth: 430, maxHeight: "85vh", overflowY: "auto", background: "var(--bg-surface)", border: "1px solid var(--border)", borderBottom: "none", paddingBottom: 40 }} onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto" style={{ background: "var(--border)" }} />
            <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Contract ondertekenen</h3>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {signKandidaat.voornaam} {signKandidaat.achternaam} · {signContract.contract_nummer}
            </p>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Jouw handtekening</p>

              {managerHt && !showCanvas ? (
                <>
                  <div className="rounded-xl p-2" style={{ background: "#fff", border: "1px solid var(--border)" }}>
                    <img src={managerHt} alt="Handtekening" style={{ width: "100%", height: 80, objectFit: "contain" }} />
                  </div>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Opgeslagen handtekening</p>
                  <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                    <input type="checkbox" checked={useOpgeslagen} onChange={e => setUseOpgeslagen(e.target.checked)} />
                    Gebruik opgeslagen handtekening
                  </label>
                  <button onClick={() => setShowCanvas(true)} className="text-xs underline" style={{ color: "var(--accent)" }}>
                    Andere handtekening tekenen
                  </button>
                </>
              ) : (
                <>
                  {!managerHt && (
                    <div className="rounded-xl p-2.5" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
                      <p className="text-xs" style={{ color: "var(--warn-text)" }}>Je hebt nog geen handtekening opgeslagen. Teken hieronder.</p>
                    </div>
                  )}
                  <HandtekeningCanvas hoogte={150} onSave={(b64) => setNieuweHt(b64)} />
                  <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                    <input type="checkbox" checked={saveHt} onChange={e => setSaveHt(e.target.checked)} />
                    Sla op voor toekomstige contracten
                  </label>
                </>
              )}
            </div>

            <button onClick={voltooiContract} disabled={signing || (!(useOpgeslagen && managerHt && !showCanvas) && !nieuweHt)}
              className="w-full py-3 rounded-2xl text-sm font-bold disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", color: "#fff" }}>
              {signing ? "Bezig met ondertekenen..." : "Contract voltooien ✓"}
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
      <button onClick={() => setShowNieuw(true)}
        className="fixed z-30 flex items-center justify-center rounded-full shadow-lg"
        style={{ bottom: 88, right: 20, width: 56, height: 56, background: "var(--accent)" }}>
        <UserPlus className="w-6 h-6 text-white" />
      </button>
    </PageShell>
  );
}
