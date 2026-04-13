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
import { UserPlus, MoreHorizontal, ChevronRight, Copy, AlertTriangle, Trash2, Pause, Play } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Kandidaat, ContractData } from "@/types/app";

const STATUSSEN = ["alle", "gesprek", "tarief_afgesproken", "uitgenodigd", "gecontracteerd", "on_hold", "afgewezen"] as const;
const STATUS_LABELS: Record<string, string> = {
  alle: "Alle",
  gesprek: "Gesprek",
  tarief_afgesproken: "Tarief",
  uitgenodigd: "Uitgenodigd",
  gecontracteerd: "Gecontracteerd",
  on_hold: "On hold",
  afgewezen: "Afgewezen",
};

const CORRECTIE_LABELS: Record<string, string> = {
  naam_handelsnaam: "Naam / handelsnaam",
  adres: "Adres",
  kvk_nummer: "KVK-nummer",
  btw_nummer: "BTW-nummer",
  uurtarief: "Uurtarief",
  looptijd: "Ingangsdatum / einddatum",
  anders: "Anders",
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
  const [berichten, setBerichten] = useState<any[]>([]);
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

  // Correctie modal state
  const [correctieContract, setCorrectieContract] = useState<any>(null);
  const [correctieKandidaat, setCorrectieKandidaat] = useState<Kandidaat | null>(null);
  const [correctieBerichten, setCorrectieBerichten] = useState<any[]>([]);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [resending, setResending] = useState(false);

  const fetchKandidaten = useCallback(async () => {
    const [{ data: kData }, { data: cData }, { data: bData }] = await Promise.all([
      supabase.from("kandidaten").select("*").order("aangemaakt_op", { ascending: false }),
      supabase.from("contracten").select("id, contract_nummer, kandidaat_id, status, contract_data, ot_naam, ot_handtekening, profiel_id").in("status", ["verstuurd", "ondertekend_ot", "ondertekend_beiden", "correctie_gevraagd"]),
      supabase.from("contract_berichten").select("*").order("aangemaakt_op", { ascending: true }),
    ]);
    setKandidaten((kData as unknown as Kandidaat[]) || []);
    setContracten(cData || []);
    setBerichten(bData || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchKandidaten(); }, [fetchKandidaten]);

  const gefilterd = filter === "alle" ? kandidaten : kandidaten.filter(k => k.status === filter);

  function getContractForKandidaat(kandidaatId: string) {
    return contracten.find(c => c.kandidaat_id === kandidaatId);
  }

  function getBerichtenForContract(contractId: string) {
    return berichten.filter(b => b.contract_id === contractId);
  }

  async function openCorrectieModal(k: Kandidaat, contract: any) {
    const cb = getBerichtenForContract(contract.id);
    setCorrectieKandidaat(k);
    setCorrectieContract(contract);
    setCorrectieBerichten(cb);

    // Pre-fill editable fields from contract_data
    const cd = contract.contract_data as any;
    setEditFields({
      ot_naam: cd.ot_naam || "",
      ot_handelsnaam: cd.ot_handelsnaam || "",
      ot_adres: cd.ot_adres || "",
      ot_postcode: cd.ot_postcode || "",
      ot_stad: cd.ot_stad || "",
      ot_kvk: cd.ot_kvk || "",
      ot_btw: cd.ot_btw || "",
      uurtarief: cd.uurtarief?.toString() || "",
      startdatum: cd.startdatum || "",
      einddatum: cd.einddatum || "",
    });
  }

  async function opnieuwVersturen() {
    if (!correctieContract || !correctieKandidaat || !profileId) return;
    setResending(true);

    try {
      const cd = { ...(correctieContract.contract_data as any) };

      // Apply edits
      cd.ot_naam = editFields.ot_naam;
      cd.ot_handelsnaam = editFields.ot_handelsnaam;
      cd.ot_adres = editFields.ot_adres;
      cd.ot_postcode = editFields.ot_postcode;
      cd.ot_stad = editFields.ot_stad;
      cd.ot_kvk = editFields.ot_kvk;
      cd.ot_btw = editFields.ot_btw;
      cd.uurtarief = parseFloat(editFields.uurtarief) || cd.uurtarief;
      // startdatum/einddatum are display strings, keep as-is if not changed

      // Generate new token
      const newToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
      const geldigTot = new Date();
      geldigTot.setDate(geldigTot.getDate() + 7);
      cd._token = newToken;
      cd._token_geldig_tot = geldigTot.toISOString();

      // Update contract
      await supabase.from("contracten").update({
        contract_data: cd as any,
        status: "verstuurd",
      }).eq("id", correctieContract.id);

      // Update kandidaat tarief if changed
      const nieuwTarief = parseFloat(editFields.uurtarief);
      if (!isNaN(nieuwTarief) && nieuwTarief > 0 && nieuwTarief !== correctieKandidaat.afgesproken_tarief) {
        await supabase.from("kandidaten").update({ afgesproken_tarief: nieuwTarief }).eq("id", correctieKandidaat.id);
      }

      // Add bericht record
      await supabase.from("contract_berichten").insert({
        contract_id: correctieContract.id,
        richting: "manager_naar_kandidaat",
        bericht_type: "opnieuw_verstuurd",
        toelichting: "Contract is aangepast en opnieuw verstuurd.",
      });

      // Mark correction berichten as read
      const unread = correctieBerichten.filter(b => !b.gelezen_op && b.richting === "kandidaat_naar_manager");
      for (const b of unread) {
        await supabase.from("contract_berichten").update({ gelezen_op: new Date().toISOString() }).eq("id", b.id);
      }

      const link = `${window.location.origin}/contract/ondertekenen/${newToken}`;
      toast.success("Contract opnieuw verstuurd ✓");
      toast.info(
        <div className="space-y-1">
          <p className="text-xs font-semibold">Nieuwe ondertekeningslink:</p>
          <div className="flex items-center gap-2">
            <code className="text-[10px] break-all flex-1" style={{ color: "#3fff8b" }}>{link}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(link); toast.success("Link gekopieerd ✓"); }}
              className="shrink-0 px-2 py-1 rounded text-[10px] font-medium"
              style={{ background: "#3fff8b", color: "#fff" }}>
              Kopieer
            </button>
          </div>
        </div>,
        { duration: 30000 }
      );

      setCorrectieContract(null);
      setCorrectieKandidaat(null);
      fetchKandidaten();
    } catch (err) {
      toast.error("Fout bij opnieuw versturen");
      console.error(err);
    } finally {
      setResending(false);
    }
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
      if (saveHt && (nieuweHt || showCanvas)) {
        await supabase.from("manager_handtekeningen").upsert({
          profiel_id: profileId,
          handtekening: htToUse,
          updated_op: new Date().toISOString(),
        }, { onConflict: "profiel_id" });
      }

      const managerNaam = profileCtx?.full_name || "";
      const { dataUri, hash } = await generateContractPdf(
        signContract.contract_data as ContractData,
        htToUse,
        signContract.ot_handtekening,
        managerNaam,
        signContract.ot_naam,
      );

      const bestandsnaam = `${signContract.id}.pdf`;
      const blob = dataUriToBlob(dataUri);
      await supabase.storage.from("contracten").upload(bestandsnaam, blob, { contentType: "application/pdf", upsert: true });

      await supabase.from("contracten").update({
        og_naam: managerNaam,
        og_handtekening: htToUse,
        og_profiel_id: profileId,
        og_timestamp: new Date().toISOString(),
        status: "ondertekend_beiden",
        pdf_path: bestandsnaam,
        pdf_hash: hash,
      }).eq("id", signContract.id);

      await supabase.from("kandidaten").update({ status: "gecontracteerd" }).eq("id", signKandidaat.id);

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

  async function onHold(id: string) {
    await supabase.from("kandidaten").update({ status: "on_hold" as any }).eq("id", id);
    toast.success("Kandidaat on hold gezet");
    fetchKandidaten();
  }

  async function reactiveer(id: string) {
    await supabase.from("kandidaten").update({ status: "gesprek" }).eq("id", id);
    toast.success("Kandidaat weer actief");
    fetchKandidaten();
  }

  const [deleteConfirm, setDeleteConfirm] = useState<Kandidaat | null>(null);

  async function verwijderKandidaat(id: string) {
    try {
      // Delete related contracts (cascade deletes tokens + berichten automatically)
      const relatedContracts = contracten.filter(c => c.kandidaat_id === id);
      for (const c of relatedContracts) {
        const { error } = await supabase.from("contracten").delete().eq("id", c.id);
        if (error) throw error;
      }
      const { error } = await supabase.from("kandidaten").delete().eq("id", id);
      if (error) throw error;
      toast.success("Kandidaat verwijderd");
      setDeleteConfirm(null);
      fetchKandidaten();
    } catch (err: any) {
      toast.error("Verwijderen mislukt: " + (err.message || "onbekende fout"));
    }
  }

  return (
    <>
    <PageShell>
      <h1 className="text-lg font-bold" style={{ color: "#dae6ff" }}>Kandidaten</h1>
      <p className="text-xs mb-4" style={{ color: "#a0abc3" }}>Werving en contractbeheer</p>
      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {STATUSSEN.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={{
              background: filter === s ? "rgba(63,255,139,0.1)" : "#102038",
              color: filter === s ? "#3fff8b" : "#a0abc3",
              border: `1px solid ${filter === s ? "rgba(63,255,139,0.3)" : "rgba(106,118,140,0.15)"}`,
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
            const heeftCorrectie = k.status === "uitgenodigd" && contract?.status === "correctie_gevraagd";
            const contractBerichten = contract ? getBerichtenForContract(contract.id) : [];
            const ongelezen = contractBerichten.filter(b => !b.gelezen_op && b.richting === "kandidaat_naar_manager").length;

            return (
              <div key={k.id} className="rounded-2xl p-4" style={{ background: "rgba(10,26,48,0.7)", border: `1px solid ${heeftCorrectie ? "rgba(255,113,108,0.3)" : "rgba(106,118,140,0.15)"}` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate" style={{ color: "#dae6ff" }}>
                      {k.voornaam} {k.achternaam}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#a0abc3" }}>{k.email}</p>
                    {k.telefoon && <p className="text-xs" style={{ color: "#a0abc3" }}>{k.telefoon}</p>}
                    {k.notities && (
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: "#a0abc3" }}>
                        {k.notities.length > 80 ? k.notities.slice(0, 80) + "..." : k.notities}
                      </p>
                    )}
                    {k.afgesproken_tarief && (
                      <p className="text-xs mt-1 font-mono" style={{ color: "#6e9bff" }}>
                        {euro(k.afgesproken_tarief, 2)}/uur
                      </p>
                    )}
                    <p className="text-[10px] mt-1" style={{ color: "#a0abc3" }}>
                      {formatDatumKort(k.aangemaakt_op)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                      style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                      {sc.label}
                    </span>

                    {/* Correctie gevraagd badge + button */}
                    {heeftCorrectie && (
                      <>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap flex items-center gap-1"
                          style={{ background: "rgba(255,113,108,0.1)", color: "#ff716c", border: "1px solid rgba(255,113,108,0.3)" }}>
                          <AlertTriangle className="w-3 h-3" />
                          Correctie gevraagd
                          {ongelezen > 0 && (
                            <span className="ml-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                              style={{ background: "#ff716c", color: "#fff" }}>
                              {ongelezen}
                            </span>
                          )}
                        </span>
                        <button onClick={() => openCorrectieModal(k, contract)}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium"
                          style={{ background: "rgba(255,113,108,0.1)", color: "#ff716c", border: "1px solid rgba(255,113,108,0.3)" }}>
                          Bekijken & aanpassen
                        </button>
                      </>
                    )}

                    {wachtOpManager && (
                      <>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                          style={{ background: "rgba(254,179,0,0.1)", color: "#feb300", border: "1px solid rgba(254,179,0,0.3)" }}>
                          ⏳ Wacht op jouw handtekening
                        </span>
                        <button onClick={() => openSignModal(k)}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium"
                          style={{ background: "#3fff8b", color: "#fff" }}>
                          Ondertekenen
                        </button>
                      </>
                    )}
                    {k.status === "gesprek" && (
                      <button onClick={() => { setShowTarief(k.id); setTariefForm({ tarief: "", notitie: "" }); }}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{ background: "rgba(110,155,255,0.1)", color: "#6e9bff", border: `1px solid rgba(110,155,255,0.3)` }}>
                        Tarief instellen
                      </button>
                    )}
                    {k.status === "tarief_afgesproken" && (
                      <button onClick={() => navigate(`/kandidaten/${k.id}/contract`)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1"
                        style={{ background: "#3fff8b", color: "#fff" }}>
                        Contract <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                    {!wachtOpManager && !heeftCorrectie && k.status === "uitgenodigd" && contract && (
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-medium" style={{ color: "#6e9bff" }}>📧 Uitgenodigd</span>
                        {(contract.contract_data as any)?._token && (
                          <button
                            onClick={() => {
                              const link = `${window.location.origin}/contract/ondertekenen/${(contract.contract_data as any)._token}`;
                              navigator.clipboard.writeText(link);
                              toast.success("Link gekopieerd ✓");
                            }}
                            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg font-medium"
                            style={{ background: "#102038", color: "#a0abc3", border: "1px solid rgba(106,118,140,0.15)" }}>
                            <Copy className="w-3 h-3" /> Link kopiëren
                          </button>
                        )}
                      </div>
                    )}
                    {!wachtOpManager && !heeftCorrectie && k.status === "gecontracteerd" && (
                      <span className="text-[10px] font-medium" style={{ color: "#3fff8b" }}>
                        ✓ Gecontracteerd
                      </span>
                    )}
                    {k.status !== "afgewezen" && k.status !== "gecontracteerd" && k.status !== "on_hold" && !wachtOpManager && !heeftCorrectie && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => onHold(k.id)} className="flex items-center gap-1 text-[10px]" style={{ color: "#feb300" }}>
                          <Pause className="w-3 h-3" /> On hold
                        </button>
                        <button onClick={() => afwijzen(k.id)} className="text-[10px]" style={{ color: "#ff716c" }}>
                          Afwijzen
                        </button>
                      </div>
                    )}
                    {k.status === "on_hold" && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => reactiveer(k.id)} className="flex items-center gap-1 text-[10px]" style={{ color: "#3fff8b" }}>
                          <Play className="w-3 h-3" /> Heractiveren
                        </button>
                      </div>
                    )}
                    <button onClick={() => setDeleteConfirm(k)} className="flex items-center gap-1 text-[10px]" style={{ color: "#ff716c" }}>
                      <Trash2 className="w-3 h-3" /> Verwijderen
                    </button>
                  </div>
                </div>

                {/* Inline tarief modal */}
                {showTarief === k.id && (
                  <div className="mt-3 pt-3 space-y-2" style={{ borderTop: "1px solid rgba(106,118,140,0.15)" }}>
                    <Input type="number" placeholder="Uurtarief (€/uur)" value={tariefForm.tarief}
                      onChange={e => setTariefForm(p => ({ ...p, tarief: e.target.value }))} />
                    <Input placeholder="Notitie (optioneel)" value={tariefForm.notitie}
                      onChange={e => setTariefForm(p => ({ ...p, notitie: e.target.value }))} />
                    <div className="flex gap-2">
                      <button onClick={() => setShowTarief(null)} className="flex-1 py-2 rounded-lg text-xs"
                        style={{ border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>Annuleren</button>
                      <button onClick={() => tariefOpslaan(k.id)} disabled={saving}
                        className="flex-1 py-2 rounded-lg text-xs font-medium"
                        style={{ background: "#3fff8b", color: "#fff" }}>
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
          <div className="w-full max-w-lg rounded-t-2xl p-5 space-y-3 animate-in slide-in-from-bottom" style={{ background: "rgba(10,26,48,0.7)", maxHeight: "85vh", overflowY: "auto" }}>
            <div className="w-10 h-1 rounded-full mx-auto mb-2" style={{ background: "rgba(106,118,140,0.15)" }} />
            <h3 className="text-base font-semibold" style={{ color: "#dae6ff" }}>Nieuwe kandidaat</h3>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Voornaam *" value={nieuwForm.voornaam} onChange={e => setNieuwForm(p => ({ ...p, voornaam: e.target.value }))} />
              <Input placeholder="Achternaam *" value={nieuwForm.achternaam} onChange={e => setNieuwForm(p => ({ ...p, achternaam: e.target.value }))} />
            </div>
            <Input placeholder="E-mailadres *" type="email" value={nieuwForm.email} onChange={e => setNieuwForm(p => ({ ...p, email: e.target.value }))} />
            <Input placeholder="Telefoonnummer" value={nieuwForm.telefoon} onChange={e => setNieuwForm(p => ({ ...p, telefoon: e.target.value }))} />
            <textarea placeholder="Aantekeningen van het gesprek..." value={nieuwForm.notities}
              onChange={e => setNieuwForm(p => ({ ...p, notities: e.target.value }))}
              className="w-full rounded-lg p-3 text-sm resize-none"
              style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff", minHeight: 80 }} />
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowNieuw(false)} className="flex-1 py-2.5 rounded-xl text-sm"
                style={{ border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>Annuleren</button>
              <button onClick={opslaan} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: "#3fff8b", color: "#fff" }}>
                {saving ? "Opslaan..." : "Toevoegen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manager onderteken modal */}
      {signKandidaat && signContract && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => { setSignKandidaat(null); setSignContract(null); }}>
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, #dae6ff 35%, transparent)", backdropFilter: "blur(6px)" }} />
          <div className="relative w-full animate-in slide-in-from-bottom rounded-t-3xl p-5 space-y-4" style={{ maxWidth: 430, maxHeight: "85vh", overflowY: "auto", background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", borderBottom: "none", paddingBottom: 40 }} onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto" style={{ background: "rgba(106,118,140,0.15)" }} />
            <h3 className="text-base font-bold" style={{ color: "#dae6ff" }}>Contract ondertekenen</h3>
            <p className="text-xs" style={{ color: "#a0abc3" }}>
              {signKandidaat.voornaam} {signKandidaat.achternaam} · {signContract.contract_nummer}
            </p>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Jouw handtekening</p>

              {managerHt && !showCanvas ? (
                <>
                  <div className="rounded-xl p-2" style={{ background: "#fff", border: "1px solid rgba(106,118,140,0.15)" }}>
                    <img src={managerHt} alt="Handtekening" style={{ width: "100%", height: 80, objectFit: "contain" }} />
                  </div>
                  <p className="text-[10px]" style={{ color: "#a0abc3" }}>Opgeslagen handtekening</p>
                  <label className="flex items-center gap-2 text-xs" style={{ color: "#a0abc3" }}>
                    <input type="checkbox" checked={useOpgeslagen} onChange={e => setUseOpgeslagen(e.target.checked)} />
                    Gebruik opgeslagen handtekening
                  </label>
                  <button onClick={() => setShowCanvas(true)} className="text-xs underline" style={{ color: "#3fff8b" }}>
                    Andere handtekening tekenen
                  </button>
                </>
              ) : (
                <>
                  {!managerHt && (
                    <div className="rounded-xl p-2.5" style={{ background: "rgba(254,179,0,0.1)", border: "1px solid rgba(254,179,0,0.3)" }}>
                      <p className="text-xs" style={{ color: "#feb300" }}>Je hebt nog geen handtekening opgeslagen. Teken hieronder.</p>
                    </div>
                  )}
                  <HandtekeningCanvas hoogte={150} onSave={(b64) => setNieuweHt(b64)} />
                  <label className="flex items-center gap-2 text-xs" style={{ color: "#a0abc3" }}>
                    <input type="checkbox" checked={saveHt} onChange={e => setSaveHt(e.target.checked)} />
                    Sla op voor toekomstige contracten
                  </label>
                </>
              )}
            </div>

            <button onClick={voltooiContract} disabled={signing || (!(useOpgeslagen && managerHt && !showCanvas) && !nieuweHt)}
              className="w-full py-3 rounded-2xl text-sm font-bold disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)", color: "#fff" }}>
              {signing ? "Bezig met ondertekenen..." : "Contract voltooien ✓"}
            </button>
          </div>
        </div>
      )}

      {/* Correctie modal */}
      {correctieKandidaat && correctieContract && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => { setCorrectieContract(null); setCorrectieKandidaat(null); }}>
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, #dae6ff 35%, transparent)", backdropFilter: "blur(6px)" }} />
          <div className="relative w-full animate-in slide-in-from-bottom rounded-t-3xl p-5 space-y-4"
            style={{ maxWidth: 430, maxHeight: "85vh", overflowY: "auto", background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", borderBottom: "none", paddingBottom: 40 }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto" style={{ background: "rgba(106,118,140,0.15)" }} />
            <h3 className="text-base font-bold" style={{ color: "#dae6ff" }}>Correctie gevraagd</h3>
            <p className="text-xs" style={{ color: "#a0abc3" }}>
              {correctieKandidaat.voornaam} {correctieKandidaat.achternaam} · {correctieContract.contract_nummer}
            </p>

            {/* Berichten thread */}
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Berichten</p>
              {correctieBerichten.length === 0 ? (
                <p className="text-xs" style={{ color: "#a0abc3" }}>Geen berichten</p>
              ) : (
                correctieBerichten.map(b => (
                  <div key={b.id} className="rounded-xl p-3 text-xs" style={{
                    background: b.richting === "kandidaat_naar_manager" ? "rgba(255,113,108,0.1)" : "rgba(110,155,255,0.1)",
                    border: `1px solid ${b.richting === "kandidaat_naar_manager" ? "rgba(255,113,108,0.3)" : "rgba(110,155,255,0.3)"}`,
                  }}>
                    <p className="font-semibold text-[10px] mb-1" style={{
                      color: b.richting === "kandidaat_naar_manager" ? "#ff716c" : "#6e9bff",
                    }}>
                      {b.richting === "kandidaat_naar_manager" ? "📨 Kandidaat" : "📤 Manager"}
                      {b.bericht_type === "correctie_verzoek" && " — Correctie verzoek"}
                      {b.bericht_type === "opnieuw_verstuurd" && " — Opnieuw verstuurd"}
                    </p>
                    {b.wat_klopt_niet?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {b.wat_klopt_niet.map((item: string) => (
                          <span key={item} className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                            style={{ background: "#102038", color: "#a0abc3" }}>
                            {CORRECTIE_LABELS[item] || item}
                          </span>
                        ))}
                      </div>
                    )}
                    {b.toelichting && (
                      <p style={{ color: "#a0abc3" }}>{b.toelichting}</p>
                    )}
                    <p className="text-[9px] mt-1" style={{ color: "#a0abc3" }}>
                      {new Date(b.aangemaakt_op).toLocaleDateString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Editable fields */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Contract aanpassen</p>
              <Input placeholder="Naam" value={editFields.ot_naam} onChange={e => setEditFields(p => ({ ...p, ot_naam: e.target.value }))} />
              <Input placeholder="Handelsnaam" value={editFields.ot_handelsnaam} onChange={e => setEditFields(p => ({ ...p, ot_handelsnaam: e.target.value }))} />
              <Input placeholder="Adres" value={editFields.ot_adres} onChange={e => setEditFields(p => ({ ...p, ot_adres: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Postcode" value={editFields.ot_postcode} onChange={e => setEditFields(p => ({ ...p, ot_postcode: e.target.value }))} />
                <Input placeholder="Stad" value={editFields.ot_stad} onChange={e => setEditFields(p => ({ ...p, ot_stad: e.target.value }))} />
              </div>
              <Input placeholder="KVK-nummer" value={editFields.ot_kvk} onChange={e => setEditFields(p => ({ ...p, ot_kvk: e.target.value }))} />
              <Input placeholder="BTW-nummer" value={editFields.ot_btw} onChange={e => setEditFields(p => ({ ...p, ot_btw: e.target.value }))} />
              <div>
                <label className="text-[11px] font-medium" style={{ color: "#a0abc3" }}>Uurtarief (€/uur)</label>
                <Input type="number" value={editFields.uurtarief} onChange={e => setEditFields(p => ({ ...p, uurtarief: e.target.value }))} className="mt-1" />
              </div>
            </div>

            <button onClick={opnieuwVersturen} disabled={resending}
              className="w-full py-3 rounded-2xl text-sm font-bold disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)", color: "#fff" }}>
              {resending ? "Versturen..." : "Aanpassen & nieuwe link versturen →"}
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
      <button onClick={() => setShowNieuw(true)}
        className="fixed z-30 flex items-center justify-center rounded-full shadow-lg"
        style={{ bottom: 88, right: 20, width: 56, height: 56, background: "#3fff8b" }}>
        <UserPlus className="w-6 h-6 text-white" />
      </button>
    </PageShell>

    <AlertDialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
      <AlertDialogContent style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(61,72,93,0.3)" }}>
        <AlertDialogHeader>
          <AlertDialogTitle style={{ color: "#ff716c" }}>Kandidaat verwijderen</AlertDialogTitle>
          <AlertDialogDescription style={{ color: "#a0abc3" }}>
            Weet je zeker dat je <strong>{deleteConfirm?.voornaam} {deleteConfirm?.achternaam}</strong> wilt verwijderen? 
            Alle bijbehorende contracten en berichten worden ook verwijderd. Dit kan niet ongedaan worden.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel style={{ background: "#142640", color: "#a0abc3", border: "1px solid rgba(61,72,93,0.3)" }}>
            Annuleren
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => deleteConfirm && verwijderKandidaat(deleteConfirm.id)} style={{ background: "#ff716c", color: "#fff" }}>
            Ja, verwijderen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
