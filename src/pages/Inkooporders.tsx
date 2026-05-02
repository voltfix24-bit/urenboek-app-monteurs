import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { getBedrijfsgegevens } from "@/hooks/useBedrijfsgegevens";
import { PageShell } from "@/components/PageShell";
import { HeaderLogo } from "@/components/HeaderLogo";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { useNavBadges } from "@/hooks/useNavBadges";
import { Plus, Download, FileText, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { euroDecimals as euro } from "@/lib/formatting";
import { downloadInkooporderPdf } from "@/components/InkooporderPdf";
import { Spinner } from "@/components/ui/Spinner";
import { WeekDownloadList } from "@/components/WeekDownloadList";
import { InkooporderWizard } from "@/components/inkooporders/InkooporderWizard";

import { INKOOPORDER_STATUS_CONFIG } from "@/lib/inkooporderStatus";

function OrderStatusBadge({ status }: { status: string }) {
  const c = INKOOPORDER_STATUS_CONFIG[status] || INKOOPORDER_STATUS_CONFIG.concept;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>{c.label}</span>;
}

export default function Inkooporders() {
  const [searchParams] = useSearchParams();
  const { isManager, user } = useAuth();
  const { profileId } = useProfile();
  const { badges } = useNavBadges();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [medewerkerFilter, setMedewerkerFilter] = useState<string>("");
  const [medewerkers, setMedewerkers] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderRegels, setOrderRegels] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [wizardInitial, setWizardInitial] = useState<{ medewerkerId?: string; van?: string; tot?: string } | undefined>(undefined);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("inkooporders").select("*").order("aangemaakt_op", { ascending: false });
    if (data) {
      const medIds = [...new Set(data.map((o: any) => o.medewerker_id))];
      const { data: profs } = medIds.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", medIds) : { data: [] };
      const nameMap = new Map((profs || []).map((p: any) => [p.id, p.full_name]));
      setOrders(data.map((o: any) => ({ ...o, medewerker_naam: nameMap.get(o.medewerker_id) || "Onbekend" })));
    }
    // Load medewerkers for filter
    const { data: meds } = await supabase.from("profiles").select("id, full_name");
    setMedewerkers(meds || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Auto-open wizard from URL params (e.g. after goedkeuring)
  const didAutoOpen = useRef(false);
  useEffect(() => {
    if (didAutoOpen.current) return;
    const medId = searchParams.get("medewerker");
    const van = searchParams.get("van");
    const tot = searchParams.get("tot");
    if (medId && van && tot && medewerkers.length > 0) {
      didAutoOpen.current = true;
      setWizardInitial({ medewerkerId: medId, van, tot });
      setShowCreate(true);
    }
  }, [searchParams, medewerkers]);

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (statusFilter !== "alle") result = result.filter(o => o.status === statusFilter);
    if (medewerkerFilter) result = result.filter(o => o.medewerker_id === medewerkerFilter);
    return result;
  }, [orders, statusFilter, medewerkerFilter]);

  const loadOrderDetail = async (order: any) => {
    setSelectedOrder(order);
    const { data } = await supabase.from("inkooporder_regels").select("*, uren_boekingen(beschrijving, type)").eq("inkooporder_id", order.id).order("datum");
    const verrijkt = (data || []).map((r: any) => ({
      ...r,
      activiteit: r.activiteit || (r.uren_boekingen as any)?.beschrijving || (r.uren_boekingen as any)?.type || "",
    }));
    // Enrich with project nummer
    const projIds = [...new Set(verrijkt.map((r: any) => r.project_id).filter(Boolean))];
    if (projIds.length > 0) {
      const { data: projs } = await supabase.from("projects").select("id, nummer").in("id", projIds);
      const nummerMap = new Map((projs || []).map((p: any) => [p.id, p.nummer]));
      verrijkt.forEach((r: any) => { r._project_nummer = nummerMap.get(r.project_id) || ""; });
    }
    setOrderRegels(verrijkt);
  };

  const updateOrderStatus = async (orderId: string, newStatus: string, extra?: any) => {
    const update: any = { status: newStatus, ...extra };
    if (newStatus === "verzonden") update.verzonden_op = new Date().toISOString();
    if (newStatus === "betaald") update.betaald_op = extra?.betaald_op || new Date().toISOString();
    if (!await mutate(supabase.from("inkooporders").update(update).eq("id", orderId))) return;
    toast.success(`Status gewijzigd naar ${INKOOPORDER_STATUS_CONFIG[newStatus]?.label || newStatus}`);

    // Send mededeling when verzonden
    if (newStatus === "verzonden" && selectedOrder) {
      await supabase.from("mededelingen").insert({
        titel: `Inkooporder ${selectedOrder.order_nummer} klaar`,
        inhoud: `Je inkooporder voor de periode ${selectedOrder.periode_van} t/m ${selectedOrder.periode_tot} is klaar. Te factureren: ${euro(selectedOrder.totaal_excl_btw)} (BTW verlegd).`,
        verzonden_door: profileId,
        ontvanger_type: "persoon",
        ontvanger_id: selectedOrder.medewerker_id,
      } as any);
    }
    fetchOrders();
    if (selectedOrder) loadOrderDetail({ ...selectedOrder, status: newStatus });
  };

  // Status change helpers
  const [factuurNummer, setFactuurNummer] = useState("");
  const [factuurDatum, setFactuurDatum] = useState("");
  const [betaaldDatum, setBetaaldDatum] = useState("");
  const [showStatusDialog, setShowStatusDialog] = useState<string | null>(null);

  const generatePdf = downloadInkooporderPdf;

  if (!isManager) return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-navy)" }}><p style={{ color: "#a0abc3" }}>Alleen managers.</p></div>;

  return (
    <>
      <DesktopSidebar badges={badges} />
      <PageShell>
        <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, rgba(10,26,48,0.7) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(106,118,140,0.15)" }}>
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <HeaderLogo />
              <span className="text-base font-bold tracking-tight" style={{ color: "#dae6ff" }}>Inkooporders</span>
            </div>
            <button onClick={() => { setShowCreate(true); resetWizard(); }} className="px-3 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1.5" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)" }}>
              <Plus className="h-3.5 w-3.5" /> Nieuwe order
            </button>
          </div>
        </header>

        <main className="px-4 py-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-1.5">
            {["alle", "concept", "verzonden", "factuur_ontvangen", "betaald"].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className="px-3 py-1.5 rounded-full text-[11px] font-semibold" style={{
                background: statusFilter === s ? "rgba(63,255,139,0.1)" : "rgba(10,26,48,0.7)",
                border: `1px solid ${statusFilter === s ? "rgba(63,255,139,0.3)" : "rgba(106,118,140,0.15)"}`,
                color: statusFilter === s ? "#3fff8b" : "#a0abc3",
              }}>
                {s === "alle" ? "Alle" : INKOOPORDER_STATUS_CONFIG[s]?.label || s}
              </button>
            ))}
          </div>

          {/* Per week downloaden */}
          {!loading && filteredOrders.length > 0 && (
            <WeekDownloadList orders={filteredOrders} toonNaam />
          )}

          {loading ? (
            <Spinner padding="py-8" />
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 rounded-2xl" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
              <FileText className="h-8 w-8 mx-auto mb-2" style={{ color: "#a0abc3" }} />
              <p className="text-sm font-medium" style={{ color: "#dae6ff" }}>Geen inkooporders</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredOrders.map(o => (
                <button key={o.id} onClick={() => loadOrderDetail(o)} className="w-full text-left rounded-2xl p-4" style={{ background: "rgba(10,26,48,0.7)", border: `1px solid ${selectedOrder?.id === o.id ? "#3fff8b" : "rgba(106,118,140,0.15)"}` }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[13px] font-bold" style={{ fontFamily: "DM Mono, monospace", color: "#dae6ff" }}>{o.order_nummer}</span>
                      <span className="text-xs ml-2" style={{ color: "#a0abc3" }}>· {o.medewerker_naam}</span>
                    </div>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: "#a0abc3" }}>{o.periode_van} → {o.periode_tot}</p>
                  <p className="text-lg font-bold mt-1" style={{ fontFamily: "DM Mono, monospace", color: "#3fff8b" }}>{euro(Number(o.totaal_excl_btw) || 0)}</p>
                </button>
              ))}
            </div>
          )}

          {/* Order Detail */}
          {selectedOrder && (
            <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(63,255,139,0.3)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold" style={{ fontFamily: "DM Mono, monospace", color: "#dae6ff" }}>{selectedOrder.order_nummer}</h3>
                  <p className="text-xs" style={{ color: "#a0abc3" }}>{selectedOrder.medewerker_naam} · {selectedOrder.periode_van} → {selectedOrder.periode_tot}</p>
                </div>
                <div className="flex items-center gap-2">
                  <OrderStatusBadge status={selectedOrder.status} />
                  <button onClick={async () => {
                    let prof = wizMedProfile;
                    if (!prof) {
                      const { data } = await supabase.from("profiles").select("id, full_name, uurtarief, kvk_nummer, btw_nummer, iban, bedrijfsnaam, factuuradres, adres, betalingstermijn, telefoon").eq("id", selectedOrder.medewerker_id).single();
                      prof = data;
                    }
                    let gkNaam: string | undefined;
                    if (selectedOrder.aangemaakt_door) {
                      const { data: gk } = await supabase.from("profiles").select("full_name").eq("id", selectedOrder.aangemaakt_door).maybeSingle();
                      gkNaam = gk?.full_name || undefined;
                    }
                    const bedrijf = await getBedrijfsgegevens();
                    generatePdf(selectedOrder, orderRegels, prof, bedrijf, gkNaam);
                  }} className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1" style={{ border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>
                    <Download className="h-3.5 w-3.5" /> PDF
                  </button>
                </div>
              </div>

              {/* Regels */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(106,118,140,0.15)" }}>
                      {["Datum", "Project", "Activiteit", "Uren", "Tarief", "Bedrag"].map(h => (
                        <th key={h} className="text-left pb-2 px-2 font-semibold" style={{ color: "#a0abc3", fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orderRegels.map(r => (
                      <tr key={r.id} style={{ borderBottom: "1px solid #102038" }}>
                        <td className="py-2 px-2" style={{ color: "#dae6ff" }}>{r.datum}</td>
                        <td className="py-2 px-2">
                          <span style={{ color: "#dae6ff" }}>{r.project_naam}</span>
                          {r._project_nummer && <span className="block text-[10px]" style={{ color: "#a0abc3", fontFamily: "DM Mono, monospace" }}>{r._project_nummer}</span>}
                        </td>
                        <td className="py-2 px-2" style={{ color: "#a0abc3" }}>{r.activiteit || "—"}</td>
                        <td className="py-2 px-2" style={{ fontFamily: "DM Mono, monospace" }}>{r.uren}</td>
                        <td className="py-2 px-2" style={{ fontFamily: "DM Mono, monospace" }}>{euro(r.uurtarief)}</td>
                        <td className="py-2 px-2 font-semibold" style={{ fontFamily: "DM Mono, monospace" }}>{euro(r.bedrag)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid rgba(63,255,139,0.3)" }}>
                      <td colSpan={3} />
                      <td className="py-2 px-2 font-bold" style={{ fontFamily: "DM Mono, monospace" }}>{selectedOrder.totaal_uren}u</td>
                      <td className="py-2 px-2 text-right font-semibold" style={{ color: "#a0abc3" }}>Subtotaal:</td>
                      <td className="py-2 px-2 font-bold" style={{ fontFamily: "DM Mono, monospace" }}>{euro(Number(selectedOrder.totaal_excl_btw))}</td>
                    </tr>
                    <tr>
                      <td colSpan={4} />
                      <td className="py-1 px-2 text-right" style={{ color: "#a0abc3" }}>BTW:</td>
                      <td className="py-1 px-2" style={{ fontFamily: "DM Mono, monospace", color: "#feb300" }}>Verlegd (art. 12 Wet OB)</td>
                    </tr>
                    <tr>
                      <td colSpan={4} />
                      <td className="py-1 px-2 text-right font-bold" style={{ color: "#3fff8b" }}>Te factureren:</td>
                      <td className="py-1 px-2 font-bold text-base" style={{ fontFamily: "DM Mono, monospace", color: "#3fff8b" }}>{euro(Number(selectedOrder.totaal_excl_btw))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Status actions */}
              <div className="flex flex-wrap items-center gap-2 pt-2" style={{ borderTop: "1px solid rgba(106,118,140,0.15)" }}>
                {selectedOrder.status === "concept" && (
                  <button onClick={() => updateOrderStatus(selectedOrder.id, "verzonden")} className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)" }}>
                    Verzenden naar monteur
                  </button>
                )}
                {selectedOrder.status === "verzonden" && (
                  <div className="flex items-center gap-2">
                    <input value={factuurNummer} onChange={e => setFactuurNummer(e.target.value)} placeholder="Factuurnummer" className="px-3 py-2 rounded-xl text-xs" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
                    <input type="date" value={factuurDatum} onChange={e => setFactuurDatum(e.target.value)} className="px-3 py-2 rounded-xl text-xs" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
                    <button onClick={() => { if (!factuurNummer) { toast.error("Vul factuurnummer in"); return; } updateOrderStatus(selectedOrder.id, "factuur_ontvangen", { factuur_nummer: factuurNummer, factuur_datum: factuurDatum || new Date().toISOString() }); }} className="px-4 py-2 rounded-xl text-xs font-semibold" style={{ background: "rgba(110,155,255,0.1)", border: "1px solid rgba(110,155,255,0.3)", color: "#6e9bff" }}>
                      Factuur registreren
                    </button>
                  </div>
                )}
                {selectedOrder.status === "factuur_ontvangen" && (
                  <div className="flex items-center gap-2">
                    <input type="date" value={betaaldDatum} onChange={e => setBetaaldDatum(e.target.value)} className="px-3 py-2 rounded-xl text-xs" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
                    <button onClick={() => updateOrderStatus(selectedOrder.id, "betaald", { betaald_op: betaaldDatum || new Date().toISOString() })} className="px-4 py-2 rounded-xl text-xs font-semibold" style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)", color: "#3fff8b" }}>
                      Betaling registreren
                    </button>
                  </div>
                )}
                {/* Verwijderen */}
                <button onClick={async () => {
                  if (!confirm(`Weet je zeker dat je ${selectedOrder.order_nummer} wilt verwijderen?`)) return;
                  await supabase.from("inkooporder_regels").delete().eq("inkooporder_id", selectedOrder.id);
                  const { error } = await supabase.from("inkooporders").delete().eq("id", selectedOrder.id);
                  if (error) { toast.error("Verwijderen mislukt"); return; }
                  toast.success(`${selectedOrder.order_nummer} verwijderd`);
                  setSelectedOrder(null);
                  fetchOrders();
                }} className="ml-auto px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                  style={{ background: "rgba(255,113,108,0.1)", border: "1px solid rgba(255,113,108,0.3)", color: "#ff716c" }}>
                  <Trash2 className="h-3.5 w-3.5" /> Verwijderen
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Create wizard modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
            <div className="w-full max-w-lg mx-4 rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold" style={{ color: "#dae6ff" }}>Nieuwe inkooporder</h3>
                <button onClick={() => { setShowCreate(false); resetWizard(); }} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#102038" }}><X className="h-4 w-4" style={{ color: "#a0abc3" }} /></button>
              </div>

              {wizStep === 1 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold" style={{ color: "#a0abc3" }}>Stap 1 — Selecteer monteur</p>
                  <select value={wizMedewerker} onChange={e => setWizMedewerker(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }}>
                    <option value="">Kies medewerker...</option>
                    {medewerkers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                  <button disabled={!wizMedewerker} onClick={() => setWizStep(2)} className="w-full py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)" }}>
                    Volgende →
                  </button>
                </div>
              )}

              {wizStep === 2 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold" style={{ color: "#a0abc3" }}>Stap 2 — Selecteer periode</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-medium" style={{ color: "#a0abc3" }}>Van</label>
                      <input type="date" value={wizVan} onChange={e => setWizVan(e.target.value)} className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium" style={{ color: "#a0abc3" }}>Tot</label>
                      <input type="date" value={wizTot} onChange={e => setWizTot(e.target.value)} className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setWizStep(1)} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>Vorige</button>
                    <button disabled={!wizVan || !wizTot} onClick={loadBoekingen} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)" }}>
                      {wizLoading ? "Laden..." : "Boekingen ophalen →"}
                    </button>
                  </div>
                </div>
              )}

              {wizStep === 3 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold" style={{ color: "#a0abc3" }}>Stap 3 — Selecteer uren ({wizBoekingen.length} beschikbaar)</p>
                  {wizBoekingen.length === 0 ? (
                    <p className="text-sm py-4 text-center" style={{ color: "#a0abc3" }}>Geen goedgekeurde uren gevonden in deze periode</p>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {wizBoekingen.map(b => (
                        <label key={b.id} className="flex items-center gap-2 p-2 rounded-lg cursor-pointer" style={{ background: wizSelected.has(b.id) ? "rgba(63,255,139,0.1)" : "var(--app-navy)", border: `1px solid ${wizSelected.has(b.id) ? "rgba(63,255,139,0.3)" : "rgba(106,118,140,0.15)"}` }}>
                          <input type="checkbox" checked={wizSelected.has(b.id)} onChange={() => {
                            const next = new Set(wizSelected);
                            next.has(b.id) ? next.delete(b.id) : next.add(b.id);
                            setWizSelected(next);
                          }} />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium" style={{ color: "#dae6ff" }}>{b.datum}</span>
                            <span className="text-[11px] ml-2" style={{ color: "#a0abc3" }}>{b.project_naam} · {b.activiteit || b.type}</span>
                          </div>
                          <span className="text-xs font-bold shrink-0" style={{ fontFamily: "DM Mono, monospace", color: "#3fff8b" }}>{b.uren}u</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setWizStep(2)} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>Vorige</button>
                    <button disabled={wizSelected.size === 0} onClick={() => setWizStep(4)} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)" }}>
                      Controleren → ({wizTotaalUren}u)
                    </button>
                  </div>
                </div>
              )}

              {wizStep === 4 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold" style={{ color: "#a0abc3" }}>Stap 4 — Controleer & bevestig</p>
                  {wizMedProfile && !wizMedProfile.kvk_nummer && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: "rgba(254,179,0,0.08)", border: "1px solid rgba(254,179,0,0.3)" }}>
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "#feb300" }} />
                      <span className="text-[11px]" style={{ color: "#feb300" }}>Monteur heeft nog geen ZZP gegevens ingevuld. PDF is incompleet.</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-medium" style={{ color: "#a0abc3" }}>Uurtarief</label>
                      <input type="number" value={wizTarief} onChange={e => setWizTarief(Number(e.target.value))} className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff", fontFamily: "DM Mono, monospace" }} />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium" style={{ color: "#a0abc3" }}>Betalingstermijn</label>
                      <span className="block px-3 py-2 text-sm" style={{ color: "#dae6ff" }}>{wizMedProfile?.betalingstermijn || 30} dagen</span>
                    </div>
                  </div>
                  <div className="rounded-xl p-3 space-y-1" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)" }}>
                    <div className="flex justify-between text-xs"><span style={{ color: "#a0abc3" }}>Uren</span><span style={{ fontFamily: "DM Mono, monospace" }}>{wizTotaalUren}u × €{wizTarief}</span></div>
                    <div className="flex justify-between text-xs"><span style={{ color: "#a0abc3" }}>BTW</span><span style={{ fontFamily: "DM Mono, monospace", color: "#feb300" }}>Verlegd (artikel 12)</span></div>
                    <div className="flex justify-between text-sm font-bold pt-2" style={{ borderTop: "1px solid rgba(106,118,140,0.15)" }}><span style={{ color: "#dae6ff" }}>Te factureren</span><span style={{ fontFamily: "DM Mono, monospace", color: "#3fff8b" }}>{euro(wizSubtotaal)}</span></div>
                  </div>
                  <textarea value={wizNotitie} onChange={e => setWizNotitie(e.target.value)} placeholder="Notitie (optioneel)" className="w-full px-3 py-2 rounded-xl text-sm" rows={2} style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
                  <div className="flex gap-2">
                    <button onClick={() => setWizStep(3)} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>Vorige</button>
                    <button onClick={createOrder} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)" }}>
                      Order aanmaken
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </PageShell>
    </>
  );
}
