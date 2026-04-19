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

interface EntryWithProfile {
  id: string; datum: string; project_naam: string; project_nummer: string; beschrijving: string;
  uren: number; status: string; medewerker_id: string; full_name: string; afkeur_reden: string | null;
  project_id: string;
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

  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);

  const { entries: rawEntries, loading, refetch: fetchEntries } = useGoedkeuring(weekStart, "alle");

  const entries: EntryWithProfile[] = rawEntries.map(e => ({
    id: e.id, datum: e.datum, project_naam: e.project_naam, project_nummer: e.project_nummer,
    beschrijving: e.beschrijving || e.type || "", uren: e.uren, status: e.status,
    medewerker_id: e.medewerker_id, full_name: e.full_name,
    afkeur_reden: e.afkeur_reden, project_id: e.project_id,
  }));

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
    ingediend: { bg: "rgba(254,179,0,0.1)", text: "#feb300", dot: "#feb300" },
    goedgekeurd: { bg: "rgba(63,255,139,0.1)", text: "#3fff8b", dot: "#3fff8b" },
    afgekeurd: { bg: "rgba(255,113,108,0.1)", text: "#ff716c", dot: "#ff716c" },
    concept: { bg: "#102038", text: "#a0abc3", dot: "#a0abc3" },
  };

  if (!isManager) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "#030e20" }}><p style={{ color: "#a0abc3" }}>Alleen managers hebben toegang.</p></div>;
  }

  function renderEntryActions(entry: EntryWithProfile) {
    return (
      <div className="flex gap-1 items-center">
        {/* Edit */}
        <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#102038" }} onClick={() => setEditEntry(entry)} title="Bewerken">
          <Pencil className="h-3.5 w-3.5" style={{ color: "#a0abc3" }} />
        </button>
        {/* Status-specific actions */}
        {entry.status === "concept" && (
          <>
            <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)" }} onClick={() => updateStatus(entry.id, "ingediend")} title="Indienen">
              <Send className="h-3.5 w-3.5" style={{ color: "#3fff8b" }} />
            </button>
            <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)" }} onClick={() => updateStatus(entry.id, "goedgekeurd")} title="Direct goedkeuren">
              <Check className="h-3.5 w-3.5" style={{ color: "#3fff8b" }} />
            </button>
          </>
        )}
        {entry.status === "ingediend" && (
          <>
            <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)" }} onClick={() => updateStatus(entry.id, "goedgekeurd")} title="Goedkeuren">
              <Check className="h-3.5 w-3.5" style={{ color: "#3fff8b" }} />
            </button>
            <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,113,108,0.1)", border: "1px solid rgba(255,113,108,0.3)" }} onClick={() => setAfkeurId(entry.id)} title="Afkeuren">
              <X className="h-3.5 w-3.5" style={{ color: "#ff716c" }} />
            </button>
          </>
        )}
        {entry.status === "goedgekeurd" && (
          <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#102038" }} onClick={() => updateStatus(entry.id, "concept")} title="Terug naar concept">
            <RotateCcw className="h-3.5 w-3.5" style={{ color: "#a0abc3" }} />
          </button>
        )}
        {entry.status === "afgekeurd" && (
          <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#102038" }} onClick={() => updateStatus(entry.id, "concept")} title="Terug naar concept">
            <RotateCcw className="h-3.5 w-3.5" style={{ color: "#a0abc3" }} />
          </button>
        )}
        {/* Delete (concept/afgekeurd only) */}
        {(entry.status === "concept" || entry.status === "afgekeurd") && (
          <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,113,108,0.1)" }} onClick={() => { if (confirm("Boeking verwijderen?")) deleteEntry(entry.id); }} title="Verwijderen">
            <Trash2 className="h-3.5 w-3.5" style={{ color: "#ff716c" }} />
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
          <span className="text-[11px] font-medium shrink-0" style={{ color: "#a0abc3", minWidth: 60 }}>
            {format(new Date(entry.datum), "EEE d/M", { locale: nl })}
          </span>
          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0" style={{ background: "rgba(63,255,139,0.1)", color: "#3fff8b" }}>
            {entry.project_nummer}
          </span>
          <span className="text-xs flex-1 truncate min-w-0 basis-full sm:basis-auto" style={{ color: "#dae6ff" }}>{entry.project_naam} {entry.beschrijving ? `· ${entry.beschrijving}` : ""}</span>
          <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: "#dae6ff" }}>
            {entry.uren}u
            {hasOveruren && (
              <span onClick={() => navigate("/overuren")} className="inline cursor-pointer"><AlertTriangle className="h-3 w-3 inline ml-1" style={{ color: "#feb300" }} /></span>
            )}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: sc.bg, color: sc.text }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
            {entry.status}
          </span>
          {renderEntryActions(entry)}
        </div>
        {entry.status === "afgekeurd" && entry.afkeur_reden && (
          <p className="text-[10px] italic mt-1" style={{ color: "#ff716c" }}>Reden: {entry.afkeur_reden}</p>
        )}
        {afkeurId === entry.id && (
          <div className="mt-2 space-y-2">
            <textarea value={afkeurReden} onChange={e => setAfkeurReden(e.target.value)} placeholder="Reden voor afkeuring (verplicht)" rows={2} className="w-full px-3 py-2 rounded-xl text-sm resize-none" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
            <div className="flex gap-2">
              <button onClick={() => afkeurReden.trim() ? updateStatus(afkeurId, "afgekeurd", afkeurReden.trim()) : toast.error("Vul een reden in")} className="flex-1 py-2 rounded-xl text-xs font-bold" style={{ background: "#ff716c", color: "#fff" }}>Afkeuren</button>
              <button onClick={() => { setAfkeurId(null); setAfkeurReden(""); }} className="px-3 py-2 rounded-xl text-xs font-medium" style={{ background: "#102038", color: "#a0abc3" }}>Annuleren</button>
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
        <div key={name} className="rounded-2xl overflow-hidden animate-slide-up" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ background: "#102038" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-xs font-bold" style={{ color: "#fff" }}>
                {name.charAt(0).toUpperCase()}
              </div>
              <div>
                <span className="font-semibold text-sm" style={{ color: "#dae6ff" }}>{name}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px]" style={{ color: "#a0abc3" }}>{userEntries.length} boekingen · {totalHours}u</span>
                  {pendingCount > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(254,179,0,0.1)", color: "#feb300" }}>{pendingCount} open</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tabular-nums" style={{ color: "#3fff8b" }}>{totalHours}u</span>
              {conceptCount > 0 && (
                <button onClick={() => {
                  const ids = userEntries.filter(e => e.status === "concept").map(e => e.id);
                  mutate(supabase.from("uren_boekingen").update({ status: "ingediend" }).in("id", ids)).then(ok => {
                    if (ok) { toast.success(`${ids.length} uren ingediend`); fetchEntries(); }
                  });
                }} className="flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] font-bold" style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)", color: "#3fff8b" }}>
                  <Send className="h-3 w-3" /> Indienen
                </button>
              )}
              {pendingCount > 0 && (
                <button onClick={() => approveAllForUser(name)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors active:scale-95" style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)", color: "#3fff8b" }}>
                  <CheckCheck className="h-3.5 w-3.5" /> Alles goedkeuren
                </button>
              )}
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: "#102038" }}>
            {userEntries.map(renderEntryRow)}
          </div>
        </div>
      );
    });
  }

  const mainContent = (
    <main className="px-4 py-4 space-y-4">
      {/* Week navigation */}
      <div className="rounded-2xl p-3 flex items-center justify-between" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
        <button className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors active:scale-95" style={{ background: "#102038", color: "#a0abc3" }} onClick={() => setWeekOffset((w) => w - 1)}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button onClick={() => setWeekOffset(0)} className="flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition-colors" style={{ background: weekOffset === 0 ? "rgba(63,255,139,0.1)" : "transparent" }}>
          <span className="text-lg font-extrabold tabular-nums" style={{ color: "#3fff8b", fontFamily: "DM Mono, monospace" }}>Week {getISOWeek(weekStart)}</span>
          <span className="text-[11px] font-medium" style={{ color: "#a0abc3" }}>{format(weekStart, "d MMM", { locale: nl })} – {format(weekEnd, "d MMM yyyy", { locale: nl })}</span>
          {weekOffset !== 0 && <span className="text-[9px] font-semibold mt-0.5 px-2 py-0.5 rounded-full" style={{ background: "rgba(63,255,139,0.1)", color: "#3fff8b", border: "1px solid rgba(63,255,139,0.3)" }}>Terug naar deze week</span>}
        </button>
        <button className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors active:scale-95" style={{ background: "#102038", color: "#a0abc3" }} onClick={() => setWeekOffset((w) => w + 1)}>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {([["alle", "Alle"], ["ingediend", "Ingediend"], ["goedgekeurd", "Goedgekeurd"], ["afgekeurd", "Afgekeurd"], ["concept", "Concept"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors" style={{
            background: filter === k ? "rgba(63,255,139,0.1)" : "rgba(10,26,48,0.7)",
            border: filter === k ? "1px solid rgba(63,255,139,0.3)" : "1px solid rgba(106,118,140,0.15)",
            color: filter === k ? "#3fff8b" : "#a0abc3",
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
                    background: isSelected ? "rgba(63,255,139,0.1)" : "rgba(10,26,48,0.7)",
                    border: isSelected ? "1px solid rgba(63,255,139,0.3)" : "1px solid rgba(106,118,140,0.15)",
                  }}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-xs font-bold" style={{ color: "#fff" }}>{name.charAt(0).toUpperCase()}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate" style={{ color: "#dae6ff" }}>{name}</p>
                        <p className="text-[11px]" style={{ color: "#a0abc3" }}>{userEntries.length} boekingen · {totalHours}u</p>
                      </div>
                      {pendingCount > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(254,179,0,0.1)", color: "#feb300" }}>{pendingCount}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex-1 min-w-0">
              {selectedMonteur && grouped[selectedMonteur] ? (
                <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
                  {/* Sticky toolbar */}
                  <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3" style={{ background: "#102038" }}>
                    <span className="font-semibold text-sm" style={{ color: "#dae6ff" }}>{selectedMonteur}</span>
                    <div className="flex gap-2">
                      {grouped[selectedMonteur].some(e => e.status === "concept") && (
                        <button onClick={() => {
                          const ids = grouped[selectedMonteur].filter(e => e.status === "concept").map(e => e.id);
                          mutate(supabase.from("uren_boekingen").update({ status: "ingediend" }).in("id", ids)).then(ok => {
                            if (ok) { toast.success(`${ids.length} uren ingediend`); fetchEntries(); }
                          });
                        }} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold" style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)", color: "#3fff8b" }}>
                          <Send className="h-3.5 w-3.5" /> Indienen
                        </button>
                      )}
                      {grouped[selectedMonteur].some(e => e.status === "ingediend") && (
                        <button onClick={() => approveAllForUser(selectedMonteur)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold" style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)", color: "#3fff8b" }}>
                          <CheckCheck className="h-3.5 w-3.5" /> Alles goedkeuren
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Wide table with sticky header */}
                  <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
                    <table className="w-full text-sm" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                      <thead className="sticky top-0 z-10" style={{ background: "#0a1a30" }}>
                        <tr style={{ color: "#a0abc3", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          <th className="text-left font-semibold px-4 py-3" style={{ width: 110, borderBottom: "1px solid rgba(106,118,140,0.2)" }}>Datum</th>
                          <th className="text-left font-semibold px-3 py-3" style={{ width: 100, borderBottom: "1px solid rgba(106,118,140,0.2)" }}>Project</th>
                          <th className="text-left font-semibold px-3 py-3" style={{ borderBottom: "1px solid rgba(106,118,140,0.2)" }}>Omschrijving</th>
                          <th className="text-right font-semibold px-3 py-3" style={{ width: 70, borderBottom: "1px solid rgba(106,118,140,0.2)" }}>Uren</th>
                          <th className="text-left font-semibold px-3 py-3" style={{ width: 110, borderBottom: "1px solid rgba(106,118,140,0.2)" }}>Status</th>
                          <th className="text-right font-semibold px-4 py-3" style={{ width: 180, borderBottom: "1px solid rgba(106,118,140,0.2)" }}>Acties</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grouped[selectedMonteur].map((entry) => {
                          const sc = statusConfig[entry.status] || statusConfig.concept;
                          const hasOveruren = overurenIds.has(`${entry.medewerker_id}_${entry.datum}`);
                          return (
                            <Fragment key={entry.id}>
                              <tr style={{ borderBottom: "1px solid rgba(106,118,140,0.1)" }}>
                                <td className="px-4 py-3 text-xs" style={{ color: "#a0abc3" }}>
                                  {format(new Date(entry.datum), "EEE d/M", { locale: nl })}
                                </td>
                                <td className="px-3 py-3">
                                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ background: "rgba(63,255,139,0.1)", color: "#3fff8b" }}>
                                    {entry.project_nummer}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-xs truncate" style={{ color: "#dae6ff", maxWidth: 0 }}>
                                  <div className="truncate">{entry.project_naam}{entry.beschrijving ? ` · ${entry.beschrijving}` : ""}</div>
                                </td>
                                <td className="px-3 py-3 text-right text-xs font-bold tabular-nums" style={{ color: "#dae6ff" }}>
                                  {entry.uren}u
                                  {hasOveruren && (
                                    <span onClick={() => navigate("/overuren")} className="inline cursor-pointer"><AlertTriangle className="h-3 w-3 inline ml-1" style={{ color: "#feb300" }} /></span>
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
                                  <td colSpan={6} className="px-4 pb-2 text-[10px] italic" style={{ color: "#ff716c" }}>
                                    Reden: {entry.afkeur_reden}
                                  </td>
                                </tr>
                              )}
                              {afkeurId === entry.id && (
                                <tr>
                                  <td colSpan={6} className="px-4 pb-3">
                                    <div className="space-y-2">
                                      <textarea value={afkeurReden} onChange={e => setAfkeurReden(e.target.value)} placeholder="Reden voor afkeuring (verplicht)" rows={2} className="w-full px-3 py-2 rounded-xl text-sm resize-none" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
                                      <div className="flex gap-2">
                                        <button onClick={() => afkeurReden.trim() ? updateStatus(afkeurId, "afgekeurd", afkeurReden.trim()) : toast.error("Vul een reden in")} className="px-4 py-2 rounded-xl text-xs font-bold" style={{ background: "#ff716c", color: "#fff" }}>Afkeuren</button>
                                        <button onClick={() => { setAfkeurId(null); setAfkeurReden(""); }} className="px-3 py-2 rounded-xl text-xs font-medium" style={{ background: "#102038", color: "#a0abc3" }}>Annuleren</button>
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
                <div className="text-center py-20 rounded-2xl" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
                  <p className="text-sm" style={{ color: "#a0abc3" }}>Selecteer een monteur</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );

  const weekNumber = getISOWeek(weekStart);

  // Build monteurGroups from grouped data for the new UI (keyed by medewerker_id)
  const monteurGroups = Object.entries(grouped).map(([medewerker_id, userEntries]) => {
    const statuses = userEntries.map(e => e.status);
    const overallStatus = statuses.every(s => s === "goedgekeurd") ? "goedgekeurd"
      : statuses.some(s => s === "afgekeurd") ? "afgekeurd"
      : statuses.some(s => s === "ingediend") ? "ingediend"
      : "concept";
    return {
      id: medewerker_id,
      full_name: userEntries[0]?.full_name || "Onbekend",
      status: overallStatus,
      entries: userEntries,
    };
  });

  return (
    <PageShell>
      <PullToRefresh onRefresh={fetchEntries}>
      <div style={{ background: "#030e20", minHeight: "100dvh", paddingBottom: 160 }}>
        <MobileHeader showBrand={false} title="Weekstaten keuren" actions={
          <button onClick={() => setShowBookModal(true)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#3fff8b" }}>add_circle</span>
          </button>
        } />

        <main style={{ padding: "24px 20px" }}>
          {/* HEADER INFO */}
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 26, color: "#dae6ff", marginBottom: 4 }}>
              {monteurGroups.filter(g => g.status === "ingediend").length} openstaande weekstaten
            </h2>
            <p style={{ fontSize: 13, color: "#a0abc3", fontFamily: "Inter" }}>
              Week {weekNumber} — {format(weekStart, "EEE d MMM", { locale: nl })} t/m {format(weekEnd, "EEE d MMM", { locale: nl })}
            </p>
          </section>

          {/* WEEK NAV */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <button onClick={() => setWeekOffset(w => w - 1)} style={{ width: 44, height: 44, borderRadius: 12, background: "#102038", border: "1px solid rgba(255,255,255,0.07)", color: "#dae6ff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <ChevronLeft size={20} />
            </button>
            <button onClick={() => setWeekOffset(0)} style={{ flex: 1, textAlign: "center", fontFamily: "Manrope", fontWeight: 700, fontSize: 15, color: "#dae6ff", background: weekOffset === 0 ? "rgba(63,255,139,0.08)" : "transparent", border: "none", borderRadius: 12, padding: "8px 0", cursor: "pointer" }}>
              Week {weekNumber}
              {weekOffset !== 0 && <span style={{ display: "block", fontSize: 10, color: "#3fff8b", marginTop: 2 }}>↩ Terug naar deze week</span>}
            </button>
            <button onClick={() => setWeekOffset(w => w + 1)} style={{ width: 44, height: 44, borderRadius: 12, background: "#102038", border: "1px solid rgba(255,255,255,0.07)", color: "#dae6ff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <ChevronRight size={20} />
            </button>
          </div>

          {/* FILTER CHIPS */}
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 24, scrollbarWidth: "none" }}>
            {["alle", "ingediend", "goedgekeurd", "afgekeurd"].map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: "8px 16px", borderRadius: 9999,
                border: filter === f ? "2px solid #3fff8b" : "1px solid rgba(255,255,255,0.07)",
                background: filter === f ? "rgba(63,255,139,0.1)" : "#102038",
                color: filter === f ? "#3fff8b" : "#a0abc3",
                fontFamily: "Inter", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", textTransform: "capitalize",
              }}>
                {f === "alle" ? "Alle" : f === "ingediend" ? "Ingediend" : f === "goedgekeurd" ? "Goedgekeurd" : "Afgekeurd"}
              </button>
            ))}
          </div>

          {/* LOADING */}
          {loading && (
            <div style={{ textAlign: "center", padding: 40, color: "#a0abc3" }}>Laden...</div>
          )}

          {/* MONTEUR CARDS */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {monteurGroups
              .filter(g => filter === "alle" || g.status === filter)
              .map((group) => {
              const isGoedgekeurd = group.status === "goedgekeurd";
              const isAfgekeurd = group.status === "afgekeurd";
              const borderColor = isGoedgekeurd ? "#3fff8b" : isAfgekeurd ? "#ff716c" : "#feb300";
              const totalUren = group.entries.reduce((s: number, e: any) => s + e.uren, 0);
              const pct = Math.min(100, Math.round((totalUren / 40) * 100));
              const initials = group.full_name?.split(" ").map((n: string) => n[0]).slice(0, 2).join("") || "XX";

              return (
                <div key={group.id} style={{
                  background: "linear-gradient(135deg, rgba(10,26,48,0.7), rgba(6,19,39,0.8))",
                  backdropFilter: "blur(12px)", borderRadius: 20,
                  border: "1px solid rgba(106,118,140,0.15)",
                  borderLeft: `6px solid ${borderColor}`,
                  overflow: "hidden", opacity: isGoedgekeurd ? 0.65 : 1,
                }}>
                  <div style={{ padding: "20px 20px 16px" }}>
                    {/* Card header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: "#142640", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope", fontWeight: 700, fontSize: 14, color: "#dae6ff" }}>
                          {initials}
                        </div>
                        <div>
                          <p style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 16, color: "#dae6ff", marginBottom: 2 }}>{group.full_name}</p>
                          <p style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.1em", color: "#a0abc3" }}>
                            Week {weekNumber} · {totalUren} uur
                          </p>
                        </div>
                      </div>
                      <div style={{ padding: "4px 12px", borderRadius: 9999, background: isGoedgekeurd ? "rgba(63,255,139,0.1)" : isAfgekeurd ? "rgba(255,113,108,0.1)" : "rgba(254,179,0,0.1)", border: `1px solid ${borderColor}50`, whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 9, fontWeight: 800, fontFamily: "Inter", textTransform: "uppercase", color: borderColor }}>{group.status.toUpperCase()}</span>
                      </div>
                    </div>

                    {/* Day entries */}
                    <div style={{ marginBottom: 12 }}>
                      {group.entries.map((e: any) => {
                        const hasOveruren = overurenIds.has(`${e.medewerker_id}_${e.datum}`);
                        return (
                          <div key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(61,72,93,0.15)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 11, color: "#a0abc3", fontFamily: "Inter", minWidth: 52 }}>{format(new Date(e.datum), "EEE d/M", { locale: nl })}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#3fff8b", fontFamily: "Inter", padding: "1px 6px", borderRadius: 6, background: "rgba(63,255,139,0.08)" }}>{e.project_nummer}</span>
                              <span style={{ fontSize: 11, color: "#dae6ff", fontFamily: "Inter" }}>{e.beschrijving || ""}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#dae6ff", fontFamily: "Inter" }}>{e.uren}u</span>
                              {hasOveruren && (
                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#feb300", cursor: "pointer" }} onClick={() => navigate("/overuren")}>warning</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Progress bar */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ height: 6, background: "#000", borderRadius: 9999, overflow: "hidden", marginBottom: 6 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: isGoedgekeurd ? "#3fff8b" : pct < 100 ? "#feb300" : "#3fff8b", borderRadius: 9999 }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        {["Ma", "Di", "Wo", "Do", "Vr"].map(d => (
                          <span key={d} style={{ fontSize: 9, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", color: pct === 100 ? "#3fff8b" : "#a0abc3" }}>{d}</span>
                        ))}
                      </div>
                    </div>

                    {/* Action buttons */}
                    {!isGoedgekeurd && (
                      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                        <button onClick={() => { setAfkeurId(group.entries[0]?.id); setAfkeurReden(""); }} style={{
                          flex: 1, height: 52, borderRadius: 14, background: "transparent",
                          border: "1px solid rgba(255,113,108,0.4)", color: "#ff716c",
                          fontFamily: "Inter", fontWeight: 700, fontSize: 12, textTransform: "uppercase",
                          letterSpacing: "0.1em", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}>
                          <X size={16} /> Afwijzen
                        </button>
                        <button onClick={() => { group.entries.forEach((e: any) => updateStatus(e.id, "goedgekeurd")); }} style={{
                          flex: 1, height: 52, borderRadius: 14, background: "#3fff8b", border: "none",
                          color: "#005d2c", fontFamily: "Manrope", fontWeight: 800, fontSize: 12, textTransform: "uppercase",
                          letterSpacing: "0.1em", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                          boxShadow: "0 4px 16px rgba(63,255,139,0.2)",
                        }}>
                          <Check size={16} /> Goedkeuren
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* EMPTY STATE */}
          {!loading && monteurGroups.length === 0 && (
            <EmptyState icoon="✓" titel="Alles behandeld" subtitel="Er zijn geen openstaande weekstaten voor deze week." />
          )}
        </main>

        {/* AFKEUR BOTTOM SHEET */}
        {afkeurId && (
          <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div onClick={() => setAfkeurId(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
            <div style={{ position: "relative", background: "#0a1a30", borderRadius: "40px 40px 0 0", padding: "24px 24px 48px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ width: 48, height: 6, borderRadius: 9999, background: "rgba(255,255,255,0.2)", margin: "0 auto 24px" }} />
              <h3 style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 22, color: "#dae6ff", marginBottom: 20 }}>Reden van afwijzing</h3>
              {["Onjuiste uren / project", "Dubbele boeking", "Geen omschrijving", "Anders..."].map((opt) => (
                <button key={opt} onClick={() => setAfkeurReden(opt)} style={{
                  width: "100%", padding: 16, borderRadius: 16,
                  background: afkeurReden === opt ? "rgba(254,179,0,0.1)" : "rgba(10,26,48,0.5)",
                  border: afkeurReden === opt ? "1px solid rgba(254,179,0,0.4)" : "1px solid rgba(61,72,93,0.3)",
                  display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: 8,
                }}>
                  <span style={{ fontSize: 14, fontFamily: "Inter", fontWeight: 500, color: "#dae6ff" }}>{opt}</span>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: afkeurReden === opt ? "6px solid #feb300" : "2px solid #a0abc3" }} />
                </button>
              ))}
              <textarea
                value={afkeurReden.startsWith("Onjuiste") || afkeurReden === "Dubbele boeking" || afkeurReden === "Geen omschrijving" ? "" : afkeurReden}
                onChange={(e) => setAfkeurReden(e.target.value)}
                placeholder="Toelichting (optioneel)..."
                rows={3}
                style={{ width: "100%", marginTop: 8, marginBottom: 16, padding: "12px 16px", borderRadius: 16, border: "1px solid rgba(61,72,93,0.4)", background: "#030e20", color: "#dae6ff", fontFamily: "Inter", fontSize: 14, resize: "none", outline: "none", boxSizing: "border-box" }}
              />
              <button onClick={() => { updateStatus(afkeurId, "afgekeurd", afkeurReden); setAfkeurId(null); }} style={{
                width: "100%", height: 56, borderRadius: 16, background: "#feb300", border: "none",
                color: "#523700", fontFamily: "Manrope", fontWeight: 800, fontSize: 15, textTransform: "uppercase",
                letterSpacing: "0.1em", cursor: "pointer", marginBottom: 12,
              }}>
                AFWIJZEN
              </button>
              <button onClick={() => setAfkeurId(null)} style={{
                width: "100%", height: 48, background: "transparent", border: "none",
                color: "#a0abc3", fontFamily: "Inter", fontWeight: 700, fontSize: 13, textTransform: "uppercase", cursor: "pointer",
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
    <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in" style={{ background: "color-mix(in srgb, #dae6ff 35%, transparent)", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-[430px] animate-sheet-up rounded-t-3xl space-y-4" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", borderBottom: "none", padding: "20px 20px 48px" }}>
        <div className="w-10 h-1 rounded-full mx-auto" style={{ background: "rgba(106,118,140,0.15)" }} />
        <h2 className="text-base font-bold" style={{ color: "#dae6ff" }}>Uren boeken voor medewerker</h2>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Medewerker</label>
            <select value={medId} onChange={e => setMedId(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }}>
              <option value="">Kies medewerker...</option>
              {medewerkers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Dag</label>
            <select value={datum} onChange={e => setDatum(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }}>
              {weekDays.map(d => <option key={format(d, "yyyy-MM-dd")} value={format(d, "yyyy-MM-dd")}>{format(d, "EEEE d MMM", { locale: nl })}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Project</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }}>
              <option value="">Kies project...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.naam} ({p.nummer})</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Werkzaamheden</label>
            <div className="flex gap-2 mt-1">
              {["monteren", "schakelen"].map(w => (
                <button key={w} type="button" onClick={() => setType(w)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold capitalize" style={{ background: type === w ? "rgba(63,255,139,0.1)" : "#030e20", border: type === w ? "1px solid rgba(63,255,139,0.3)" : "1px solid rgba(106,118,140,0.15)", color: type === w ? "#3fff8b" : "#a0abc3" }}>
                  {w}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Uren</label>
            <div className="flex items-center justify-center gap-6 mt-2">
              <button type="button" onClick={() => setUren(u => Math.max(0.5, u - 0.5))} className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "#102038", color: "#a0abc3" }}>−</button>
              <span className="text-3xl font-bold tabular-nums" style={{ color: "#dae6ff" }}>{uren}u</span>
              <button type="button" onClick={() => setUren(u => Math.min(24, u + 0.5))} className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "#102038", color: "#a0abc3" }}>+</button>
            </div>
            <div className="flex justify-center gap-2 mt-2">
              {[4, 6, 8, 9, 10].map(h => (
                <button key={h} type="button" onClick={() => setUren(h)} className="px-3 py-1 rounded-lg text-xs font-medium" style={{ background: uren === h ? "rgba(63,255,139,0.1)" : "#030e20", border: uren === h ? "1px solid rgba(63,255,139,0.3)" : "1px solid rgba(106,118,140,0.15)", color: uren === h ? "#3fff8b" : "#a0abc3" }}>
                  {h}u
                </button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={handleSubmit} disabled={saving || !medId || !projectId} className="w-full py-3.5 rounded-2xl text-sm font-bold transition-all disabled:opacity-40" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)", color: "#fff" }}>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in" style={{ background: "color-mix(in srgb, #dae6ff 35%, transparent)", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-[430px] animate-sheet-up rounded-t-3xl space-y-4" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", borderBottom: "none", padding: "20px 20px 48px" }}>
        <div className="w-10 h-1 rounded-full mx-auto" style={{ background: "rgba(106,118,140,0.15)" }} />
        <h2 className="text-base font-bold" style={{ color: "#dae6ff" }}>Boeking bewerken</h2>
        <p className="text-xs" style={{ color: "#a0abc3" }}>{entry.full_name} · {entry.status}</p>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Datum</label>
            <input type="date" value={datum} onChange={e => setDatum(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Project</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.naam} ({p.nummer})</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Werkzaamheden</label>
            <div className="flex gap-2 mt-1">
              {["monteren", "schakelen"].map(w => (
                <button key={w} type="button" onClick={() => setType(w)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold capitalize" style={{ background: type === w ? "rgba(63,255,139,0.1)" : "#030e20", border: type === w ? "1px solid rgba(63,255,139,0.3)" : "1px solid rgba(106,118,140,0.15)", color: type === w ? "#3fff8b" : "#a0abc3" }}>
                  {w}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Uren</label>
            <div className="flex items-center justify-center gap-6 mt-2">
              <button type="button" onClick={() => setUren(u => Math.max(0.5, u - 0.5))} className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "#102038", color: "#a0abc3" }}>−</button>
              <span className="text-3xl font-bold tabular-nums" style={{ color: "#dae6ff" }}>{uren}u</span>
              <button type="button" onClick={() => setUren(u => Math.min(24, u + 0.5))} className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "#102038", color: "#a0abc3" }}>+</button>
            </div>
            <div className="flex justify-center gap-2 mt-2">
              {[4, 6, 8, 9, 10].map(h => (
                <button key={h} type="button" onClick={() => setUren(h)} className="px-3 py-1 rounded-lg text-xs font-medium" style={{ background: uren === h ? "rgba(63,255,139,0.1)" : "#030e20", border: uren === h ? "1px solid rgba(63,255,139,0.3)" : "1px solid rgba(106,118,140,0.15)", color: uren === h ? "#3fff8b" : "#a0abc3" }}>
                  {h}u
                </button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} className="w-full py-3.5 rounded-2xl text-sm font-bold transition-all disabled:opacity-40" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)", color: "#fff" }}>
          {saving ? "Opslaan..." : "Opslaan"}
        </button>
      </div>
    </div>
  );
}
