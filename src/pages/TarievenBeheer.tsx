import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { BottomNav } from "@/components/BottomNav";
import { useNavBadges } from "@/hooks/useNavBadges";
import { useProfile } from "@/hooks/useProfile";
import { ArrowLeft, Pencil, Check, X, Download, RotateCcw, Info } from "lucide-react";
import { SPEC_CODES, GROEP_LABELS } from "@/lib/specCodes";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface Tarief {
  id: string;
  code: string;
  omschrijving: string;
  eenheid: string;
  tarief: number;
  groep: string;
  updated_at: string;
  updated_by: string | null;
}

const fmt = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
const origMap = new Map(SPEC_CODES.map(s => [s.code, s.tarief]));

export default function TarievenBeheer() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const { badges } = useNavBadges();
  const { profile } = useProfile();
  const [tarieven, setTarieven] = useState<Tarief[]>([]);
  const [loading, setLoading] = useState(true);
  const [editCode, setEditCode] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  const fetch = useCallback(async () => {
    const { data } = await supabase.from("spec_code_tarieven").select("*").order("code");
    if (data) setTarieven(data as any);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => { if (!isManager) navigate("/"); }, [isManager, navigate]);

  const grouped = tarieven.reduce<Record<string, Tarief[]>>((acc, t) => {
    const g = t.groep || "Overig";
    (acc[g] = acc[g] || []).push(t);
    return acc;
  }, {});

  async function saveTarief(t: Tarief) {
    const val = parseFloat(editValue.replace(",", "."));
    if (isNaN(val) || val < 0) { toast.error("Ongeldig tarief"); return; }
    const { error } = await supabase.from("spec_code_tarieven").update({
      tarief: val,
      updated_by: profile?.id || null,
    }).eq("id", t.id);
    if (error) { toast.error("Fout bij opslaan"); return; }
    toast.success(`Tarief ${t.code} bijgewerkt ✓`);
    setEditCode(null);
    fetch();
  }

  async function resetAll() {
    for (const sc of SPEC_CODES) {
      await supabase.from("spec_code_tarieven").update({ tarief: sc.tarief, updated_by: null }).eq("code", sc.code);
    }
    toast.success("Alle tarieven gereset naar origineel");
    setConfirmReset(false);
    fetch();
  }

  function exportCsv() {
    const bom = "\uFEFF";
    const header = "Code;Omschrijving;Eenheid;Tarief;Groep\n";
    const rows = tarieven.map(t => `${t.code};${t.omschrijving};${t.eenheid};${t.tarief.toFixed(2).replace(".", ",")};${t.groep}`).join("\n");
    const blob = new Blob([bom + header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "tarieven_van_gelder.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <DesktopSidebar badges={badges} />
      <div className="lg:ml-[240px] min-h-screen" style={{ background: "var(--bg-base)" }}>
        <header className="flex items-center gap-3 px-6 lg:px-10 pt-6 pb-4">
          <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-lg flex items-center justify-center lg:hidden" style={{ background: "var(--bg-surface-2)" }}>
            <ArrowLeft className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Tarieven Van Gelder</h1>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Prijsvoorstel TerreVolt v2.0</p>
          </div>
          <button onClick={exportCsv} className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          {!confirmReset ? (
            <button onClick={() => setConfirmReset(true)} className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5" style={{ border: "1px solid var(--danger-border)", color: "var(--danger)" }}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          ) : (
            <div className="flex gap-1">
              <button onClick={resetAll} className="px-3 py-2 rounded-lg text-xs font-bold text-white" style={{ background: "var(--danger)" }}>Bevestigen</button>
              <button onClick={() => setConfirmReset(false)} className="px-2 py-2 rounded-lg text-xs" style={{ color: "var(--text-muted)" }}>×</button>
            </div>
          )}
        </header>

        {/* Info banner */}
        <div className="mx-6 lg:mx-10 mb-4 rounded-xl p-3 flex items-start gap-2" style={{ background: "var(--info-light)", border: "1px solid var(--info-border)" }}>
          <Info className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--info)" }} />
          <p className="text-xs" style={{ color: "var(--info)" }}>Deze tarieven zijn gebaseerd op het prijsvoorstel van Van Gelder. Pas ze aan als er een nieuw voorstel is.</p>
        </div>

        <div className="px-6 lg:px-10 pb-10">
          {loading ? (
            <div className="text-center py-8"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} /></div>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([groep, items]) => (
                <AccordionItem key={groep} value={groep} className="rounded-[14px] overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
                  <AccordionTrigger className="px-4 py-3 text-sm font-semibold hover:no-underline" style={{ color: "var(--text-primary)" }}>
                    {GROEP_LABELS[groep] || groep} ({items.length})
                  </AccordionTrigger>
                  <AccordionContent className="px-0 pb-0">
                    <div className="grid grid-cols-[90px_1fr_50px_100px_80px_60px] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>
                      <span>Code</span><span>Omschrijving</span><span>Eh</span><span>Tarief</span><span>Status</span><span></span>
                    </div>
                    {items.map(t => {
                      const orig = origMap.get(t.code);
                      const isModified = orig !== undefined && Math.abs(orig - t.tarief) > 0.005;
                      const isEditing = editCode === t.code;
                      return (
                        <div key={t.id} className="grid grid-cols-[90px_1fr_50px_100px_80px_60px] items-center px-4 py-2 text-[12px]" style={{ borderTop: "1px solid var(--border)" }}>
                          <span className="font-mono font-semibold" style={{ color: "var(--accent)" }}>{t.code}</span>
                          <span className="truncate" style={{ color: "var(--text-primary)" }}>{t.omschrijving}</span>
                          <span style={{ color: "var(--text-muted)" }}>{t.eenheid}</span>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs" style={{ color: "var(--text-muted)" }}>€</span>
                              <input
                                autoFocus
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && saveTarief(t)}
                                className="w-20 px-2 py-1 rounded text-xs font-mono text-right"
                                style={{ background: "var(--bg-base)", border: "1px solid var(--accent)", color: "var(--text-primary)" }}
                              />
                              <button onClick={() => saveTarief(t)} className="w-5 h-5 rounded flex items-center justify-center" style={{ color: "var(--success)" }}><Check className="h-3 w-3" /></button>
                              <button onClick={() => setEditCode(null)} className="w-5 h-5 rounded flex items-center justify-center" style={{ color: "var(--text-muted)" }}><X className="h-3 w-3" /></button>
                            </div>
                          ) : (
                            <span className="font-mono" style={{ color: "var(--text-primary)" }}>{fmt(t.tarief)}</span>
                          )}
                          <span>
                            {isModified && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "var(--warn-light)", color: "var(--warn-text)" }} title={`Origineel: ${fmt(orig!)}`}>
                                Aangepast
                              </span>
                            )}
                          </span>
                          {!isEditing && (
                            <button onClick={() => { setEditCode(t.code); setEditValue(t.tarief.toFixed(2)); }} className="w-6 h-6 rounded flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      </div>
      <BottomNav badges={badges} />
    </>
  );
}
