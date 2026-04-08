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
import { BottomNav } from "@/components/BottomNav";
import { useNavBadges } from "@/hooks/useNavBadges";
import { Plus, Download, ChevronRight, ArrowLeft, X, Check, FileText, AlertTriangle } from "lucide-react";
import { format, startOfISOWeek, endOfISOWeek, getISOWeek, getISOWeekYear } from "date-fns";
import { useSearchParams } from "react-router-dom";
import { nl } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { euroDecimals as euro } from "@/lib/formatting";
import { Spinner } from "@/components/ui/Spinner";

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

  // Create wizard state
  const [wizStep, setWizStep] = useState(1);
  const [wizMedewerker, setWizMedewerker] = useState("");
  const [wizVan, setWizVan] = useState("");
  const [wizTot, setWizTot] = useState("");
  const [wizBoekingen, setWizBoekingen] = useState<any[]>([]);
  const [wizSelected, setWizSelected] = useState<Set<string>>(new Set());
  const [wizTarief, setWizTarief] = useState<number>(0);
  const [wizNotitie, setWizNotitie] = useState("");
  const [wizMedProfile, setWizMedProfile] = useState<any>(null);
  const [wizLoading, setWizLoading] = useState(false);

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
      setWizMedewerker(medId);
      setWizVan(van);
      setWizTot(tot);
      setShowCreate(true);
      setWizStep(2);
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
    const { data } = await supabase.from("inkooporder_regels").select("*").eq("inkooporder_id", order.id).order("datum");
    setOrderRegels(data || []);
  };

  // Generate next order number
  const generateOrderNummer = async () => {
    const year = new Date().getFullYear();
    const { data } = await supabase.from("inkooporders").select("order_nummer").like("order_nummer", `TV-${year}-%`).order("order_nummer", { ascending: false }).limit(1);
    if (data && data.length > 0) {
      const last = data[0].order_nummer;
      const num = parseInt(last.split("-")[2]) + 1;
      return `TV-${year}-${String(num).padStart(4, "0")}`;
    }
    return `TV-${year}-0001`;
  };

  // Wizard: load boekingen
  const loadBoekingen = async () => {
    if (!wizMedewerker || !wizVan || !wizTot) return;
    setWizLoading(true);
    const { data } = await supabase.from("uren_boekingen").select("id, datum, project_id, uren, beschrijving, type").eq("medewerker_id", wizMedewerker).eq("status", "goedgekeurd").gte("datum", wizVan).lte("datum", wizTot).order("datum");
    // Filter out boekingen already on an order
    const { data: existingRegels } = await supabase.from("inkooporder_regels").select("uren_boeking_id");
    const usedIds = new Set((existingRegels || []).map((r: any) => r.uren_boeking_id).filter(Boolean));
    const available = (data || []).filter((b: any) => !usedIds.has(b.id));
    // Get project names
    const projIds = [...new Set(available.map((b: any) => b.project_id))];
    const { data: projs } = projIds.length > 0 ? await supabase.from("projects").select("id, naam, nummer").in("id", projIds) : { data: [] };
    const projMap = new Map((projs || []).map((p: any) => [p.id, p]));
    // Get planning activiteit
    const { data: planData } = await supabase.from("planning").select("medewerker_id, datum, project_id, activiteit").eq("medewerker_id", wizMedewerker).gte("datum", wizVan).lte("datum", wizTot);
    const planKey = (mid: string, d: string, pid: string) => `${mid}-${d}-${pid}`;
    const planMap = new Map((planData || []).map((p: any) => [planKey(p.medewerker_id, p.datum, p.project_id), p.activiteit]));

    const enriched = available.map((b: any) => {
      const proj = projMap.get(b.project_id) || { naam: "", nummer: "" };
      return { ...b, project_naam: (proj as any).naam, project_nummer: (proj as any).nummer, activiteit: planMap.get(planKey(wizMedewerker, b.datum, b.project_id)) || null };
    });
    setWizBoekingen(enriched);
    setWizSelected(new Set(enriched.map((b: any) => b.id)));
    // Get profile + tarief
    const { data: prof } = await supabase.from("profiles").select("id, full_name, uurtarief, kvk_nummer, btw_nummer, iban, bedrijfsnaam, factuuradres, adres, betalingstermijn").eq("id", wizMedewerker).single();
    setWizMedProfile(prof);
    setWizTarief(Number(prof?.uurtarief) || 0);
    setWizLoading(false);
    setWizStep(3);
  };

  const wizTotaalUren = useMemo(() => wizBoekingen.filter(b => wizSelected.has(b.id)).reduce((s, b) => s + Number(b.uren), 0), [wizBoekingen, wizSelected]);
  const wizSubtotaal = wizTotaalUren * wizTarief;
  const wizBtw = wizSubtotaal * 0.21;
  const wizTotaalIncl = wizSubtotaal + wizBtw;

  const createOrder = async () => {
    const orderNummer = await generateOrderNummer();
    const selectedBoekingen = wizBoekingen.filter(b => wizSelected.has(b.id));
    const { data: order, error } = await supabase.from("inkooporders").insert({
      order_nummer: orderNummer,
      medewerker_id: wizMedewerker,
      periode_van: wizVan,
      periode_tot: wizTot,
      status: "concept",
      totaal_uren: wizTotaalUren,
      totaal_excl_btw: wizSubtotaal,
      btw_bedrag: wizBtw,
      totaal_incl_btw: wizTotaalIncl,
      aangemaakt_door: profileId,
      notitie: wizNotitie || null,
    } as any).select("id").single();
    if (error || !order) { toast.error("Fout bij aanmaken"); return; }
    // Insert regels
    const regels = selectedBoekingen.map((b: any) => ({
      inkooporder_id: order.id,
      uren_boeking_id: b.id,
      datum: b.datum,
      project_id: b.project_id,
      project_naam: b.project_naam,
      activiteit: b.activiteit || null,
      uren: Number(b.uren),
      uurtarief: wizTarief,
      bedrag: Number(b.uren) * wizTarief,
    }));
    await supabase.from("inkooporder_regels").insert(regels as any);
    toast.success(`Inkooporder ${orderNummer} aangemaakt`);
    setShowCreate(false);
    resetWizard();
    fetchOrders();
  };

  const resetWizard = () => {
    setWizStep(1); setWizMedewerker(""); setWizVan(""); setWizTot("");
    setWizBoekingen([]); setWizSelected(new Set()); setWizTarief(0);
    setWizNotitie(""); setWizMedProfile(null);
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
        inhoud: `Je inkooporder voor de periode ${selectedOrder.periode_van} t/m ${selectedOrder.periode_tot} is klaar. Totaal: ${euro(selectedOrder.totaal_incl_btw)} incl BTW.`,
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

  const generatePdf = async (order: any, regels: any[], prof: any) => {
    const bedrijf = await getBedrijfsgegevens();
    const bNaam = bedrijf?.bedrijfsnaam || "TerreVolt BV";
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(74, 124, 47);
    doc.text(bNaam, 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("Inkooporder", 14, 28);

    // Opdrachtgever info
    let yLeft = 36;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    if (bedrijf?.straat) { doc.text(bedrijf.straat, 14, yLeft); yLeft += 5; }
    if (bedrijf?.postcode || bedrijf?.stad) { doc.text([bedrijf.postcode, bedrijf.stad].filter(Boolean).join(" "), 14, yLeft); yLeft += 5; }
    if (bedrijf?.kvk_nummer) { doc.text(`KVK: ${bedrijf.kvk_nummer}`, 14, yLeft); yLeft += 5; }
    if (bedrijf?.btw_nummer) { doc.text(`BTW: ${bedrijf.btw_nummer}`, 14, yLeft); yLeft += 5; }

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text(`${order.order_nummer}`, 14, yLeft + 6);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Datum: ${format(new Date(order.aangemaakt_op), "d MMMM yyyy", { locale: nl })}`, 14, yLeft + 13);
    doc.text(`Periode: ${order.periode_van} t/m ${order.periode_tot}`, 14, yLeft + 19);

    // Opdrachtnemer
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Opdrachtnemer:", 120, 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const naam = prof?.bedrijfsnaam || prof?.full_name || order.medewerker_naam;
    doc.text(naam, 120, 47);
    if (prof?.factuuradres || prof?.adres) doc.text(prof.factuuradres || prof.adres, 120, 53);
    if (prof?.kvk_nummer) doc.text(`KVK: ${prof.kvk_nummer}`, 120, 59);
    if (prof?.btw_nummer) doc.text(`BTW: ${prof.btw_nummer}`, 120, 65);
    if (prof?.iban) doc.text(`IBAN: ${prof.iban}`, 120, 71);

    autoTable(doc, {
      startY: 80,
      head: [["Datum", "Project", "Activiteit", "Uren", "Tarief", "Bedrag"]],
      body: regels.map(r => [
        r.datum, r.project_naam || "", r.activiteit || "", `${r.uren}`, euro(r.uurtarief), euro(r.bedrag),
      ]),
      foot: [
        ["", "", "", "", "Subtotaal excl BTW:", euro(order.totaal_excl_btw)],
        ["", "", "", "", "BTW 21%:", euro(order.btw_bedrag)],
        ["", "", "", "", "Totaal incl BTW:", euro(order.totaal_incl_btw)],
      ],
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [74, 124, 47], textColor: 255 },
      footStyles: { fillColor: [245, 247, 240], textColor: [0, 0, 0], fontStyle: "bold" },
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 200;
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(`Betaling binnen ${prof?.betalingstermijn || bedrijf?.betalingstermijn || 14} dagen na ontvangst factuur`, 14, finalY + 15);
    if (bedrijf?.iban) doc.text(`IBAN: ${bedrijf.iban}${bedrijf.iban_naam ? ` t.n.v. ${bedrijf.iban_naam}` : ""}`, 14, finalY + 22);
    doc.text(`Gegenereerd op ${format(new Date(), "d MMMM yyyy", { locale: nl })} · ${bNaam}`, 14, finalY + 29);

    doc.save(`Inkooporder_${order.order_nummer}.pdf`);
  };

  if (!isManager) return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}><p style={{ color: "var(--text-muted)" }}>Alleen managers.</p></div>;

  return (
    <>
      <DesktopSidebar badges={badges} />
      <PageShell>
        <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <HeaderLogo />
              <span className="text-base font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Inkooporders</span>
            </div>
            <button onClick={() => { setShowCreate(true); resetWizard(); }} className="px-3 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1.5" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
              <Plus className="h-3.5 w-3.5" /> Nieuwe order
            </button>
          </div>
        </header>

        <main className="px-4 py-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-1.5">
            {["alle", "concept", "verzonden", "factuur_ontvangen", "betaald"].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className="px-3 py-1.5 rounded-full text-[11px] font-semibold" style={{
                background: statusFilter === s ? "var(--accent-light)" : "var(--bg-surface)",
                border: `1px solid ${statusFilter === s ? "var(--accent-border)" : "var(--border)"}`,
                color: statusFilter === s ? "var(--accent)" : "var(--text-muted)",
              }}>
                {s === "alle" ? "Alle" : INKOOPORDER_STATUS_CONFIG[s]?.label || s}
              </button>
            ))}
          </div>

          {loading ? (
            <Spinner padding="py-8" />
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <FileText className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Geen inkooporders</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredOrders.map(o => (
                <button key={o.id} onClick={() => loadOrderDetail(o)} className="w-full text-left rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: `1px solid ${selectedOrder?.id === o.id ? "var(--accent)" : "var(--border)"}` }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[13px] font-bold" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-primary)" }}>{o.order_nummer}</span>
                      <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>· {o.medewerker_naam}</span>
                    </div>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{o.periode_van} → {o.periode_tot}</p>
                  <p className="text-lg font-bold mt-1" style={{ fontFamily: "DM Mono, monospace", color: "var(--accent)" }}>{euro(Number(o.totaal_incl_btw) || 0)}</p>
                </button>
              ))}
            </div>
          )}

          {/* Order Detail */}
          {selectedOrder && (
            <div className="rounded-2xl p-5 space-y-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--accent-border)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-primary)" }}>{selectedOrder.order_nummer}</h3>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{selectedOrder.medewerker_naam} · {selectedOrder.periode_van} → {selectedOrder.periode_tot}</p>
                </div>
                <div className="flex items-center gap-2">
                  <OrderStatusBadge status={selectedOrder.status} />
                  <button onClick={() => generatePdf(selectedOrder, orderRegels, wizMedProfile)} className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                    <Download className="h-3.5 w-3.5" /> PDF
                  </button>
                </div>
              </div>

              {/* Regels */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Datum", "Project", "Activiteit", "Uren", "Tarief", "Bedrag"].map(h => (
                        <th key={h} className="text-left pb-2 px-2 font-semibold" style={{ color: "var(--text-muted)", fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orderRegels.map(r => (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--bg-surface-2)" }}>
                        <td className="py-2 px-2" style={{ color: "var(--text-primary)" }}>{r.datum}</td>
                        <td className="py-2 px-2" style={{ color: "var(--text-primary)" }}>{r.project_naam}</td>
                        <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>{r.activiteit || "—"}</td>
                        <td className="py-2 px-2" style={{ fontFamily: "DM Mono, monospace" }}>{r.uren}</td>
                        <td className="py-2 px-2" style={{ fontFamily: "DM Mono, monospace" }}>{euro(r.uurtarief)}</td>
                        <td className="py-2 px-2 font-semibold" style={{ fontFamily: "DM Mono, monospace" }}>{euro(r.bedrag)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--accent-border)" }}>
                      <td colSpan={3} />
                      <td className="py-2 px-2 font-bold" style={{ fontFamily: "DM Mono, monospace" }}>{selectedOrder.totaal_uren}u</td>
                      <td className="py-2 px-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>excl BTW:</td>
                      <td className="py-2 px-2 font-bold" style={{ fontFamily: "DM Mono, monospace" }}>{euro(Number(selectedOrder.totaal_excl_btw))}</td>
                    </tr>
                    <tr>
                      <td colSpan={4} />
                      <td className="py-1 px-2 text-right" style={{ color: "var(--text-muted)" }}>BTW 21%:</td>
                      <td className="py-1 px-2" style={{ fontFamily: "DM Mono, monospace" }}>{euro(Number(selectedOrder.btw_bedrag))}</td>
                    </tr>
                    <tr>
                      <td colSpan={4} />
                      <td className="py-1 px-2 text-right font-bold" style={{ color: "var(--accent)" }}>Totaal:</td>
                      <td className="py-1 px-2 font-bold text-base" style={{ fontFamily: "DM Mono, monospace", color: "var(--accent)" }}>{euro(Number(selectedOrder.totaal_incl_btw))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Status actions */}
              <div className="flex flex-wrap gap-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                {selectedOrder.status === "concept" && (
                  <button onClick={() => updateOrderStatus(selectedOrder.id, "verzonden")} className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
                    Verzenden naar monteur
                  </button>
                )}
                {selectedOrder.status === "verzonden" && (
                  <div className="flex items-center gap-2">
                    <input value={factuurNummer} onChange={e => setFactuurNummer(e.target.value)} placeholder="Factuurnummer" className="px-3 py-2 rounded-xl text-xs" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                    <input type="date" value={factuurDatum} onChange={e => setFactuurDatum(e.target.value)} className="px-3 py-2 rounded-xl text-xs" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                    <button onClick={() => { if (!factuurNummer) { toast.error("Vul factuurnummer in"); return; } updateOrderStatus(selectedOrder.id, "factuur_ontvangen", { factuur_nummer: factuurNummer, factuur_datum: factuurDatum || new Date().toISOString() }); }} className="px-4 py-2 rounded-xl text-xs font-semibold" style={{ background: "var(--info-light)", border: "1px solid var(--info-border)", color: "var(--info)" }}>
                      Factuur registreren
                    </button>
                  </div>
                )}
                {selectedOrder.status === "factuur_ontvangen" && (
                  <div className="flex items-center gap-2">
                    <input type="date" value={betaaldDatum} onChange={e => setBetaaldDatum(e.target.value)} className="px-3 py-2 rounded-xl text-xs" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                    <button onClick={() => updateOrderStatus(selectedOrder.id, "betaald", { betaald_op: betaaldDatum || new Date().toISOString() })} className="px-4 py-2 rounded-xl text-xs font-semibold" style={{ background: "var(--success-light)", border: "1px solid var(--success-border)", color: "var(--success)" }}>
                      Betaling registreren
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Create wizard modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
            <div className="w-full max-w-lg mx-4 rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Nieuwe inkooporder</h3>
                <button onClick={() => { setShowCreate(false); resetWizard(); }} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface-2)" }}><X className="h-4 w-4" style={{ color: "var(--text-muted)" }} /></button>
              </div>

              {wizStep === 1 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Stap 1 — Selecteer monteur</p>
                  <select value={wizMedewerker} onChange={e => setWizMedewerker(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                    <option value="">Kies medewerker...</option>
                    {medewerkers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                  <button disabled={!wizMedewerker} onClick={() => setWizStep(2)} className="w-full py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
                    Volgende →
                  </button>
                </div>
              )}

              {wizStep === 2 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Stap 2 — Selecteer periode</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Van</label>
                      <input type="date" value={wizVan} onChange={e => setWizVan(e.target.value)} className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Tot</label>
                      <input type="date" value={wizTot} onChange={e => setWizTot(e.target.value)} className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setWizStep(1)} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Vorige</button>
                    <button disabled={!wizVan || !wizTot} onClick={loadBoekingen} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
                      {wizLoading ? "Laden..." : "Boekingen ophalen →"}
                    </button>
                  </div>
                </div>
              )}

              {wizStep === 3 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Stap 3 — Selecteer uren ({wizBoekingen.length} beschikbaar)</p>
                  {wizBoekingen.length === 0 ? (
                    <p className="text-sm py-4 text-center" style={{ color: "var(--text-muted)" }}>Geen goedgekeurde uren gevonden in deze periode</p>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {wizBoekingen.map(b => (
                        <label key={b.id} className="flex items-center gap-2 p-2 rounded-lg cursor-pointer" style={{ background: wizSelected.has(b.id) ? "var(--accent-light)" : "var(--bg-base)", border: `1px solid ${wizSelected.has(b.id) ? "var(--accent-border)" : "var(--border)"}` }}>
                          <input type="checkbox" checked={wizSelected.has(b.id)} onChange={() => {
                            const next = new Set(wizSelected);
                            next.has(b.id) ? next.delete(b.id) : next.add(b.id);
                            setWizSelected(next);
                          }} />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{b.datum}</span>
                            <span className="text-[11px] ml-2" style={{ color: "var(--text-muted)" }}>{b.project_naam} · {b.activiteit || b.type}</span>
                          </div>
                          <span className="text-xs font-bold shrink-0" style={{ fontFamily: "DM Mono, monospace", color: "var(--accent)" }}>{b.uren}u</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setWizStep(2)} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Vorige</button>
                    <button disabled={wizSelected.size === 0} onClick={() => setWizStep(4)} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
                      Controleren → ({wizTotaalUren}u)
                    </button>
                  </div>
                </div>
              )}

              {wizStep === 4 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Stap 4 — Controleer & bevestig</p>
                  {wizMedProfile && !wizMedProfile.kvk_nummer && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: "var(--warn-bg)", border: "1px solid var(--warn-border)" }}>
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--warn-text)" }} />
                      <span className="text-[11px]" style={{ color: "var(--warn-text)" }}>Monteur heeft nog geen ZZP gegevens ingevuld. PDF is incompleet.</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Uurtarief</label>
                      <input type="number" value={wizTarief} onChange={e => setWizTarief(Number(e.target.value))} className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }} />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Betalingstermijn</label>
                      <span className="block px-3 py-2 text-sm" style={{ color: "var(--text-primary)" }}>{wizMedProfile?.betalingstermijn || 14} dagen</span>
                    </div>
                  </div>
                  <div className="rounded-xl p-3 space-y-1" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
                    <div className="flex justify-between text-xs"><span style={{ color: "var(--text-muted)" }}>Uren</span><span style={{ fontFamily: "DM Mono, monospace" }}>{wizTotaalUren}u × €{wizTarief}</span></div>
                    <div className="flex justify-between text-xs"><span style={{ color: "var(--text-muted)" }}>Subtotaal excl BTW</span><span style={{ fontFamily: "DM Mono, monospace" }}>{euro(wizSubtotaal)}</span></div>
                    <div className="flex justify-between text-xs"><span style={{ color: "var(--text-muted)" }}>BTW 21%</span><span style={{ fontFamily: "DM Mono, monospace" }}>{euro(wizBtw)}</span></div>
                    <div className="flex justify-between text-sm font-bold pt-1" style={{ borderTop: "1px solid var(--border)" }}><span style={{ color: "var(--text-primary)" }}>Totaal incl BTW</span><span style={{ fontFamily: "DM Mono, monospace", color: "var(--accent)" }}>{euro(wizTotaalIncl)}</span></div>
                  </div>
                  <textarea value={wizNotitie} onChange={e => setWizNotitie(e.target.value)} placeholder="Notitie (optioneel)" className="w-full px-3 py-2 rounded-xl text-sm" rows={2} style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                  <div className="flex gap-2">
                    <button onClick={() => setWizStep(3)} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Vorige</button>
                    <button onClick={createOrder} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
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
