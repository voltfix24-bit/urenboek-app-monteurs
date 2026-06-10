import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Check, AlertTriangle, ChevronLeft, Users, Calendar, ListChecks, FileCheck2, Navigation } from "lucide-react";

import { euroDecimals as euro } from "@/lib/formatting";
import { Spinner } from "@/components/ui/Spinner";
import { T } from "@/lib/inkooporderTheme";
import { differenceInMinutes, format, parseISO, startOfISOWeek, endOfISOWeek, getISOWeek, getISOWeekYear } from "date-fns";

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
interface PloegLid { id: string; naam: string; uren: number; starttijd?: string; eindtijd?: string }
interface Boeking {
  id: string; datum: string; project_id: string; uren: number; beschrijving?: string; type?: string;
  project_naam?: string; project_nummer?: string; activiteit?: string | null;
  medewerker_id?: string; monteur_naam?: string; bron?: "uren" | "planning"; planning_id?: string;
  starttijd?: string; eindtijd?: string; project_adres?: string | null;
  is_ploeg?: boolean; ploegleden?: PloegLid[]; uren_mismatch?: boolean;
}
interface Profile {
  id: string; full_name: string; uurtarief?: number | null; kvk_nummer?: string | null;
  btw_nummer?: string | null; iban?: string | null; bedrijfsnaam?: string | null;
  factuuradres?: string | null; adres?: string | null; betalingstermijn?: number | null; telefoon?: string | null;
  onderaannemer_startlocatie?: string | null; onderaannemer_vrije_km_per_dag?: number | null;
  onderaannemer_km_tarief?: number | null; onderaannemer_reiskosten_per_ploeg?: boolean | null;
}
interface ReiskostenRegel {
  id: string;
  datum: string;
  project_id: string | null;
  project_naam: string;
  project_adres: string | null;
  retour_km: number;
  vrije_km: number;
  km_tarief: number;
  startlocatie: string | null;
  afstand_bron: string;
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
  const [weken, setWeken] = useState<WeekOptie[]>([]);
  const [loadingWeken, setLoadingWeken] = useState(false);
  const [geselecteerdeWeek, setGeselecteerdeWeek] = useState<string>("");
  const [reiskosten, setReiskosten] = useState<ReiskostenRegel[]>([]);
  const [berekenenId, setBerekenenId] = useState<string | null>(null);

  const berekenAfstand = useCallback(async (regelId: string) => {
    const regel = reiskosten.find(r => r.id === regelId);
    if (!regel) return;
    if (!regel.startlocatie || !regel.project_adres) {
      toast.error("Startlocatie of projectadres ontbreekt");
      return;
    }
    setBerekenenId(regelId);
    try {
      const { data, error } = await supabase.functions.invoke("bereken-afstand", {
        body: { origin: regel.startlocatie, destination: regel.project_adres },
      });
      if (error || !data || (data as any).error) {
        toast.error((data as any)?.error || "Afstand berekenen mislukt — vul handmatig in");
        return;
      }
      const retour = Number((data as any).retour_km || 0);
      setReiskosten(prev => prev.map(r => r.id === regelId
        ? { ...r, retour_km: retour, afstand_bron: "google_routes" }
        : r));
      toast.success(`Afstand berekend: ${retour} km retour`);
    } catch {
      toast.error("Afstand berekenen mislukt — vul handmatig in");
    } finally {
      setBerekenenId(null);
    }
  }, [reiskosten]);


  const selectedMedewerker = useMemo(() => medewerkers.find(m => m.id === medewerker), [medewerkers, medewerker]);
  const isOnderaannemerOrder = !!selectedMedewerker?.is_onderaannemer;

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
    setBoekingen([]); setSelected(new Set()); setTarief(0); setReiskosten([]);
    setNotitie(""); setMedProfile(null);
    setWeken([]); setGeselecteerdeWeek("");
  }, []);

  const handleClose = () => { reset(); onClose(); };

  const totaalUren = useMemo(
    () => boekingen.filter(b => selected.has(b.id)).reduce((s, b) => s + Number(b.uren), 0),
    [boekingen, selected],
  );
  const urenSubtotaal = totaalUren * tarief;
  const reiskostenTotaal = useMemo(
    () => reiskosten.reduce((sum, r) => sum + Math.max(0, Number(r.retour_km || 0) - Number(r.vrije_km || 0)) * Number(r.km_tarief || 0), 0),
    [reiskosten],
  );
  const subtotaal = urenSubtotaal + reiskostenTotaal;

  const calcPlanningUren = (starttijd?: string, eindtijd?: string) => {
    if (!starttijd || !eindtijd) return 8;
    const start = new Date(`2026-01-01T${starttijd}`);
    const eind = new Date(`2026-01-01T${eindtijd}`);
    const minuten = differenceInMinutes(eind, start);
    if (!Number.isFinite(minuten) || minuten <= 0) return 8;
    return Math.max(0, Math.round(((minuten / 60) - 1) * 100) / 100);
  };

  // Laad beschikbare weken zodra stap 2 actief is voor de geselecteerde monteur
  useEffect(() => {
    if (step !== 2 || !medewerker) return;
    let cancelled = false;
    (async () => {
      setLoadingWeken(true);
      try {
        const selectedMed = medewerkers.find(m => m.id === medewerker);
        const teamIds: string[] = [medewerker];
        if (selectedMed?.is_onderaannemer) {
          const { data: monteurs } = await supabase
            .from("profiles").select("id").eq("onderaannemer_id", medewerker);
          (monteurs || []).forEach((m: any) => teamIds.push(m.id));

          const huidigeWeekStart = format(startOfISOWeek(new Date()), "yyyy-MM-dd");
          const { data: planningRows } = await supabase
            .from("planning")
            .select("id, datum, starttijd, eindtijd")
            .in("medewerker_id", teamIds)
            .lt("datum", huidigeWeekStart)
            .order("datum");

          const { data: bestaandeOrders } = await supabase
            .from("inkooporders")
            .select("week_jaar, week_nummer")
            .eq("medewerker_id", medewerker)
            .eq("order_type", "onderaannemer_week");
          const bestaande = new Set((bestaandeOrders || []).map((o: any) => `${o.week_jaar}-W${String(o.week_nummer).padStart(2, "0")}`));

          const map = new Map<string, WeekOptie>();
          for (const p of (planningRows || []) as any[]) {
            const d = parseISO(p.datum);
            const jaar = getISOWeekYear(d);
            const week = getISOWeek(d);
            const key = `${jaar}-W${String(week).padStart(2, "0")}`;
            if (bestaande.has(key)) continue;
            if (!map.has(key)) {
              map.set(key, {
                key, jaar, week,
                van: format(startOfISOWeek(d), "yyyy-MM-dd"),
                tot: format(endOfISOWeek(d), "yyyy-MM-dd"),
                aantalBoekingen: 0,
                totaalUren: 0,
              });
            }
            const g = map.get(key)!;
            g.aantalBoekingen += 1;
            g.totaalUren += calcPlanningUren(p.starttijd, p.eindtijd);
          }
          const lijst = Array.from(map.values()).sort((a, b) =>
            a.jaar !== b.jaar ? b.jaar - a.jaar : b.week - a.week
          );
          if (!cancelled) setWeken(lijst);
          return;
        }
        const vandaag = format(new Date(), "yyyy-MM-dd");
        const { data: rawBoekingen } = await supabase
          .from("uren_boekingen")
          .select("id, datum, uren")
          .in("medewerker_id", teamIds)
          .eq("status", "goedgekeurd")
          .lte("datum", vandaag)
          .order("datum");

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

        const map = new Map<string, WeekOptie>();
        for (const b of beschikbaar) {
          const d = parseISO(b.datum);
          const jaar = getISOWeekYear(d);
          const week = getISOWeek(d);
          const key = `${jaar}-W${String(week).padStart(2, "0")}`;
          if (!map.has(key)) {
            map.set(key, {
              key, jaar, week,
              van: format(startOfISOWeek(d), "yyyy-MM-dd"),
              tot: format(endOfISOWeek(d), "yyyy-MM-dd"),
              aantalBoekingen: 0,
              totaalUren: 0,
            });
          }
          const g = map.get(key)!;
          g.aantalBoekingen += 1;
          g.totaalUren += Number(b.uren) || 0;
        }
        const lijst = Array.from(map.values()).sort((a, b) =>
          a.jaar !== b.jaar ? b.jaar - a.jaar : b.week - a.week
        );
        if (!cancelled) setWeken(lijst);
      } finally {
        if (!cancelled) setLoadingWeken(false);
      }
    })();
    return () => { cancelled = true; };
  }, [step, medewerker, medewerkers]);

  const loadBoekingen = async (vanArg?: string, totArg?: string) => {
    const vanD = vanArg ?? van;
    const totD = totArg ?? tot;
    if (!medewerker || !vanD || !totD) return;
    if (vanD > totD) { toast.error("Van-datum moet vóór tot-datum liggen"); return; }
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

        const { data: planningRows } = await supabase
          .from("planning")
          .select("id, datum, project_id, medewerker_id, starttijd, eindtijd, activiteit, notitie")
          .in("medewerker_id", teamIds)
          .gte("datum", vanD)
          .lte("datum", totD)
          .order("datum");

        const projIds = [...new Set((planningRows || []).map((p: any) => p.project_id).filter(Boolean))];
        const { data: projs } = projIds.length
          ? await supabase.from("projects").select("id, naam, nummer, adres, straat, postcode, stad").in("id", projIds)
          : { data: [] as any[] };
        const projMap = new Map((projs || []).map((p: any) => [p.id, p]));

        const { data: prof } = await supabase
          .from("profiles")
          .select("id, full_name, uurtarief, kvk_nummer, btw_nummer, iban, bedrijfsnaam, factuuradres, adres, betalingstermijn, telefoon, onderaannemer_startlocatie, onderaannemer_vrije_km_per_dag, onderaannemer_km_tarief, onderaannemer_reiskosten_per_ploeg")
          .eq("id", medewerker).single();

        // Groepeer planningregels per dag+project tot één ploeg-boeking.
        // Ploegtarief geldt één keer per ploeg/uur, niet per monteur.
        type Groep = {
          datum: string; project_id: string; proj: any; projectAdres: string | null;
          activiteit: string; leden: PloegLid[];
        };
        const groepen = new Map<string, Groep>();
        for (const p of (planningRows || []) as any[]) {
          const proj: any = projMap.get(p.project_id) || {};
          const projectAdres = [proj.adres || proj.straat, proj.postcode, proj.stad].filter(Boolean).join(", ") || null;
          const key = `${p.datum}|${p.project_id || "geen"}`;
          if (!groepen.has(key)) {
            groepen.set(key, {
              datum: p.datum, project_id: p.project_id, proj, projectAdres,
              activiteit: p.activiteit || "Gepland werk", leden: [],
            });
          }
          groepen.get(key)!.leden.push({
            id: p.medewerker_id,
            naam: naamMap.get(p.medewerker_id) || "",
            uren: calcPlanningUren(p.starttijd, p.eindtijd),
            starttijd: p.starttijd,
            eindtijd: p.eindtijd,
          });
        }

        const enriched: Boeking[] = Array.from(groepen.values()).map((g) => {
          const urenSet = new Set(g.leden.map(l => l.uren));
          const mismatch = urenSet.size > 1;
          const ploeguren = Math.max(...g.leden.map(l => l.uren));
          return {
            id: `ploeg:${g.datum}:${g.project_id || "geen"}`,
            bron: "planning",
            datum: g.datum,
            project_id: g.project_id,
            medewerker_id: undefined,
            monteur_naam: g.leden.map(l => l.naam).filter(Boolean).join(" + "),
            project_naam: g.proj.naam || "",
            project_nummer: g.proj.nummer || "",
            project_adres: g.projectAdres,
            activiteit: g.activiteit,
            uren: ploeguren,
            is_ploeg: true,
            ploegleden: g.leden,
            uren_mismatch: mismatch,
          };
        });

        const vrijeKm = Number((prof as any)?.onderaannemer_vrije_km_per_dag ?? 150);
        const kmTarief = Number((prof as any)?.onderaannemer_km_tarief ?? 0.46);
        // Onderaannemer-orders: ALTIJD één reiskostenregel per ploeg/dag/project.
        const reisMap = new Map<string, ReiskostenRegel>();
        enriched.forEach((b) => {
          const key = `${b.datum}:${b.project_id}`;
          if (!reisMap.has(key)) {
            reisMap.set(key, {
              id: key,
              datum: b.datum,
              project_id: b.project_id,
              project_naam: b.project_naam || "Project",
              project_adres: b.project_adres || null,
              retour_km: 0,
              vrije_km: vrijeKm,
              km_tarief: kmTarief,
              startlocatie: (prof as any)?.onderaannemer_startlocatie || null,
              afstand_bron: "handmatig",
            });
          }
        });

        setBoekingen(enriched);
        setSelected(new Set(enriched.map(b => b.id)));
        setReiskosten(Array.from(reisMap.values()));
        setMedProfile(prof as Profile);
        setTarief(Number((prof as any)?.uurtarief) || 0);
        setStep(3);
        return;
      }

      const { data: rawBoekingen } = await supabase
        .from("uren_boekingen")
        .select("id, datum, project_id, uren, beschrijving, type, medewerker_id")
        .in("medewerker_id", teamIds)
        .eq("status", "goedgekeurd")
        .gte("datum", vanD)
        .lte("datum", totD)
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
      const weekInfo = weken.find(w => w.key === geselecteerdeWeek);

      const { data: order, error } = await supabase.from("inkooporders").insert({
        order_nummer: orderNummer,
        medewerker_id: medewerker,
        periode_van: van,
        periode_tot: tot,
        order_type: isOnderaannemerOrder ? "onderaannemer_week" : "medewerker",
        week_jaar: weekInfo?.jaar ?? null,
        week_nummer: weekInfo?.week ?? null,
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
        uren_boeking_id: b.bron === "planning" ? null : b.id,
        regel_type: "uren",
        medewerker_id: b.medewerker_id || null,
        medewerker_naam: b.monteur_naam || null,
        datum: b.datum,
        project_id: b.project_id,
        project_naam: b.project_naam,
        project_adres: b.project_adres || null,
        activiteit: b.activiteit || null,
        uren: Number(b.uren),
        uurtarief: tarief,
        bedrag: Number(b.uren) * tarief,
      }));

      const reisRegels = isOnderaannemerOrder
        ? reiskosten
          .filter(r => Number(r.retour_km || 0) > 0)
          .map(r => {
            const vergoedbareKm = Math.max(0, Number(r.retour_km || 0) - Number(r.vrije_km || 0));
            return {
              inkooporder_id: order.id,
              uren_boeking_id: null,
              regel_type: "reiskosten",
              datum: r.datum,
              project_id: r.project_id,
              project_naam: r.project_naam,
              project_adres: r.project_adres,
              activiteit: `Reiskosten ploeg (${vergoedbareKm} km vergoedbaar)`,
              uren: 0,
              uurtarief: 0,
              bedrag: vergoedbareKm * Number(r.km_tarief || 0),
              kilometers: vergoedbareKm,
              retour_km: Number(r.retour_km || 0),
              vrije_km: Number(r.vrije_km || 0),
              km_tarief: Number(r.km_tarief || 0),
              afstand_bron: r.afstand_bron,
              startlocatie: r.startlocatie,
            };
          })
        : [];

      const { error: regelsError } = await supabase.from("inkooporder_regels").insert([...regels, ...reisRegels] as any);
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

        {/* Stap 2: Periode (week-selectie) */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: T.textMuted }}>
              {isOnderaannemerOrder
                ? "Welke afgeronde week wil je omzetten naar een onderaannemer-weekorder? Alleen weken uit de planning die nog geen weekorder hebben worden getoond."
                : "Welke week wil je factureren? Alleen weken met nog niet gefactureerde, goedgekeurde uren worden getoond."}
            </p>

            {loadingWeken ? (
              <div className="py-6 flex justify-center"><Spinner center={false} /></div>
            ) : weken.length === 0 ? (
              <div className="rounded-xl p-6 text-center space-y-2" style={{ background: T.navy, border: `1px solid ${T.border}` }}>
                <AlertTriangle className="h-6 w-6 mx-auto" style={{ color: T.warn }} />
                <p className="text-sm font-medium" style={{ color: T.text }}>Geen beschikbare weken</p>
                <p className="text-[11px]" style={{ color: T.textMuted }}>
                  {isOnderaannemerOrder
                    ? "Er zijn geen afgeronde planningweken zonder weekorder."
                    : "Alle goedgekeurde uren tot vandaag staan al op een inkooporder, of er zijn nog geen goedgekeurde uren."}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {weken.map(w => {
                  const isSel = geselecteerdeWeek === w.key;
                  return (
                    <button
                      key={w.key}
                      type="button"
                      onClick={() => {
                        setGeselecteerdeWeek(w.key);
                        setVan(w.van);
                        setTot(w.tot);
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-xl text-left"
                      style={{
                        background: isSel ? T.primarySoft : T.navy,
                        border: `1px solid ${isSel ? T.borderActive : T.border}`,
                      }}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold" style={{ color: T.text }}>
                          Week {w.week} · {w.jaar}
                        </div>
                        <div className="text-[11px]" style={{ color: T.textMuted }}>
                          {format(parseISO(w.van), "dd-MM")} → {format(parseISO(w.tot), "dd-MM")} · {w.aantalBoekingen} boeking{w.aantalBoekingen === 1 ? "" : "en"}
                        </div>
                      </div>
                      <span className="text-sm font-bold shrink-0" style={{ fontFamily: T.mono, color: T.primary }}>
                        {w.totaalUren}u
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setStep(1)}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
                style={{ background: T.navy, border: `1px solid ${T.border}`, color: T.textMuted }}>
                <ChevronLeft className="h-3.5 w-3.5" /> Vorige
              </button>
              <button
                disabled={!geselecteerdeWeek || loadingBoekingen}
                onClick={() => loadBoekingen()}
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
                      {isOnderaannemerOrder ? (
                        <input
                          type="number"
                          min="0"
                          step="0.25"
                          value={b.uren}
                          onChange={(e) => {
                            const value = Number(e.target.value || 0);
                            setBoekingen(prev => prev.map(item => item.id === b.id ? { ...item, uren: value } : item));
                          }}
                          className="w-20 px-2 py-1.5 rounded-lg text-xs font-bold text-right"
                          style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.primary, fontFamily: T.mono }}
                        />
                      ) : (
                        <span className="text-xs font-bold shrink-0" style={{ fontFamily: T.mono, color: T.primary }}>
                          {b.uren}u
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            {isOnderaannemerOrder && reiskosten.length > 0 && (
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-bold" style={{ color: T.text }}>Reiskosten ploeg</p>
                  <p className="text-[11px]" style={{ color: T.textMuted }}>
                    Vul per dag/project de retourafstand in. Vrije kilometers en km-tarief worden automatisch toegepast.
                  </p>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {reiskosten.map(r => {
                    const vergoedbareKm = Math.max(0, Number(r.retour_km || 0) - Number(r.vrije_km || 0));
                    const bedrag = vergoedbareKm * Number(r.km_tarief || 0);
                    return (
                      <div key={r.id} className="rounded-lg p-2 space-y-2" style={{ background: T.navy, border: `1px solid ${T.border}` }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold" style={{ color: T.text }}>{r.datum} · {r.project_naam}</p>
                            <p className="text-[10px]" style={{ color: T.textMuted }}>
                              {r.startlocatie || "Startlocatie ontbreekt"} → {r.project_adres || "projectadres onbekend"}
                            </p>
                          </div>
                          <span className="text-xs font-bold shrink-0" style={{ color: T.primary, fontFamily: T.mono }}>{euro(bedrag)}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <label className="text-[10px]" style={{ color: T.textMuted }}>
                            Retour km
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={r.retour_km}
                              onChange={(e) => {
                                const value = Number(e.target.value || 0);
                                setReiskosten(prev => prev.map(item => item.id === r.id ? { ...item, retour_km: value, afstand_bron: "handmatig" } : item));
                              }}
                              className="w-full mt-1 px-2 py-1.5 rounded-lg text-xs text-right"
                              style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontFamily: T.mono }}
                            />
                          </label>

                          <label className="text-[10px]" style={{ color: T.textMuted }}>
                            Vrij
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={r.vrije_km}
                              onChange={(e) => {
                                const value = Number(e.target.value || 0);
                                setReiskosten(prev => prev.map(item => item.id === r.id ? { ...item, vrije_km: value } : item));
                              }}
                              className="w-full mt-1 px-2 py-1.5 rounded-lg text-xs text-right"
                              style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontFamily: T.mono }}
                            />
                          </label>
                          <label className="text-[10px]" style={{ color: T.textMuted }}>
                            Tarief
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={r.km_tarief}
                              onChange={(e) => {
                                const value = Number(e.target.value || 0);
                                setReiskosten(prev => prev.map(item => item.id === r.id ? { ...item, km_tarief: value } : item));
                              }}
                              className="w-full mt-1 px-2 py-1.5 rounded-lg text-xs text-right"
                              style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontFamily: T.mono }}
                            />
                          </label>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px]" style={{ color: T.textMuted }}>
                            Vergoedbaar: {vergoedbareKm} km · bron: {r.afstand_bron === "google_routes" ? "automatisch" : "handmatig"}
                          </p>
                          <button
                            type="button"
                            disabled={!r.startlocatie || !r.project_adres || berekenenId === r.id}
                            onClick={() => berekenAfstand(r.id)}
                            className="text-[10px] font-semibold px-2 py-1 rounded-md flex items-center gap-1 disabled:opacity-40"
                            style={{ background: T.primarySoft, color: T.primary, border: `1px solid ${T.borderActive}` }}
                          >
                            <Navigation className="h-3 w-3" />
                            {berekenenId === r.id ? "Berekenen…" : "Bereken afstand"}
                          </button>
                        </div>

                      </div>
                    );
                  })}
                </div>
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
              {isOnderaannemerOrder && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: T.textMuted }}>Uren subtotaal</span>
                  <span style={{ fontFamily: T.mono, color: T.text }}>{euro(urenSubtotaal)}</span>
                </div>
              )}
              {isOnderaannemerOrder && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: T.textMuted }}>Reiskosten ploeg</span>
                  <span style={{ fontFamily: T.mono, color: T.text }}>{euro(reiskostenTotaal)}</span>
                </div>
              )}
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
