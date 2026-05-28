import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Check, AlertTriangle, ChevronLeft, Users, Calendar, ListChecks, FileCheck2 } from "lucide-react";
import { euroDecimals as euro } from "@/lib/formatting";
import { Spinner } from "@/components/ui/Spinner";
import { T } from "@/lib/inkooporderTheme";
import { format, parseISO, startOfISOWeek, endOfISOWeek, getISOWeek, getISOWeekYear } from "date-fns";

interface WeekOptie {
  key: string;          // "2026-W21"
  jaar: number;
  week: number;
  van: string;          // YYYY-MM-DD (maandag)
  tot: string;          // YYYY-MM-DD (zondag)
  aantalBoekingen: number;
  totaalUren: number;
}

interface Medewerker { id: string; full_name: string; is_onderaannemer?: boolean; monteur_count?: number }
interface Boeking {
  id: string; datum: string; project_id: string; uren: number; beschrijving?: string; type?: string;
  project_naam?: string; project_nummer?: string; activiteit?: string | null;
  medewerker_id?: string; monteur_naam?: string;
}
interface Profile {
  id: string; full_name: string; uurtarief?: number | null; kvk_nummer?: string | null;
  btw_nummer?: string | null; iban?: string | null; bedrijfsnaam?: string | null;
  factuuradres?: string | null; adres?: string | null; betalingstermijn?: number | null; telefoon?: string | null;
}

interface Props {
  open: boolean;
  medewerkers: Medewerker[];
  profileId: string | null;
  initial?: { medewerkerId?: string; van?: string; tot?: string };
  onClose: () => void;
  onCreated: () => void;
}

const STEPS = [
  { n: 1, label: "Monteur", Icon: Users },
  { n: 2, label: "Periode", Icon: Calendar },
  { n: 3, label: "Uren", Icon: ListChecks },
  { n: 4, label: "Controle", Icon: FileCheck2 },
] as const;

export function InkooporderWizard({ open, medewerkers, profileId, initial, onClose, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [medewerker, setMedewerker] = useState("");
  const [van, setVan] = useState("");
  const [tot, setTot] = useState("");
  const [boekingen, setBoekingen] = useState<Boeking[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tarief, setTarief] = useState<number>(0);
  const [notitie, setNotitie] = useState("");
  const [medProfile, setMedProfile] = useState<Profile | null>(null);
  const [loadingBoekingen, setLoadingBoekingen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Init vanuit URL params (vanuit Goedkeuring)
  useEffect(() => {
    if (open && initial) {
      if (initial.medewerkerId) setMedewerker(initial.medewerkerId);
      if (initial.van) setVan(initial.van);
      if (initial.tot) setTot(initial.tot);
      if (initial.medewerkerId && initial.van && initial.tot) setStep(2);
    }
  }, [open, initial]);

  const reset = useCallback(() => {
    setStep(1); setMedewerker(""); setVan(""); setTot("");
    setBoekingen([]); setSelected(new Set()); setTarief(0);
    setNotitie(""); setMedProfile(null);
  }, []);

  const handleClose = () => { reset(); onClose(); };

  const totaalUren = useMemo(
    () => boekingen.filter(b => selected.has(b.id)).reduce((s, b) => s + Number(b.uren), 0),
    [boekingen, selected],
  );
  const subtotaal = totaalUren * tarief;

  const loadBoekingen = async () => {
    if (!medewerker || !van || !tot) return;
    if (van > tot) { toast.error("Van-datum moet vóór tot-datum liggen"); return; }
    setLoadingBoekingen(true);
    try {
      // Bepaal of geselecteerde medewerker een onderaannemer is → dan ook uren van zijn monteurs meenemen
      const selectedMed = medewerkers.find(m => m.id === medewerker);
      const teamIds: string[] = [medewerker];
      const naamMap = new Map<string, string>([[medewerker, selectedMed?.full_name || ""]]);
      if (selectedMed?.is_onderaannemer) {
        const { data: monteurs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("onderaannemer_id", medewerker);
        (monteurs || []).forEach((m: any) => {
          teamIds.push(m.id);
          naamMap.set(m.id, m.full_name);
        });
      }

      const { data: rawBoekingen } = await supabase
        .from("uren_boekingen")
        .select("id, datum, project_id, uren, beschrijving, type, medewerker_id")
        .in("medewerker_id", teamIds)
        .eq("status", "goedgekeurd")
        .gte("datum", van)
        .lte("datum", tot)
        .order("datum");

      // Filter al-gebruikte boekingen (gericht, niet hele tabel)
      const ids = (rawBoekingen || []).map((b: any) => b.id);
      const usedIds = new Set<string>();
      if (ids.length) {
        const { data: usedRegels } = await supabase
          .from("inkooporder_regels")
          .select("uren_boeking_id")
          .in("uren_boeking_id", ids);
        (usedRegels || []).forEach((r: any) => r.uren_boeking_id && usedIds.add(r.uren_boeking_id));
      }
      const beschikbaar = (rawBoekingen || []).filter((b: any) => !usedIds.has(b.id));

      const projIds = [...new Set(beschikbaar.map((b: any) => b.project_id))];
      const { data: projs } = projIds.length
        ? await supabase.from("projects").select("id, naam, nummer").in("id", projIds)
        : { data: [] as any[] };
      const projMap = new Map((projs || []).map((p: any) => [p.id, p]));
      const enriched: Boeking[] = beschikbaar.map((b: any) => {
        const p = projMap.get(b.project_id) || { naam: "", nummer: "" };
        return {
          ...b,
          project_naam: (p as any).naam,
          project_nummer: (p as any).nummer,
          activiteit: b.type || null,
          monteur_naam: naamMap.get(b.medewerker_id) || "",
        };
      });
      setBoekingen(enriched);
      setSelected(new Set(enriched.map(b => b.id))); // standaard alles geselecteerd

      const { data: prof } = await supabase
        .from("profiles")
        .select("id, full_name, uurtarief, kvk_nummer, btw_nummer, iban, bedrijfsnaam, factuuradres, adres, betalingstermijn, telefoon")
        .eq("id", medewerker).single();
      setMedProfile(prof as Profile);
      setTarief(Number(prof?.uurtarief) || 0);
      setStep(3);
    } finally {
      setLoadingBoekingen(false);
    }
  };

  const toggleAll = () => {
    if (selected.size === boekingen.length) setSelected(new Set());
    else setSelected(new Set(boekingen.map(b => b.id)));
  };

  const createOrder = async () => {
    if (creating) return;
    setCreating(true);
    try {
      // Veilig ordernummer via DB-functie (geen race condition)
      const { data: nummerData, error: nummerError } = await supabase.rpc("next_inkooporder_nummer");
      if (nummerError || !nummerData) {
        toast.error("Kon ordernummer niet genereren");
        return;
      }
      const orderNummer = nummerData as string;

      const selectedBoekingen = boekingen.filter(b => selected.has(b.id));

      const { data: order, error } = await supabase.from("inkooporders").insert({
        order_nummer: orderNummer,
        medewerker_id: medewerker,
        periode_van: van,
        periode_tot: tot,
        status: "concept",
        totaal_uren: totaalUren,
        totaal_excl_btw: subtotaal,
        btw_bedrag: 0,
        totaal_incl_btw: subtotaal,
        aangemaakt_door: profileId,
        notitie: notitie || null,
      } as any).select("id").single();

      if (error || !order) {
        toast.error("Fout bij aanmaken inkooporder");
        return;
      }

      const regels = selectedBoekingen.map(b => ({
        inkooporder_id: order.id,
        uren_boeking_id: b.id,
        datum: b.datum,
        project_id: b.project_id,
        project_naam: b.project_naam,
        activiteit: b.activiteit || null,
        uren: Number(b.uren),
        uurtarief: tarief,
        bedrag: Number(b.uren) * tarief,
      }));

      const { error: regelsError } = await supabase.from("inkooporder_regels").insert(regels as any);
      if (regelsError) {
        // Rollback: verwijder de zojuist aangemaakte order
        await supabase.from("inkooporders").delete().eq("id", order.id);
        if (regelsError.code === "23505") {
          toast.error("Een of meer uren staan al op een andere inkooporder");
        } else {
          toast.error("Fout bij toevoegen regels");
        }
        return;
      }

      toast.success(`Inkooporder ${orderNummer} aangemaakt`);
      reset();
      onCreated();
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div
        className="w-full max-w-lg mx-4 rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ background: T.surface, border: `1px solid ${T.border}`, backdropFilter: "blur(12px)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold" style={{ color: T.text }}>Nieuwe inkooporder</h3>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: T.step }}
            aria-label="Sluiten"
          >
            <X className="h-4 w-4" style={{ color: T.textMuted }} />
          </button>
        </div>

        {/* Progress indicator */}
        <ol className="flex items-center gap-1.5">
          {STEPS.map(({ n, label, Icon }, idx) => {
            const done = step > n;
            const active = step === n;
            return (
              <li key={n} className="flex items-center flex-1 min-w-0">
                <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      background: done ? T.primaryGradient : active ? T.primarySoft : T.step,
                      border: `1px solid ${done || active ? T.borderActive : T.border}`,
                    }}
                  >
                    {done
                      ? <Check className="h-3.5 w-3.5" style={{ color: "#fff" }} />
                      : <Icon className="h-3.5 w-3.5" style={{ color: active ? T.primary : T.textMuted }} />}
                  </div>
                  <span
                    className="text-[10px] font-semibold truncate w-full text-center"
                    style={{ color: active ? T.primary : done ? T.text : T.textMuted }}
                  >
                    {label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className="h-px flex-1 mx-1 -mt-4"
                    style={{ background: done ? T.primary : T.border }}
                  />
                )}
              </li>
            );
          })}
        </ol>

        {/* Stap 1: Monteur */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: T.textMuted }}>Voor welke monteur maak je een inkooporder aan?</p>
            <select
              value={medewerker}
              onChange={e => setMedewerker(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: T.navy, border: `1px solid ${T.border}`, color: T.text }}
            >
              <option value="">Kies medewerker…</option>
              {medewerkers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.full_name}{m.is_onderaannemer ? ` — onderaannemer${m.monteur_count ? ` (+${m.monteur_count} monteurs)` : ""}` : ""}
                </option>
              ))}
            </select>
            {(() => {
              const sel = medewerkers.find(m => m.id === medewerker);
              if (!sel?.is_onderaannemer) return null;
              return (
                <div className="rounded-xl p-2.5 text-[11px]" style={{ background: T.primarySoft, border: `1px solid ${T.borderActive}`, color: T.primary }}>
                  Onderaannemer geselecteerd — uren van {sel.full_name} én zijn {sel.monteur_count ?? 0} monteur(s) worden in deze order verzameld.
                </div>
              );
            })()}
            <div className="flex gap-2">
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
                style={{ background: T.navy, border: `1px solid ${T.border}`, color: T.textMuted }}
              >
                Annuleren
              </button>
              <button
                disabled={!medewerker}
                onClick={() => setStep(2)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40"
                style={{ background: T.primaryGradient }}
              >
                Volgende →
              </button>
            </div>
          </div>
        )}

        {/* Stap 2: Periode */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: T.textMuted }}>Welke periode wil je factureren?</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-medium" style={{ color: T.textMuted }}>Van</label>
                <input type="date" value={van} onChange={e => setVan(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{ background: T.navy, border: `1px solid ${T.border}`, color: T.text }} />
              </div>
              <div>
                <label className="text-[10px] font-medium" style={{ color: T.textMuted }}>Tot</label>
                <input type="date" value={tot} onChange={e => setTot(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{ background: T.navy, border: `1px solid ${T.border}`, color: T.text }} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
                style={{ background: T.navy, border: `1px solid ${T.border}`, color: T.textMuted }}>
                <ChevronLeft className="h-3.5 w-3.5" /> Vorige
              </button>
              <button disabled={!van || !tot || loadingBoekingen} onClick={loadBoekingen}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40"
                style={{ background: T.primaryGradient }}>
                {loadingBoekingen ? "Laden…" : "Boekingen ophalen →"}
              </button>
            </div>
          </div>
        )}

        {/* Stap 3: Uren */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs" style={{ color: T.textMuted }}>
                {boekingen.length === 0
                  ? "Geen beschikbare uren"
                  : `${selected.size} van ${boekingen.length} geselecteerd`}
              </p>
              {boekingen.length > 0 && (
                <button onClick={toggleAll} className="text-[11px] font-semibold" style={{ color: T.primary }}>
                  {selected.size === boekingen.length ? "Alles deselecteren" : "Alles selecteren"}
                </button>
              )}
            </div>

            {boekingen.length === 0 ? (
              <div className="rounded-xl p-6 text-center space-y-2" style={{ background: T.navy, border: `1px solid ${T.border}` }}>
                <AlertTriangle className="h-6 w-6 mx-auto" style={{ color: T.warn }} />
                <p className="text-sm font-medium" style={{ color: T.text }}>Geen goedgekeurde uren in deze periode</p>
                <p className="text-[11px]" style={{ color: T.textMuted }}>
                  Mogelijk staan ze al op een eerdere inkooporder, of moeten ze nog goedgekeurd worden.
                </p>
              </div>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {boekingen.map(b => {
                  const isSel = selected.has(b.id);
                  return (
                    <label key={b.id}
                      className="flex items-center gap-2 p-2 rounded-lg cursor-pointer"
                      style={{ background: isSel ? T.primarySoft : T.navy, border: `1px solid ${isSel ? T.borderActive : T.border}` }}>
                      <input type="checkbox" checked={isSel}
                        onChange={() => {
                          const next = new Set(selected);
                          next.has(b.id) ? next.delete(b.id) : next.add(b.id);
                          setSelected(next);
                        }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium" style={{ color: T.text }}>{b.datum}</span>
                          {b.monteur_naam && medewerkers.find(m => m.id === medewerker)?.is_onderaannemer && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: T.primarySoft, color: T.primary, border: `1px solid ${T.borderActive}` }}>
                              {b.monteur_naam}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px]" style={{ color: T.textMuted }}>
                          {b.project_naam || "—"} · {b.activiteit || b.type}
                        </span>
                      </div>
                      <span className="text-xs font-bold shrink-0" style={{ fontFamily: T.mono, color: T.primary }}>
                        {b.uren}u
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setStep(2)}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
                style={{ background: T.navy, border: `1px solid ${T.border}`, color: T.textMuted }}>
                <ChevronLeft className="h-3.5 w-3.5" /> Vorige
              </button>
              <button disabled={selected.size === 0} onClick={() => setStep(4)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40"
                style={{ background: T.primaryGradient }}>
                Controleren → ({totaalUren}u)
              </button>
            </div>
          </div>
        )}

        {/* Stap 4: Review & bevestig */}
        {step === 4 && (
          <div className="space-y-3">
            {/* Samenvatting kop */}
            <div className="rounded-xl p-3 space-y-1.5" style={{ background: T.primarySoft, border: `1px solid ${T.borderActive}` }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.primary }}>Samenvatting</p>
              <p className="text-sm font-bold" style={{ color: T.text }}>{medProfile?.full_name}</p>
              <p className="text-[11px]" style={{ color: T.textMuted }}>{van} → {tot}</p>
            </div>

            {/* Waarschuwing ontbrekende ZZP-data */}
            {medProfile && !medProfile.kvk_nummer && (
              <div className="flex items-start gap-2 p-2.5 rounded-xl" style={{ background: T.warnSoft, border: `1px solid ${T.warnBorder}` }}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: T.warn }} />
                <span className="text-[11px]" style={{ color: T.warn }}>
                  Deze monteur heeft nog geen KVK-nummer. De PDF wordt incompleet.
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium" style={{ color: T.textMuted }}>Uurtarief</label>
                <input type="number" value={tarief} onChange={e => setTarief(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{ background: T.navy, border: `1px solid ${T.border}`, color: T.text, fontFamily: T.mono }} />
                {medProfile?.uurtarief != null && Number(medProfile.uurtarief) !== tarief && (
                  <p className="text-[10px] mt-1" style={{ color: T.warn }}>
                    Wijkt af van profieltarief (€{medProfile.uurtarief})
                  </p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-medium" style={{ color: T.textMuted }}>Betalingstermijn</label>
                <span className="block px-3 py-2 text-sm" style={{ color: T.text }}>
                  {medProfile?.betalingstermijn || 30} dagen
                </span>
              </div>
            </div>

            {/* Totaal-blok groot in beeld */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: T.navy, border: `1px solid ${T.border}` }}>
              <div className="flex justify-between text-xs">
                <span style={{ color: T.textMuted }}>{selected.size} regels · {totaalUren}u × {euro(tarief)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: T.textMuted }}>BTW</span>
                <span style={{ fontFamily: T.mono, color: T.warn }}>Verlegd (art. 12)</span>
              </div>
              <div className="flex justify-between items-center pt-2" style={{ borderTop: `1px solid ${T.border}` }}>
                <span className="text-xs font-bold" style={{ color: T.text }}>Te factureren</span>
                <span className="text-xl font-bold" style={{ fontFamily: T.mono, color: T.primary }}>{euro(subtotaal)}</span>
              </div>
            </div>

            <textarea value={notitie} onChange={e => setNotitie(e.target.value)}
              placeholder="Notitie (optioneel)" rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ background: T.navy, border: `1px solid ${T.border}`, color: T.text }} />

            <div className="flex gap-2">
              <button onClick={() => setStep(3)} disabled={creating}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
                style={{ background: T.navy, border: `1px solid ${T.border}`, color: T.textMuted }}>
                <ChevronLeft className="h-3.5 w-3.5" /> Vorige
              </button>
              <button onClick={createOrder} disabled={creating}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40 flex items-center justify-center gap-1.5"
                style={{ background: T.primaryGradient }}>
                {creating ? <Spinner center={false} /> : <><Check className="h-3.5 w-3.5" /> Order aanmaken</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
