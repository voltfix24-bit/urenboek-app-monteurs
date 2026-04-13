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

import { euroDecimals as fmt } from "@/lib/formatting";
import { Spinner } from "@/components/ui/Spinner";
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
      <div className="lg:ml-[240px] min-h-screen" style={{ background: "#030e20" }}>
        <header className="flex items-center gap-3 px-6 lg:px-10 pt-6 pb-4">
          <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-lg flex items-center justify-center lg:hidden" style={{ background: "#102038" }}>
            <ArrowLeft className="h-4 w-4" style={{ color: "#a0abc3" }} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold" style={{ color: "#dae6ff" }}>Tarieven Van Gelder</h1>
            <p className="text-xs" style={{ color: "#a0abc3" }}>Prijsvoorstel TerreVolt v2.0</p>
          </div>
          <button onClick={exportCsv} className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5" style={{ border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          {!confirmReset ? (
            <button onClick={() => setConfirmReset(true)} className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5" style={{ border: "1px solid rgba(255,113,108,0.3)", color: "#ff716c" }}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          ) : (
            <div className="flex gap-1">
              <button onClick={resetAll} className="px-3 py-2 rounded-lg text-xs font-bold text-white" style={{ background: "#ff716c" }}>Bevestigen</button>
              <button onClick={() => setConfirmReset(false)} className="px-2 py-2 rounded-lg text-xs" style={{ color: "#a0abc3" }}>×</button>
            </div>
          )}
        </header>

        {/* Info banner */}
        <div className="mx-6 lg:mx-10 mb-4 rounded-xl p-3 flex items-start gap-2" style={{ background: "rgba(110,155,255,0.1)", border: "1px solid rgba(110,155,255,0.3)" }}>
          <Info className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#6e9bff" }} />
          <p className="text-xs" style={{ color: "#6e9bff" }}>Deze tarieven zijn gebaseerd op het prijsvoorstel van Van Gelder. Pas ze aan als er een nieuw voorstel is.</p>
        </div>

        <div className="px-6 lg:px-10 pb-10">
          {loading ? (
            <Spinner padding="py-8" />
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([groep, items]) => (
                <AccordionItem key={groep} value={groep} className="rounded-[14px] overflow-hidden" style={{ border: "1px solid rgba(106,118,140,0.15)", background: "rgba(10,26,48,0.7)" }}>
                  <AccordionTrigger className="px-4 py-3 text-sm font-semibold hover:no-underline" style={{ color: "#dae6ff" }}>
                    {GROEP_LABELS[groep] || groep} ({items.length})
                  </AccordionTrigger>
                  <AccordionContent className="px-0 pb-0">
                    <div className="grid grid-cols-[90px_1fr_50px_100px_80px_60px] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ background: "#102038", color: "#a0abc3" }}>
                      <span>Code</span><span>Omschrijving</span><span>Eh</span><span>Tarief</span><span>Status</span><span></span>
                    </div>
                    {items.map(t => {
                      const orig = origMap.get(t.code);
                      const isModified = orig !== undefined && Math.abs(orig - t.tarief) > 0.005;
                      const isEditing = editCode === t.code;
                      return (
                        <div key={t.id} className="grid grid-cols-[90px_1fr_50px_100px_80px_60px] items-center px-4 py-2 text-[12px]" style={{ borderTop: "1px solid rgba(106,118,140,0.15)" }}>
                          <span className="font-mono font-semibold" style={{ color: "#3fff8b" }}>{t.code}</span>
                          <span className="truncate" style={{ color: "#dae6ff" }}>{t.omschrijving}</span>
                          <span style={{ color: "#a0abc3" }}>{t.eenheid}</span>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs" style={{ color: "#a0abc3" }}>€</span>
                              <input
                                autoFocus
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && saveTarief(t)}
                                className="w-20 px-2 py-1 rounded text-xs font-mono text-right"
                                style={{ background: "#030e20", border: "1px solid #3fff8b", color: "#dae6ff" }}
                              />
                              <button onClick={() => saveTarief(t)} className="w-5 h-5 rounded flex items-center justify-center" style={{ color: "#3fff8b" }}><Check className="h-3 w-3" /></button>
                              <button onClick={() => setEditCode(null)} className="w-5 h-5 rounded flex items-center justify-center" style={{ color: "#a0abc3" }}><X className="h-3 w-3" /></button>
                            </div>
                          ) : (
                            <span className="font-mono" style={{ color: "#dae6ff" }}>{fmt(t.tarief)}</span>
                          )}
                          <span>
                            {isModified && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "rgba(254,179,0,0.1)", color: "#feb300" }} title={`Origineel: ${fmt(orig!)}`}>
                                Aangepast
                              </span>
                            )}
                          </span>
                          {!isEditing && (
                            <button onClick={() => { setEditCode(t.code); setEditValue(t.tarief.toFixed(2)); }} className="w-6 h-6 rounded flex items-center justify-center" style={{ color: "#a0abc3" }}>
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
