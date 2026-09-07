import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { PageShell } from "@/components/PageShell";
import { HeaderLogo } from "@/components/HeaderLogo";
import { PullToRefresh } from "@/components/PullToRefresh";
import { toast } from "sonner";
import { format, getISOWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { ListSkeleton, OverurenCardSkeleton } from "@/components/ui/Skeletons";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { OverurenApprovalCard } from "@/components/OverurenApprovalCard";

interface Melding {
  id: string;
  medewerker_id: string;
  datum: string;
  type: string;
  geboekte_uren: number;
  limiet_uren: number;
  ingeplande_uren: number | null;
  toelichting: string | null;
  status: string;
  behandeld_door: string | null;
  behandeld_op: string | null;
  created_at: string;
  full_name: string;
  behandeld_naam: string | null;
  projectNamen: string[];
  starttijd: string | null;
  eindtijd: string | null;
  pauzeUren: number;
  reistijdUren: number;
}

const normaliseerProjectnaam = (naam: string) => naam
  .toLocaleLowerCase("nl-NL")
  .replace(/(^|[\s,.-])\p{L}/gu, teken => teken.toLocaleUpperCase("nl-NL"));

export default function Overuren() {
  const { isManager } = useAuth();
  const { profileId } = useProfile();
  const [meldingen, setMeldingen] = useState<Melding[]>([]);
  const [filter, setFilter] = useState("open");
  const [loading, setLoading] = useState(true);

  const fetchMeldingen = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("overuren_meldingen").select("*").order("created_at", { ascending: false });
    if (filter !== "alle") q = q.eq("status", filter);
    const { data } = await q;
    if (!data) { setLoading(false); return; }

    const medIds = [...new Set(data.map((m: any) => m.medewerker_id))];
    const behIds = [...new Set(data.filter((m: any) => m.behandeld_door).map((m: any) => m.behandeld_door))];
    const allIds = [...new Set([...medIds, ...behIds])];

    const { data: profiles } = allIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", allIds)
      : { data: [] };
    const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));

    // Projectnamen per medewerker+datum ophalen via de urenboekingen van die dag
    const datums = [...new Set(data.map((m: any) => m.datum))];
    const { data: boekingen } = (medIds.length > 0 && datums.length > 0)
      ? await supabase.from("uren_boekingen")
          .select("medewerker_id, datum, project_id, type, uren")
          .in("medewerker_id", medIds)
          .in("datum", datums)
      : { data: [] };
    const projectIds = [...new Set((boekingen ?? []).map((b: any) => b.project_id).filter(Boolean))];
    const { data: projecten } = projectIds.length > 0
      ? await supabase.from("projects").select("id, naam").in("id", projectIds)
      : { data: [] };
    const projectMap = new Map((projecten ?? []).map((p: any) => [p.id, p.naam]));
    const projectenPerDag = new Map<string, Set<string>>();
    const reistijdPerDag = new Map<string, number>();
    for (const b of boekingen ?? []) {
      const key = `${b.medewerker_id}|${b.datum}`;
      if (!projectenPerDag.has(key)) projectenPerDag.set(key, new Set());
      const naam = projectMap.get(b.project_id);
      if (naam) projectenPerDag.get(key)?.add(normaliseerProjectnaam(naam));
      if (b.type?.toLocaleLowerCase("nl-NL").includes("reis")) {
        reistijdPerDag.set(key, (reistijdPerDag.get(key) ?? 0) + Number(b.uren));
      }
    }

    const { data: planning } = (medIds.length > 0 && datums.length > 0)
      ? await supabase.from("planning")
          .select("medewerker_id, datum, starttijd, eindtijd")
          .in("medewerker_id", medIds)
          .in("datum", datums)
      : { data: [] };
    const planningPerDag = new Map<string, { starttijd: string; eindtijd: string }[]>();
    for (const regel of planning ?? []) {
      const key = `${regel.medewerker_id}|${regel.datum}`;
      const regels = planningPerDag.get(key) ?? [];
      regels.push({ starttijd: regel.starttijd, eindtijd: regel.eindtijd });
      planningPerDag.set(key, regels);
    }

    setMeldingen(data.map((m: any) => {
      const key = `${m.medewerker_id}|${m.datum}`;
      const dagPlanning = planningPerDag.get(key) ?? [];
      const starttijd = dagPlanning.length ? dagPlanning.map(r => r.starttijd).sort()[0].slice(0, 5) : null;
      const eindtijd = dagPlanning.length ? dagPlanning.map(r => r.eindtijd).sort().at(-1)?.slice(0, 5) ?? null : null;
      return {
        projectNamen: [...(projectenPerDag.get(key) ?? [])],
        starttijd,
        eindtijd,
        pauzeUren: starttijd && eindtijd ? 1 : 0,
        reistijdUren: reistijdPerDag.get(key) ?? 0,
        ...m,
        geboekte_uren: Number(m.geboekte_uren),
        limiet_uren: Number(m.limiet_uren),
        ingeplande_uren: m.ingeplande_uren != null ? Number(m.ingeplande_uren) : null,
        full_name: nameMap.get(m.medewerker_id) || "Onbekend",
        behandeld_naam: m.behandeld_door ? nameMap.get(m.behandeld_door) || null : null,
      };
    }));
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchMeldingen(); }, [fetchMeldingen]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel('overuren-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'overuren_meldingen' }, fetchMeldingen).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMeldingen]);

  const handleAction = async (ids: string[], status: string) => {
    const { error } = await supabase.from("overuren_meldingen").update({
      status,
      behandeld_door: profileId,
      behandeld_op: new Date().toISOString(),
    }).in("id", ids);
    if (error) { toast.error("Fout bij opslaan"); return; }
    toast.success(status === "goedgekeurd" ? "Overuren goedgekeurd ✓" : "Overuren afgekeurd");
    fetchMeldingen();
  };

  if (!isManager) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-navy)" }}><p style={{ color: "var(--text-muted)" }}>Alleen managers hebben toegang.</p></div>;
  }

  // Groepeer meldingen per medewerker + datum: meerdere signalen (bijv. "Dag > 8u"
  // én "Meer dan ingepland") worden één kaart met één keuze.
  interface Groep {
    key: string;
    items: Melding[];
    hoofd: Melding; // representatieve melding voor naam/datum/toelichting
    status: string; // "open" als minstens één open is
  }
  const groepen: Groep[] = [];
  const groepMap = new Map<string, Groep>();
  for (const m of meldingen) {
    const key = `${m.medewerker_id}|${m.datum}`;
    let g = groepMap.get(key);
    if (!g) {
      g = { key, items: [], hoofd: m, status: m.status };
      groepMap.set(key, g);
      groepen.push(g);
    }
    g.items.push(m);
    // Bepaal representatieve: de melding met de hoogste geboekte uren
    if (m.geboekte_uren > g.hoofd.geboekte_uren) g.hoofd = m;
    if (m.status === "open") g.status = "open";
  }

  const mainContent = (
    <main className="px-4 py-4 space-y-4">
      <div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {filter === "open" ? `${groepen.length} open meldingen` : `${groepen.length} meldingen`}
        </p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {([["open", "Open"], ["goedgekeurd", "Goedgekeurd"], ["afgekeurd", "Afgekeurd"], ["alle", "Alle"]] as const).map(([k, l]) => (
          <Button key={k} variant="outline" onClick={() => setFilter(k)} className="h-8 shrink-0 rounded-lg px-3 text-xs font-medium focus-visible:ring-2" style={{
            background: filter === k ? "var(--accent-light)" : "var(--bg-surface)",
            border: filter === k ? "1px solid var(--accent-border)" : "1px solid var(--planning-border-soft)",
            color: filter === k ? "var(--accent)" : "var(--text-muted)",
          }}>
            {l}
          </Button>
        ))}
      </div>

      {loading ? (
        <ListSkeleton count={3} ItemSkeleton={OverurenCardSkeleton} />
      ) : meldingen.length === 0 ? (
        <EmptyState icoon="✓" titel="Geen overuren meldingen" subtitel="Geen meldingen voor dit filter." />
      ) : (
        <div className="space-y-5">
          {groepen.map(g => {
            const m = g.hoofd;
            const isDone = g.status !== "open";
            const types = [...new Set(g.items.map(i => i.type))];
            const geboektMax = Math.max(...g.items.map(i => i.geboekte_uren));
            const ingepland = g.items.find(i => i.ingeplande_uren != null)?.ingeplande_uren ?? null;
            const ids = g.items.map(i => i.id);
            const alleGoedgekeurd = g.items.every(i => i.status === "goedgekeurd");
            const behandeld = g.items.find(i => i.behandeld_op);
            const overwerk = Math.max(0, geboektMax - 8);
            const afwijking = ingepland != null ? Math.max(0, geboektMax - ingepland) : overwerk;
            const tijdLabel = m.starttijd && m.eindtijd
              ? `${m.starttijd}–${m.eindtijd} · ${m.pauzeUren}u pauze`
              : "Tijden niet beschikbaar";
            const behandeldLabel = behandeld?.behandeld_op
              ? `${format(new Date(behandeld.behandeld_op), "d MMM yyyy", { locale: nl })}${behandeld.behandeld_naam ? ` door ${behandeld.behandeld_naam}` : ""}`
              : null;
            return <OverurenApprovalCard
              key={g.key}
              name={m.full_name}
              dateLabel={`${format(new Date(m.datum + "T12:00:00"), "EEEE d MMMM yyyy", { locale: nl })} · week ${getISOWeek(new Date(m.datum + "T12:00:00"))}`}
              deviationLabel={`${afwijking}u meer dan gepland`}
              bookedHours={geboektMax}
              plannedHours={ingepland}
              overtimeHours={overwerk}
              travelHours={m.reistijdUren}
              timeLabel={tijdLabel}
              projectNames={m.projectNamen}
              explanation={m.toelichting}
              done={isDone}
              approved={alleGoedgekeurd}
              handledLabel={behandeldLabel}
              onApprove={() => handleAction(ids, "goedgekeurd")}
              onReject={() => handleAction(ids, "afgekeurd")}
              onRequestExplanation={() => toast.info(`Vraag ${m.full_name} om een toelichting.`)}
            />;
          })}
        </div>
      )}
    </main>
  );

  return (
    <PageShell>
      <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--planning-border-soft)" }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <HeaderLogo />
            <span className="text-base font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Overuren meldingen</span>
          </div>
          {filter === "open" && groepen.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
              <span className="text-lg font-extrabold" style={{ color: "var(--warn-text)" }}>{groepen.length}</span>
              <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>open</span>
            </div>
          )}
        </div>
      </header>
      <div className="lg:hidden">
        <PullToRefresh onRefresh={fetchMeldingen}>{mainContent}</PullToRefresh>
      </div>
      <div className="hidden lg:block">{mainContent}</div>
    </PageShell>
  );
}
