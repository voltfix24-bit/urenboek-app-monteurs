import { useState, useEffect, useCallback } from "react";
import { ListSkeleton, GoedkeuringCardSkeleton } from "@/components/ui/Skeletons";
import { HeaderLogo } from "@/components/HeaderLogo";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { PullToRefresh } from "@/components/PullToRefresh";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { Check, X, ChevronLeft, ChevronRight, Calendar, CheckCheck, CheckCircle, AlertTriangle } from "lucide-react";
import { checkOveruren } from "@/lib/overurenCheck";
import { useNavigate } from "react-router-dom";
import { useGoedkeuring } from "@/hooks/useGoedkeuring";
import { format, startOfWeek, addDays } from "date-fns";
import { nl } from "date-fns/locale";

interface EntryWithProfile {
  id: string; datum: string; project_naam: string; project_nummer: string; beschrijving: string;
  uren: number; status: string; medewerker_id: string; full_name: string; afkeur_reden: string | null;
  project_id: string;
}

export default function Goedkeuring() {
  const { isManager, user } = useAuth();
  const { profileId: myProfileId } = useProfile();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>("ingediend");
  const [weekOffset, setWeekOffset] = useState(0);
  const [afkeurId, setAfkeurId] = useState<string | null>(null);
  const [afkeurReden, setAfkeurReden] = useState("");
  const [overurenIds, setOverurenIds] = useState<Set<string>>(new Set());
  const [selectedMonteur, setSelectedMonteur] = useState<string | null>(null);

  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);

  const { entries: rawEntries, loading, refetch: fetchEntries } = useGoedkeuring(weekStart, "alle");

  // Map to EntryWithProfile shape for existing render logic
  const entries: EntryWithProfile[] = rawEntries.map(e => ({
    id: e.id, datum: e.datum, project_naam: e.project_naam, project_nummer: e.project_nummer,
    beschrijving: e.beschrijving || e.type || "", uren: e.uren, status: e.status,
    medewerker_id: e.medewerker_id, full_name: e.full_name,
    afkeur_reden: e.afkeur_reden, project_id: e.project_id,
  }));

  // Fetch overuren meldingen for this week
  useEffect(() => {
    const fetchOveruren = async () => {
      const { data: ouData } = await supabase
        .from("overuren_meldingen")
        .select("medewerker_id, datum")
        .eq("status", "open")
        .gte("datum", format(weekStart, "yyyy-MM-dd"))
        .lte("datum", format(weekEnd, "yyyy-MM-dd"));
      if (ouData) {
        const ids = new Set(ouData.map((m: any) => `${m.medewerker_id}_${m.datum}`));
        setOverurenIds(ids);
      }
    };
    fetchOveruren();
  }, [weekOffset]);

  const updateStatus = async (id: string, status: string, reden?: string) => {
    const entry = entries.find(e => e.id === id);
    const update: any = { status, approved_by: myProfileId };
    if (reden) update.afkeur_reden = reden;
    if (!await mutate(supabase.from("uren_boekingen").update(update).eq("id", id))) return;
    toast.success(status === "goedgekeurd" ? "Goedgekeurd!" : "Afgekeurd");
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
    toast.success(`${userEntries.length} uren goedgekeurd voor ${userName}`);
    fetchEntries();
  };

  const filteredEntries = entries.filter((e) => filter === "alle" || e.status === filter);
  const grouped = filteredEntries.reduce<Record<string, EntryWithProfile[]>>((acc, e) => {
    if (!acc[e.full_name]) acc[e.full_name] = [];
    acc[e.full_name].push(e);
    return acc;
  }, {});
  const totalIngediend = entries.filter((e) => e.status === "ingediend").length;

  const statusConfig: Record<string, { bg: string; text: string; dot: string }> = {
    ingediend: { bg: "var(--warn-light)", text: "var(--warn-text)", dot: "var(--warn-dot)" },
    goedgekeurd: { bg: "var(--success-light)", text: "var(--success)", dot: "var(--success)" },
    afgekeurd: { bg: "var(--danger-light)", text: "var(--danger)", dot: "var(--danger)" },
    concept: { bg: "var(--bg-surface-2)", text: "var(--text-secondary)", dot: "var(--text-muted)" },
  };

  if (!isManager) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}><p style={{ color: "var(--text-muted)" }}>Alleen managers hebben toegang.</p></div>;
  }



  const mainContent = (
    <main className="px-4 py-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-xl p-0.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <button className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }} onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button className="px-2 py-1 rounded-lg text-[11px] font-medium" style={{ color: "var(--text-secondary)" }} onClick={() => setWeekOffset(0)}>
            <Calendar className="h-3 w-3 inline mr-1" />Vandaag
          </button>
          <button className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }} onClick={() => setWeekOffset((w) => w + 1)}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
          {format(weekStart, "d MMM", { locale: nl })} – {format(weekEnd, "d MMM", { locale: nl })}
        </span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {([["ingediend", "Ingediend"], ["goedgekeurd", "Goedgekeurd"], ["afgekeurd", "Afgekeurd"], ["alle", "Alle"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors" style={{
            background: filter === k ? "var(--accent-light)" : "var(--bg-surface)",
            border: filter === k ? "1px solid var(--accent-border)" : "1px solid var(--border)",
            color: filter === k ? "var(--accent)" : "var(--text-muted)",
          }}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <ListSkeleton count={3} ItemSkeleton={GoedkeuringCardSkeleton} />
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-10 rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <CheckCircle className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--accent)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Geen uren gevonden</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Geen uren met deze filter voor deze week</p>
        </div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="lg:hidden space-y-4">
            {renderGroupedCards(grouped)}
          </div>
          {/* Desktop: 2-column layout */}
          <div className="hidden lg:flex gap-4">
            <div className="w-[40%] space-y-2">
              {Object.entries(grouped).map(([name, userEntries]) => {
                const totalHours = userEntries.reduce((s, e) => s + e.uren, 0);
                const pendingCount = userEntries.filter((e) => e.status === "ingediend").length;
                const isSelected = selectedMonteur === name;
                return (
                  <button key={name} onClick={() => setSelectedMonteur(name)} className="w-full text-left rounded-2xl p-4 transition-colors" style={{
                    background: isSelected ? "var(--accent-light)" : "var(--bg-surface)",
                    border: isSelected ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                  }}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-xs font-bold" style={{ color: "#fff" }}>
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>{name}</p>
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{userEntries.length} boekingen · {totalHours}u</p>
                      </div>
                      {pendingCount > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "var(--warn-light)", color: "var(--warn-text)" }}>
                          {pendingCount}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="w-[60%]">
              {selectedMonteur && grouped[selectedMonteur] ? (
                <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between px-4 py-3" style={{ background: "var(--bg-surface-2)" }}>
                    <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{selectedMonteur}</span>
                    {grouped[selectedMonteur].some(e => e.status === "ingediend") && (
                      <button onClick={() => approveAllForUser(selectedMonteur)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold" style={{ background: "var(--success-light)", border: "1px solid var(--success-border)", color: "var(--success)" }}>
                        <CheckCheck className="h-3.5 w-3.5" /> Alles goedkeuren
                      </button>
                    )}
                  </div>
                  <div className="divide-y" style={{ borderColor: "var(--bg-surface-2)" }}>
                    {grouped[selectedMonteur].map((entry) => {
                      const sc = statusConfig[entry.status] || statusConfig.concept;
                      const hasOveruren = overurenIds.has(`${entry.medewerker_id}_${entry.datum}`);
                      return (
                        <div key={entry.id} className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-medium min-w-[60px]" style={{ color: "var(--text-muted)" }}>
                              {format(new Date(entry.datum), "EEE d/M", { locale: nl })}
                            </span>
                            <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                              {entry.project_nummer}
                            </span>
                            <span className="text-xs flex-1 truncate min-w-0" style={{ color: "var(--text-primary)" }}>{entry.project_naam} {entry.beschrijving ? `· ${entry.beschrijving}` : ""}</span>
                            <span className="text-xs font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                              {entry.uren}u
                              {hasOveruren && (
                                <span onClick={() => navigate("/overuren")} className="inline cursor-pointer"><AlertTriangle className="h-3 w-3 inline ml-1" style={{ color: "var(--warn-text)" }} /></span>
                              )}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.text }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
                              {entry.status}
                            </span>
                            {entry.status === "ingediend" && (
                              <div className="flex gap-1">
                                <button className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--success-light)", border: "1px solid var(--success-border)" }} onClick={() => updateStatus(entry.id, "goedgekeurd")}>
                                  <Check className="h-4 w-4" style={{ color: "var(--success)" }} />
                                </button>
                                <button className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--danger-light)", border: "1px solid var(--danger-border)" }} onClick={() => setAfkeurId(entry.id)}>
                                  <X className="h-4 w-4" style={{ color: "var(--danger)" }} />
                                </button>
                              </div>
                            )}
                          </div>
                          {entry.status === "afgekeurd" && entry.afkeur_reden && (
                            <p className="text-[10px] italic mt-1" style={{ color: "var(--danger)" }}>Reden: {entry.afkeur_reden}</p>
                          )}
                          {afkeurId === entry.id && (
                            <div className="mt-2 space-y-2">
                              <textarea value={afkeurReden} onChange={e => setAfkeurReden(e.target.value)} placeholder="Reden voor afkeuring (verplicht)" rows={2} className="w-full px-3 py-2 rounded-xl text-sm resize-none" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                              <div className="flex gap-2">
                                <button onClick={() => afkeurReden.trim() ? updateStatus(afkeurId, "afgekeurd", afkeurReden.trim()) : toast.error("Vul een reden in")} className="flex-1 py-2 rounded-xl text-xs font-bold" style={{ background: "var(--danger)", color: "#fff" }}>Afkeuren</button>
                                <button onClick={() => { setAfkeurId(null); setAfkeurReden(""); }} className="px-3 py-2 rounded-xl text-xs font-medium" style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>Annuleren</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>Selecteer een monteur</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );

  function renderGroupedCards(grouped: Record<string, EntryWithProfile[]>) {
    return Object.entries(grouped).map(([name, userEntries]) => {
      const totalHours = userEntries.reduce((s, e) => s + e.uren, 0);
      const pendingCount = userEntries.filter((e) => e.status === "ingediend").length;
      return (
        <div key={name} className="rounded-2xl overflow-hidden animate-slide-up" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ background: "var(--bg-surface-2)" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-xs font-bold" style={{ color: "#fff" }}>
                {name.charAt(0).toUpperCase()}
              </div>
              <div>
                <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{name}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{userEntries.length} dag{userEntries.length !== 1 ? "en" : ""} · {totalHours}u</span>
                  {pendingCount > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "var(--warn-light)", color: "var(--warn-text)" }}>
                      {pendingCount} open
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tabular-nums" style={{ color: "var(--accent)" }}>{totalHours}u</span>
              {pendingCount > 0 && (
                <button onClick={() => approveAllForUser(name)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors active:scale-95" style={{ background: "var(--success-light)", border: "1px solid var(--success-border)", color: "var(--success)" }}>
                  <CheckCheck className="h-3.5 w-3.5" /> Alles goedkeuren
                </button>
              )}
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--bg-surface-2)" }}>
            {userEntries.map((entry) => {
              const sc = statusConfig[entry.status] || statusConfig.concept;
              const hasOveruren = overurenIds.has(`${entry.medewerker_id}_${entry.datum}`);
              return (
                <div key={entry.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-medium min-w-[60px]" style={{ color: "var(--text-muted)" }}>
                      {format(new Date(entry.datum), "EEE d/M", { locale: nl })}
                    </span>
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                      {entry.project_nummer}
                    </span>
                    <span className="text-xs flex-1 truncate min-w-0" style={{ color: "var(--text-primary)" }}>{entry.project_naam} {entry.beschrijving ? `· ${entry.beschrijving}` : ""}</span>
                    <span className="text-xs font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {entry.uren}u
                      {hasOveruren && (
                        <span onClick={() => navigate("/overuren")} className="inline cursor-pointer"><AlertTriangle className="h-3 w-3 inline ml-1" style={{ color: "var(--warn-text)" }} /></span>
                      )}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.text }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
                      {entry.status}
                    </span>
                    {entry.status === "ingediend" && (
                      <div className="flex gap-1">
                        <button className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors" style={{ background: "var(--success-light)", border: "1px solid var(--success-border)" }} onClick={() => updateStatus(entry.id, "goedgekeurd")}>
                          <Check className="h-4 w-4" style={{ color: "var(--success)" }} />
                        </button>
                        <button className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors" style={{ background: "var(--danger-light)", border: "1px solid var(--danger-border)" }} onClick={() => setAfkeurId(entry.id)}>
                          <X className="h-4 w-4" style={{ color: "var(--danger)" }} />
                        </button>
                      </div>
                    )}
                  </div>
                  {entry.status === "afgekeurd" && entry.afkeur_reden && (
                    <p className="text-[10px] italic mt-1" style={{ color: "var(--danger)" }}>Reden: {entry.afkeur_reden}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    });
  }

  return (
    <PageShell>
      <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <HeaderLogo />
              <span className="text-base font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Goedkeuren</span>
            </div>
            {totalIngediend > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
                <span className="text-lg font-extrabold" style={{ color: "var(--warn-text)" }}>{totalIngediend}</span>
                <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>open</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="lg:hidden">
        <PullToRefresh onRefresh={async () => { await fetchEntries(); }}>
          {mainContent}
        </PullToRefresh>
      </div>
      <div className="hidden lg:block">
        {mainContent}
      </div>

      {/* Mobile afkeur sheet */}
      {afkeurId && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end justify-center" onClick={() => setAfkeurId(null)}>
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--text-primary) 35%, transparent)", backdropFilter: "blur(6px)" }} />
          <div className="relative w-full animate-sheet-up rounded-t-3xl p-5 space-y-4" style={{ maxWidth: 430, background: "var(--bg-surface)", border: "1px solid var(--border)", borderBottom: "none", paddingBottom: 40 }} onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto" style={{ background: "var(--border)" }} />
            <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Uren afkeuren</h2>
            <textarea value={afkeurReden} onChange={e => setAfkeurReden(e.target.value)} placeholder="Reden voor afkeuring (verplicht)" rows={3} className="w-full px-3 py-2.5 rounded-xl text-sm resize-none" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
            <button onClick={() => afkeurReden.trim() ? updateStatus(afkeurId, "afgekeurd", afkeurReden.trim()) : toast.error("Vul een reden in")} className="w-full py-3 rounded-2xl text-sm font-bold" style={{ background: "var(--danger)", color: "#fff" }}>
              Afkeuren
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
