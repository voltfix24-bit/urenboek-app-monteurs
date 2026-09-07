import { useState, useEffect, useCallback, Fragment } from "react";
import { ListSkeleton, GoedkeuringCardSkeleton } from "@/components/ui/Skeletons";
import { EmptyState } from "@/components/ui/EmptyState";
import { HeaderLogo } from "@/components/HeaderLogo";
import { MobileHeader } from "@/components/MobileHeader";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { PullToRefresh } from "@/components/PullToRefresh";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { Check, X, ChevronLeft, ChevronRight, CheckCheck, AlertTriangle, Plus, Pencil, Send, Trash2, RotateCcw } from "lucide-react";
import { checkOveruren } from "@/lib/overurenCheck";
import { useNavigate } from "react-router-dom";
import { useGoedkeuring } from "@/hooks/useGoedkeuring";
import { BottomNav } from "@/components/BottomNav";
import { useNavBadges } from "@/hooks/useNavBadges";
import { format, startOfWeek, addDays, getISOWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { useProjects } from "@/hooks/useProjects";
import { WeekstaatCard } from "@/components/WeekstaatCard";


interface EntryWithProfile {
  id: string; datum: string; project_naam: string; project_nummer: string; beschrijving: string;
  uren: number; status: string; medewerker_id: string; full_name: string; afkeur_reden: string | null;
  project_id: string; approved_by?: string | null; updated_at?: string | null;
}

export default function Goedkeuring() {
  const { isManager, user } = useAuth();
  const { badges } = useNavBadges();
  const { profile, profileId: myProfileId } = useProfile();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>("alle");
  const [weekOffset, setWeekOffset] = useState(0);
  const [afkeurId, setAfkeurId] = useState<string | null>(null);
  const [afkeurReden, setAfkeurReden] = useState("");
  const [overurenIds, setOverurenIds] = useState<Set<string>>(new Set());
  const [selectedMonteur, setSelectedMonteur] = useState<string | null>(null);
  const [showBookModal, setShowBookModal] = useState(false);
  const [editEntry, setEditEntry] = useState<EntryWithProfile | null>(null);
  const [busyGroep, setBusyGroep] = useState<string | null>(null);
  const [keurderNamen, setKeurderNamen] = useState<Record<string, string>>({});

  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);

  const { entries: rawEntries, loading, refetch: fetchEntries } = useGoedkeuring(weekStart, "alle");

  const entries: EntryWithProfile[] = rawEntries.map(e => ({
    id: e.id, datum: e.datum, project_naam: e.project_naam, project_nummer: e.project_nummer,
    beschrijving: e.beschrijving || e.type || "", uren: e.uren, status: e.status,
    medewerker_id: e.medewerker_id, full_name: e.full_name,
    afkeur_reden: e.afkeur_reden, project_id: e.project_id,
    approved_by: (e as any).approved_by ?? null, updated_at: (e as any).updated_at ?? null,
  }));

  // Namen van keurders (voor "Goedgekeurd door ... op ...")
  useEffect(() => {
    const ids = [...new Set(entries.map(e => e.approved_by).filter(Boolean))] as string[];
    const ontbrekend = ids.filter(id => !keurderNamen[id]);
    if (ontbrekend.length === 0) return;
    supabase.from("profiles").select("id, full_name").in("id", ontbrekend).then(({ data }) => {
      if (data?.length) setKeurderNamen(prev => ({ ...prev, ...Object.fromEntries(data.map((p: any) => [p.id, p.full_name])) }));
    });
  }, [rawEntries]);


  useEffect(() => {
    const fetchOveruren = async () => {
      const { data: ouData } = await supabase
        .from("overuren_meldingen")
        .select("medewerker_id, datum")
        .eq("status", "open")
        .gte("datum", format(weekStart, "yyyy-MM-dd"))
        .lte("datum", format(weekEnd, "yyyy-MM-dd"));
      if (ouData) {
        setOverurenIds(new Set(ouData.map((m: any) => `${m.medewerker_id}_${m.datum}`)));
      }
    };
    fetchOveruren();
  }, [weekOffset]);

  const updateStatus = async (id: string, status: string, reden?: string) => {
    const entry = entries.find(e => e.id === id);
    const update: any = { status, approved_by: myProfileId };
    if (reden) update.afkeur_reden = reden;
    if (status === "concept") { update.approved_by = null; update.afkeur_reden = null; }
    if (!await mutate(supabase.from("uren_boekingen").update(update).eq("id", id))) return;
    toast.success(
      status === "goedgekeurd" ? "Goedgekeurd!" :
      status === "afgekeurd" ? "Afgekeurd" :
      status === "ingediend" ? "Ingediend" :
      "Teruggezet naar concept"
    );
    if (status === "goedgekeurd" && entry) {
      checkOveruren(entry.medewerker_id, entry.datum, entry.project_id, entry.uren).catch(() => {});
    }
    fetchEntries();
    setAfkeurId(null);
    setAfkeurReden("");
  };

  const approveAllForUser = async (userName: string) => {
    const userEntries = entries.filter((e) => e.full_name === userName && e.status === "ingediend");
    if (userEntries.length === 0) return;
    const ids = userEntries.map((e) => e.id);
    if (!await mutate(supabase.from("uren_boekingen").update({ status: "goedgekeurd", approved_by: myProfileId }).in("id", ids))) return;
    toast.success(`${userEntries.length} uren goedgekeurd voor ${userName}`, {
      action: {
        label: "Order aanmaken →",
        onClick: () => {
          const params = new URLSearchParams({
            medewerker: userEntries[0].medewerker_id,
            van: format(weekStart, "yyyy-MM-dd"),
            tot: format(weekEnd, "yyyy-MM-dd"),
          });
          navigate(`/inkooporders?${params}`);
        },
      },
      duration: 8000,
    });
    fetchEntries();
  };

  const deleteEntry = async (id: string) => {
    if (!await mutate(supabase.from("uren_boekingen").delete().eq("id", id))) return;
    toast.success("Boeking verwijderd");
    fetchEntries();
  };

  const filteredEntries = entries.filter((e) => filter === "alle" || e.status === filter);
  const grouped = filteredEntries.reduce<Record<string, EntryWithProfile[]>>((acc, e) => {
    const key = e.medewerker_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});
  const totalIngediend = entries.filter((e) => e.status === "ingediend").length;

  const statusConfig: Record<string, { bg: string; text: string; dot: string }> = {
    ingediend: { bg: "var(--warn-light)", text: "var(--warn-text)", dot: "var(--warn-text)" },
    goedgekeurd: { bg: "var(--accent-light)", text: "var(--accent)", dot: "var(--accent)" },
    afgekeurd: { bg: "var(--danger-light)", text: "var(--danger)", dot: "var(--danger)" },
    concept: { bg: "var(--bg-surface-2)", text: "var(--text-muted)", dot: "var(--text-muted)" },
  };

  if (!isManager) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-navy)" }}><p style={{ color: "var(--text-muted)" }}>Alleen managers hebben toegang.</p></div>;
  }

  function renderEntryActions(entry: EntryWithProfile) {
    return (
      <div className="flex gap-1 items-center">
        {/* Edit */}
        <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface-2)" }} onClick={() => setEditEntry(entry)} title="Bewerken">
          <Pencil className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
        </button>
        {/* Status-specific actions */}
        {entry.status === "concept" && (
          <>
            <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-light)", border: "1px solid var(--accent-border)" }} onClick={() => updateStatus(entry.id, "ingediend")} title="Indienen">
              <Send className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
            </button>
            <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-light)", border: "1px solid var(--accent-border)" }} onClick={() => updateStatus(entry.id, "goedgekeurd")} title="Direct goedkeuren">
              <Check className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
            </button>
          </>
        )}
        {entry.status === "ingediend" && (
          <>
            <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-light)", border: "1px solid var(--accent-border)" }} onClick={() => updateStatus(entry.id, "goedgekeurd")} title="Goedkeuren">
              <Check className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
            </button>
            <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--danger-light)", border: "1px solid var(--danger-border)" }} onClick={() => setAfkeurId(entry.id)} title="Afkeuren">
              <X className="h-3.5 w-3.5" style={{ color: "var(--danger)" }} />
            </button>
          </>
        )}
        {entry.status === "goedgekeurd" && (
          <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface-2)" }} onClick={() => updateStatus(entry.id, "concept")} title="Terug naar concept">
            <RotateCcw className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
          </button>
        )}
        {entry.status === "afgekeurd" && (
          <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface-2)" }} onClick={() => updateStatus(entry.id, "concept")} title="Terug naar concept">
            <RotateCcw className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
          </button>
        )}
        {/* Delete (concept/afgekeurd only) */}
        {(entry.status === "concept" || entry.status === "afgekeurd") && (
          <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--danger-light)" }} onClick={() => { if (confirm("Boeking verwijderen?")) deleteEntry(entry.id); }} title="Verwijderen">
            <Trash2 className="h-3.5 w-3.5" style={{ color: "var(--danger)" }} />
          </button>
        )}
      </div>
    );
  }

  function renderEntryRow(entry: EntryWithProfile) {
    const sc = statusConfig[entry.status] || statusConfig.concept;
    const hasOveruren = overurenIds.has(`${entry.medewerker_id}_${entry.datum}`);
    return (
      <div key={entry.id} className="px-4 py-3 min-w-0">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-[11px] font-medium shrink-0" style={{ color: "var(--text-muted)", minWidth: 60 }}>
            {format(new Date(entry.datum), "EEE d/M", { locale: nl })}
          </span>
          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
            {entry.project_nummer}
          </span>
          <span className="text-xs flex-1 truncate min-w-0 basis-full sm:basis-auto" style={{ color: "var(--text-primary)" }}>{entry.project_naam} {entry.beschrijving ? `· ${entry.beschrijving}` : ""}</span>
          <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: "var(--text-primary)" }}>
            {entry.uren}u
            {hasOveruren && (
              <span onClick={() => navigate("/overuren")} className="inline cursor-pointer"><AlertTriangle className="h-3 w-3 inline ml-1" style={{ color: "var(--warn-text)" }} /></span>
            )}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: sc.bg, color: sc.text }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
            {entry.status}
          </span>
          {renderEntryActions(entry)}
        </div>
        {entry.status === "afgekeurd" && entry.afkeur_reden && (
          <p className="text-[10px] italic mt-1" style={{ color: "var(--danger)" }}>Reden: {entry.afkeur_reden}</p>
        )}
        {afkeurId === entry.id && (
          <div className="mt-2 space-y-2">
            <textarea value={afkeurReden} onChange={e => setAfkeurReden(e.target.value)} placeholder="Reden voor afkeuring (verplicht)" rows={2} className="w-full px-3 py-2 rounded-xl text-sm resize-none" style={{ background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }} />
            <div className="flex gap-2">
              <button onClick={() => afkeurReden.trim() ? updateStatus(afkeurId, "afgekeurd", afkeurReden.trim()) : toast.error("Vul een reden in")} className="flex-1 py-2 rounded-xl text-xs font-bold" style={{ background: "var(--danger)", color: "#fff" }}>Afkeuren</button>
              <button onClick={() => { setAfkeurId(null); setAfkeurReden(""); }} className="px-3 py-2 rounded-xl text-xs font-medium" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>Annuleren</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderGroupedCards(grouped: Record<string, EntryWithProfile[]>) {
    return Object.entries(grouped).map(([name, userEntries]) => {
      const totalHours = userEntries.reduce((s, e) => s + e.uren, 0);
      const pendingCount = userEntries.filter((e) => e.status === "ingediend").length;
      const conceptCount = userEntries.filter(e => e.status === "concept").length;
      return (
        <div key={name} className="rounded-2xl overflow-hidden animate-slide-up" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ background: "var(--bg-surface-2)" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-xs font-bold" style={{ color: "#fff" }}>
                {name.charAt(0).toUpperCase()}
              </div>
              <div>
                <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{name}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{userEntries.length} boekingen · {totalHours}u</span>
                  {pendingCount > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "var(--warn-light)", color: "var(--warn-text)" }}>{pendingCount} open</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tabular-nums" style={{ color: "var(--accent)" }}>{totalHours}u</span>
              {conceptCount > 0 && (
                <button onClick={() => {
                  const ids = userEntries.filter(e => e.status === "concept").map(e => e.id);
                  mutate(supabase.from("uren_boekingen").update({ status: "ingediend" }).in("id", ids)).then(ok => {
                    if (ok) { toast.success(`${ids.length} uren ingediend`); fetchEntries(); }
                  });
                }} className="flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] font-bold" style={{ background: "var(--accent-light)", border: "1px solid var(--accent-border)", color: "var(--accent)" }}>
                  <Send className="h-3 w-3" /> Indienen
                </button>
              )}
              {pendingCount > 0 && (
                <button onClick={() => approveAllForUser(name)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors active:scale-95" style={{ background: "var(--accent-light)", border: "1px solid var(--accent-border)", color: "var(--accent)" }}>
                  <CheckCheck className="h-3.5 w-3.5" /> Alles goedkeuren
                </button>
              )}
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--bg-surface-2)" }}>
            {userEntries.map(renderEntryRow)}
          </div>
        </div>
      );
    });
  }

  const mainContent = (
    <main className="px-4 py-4 space-y-4">
      {/* Week navigation */}
      <div className="rounded-2xl p-3 flex items-center justify-between" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
        <button className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors active:scale-95" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }} onClick={() => setWeekOffset((w) => w - 1)}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button onClick={() => setWeekOffset(0)} className="flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition-colors" style={{ background: weekOffset === 0 ? "var(--accent-light)" : "transparent" }}>
          <span className="text-lg font-extrabold tabular-nums" style={{ color: "var(--accent)", fontFamily: "DM Mono, monospace" }}>Week {getISOWeek(weekStart)}</span>
          <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{format(weekStart, "d MMM", { locale: nl })} – {format(weekEnd, "d MMM yyyy", { locale: nl })}</span>
          {weekOffset !== 0 && <span className="text-[9px] font-semibold mt-0.5 px-2 py-0.5 rounded-full" style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}>Terug naar deze week</span>}
        </button>
        <button className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors active:scale-95" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }} onClick={() => setWeekOffset((w) => w + 1)}>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {([["alle", "Alle"], ["ingediend", "Ingediend"], ["goedgekeurd", "Goedgekeurd"], ["afgekeurd", "Afgekeurd"], ["concept", "Concept"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors" style={{
            background: filter === k ? "var(--accent-light)" : "var(--bg-surface)",
            border: filter === k ? "1px solid var(--accent-border)" : "1px solid var(--planning-border-soft)",
            color: filter === k ? "var(--accent)" : "var(--text-muted)",
          }}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <ListSkeleton count={3} ItemSkeleton={GoedkeuringCardSkeleton} />
      ) : Object.keys(grouped).length === 0 ? (
        <EmptyState icoon="✓" titel="Geen boekingen gevonden" subtitel="Geen uren in deze week met dit filter." />
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="lg:hidden space-y-4">
            {renderGroupedCards(grouped)}
          </div>
          {/* Desktop: monteur sidebar + wide sticky table */}
          <div className="hidden lg:flex gap-4">
            <div className="w-[280px] shrink-0 space-y-2">
              {Object.entries(grouped).map(([name, userEntries]) => {
                const totalHours = userEntries.reduce((s, e) => s + e.uren, 0);
                const pendingCount = userEntries.filter((e) => e.status === "ingediend").length;
                const isSelected = selectedMonteur === name;
                return (
                  <button key={name} onClick={() => setSelectedMonteur(name)} className="w-full text-left rounded-2xl p-4 transition-colors" style={{
                    background: isSelected ? "var(--accent-light)" : "var(--bg-surface)",
                    border: isSelected ? "1px solid var(--accent-border)" : "1px solid var(--planning-border-soft)",
                  }}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-xs font-bold" style={{ color: "#fff" }}>{name.charAt(0).toUpperCase()}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>{name}</p>
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{userEntries.length} boekingen · {totalHours}u</p>
                      </div>
                      {pendingCount > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "var(--warn-light)", color: "var(--warn-text)" }}>{pendingCount}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex-1 min-w-0">
              {selectedMonteur && grouped[selectedMonteur] ? (
                <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
                  {/* Sticky toolbar */}
                  <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3" style={{ background: "var(--bg-surface-2)" }}>
                    <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{selectedMonteur}</span>
                    <div className="flex gap-2">
                      {grouped[selectedMonteur].some(e => e.status === "concept") && (
                        <button onClick={() => {
                          const ids = grouped[selectedMonteur].filter(e => e.status === "concept").map(e => e.id);
                          mutate(supabase.from("uren_boekingen").update({ status: "ingediend" }).in("id", ids)).then(ok => {
                            if (ok) { toast.success(`${ids.length} uren ingediend`); fetchEntries(); }
                          });
                        }} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold" style={{ background: "var(--accent-light)", border: "1px solid var(--accent-border)", color: "var(--accent)" }}>
                          <Send className="h-3.5 w-3.5" /> Indienen
                        </button>
                      )}
                      {grouped[selectedMonteur].some(e => e.status === "ingediend") && (
                        <button onClick={() => approveAllForUser(selectedMonteur)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold" style={{ background: "var(--accent-light)", border: "1px solid var(--accent-border)", color: "var(--accent)" }}>
                          <CheckCheck className="h-3.5 w-3.5" /> Alles goedkeuren
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Wide table with sticky header */}
                  <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
                    <table className="w-full text-sm" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                      <thead className="sticky top-0 z-10" style={{ background: "var(--bg-surface)" }}>
                        <tr style={{ color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          <th className="text-left font-semibold px-4 py-3" style={{ width: 110, borderBottom: "1px solid var(--planning-border-soft)" }}>Datum</th>
                          <th className="text-left font-semibold px-3 py-3" style={{ width: 100, borderBottom: "1px solid var(--planning-border-soft)" }}>Project</th>
                          <th className="text-left font-semibold px-3 py-3" style={{ borderBottom: "1px solid var(--planning-border-soft)" }}>Omschrijving</th>
                          <th className="text-right font-semibold px-3 py-3" style={{ width: 70, borderBottom: "1px solid var(--planning-border-soft)" }}>Uren</th>
                          <th className="text-left font-semibold px-3 py-3" style={{ width: 110, borderBottom: "1px solid var(--planning-border-soft)" }}>Status</th>
                          <th className="text-right font-semibold px-4 py-3" style={{ width: 180, borderBottom: "1px solid var(--planning-border-soft)" }}>Acties</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grouped[selectedMonteur].map((entry) => {
                          const sc = statusConfig[entry.status] || statusConfig.concept;
                          const hasOveruren = overurenIds.has(`${entry.medewerker_id}_${entry.datum}`);
                          return (
                            <Fragment key={entry.id}>
                              <tr style={{ borderBottom: "1px solid color-mix(in srgb, var(--planning-border-soft) 60%, transparent)" }}>
                                <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                                  {format(new Date(entry.datum), "EEE d/M", { locale: nl })}
                                </td>
                                <td className="px-3 py-3">
                                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                                    {entry.project_nummer}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-xs truncate" style={{ color: "var(--text-primary)", maxWidth: 0 }}>
                                  <div className="truncate">{entry.project_naam}{entry.beschrijving ? ` · ${entry.beschrijving}` : ""}</div>
                                </td>
                                <td className="px-3 py-3 text-right text-xs font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                                  {entry.uren}u
                                  {hasOveruren && (
                                    <span onClick={() => navigate("/overuren")} className="inline cursor-pointer"><AlertTriangle className="h-3 w-3 inline ml-1" style={{ color: "var(--warn-text)" }} /></span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.text }}>
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
                                    {entry.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex justify-end">{renderEntryActions(entry)}</div>
                                </td>
                              </tr>
                              {entry.status === "afgekeurd" && entry.afkeur_reden && (
                                <tr>
                                  <td colSpan={6} className="px-4 pb-2 text-[10px] italic" style={{ color: "var(--danger)" }}>
                                    Reden: {entry.afkeur_reden}
                                  </td>
                                </tr>
                              )}
                              {afkeurId === entry.id && (
                                <tr>
                                  <td colSpan={6} className="px-4 pb-3">
                                    <div className="space-y-2">
                                      <textarea value={afkeurReden} onChange={e => setAfkeurReden(e.target.value)} placeholder="Reden voor afkeuring (verplicht)" rows={2} className="w-full px-3 py-2 rounded-xl text-sm resize-none" style={{ background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }} />
                                      <div className="flex gap-2">
                                        <button onClick={() => afkeurReden.trim() ? updateStatus(afkeurId, "afgekeurd", afkeurReden.trim()) : toast.error("Vul een reden in")} className="px-4 py-2 rounded-xl text-xs font-bold" style={{ background: "var(--danger)", color: "#fff" }}>Afkeuren</button>
                                        <button onClick={() => { setAfkeurId(null); setAfkeurReden(""); }} className="px-3 py-2 rounded-xl text-xs font-medium" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>Annuleren</button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>Selecteer een monteur</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );

  const weekNumber = getISOWeek(weekStart);

  // Groepeer per monteur (weekstaat) — filter werkt op groepsniveau
  const alleGroepen = Object.entries(
    entries.reduce<Record<string, EntryWithProfile[]>>((acc, e) => {
      (acc[e.medewerker_id] ||= []).push(e);
      return acc;
    }, {})
  ).map(([medewerker_id, userEntries]) => {
    const statuses = userEntries.map(e => e.status);
    const status = statuses.every(s => s === "goedgekeurd") ? "goedgekeurd"
      : statuses.some(s => s === "afgekeurd") ? "afgekeurd"
      : statuses.some(s => s === "ingediend") ? "ingediend"
      : "concept";
    const dagen = [...userEntries]
      .sort((a, b) => a.datum.localeCompare(b.datum))
      .map(e => {
        const [taakDeel, ...rest] = (e.beschrijving || "").split(" — ");
        const toelichting = rest.join(" — ").split(": ").slice(1).join(": ") || null;
        return {
          id: e.id,
          datum: e.datum,
          projectNaam: e.project_naam,
          projectNummer: e.project_nummer,
          taak: taakDeel || "",
          uren: e.uren,
          afwijking: Math.max(0, e.uren - 8),
          toelichting,
        };
      });
    const laatste = [...userEntries].sort((a, b) => (a.updated_at || "").localeCompare(b.updated_at || "")).at(-1);
    const goedgekeurdLabel = status === "goedgekeurd" && laatste?.updated_at
      ? `Goedgekeurd${laatste.approved_by && keurderNamen[laatste.approved_by] ? ` door ${keurderNamen[laatste.approved_by]}` : ""} op ${format(new Date(laatste.updated_at), "d MMM yyyy, HH:mm", { locale: nl })}`
      : null;
    return { id: medewerker_id, full_name: userEntries[0]?.full_name || "Onbekend", status, entries: userEntries, dagen, goedgekeurdLabel };
  });

  const telIngediend = alleGroepen.filter(g => g.status === "ingediend").length;
  const telGoedgekeurd = alleGroepen.filter(g => g.status === "goedgekeurd").length;
  const filterOpties = [
    { key: "alle", label: "Alle", aantal: alleGroepen.length },
    { key: "ingediend", label: "Ingediend", aantal: telIngediend },
    { key: "goedgekeurd", label: "Goedgekeurd", aantal: telGoedgekeurd },
    { key: "afgekeurd", label: "Afgekeurd", aantal: alleGroepen.filter(g => g.status === "afgekeurd").length },
  ];

  const zichtbareGroepen = alleGroepen
    .filter(g => filter === "alle" || g.status === filter)
    .sort((a, b) => {
      const prio = (g: typeof a) => (g.status === "ingediend" ? 0 : g.dagen.some(d => d.afwijking > 0) ? 1 : 2);
      return prio(a) - prio(b) || a.full_name.localeCompare(b.full_name);
    });

  const bulkGroepen = alleGroepen.filter(g => g.status === "ingediend" && g.dagen.every(d => d.afwijking === 0));

  const keurGroepGoed = async (group: { id: string; entries: EntryWithProfile[] }) => {
    setBusyGroep(group.id);
    const ids = group.entries.filter(e => e.status !== "goedgekeurd").map(e => e.id);
    const ok = await mutate(supabase.from("uren_boekingen").update({ status: "goedgekeurd", approved_by: myProfileId }).in("id", ids));
    setBusyGroep(null);
    if (!ok) return;
    toast.success(`${ids.length} uren goedgekeurd`);
    fetchEntries();
  };

  const keurGroepAf = async (group: { id: string; entries: EntryWithProfile[] }, reden: string) => {
    setBusyGroep(group.id);
    const ids = group.entries.filter(e => e.status === "ingediend").map(e => e.id);
    const ok = await mutate(supabase.from("uren_boekingen").update({ status: "afgekeurd", afkeur_reden: reden, approved_by: myProfileId }).in("id", ids));
    setBusyGroep(null);
    if (!ok) return;
    toast.success("Weekstaat afgewezen");
    fetchEntries();
  };

  const keurBulkGoed = async () => {
    const ids = bulkGroepen.flatMap(g => g.entries.filter(e => e.status === "ingediend").map(e => e.id));
    if (ids.length === 0) return;
    setBusyGroep("bulk");
    const ok = await mutate(supabase.from("uren_boekingen").update({ status: "goedgekeurd", approved_by: myProfileId }).in("id", ids));
    setBusyGroep(null);
    if (!ok) return;
    toast.success(`${bulkGroepen.length} weekstaten goedgekeurd`);
    fetchEntries();
  };


  return (
    <PageShell>
      <PullToRefresh onRefresh={fetchEntries}>
      <div style={{ background: "var(--app-navy)", minHeight: "100dvh", paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 120px)" }}>
        <MobileHeader showBrand={false} title="Weekstaten keuren" actions={
          <button onClick={() => setShowBookModal(true)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: "var(--accent)" }}>add_circle</span>
          </button>
        } />

        <main style={{ padding: "24px 20px" }}>
          {/* KOP + WEEKNAVIGATIE */}
          <section className="w-full mx-auto flex items-start justify-between gap-4 flex-wrap" style={{ maxWidth: 700, marginBottom: 20 }}>
            <div>
              <h2 style={{ fontFamily: "Hanken Grotesk", fontWeight: 500, fontSize: 18, color: "var(--text-primary)", marginBottom: 2 }}>
                {telIngediend} openstaand · {telGoedgekeurd} goedgekeurd
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {format(weekStart, "d MMM", { locale: nl })} t/m {format(weekEnd, "d MMM", { locale: nl })}
              </p>
            </div>
            <div className="flex items-center" style={{ gap: 4 }}>
              <button aria-label="Vorige week" onClick={() => setWeekOffset(w => w - 1)}
                className="rounded-lg flex items-center justify-center focus-visible:outline-none focus-visible:ring-2"
                style={{ width: 32, height: 32, background: "var(--bg-surface)", border: "0.5px solid var(--approval-border)", color: "var(--text-secondary)" }}>
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: 13, color: "var(--text-primary)", minWidth: 64, textAlign: "center" }}>Week {weekNumber}</span>
              <button aria-label="Volgende week" onClick={() => setWeekOffset(w => w + 1)}
                className="rounded-lg flex items-center justify-center focus-visible:outline-none focus-visible:ring-2"
                style={{ width: 32, height: 32, background: "var(--bg-surface)", border: "0.5px solid var(--approval-border)", color: "var(--text-secondary)" }}>
                <ChevronRight size={16} />
              </button>
              {weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)}
                  className="rounded-lg px-2 focus-visible:outline-none focus-visible:ring-2"
                  style={{ fontSize: 13, height: 32, color: "var(--text-muted)", background: "transparent", border: "none" }}>
                  Deze week
                </button>
              )}
            </div>
          </section>

          {/* FILTERS */}
          <div className="w-full mx-auto flex gap-2 overflow-x-auto" style={{ maxWidth: 700, marginBottom: 16, scrollbarWidth: "none", paddingBottom: 2 }}>
            {filterOpties.map(({ key, label, aantal }) => {
              const actief = filter === key;
              return (
                <button key={key} onClick={() => setFilter(key)}
                  className="shrink-0 rounded-full px-3 focus-visible:outline-none focus-visible:ring-2"
                  style={{
                    height: 30, fontSize: 13, fontWeight: actief ? 500 : 400,
                    background: actief ? "var(--accent)" : "transparent",
                    color: actief ? "#fff" : "var(--text-muted)",
                    border: actief ? "1px solid var(--accent)" : "1px solid var(--approval-border)",
                  }}>
                  {label} {aantal}
                </button>
              );
            })}
          </div>

          {/* BULK */}
          {bulkGroepen.length > 1 && (
            <div className="w-full mx-auto" style={{ maxWidth: 700, marginBottom: 16 }}>
              <button onClick={keurBulkGoed} disabled={!!busyGroep}
                className="rounded-lg px-3 inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
                style={{ height: 32, fontSize: 13, color: "var(--accent-dark)", background: "var(--accent-light)", border: "1px solid var(--accent-border)" }}>
                <CheckCheck size={14} /> Alles zonder afwijking goedkeuren ({bulkGroepen.length})
              </button>
            </div>
          )}

          {/* LOADING */}
          {loading && (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Laden...</div>
          )}

          {/* WEEKSTAAT-KAARTEN */}
          {!loading && zichtbareGroepen.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {zichtbareGroepen.map(group => (
                <WeekstaatCard
                  key={group.id}
                  naam={group.full_name}
                  status={group.status}
                  dagen={group.dagen}
                  busy={busyGroep === group.id}
                  goedgekeurdLabel={group.goedgekeurdLabel}
                  onApprove={() => keurGroepGoed(group)}
                  onReject={(reden) => keurGroepAf(group, reden)}
                />
              ))}
            </div>
          )}

          {/* EMPTY STATE */}
          {!loading && zichtbareGroepen.length === 0 && (
            <EmptyState
              icoon="✓"
              titel="Niets te keuren"
              subtitel={filter === "alle"
                ? "Er zijn geen weekstaten in deze week."
                : "Geen weekstaten met dit filter. Bekijk alle weekstaten."}
            />
          )}
        </main>


        {/* AFKEUR BOTTOM SHEET */}
        {afkeurId && (
          <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div onClick={() => setAfkeurId(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
            <div style={{ position: "relative", background: "var(--bg-surface)", borderRadius: "40px 40px 0 0", padding: "24px 24px 48px", borderTop: "1px solid var(--planning-border-soft)" }}>
              <div style={{ width: 48, height: 6, borderRadius: 9999, background: "var(--border-strong)", margin: "0 auto 24px" }} />
              <h3 style={{ fontFamily: "Hanken Grotesk", fontWeight: 800, fontSize: 22, color: "var(--text-primary)", marginBottom: 20 }}>Reden van afwijzing</h3>
              {["Onjuiste uren / project", "Dubbele boeking", "Geen omschrijving", "Anders..."].map((opt) => (
                <button key={opt} onClick={() => setAfkeurReden(opt)} style={{
                  width: "100%", padding: 16, borderRadius: 16,
                  background: afkeurReden === opt ? "var(--warn-light)" : "var(--bg-surface-2)",
                  border: afkeurReden === opt ? "1px solid rgba(254,179,0,0.4)" : "1px solid var(--border)",
                  display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: 8,
                }}>
                  <span style={{ fontSize: 14, fontFamily: "Hanken Grotesk", fontWeight: 500, color: "var(--text-primary)" }}>{opt}</span>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: afkeurReden === opt ? "6px solid var(--warn-text)" : "2px solid var(--text-muted)" }} />
                </button>
              ))}
              <textarea
                value={afkeurReden.startsWith("Onjuiste") || afkeurReden === "Dubbele boeking" || afkeurReden === "Geen omschrijving" ? "" : afkeurReden}
                onChange={(e) => setAfkeurReden(e.target.value)}
                placeholder="Toelichting (optioneel)..."
                rows={3}
                style={{ width: "100%", marginTop: 8, marginBottom: 16, padding: "12px 16px", borderRadius: 16, border: "1px solid var(--border)", background: "var(--app-navy)", color: "var(--text-primary)", fontFamily: "Hanken Grotesk", fontSize: 14, resize: "none", outline: "none", boxSizing: "border-box" }}
              />
              <button onClick={() => { updateStatus(afkeurId, "afgekeurd", afkeurReden); setAfkeurId(null); }} style={{
                width: "100%", height: 56, borderRadius: 16, background: "var(--warn-text)", border: "none",
                color: "#523700", fontFamily: "Hanken Grotesk", fontWeight: 800, fontSize: 15, textTransform: "uppercase",
                letterSpacing: "0.1em", cursor: "pointer", marginBottom: 12,
              }}>
                AFWIJZEN
              </button>
              <button onClick={() => setAfkeurId(null)} style={{
                width: "100%", height: 48, background: "transparent", border: "none",
                color: "var(--text-muted)", fontFamily: "Hanken Grotesk", fontWeight: 700, fontSize: 13, textTransform: "uppercase", cursor: "pointer",
              }}>
                ANNULEREN
              </button>
            </div>
          </div>
        )}
      </div>
      </PullToRefresh>

      <BottomNav badges={badges} />

      {/* Book modal */}
      {showBookModal && (
        <ManagerBookModal weekStart={weekStart} onClose={() => setShowBookModal(false)} onSaved={() => { setShowBookModal(false); fetchEntries(); }} />
      )}

      {/* Edit modal */}
      {editEntry && (
        <EditEntryModal entry={editEntry} onClose={() => setEditEntry(null)} onSaved={() => { setEditEntry(null); fetchEntries(); }} />
      )}
    </PageShell>
  );
}

/* ─── Manager Book Modal ─── */
function ManagerBookModal({ weekStart, onClose, onSaved }: { weekStart: Date; onClose: () => void; onSaved: () => void }) {
  const { projects } = useProjects();
  const [medewerkers, setMedewerkers] = useState<{ id: string; full_name: string }[]>([]);
  const [medId, setMedId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [datum, setDatum] = useState(format(new Date(), "yyyy-MM-dd"));
  const [uren, setUren] = useState(8);
  const [type, setType] = useState("monteren");
  const [saving, setSaving] = useState(false);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  useEffect(() => {
    supabase.from("profiles").select("id, full_name").order("full_name").then(({ data }) => {
      if (data) setMedewerkers(data);
    });
  }, []);

  async function handleSubmit() {
    if (!medId || !projectId) { toast.error("Selecteer medewerker en project"); return; }
    setSaving(true);
    if (!await mutate(supabase.from("uren_boekingen").insert({
      medewerker_id: medId,
      datum,
      project_id: projectId,
      beschrijving: type,
      type,
      uren,
      status: "concept",
    }))) { setSaving(false); return; }
    toast.success("Uren geboekt als concept");
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in" style={{ background: "color-mix(in srgb, var(--text-primary) 35%, transparent)", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-[430px] animate-sheet-up rounded-t-3xl space-y-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)", borderBottom: "none", padding: "20px 20px 48px" }}>
        <div className="w-10 h-1 rounded-full mx-auto" style={{ background: "var(--planning-border-soft)" }} />
        <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Uren boeken voor medewerker</h2>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Medewerker</label>
            <select value={medId} onChange={e => setMedId(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }}>
              <option value="">Kies medewerker...</option>
              {medewerkers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Dag</label>
            <select value={datum} onChange={e => setDatum(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }}>
              {weekDays.map(d => <option key={format(d, "yyyy-MM-dd")} value={format(d, "yyyy-MM-dd")}>{format(d, "EEEE d MMM", { locale: nl })}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Project</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }}>
              <option value="">Kies project...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.naam} ({p.nummer})</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Werkzaamheden</label>
            <div className="flex gap-2 mt-1">
              {["monteren", "schakelen"].map(w => (
                <button key={w} type="button" onClick={() => setType(w)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold capitalize" style={{ background: type === w ? "var(--accent-light)" : "var(--app-navy)", border: type === w ? "1px solid var(--accent-border)" : "1px solid var(--planning-border-soft)", color: type === w ? "var(--accent)" : "var(--text-muted)" }}>
                  {w}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Uren</label>
            <div className="flex items-center justify-center gap-6 mt-2">
              <button type="button" onClick={() => setUren(u => Math.max(0.5, u - 0.5))} className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>−</button>
              <span className="text-3xl font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{uren}u</span>
              <button type="button" onClick={() => setUren(u => Math.min(24, u + 0.5))} className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>+</button>
            </div>
            <div className="flex justify-center gap-2 mt-2">
              {[4, 6, 8, 9, 10].map(h => (
                <button key={h} type="button" onClick={() => setUren(h)} className="px-3 py-1 rounded-lg text-xs font-medium" style={{ background: uren === h ? "var(--accent-light)" : "var(--app-navy)", border: uren === h ? "1px solid var(--accent-border)" : "1px solid var(--planning-border-soft)", color: uren === h ? "var(--accent)" : "var(--text-muted)" }}>
                  {h}u
                </button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={handleSubmit} disabled={saving || !medId || !projectId} className="w-full py-3.5 rounded-2xl text-sm font-bold transition-all disabled:opacity-40" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", color: "#fff" }}>
          {saving ? "Opslaan..." : "Opslaan als concept"}
        </button>
      </div>
    </div>
  );
}

/* ─── Edit Entry Modal ─── */
function EditEntryModal({ entry, onClose, onSaved }: { entry: EntryWithProfile; onClose: () => void; onSaved: () => void }) {
  const { projects } = useProjects();
  const [projectId, setProjectId] = useState(entry.project_id);
  const [uren, setUren] = useState(entry.uren);
  const [type, setType] = useState(entry.beschrijving || "monteren");
  const [datum, setDatum] = useState(entry.datum);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    if (!await mutate(supabase.from("uren_boekingen").update({
      project_id: projectId,
      uren,
      beschrijving: type,
      type,
      datum,
    }).eq("id", entry.id))) { setSaving(false); return; }
    toast.success("Boeking bijgewerkt");
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in" style={{ background: "color-mix(in srgb, var(--text-primary) 35%, transparent)", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-[430px] animate-sheet-up rounded-t-3xl space-y-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)", borderBottom: "none", padding: "20px 20px 48px" }}>
        <div className="w-10 h-1 rounded-full mx-auto" style={{ background: "var(--planning-border-soft)" }} />
        <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Boeking bewerken</h2>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{entry.full_name} · {entry.status}</p>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Datum</label>
            <input type="date" value={datum} onChange={e => setDatum(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }} />
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Project</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.naam} ({p.nummer})</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Werkzaamheden</label>
            <div className="flex gap-2 mt-1">
              {["monteren", "schakelen"].map(w => (
                <button key={w} type="button" onClick={() => setType(w)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold capitalize" style={{ background: type === w ? "var(--accent-light)" : "var(--app-navy)", border: type === w ? "1px solid var(--accent-border)" : "1px solid var(--planning-border-soft)", color: type === w ? "var(--accent)" : "var(--text-muted)" }}>
                  {w}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Uren</label>
            <div className="flex items-center justify-center gap-6 mt-2">
              <button type="button" onClick={() => setUren(u => Math.max(0.5, u - 0.5))} className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>−</button>
              <span className="text-3xl font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{uren}u</span>
              <button type="button" onClick={() => setUren(u => Math.min(24, u + 0.5))} className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>+</button>
            </div>
            <div className="flex justify-center gap-2 mt-2">
              {[4, 6, 8, 9, 10].map(h => (
                <button key={h} type="button" onClick={() => setUren(h)} className="px-3 py-1 rounded-lg text-xs font-medium" style={{ background: uren === h ? "var(--accent-light)" : "var(--app-navy)", border: uren === h ? "1px solid var(--accent-border)" : "1px solid var(--planning-border-soft)", color: uren === h ? "var(--accent)" : "var(--text-muted)" }}>
                  {h}u
                </button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} className="w-full py-3.5 rounded-2xl text-sm font-bold transition-all disabled:opacity-40" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", color: "#fff" }}>
          {saving ? "Opslaan..." : "Opslaan"}
        </button>
      </div>
    </div>
  );
}
