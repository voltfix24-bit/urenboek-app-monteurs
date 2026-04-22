import { useState, useEffect, useCallback } from "react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { MobileHeader } from "@/components/MobileHeader";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { PullToRefresh } from "@/components/PullToRefresh";
import { volledigAdres } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";

import { format, startOfISOWeek, addDays, addWeeks, getISOWeek } from "date-fns";
import { useNavigate } from "react-router-dom";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import { cachePlanning, getCachedPlanning } from "@/lib/offlineQueue";
import { mutate } from "@/lib/supabaseHelpers";
import { ListSkeleton, PlanningCardSkeleton } from "@/components/ui/Skeletons";
import { BottomNav } from "@/components/BottomNav";
import { useNavBadges } from "@/hooks/useNavBadges";

interface PlanningItem { id: string; datum: string; starttijd: string; eindtijd: string; notitie: string; project_naam: string; project_nummer: string; project_id: string; is_definitief: boolean; project_straat: string | null; project_postcode: string | null; project_stad: string | null; project_adres: string | null; activiteit: string | null; activiteit_kleur: string | null; collega_ids: string[] | null; week_opmerking: string | null; }
interface BeschikbaarheidItem { id: string; type: string; datum_van: string; datum_tot: string; status: string; }
interface ExistingBoeking { id: string; uren: number; status: string; }

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

export default function Planning() {
  const { user } = useAuth();
  const { badges } = useNavBadges();
  const { profileId, profile: profileData } = useProfile();
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => startOfISOWeek(new Date()));
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [beschikbaarheid, setBeschikbaarheid] = useState<BeschikbaarheidItem[]>([]);
  const [collegaMap, setCollegaMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [existingBoekingen, setExistingBoekingen] = useState<Map<string, ExistingBoeking>>(new Map());
  const [showUrenModal, setShowUrenModal] = useState(false);
  const [modalItem, setModalItem] = useState<PlanningItem | null>(null);
  const [urenForm, setUrenForm] = useState({ werkzaamheden: "monteren" as string, uren: 8, toelichting: "" });
  const weekNumber = getISOWeek(weekStart);

  const fetchPlanning = useCallback(async () => {
    if (!user || !profileId) return;
    setLoading(true);
    const startStr = format(weekStart, "yyyy-MM-dd");
    const endStr = format(addDays(weekStart, 6), "yyyy-MM-dd");

    const [{ data }, { data: beschData }, { data: boekData }] = await Promise.all([
      supabase.from("planning").select("id, datum, starttijd, eindtijd, notitie, project_id, activiteit, activiteit_kleur, collega_ids, week_opmerking").eq("medewerker_id", profileId).gte("datum", startStr).lte("datum", endStr).order("datum"),
      supabase.from("beschikbaarheid").select("id, type, datum_van, datum_tot, status").eq("medewerker_id", profileId).eq("status", "goedgekeurd").lte("datum_van", endStr).gte("datum_tot", startStr),
      supabase.from("uren_boekingen").select("id, datum, project_id, uren, status").eq("medewerker_id", profileId).gte("datum", startStr).lte("datum", endStr),
    ]);
    setBeschikbaarheid((beschData ?? []) as any);

    // Map existing boekingen by datum+project_id
    const boekMap = new Map<string, ExistingBoeking>();
    (boekData ?? []).forEach((b: any) => {
      boekMap.set(`${b.datum}|${b.project_id}`, { id: b.id, uren: Number(b.uren), status: b.status });
    });
    setExistingBoekingen(boekMap);

    if (navigator.onLine) {
      if (data) {
        const projectIds = [...new Set(data.map((d: any) => d.project_id))];
        let projMap = new Map();
        let statusMap = new Map<string, boolean>();
        if (projectIds.length > 0) {
          const [{ data: projects }, { data: statuses }] = await Promise.all([
            supabase.from("projects_monteur" as any).select("id, naam, nummer, straat, postcode, stad, adres").in("id", projectIds),
            supabase.from("project_planning_status").select("project_id, is_definitief").in("project_id", projectIds),
          ]);
          projMap = new Map(projects?.map((p: any) => [p.id, p]) ?? []);
          (statuses || []).forEach((s: any) => statusMap.set(s.project_id, s.is_definitief));
        }

        // Load collega names
        const allCollegaIds = [...new Set(data.flatMap((d: any) => d.collega_ids || []))];
        if (allCollegaIds.length > 0) {
          const { data: collegaProfs } = await supabase.from("profiles_public" as any).select("id, full_name").in("id", allCollegaIds);
          setCollegaMap(new Map((collegaProfs ?? []).map((p: any) => [p.id, p.full_name])));
        } else {
          setCollegaMap(new Map());
        }

        setItems(data.map((d: any) => {
          const proj = projMap.get(d.project_id) || { naam: "Onbekend", nummer: "", straat: null, postcode: null, stad: null, adres: null };
          return { id: d.id, datum: d.datum, starttijd: d.starttijd?.slice(0, 5) || "07:00", eindtijd: d.eindtijd?.slice(0, 5) || "16:00", notitie: d.notitie || "", project_naam: (proj as any).naam, project_nummer: (proj as any).nummer, project_id: d.project_id, is_definitief: statusMap.get(d.project_id) ?? false, project_straat: (proj as any).straat, project_postcode: (proj as any).postcode, project_stad: (proj as any).stad, project_adres: (proj as any).adres, activiteit: d.activiteit || null, activiteit_kleur: d.activiteit_kleur || null, collega_ids: d.collega_ids || null, week_opmerking: d.week_opmerking || null };
        }));

        // Cache planning data for offline use
        await cachePlanning(profileId, startStr, data as any[]);
      }
    } else {
      // Offline: use cached data
      const cached = await getCachedPlanning(profileId, startStr);
      if (cached) {
        const projectIds = [...new Set(cached.map((d: any) => d.project_id))];
        let projMap = new Map();
        cached.forEach((d: any) => projMap.set(d.project_id, { naam: "Onbekend", nummer: "" }));

        setItems(cached.map((d: any) => {
          const proj = projMap.get(d.project_id) || { naam: "Onbekend", nummer: "" };
          return { id: d.id, datum: d.datum, starttijd: d.starttijd?.slice(0, 5) || "07:00", eindtijd: d.eindtijd?.slice(0, 5) || "16:00", notitie: d.notitie || "", project_naam: (proj as any).naam, project_nummer: (proj as any).nummer, project_id: d.project_id, is_definitief: false, project_straat: null, project_postcode: null, project_stad: null, project_adres: null, activiteit: d.activiteit || null, activiteit_kleur: d.activiteit_kleur || null, collega_ids: d.collega_ids || null, week_opmerking: d.week_opmerking || null };
        }));
        toast.info("📡 Offline — planning uit cache");
      }
    }
    setLoading(false);
  }, [user, weekStart]);

  useEffect(() => { fetchPlanning(); }, [fetchPlanning]);

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = format(new Date(), "yyyy-MM-dd");

  function openNavigatie(adres: string) {
    const encoded = encodeURIComponent(adres);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    if (isIOS) {
      window.location.href = `maps://maps.apple.com/?daddr=${encoded}`;
      setTimeout(() => { window.open(`https://maps.google.com/?daddr=${encoded}`, "_blank"); }, 500);
    } else if (isAndroid) {
      window.location.href = `google.navigation:q=${encoded}`;
      setTimeout(() => { window.open(`https://maps.google.com/?daddr=${encoded}`, "_blank"); }, 500);
    } else {
      window.open(`https://maps.google.com/?daddr=${encoded}`, "_blank");
    }
  }

  function getBeschikbaarheidForDate(dateStr: string): BeschikbaarheidItem | null {
    return beschikbaarheid.find(b => dateStr >= b.datum_van && dateStr <= b.datum_tot) || null;
  }

  function calcDefaultUren(starttijd: string, eindtijd: string): number {
    const [sh, sm] = starttijd.split(":").map(Number);
    const [eh, em] = eindtijd.split(":").map(Number);
    // 1 uur onbetaalde pauze aftrekken
    const diff = (eh * 60 + em - sh * 60 - sm) / 60 - 1;
    return Math.max(0.5, Math.round(diff * 2) / 2);
  }

  function openUrenModal(item: PlanningItem) {
    setModalItem(item);
    setUrenForm({ werkzaamheden: "monteren", uren: 8, toelichting: "" });
    setShowUrenModal(true);
  }

  const saveUren = async (submitDirect: boolean) => {
    if (!profileId || !modalItem) return;
    const planned = calcDefaultUren(modalItem.starttijd, modalItem.eindtijd);
    const diff = Math.abs(urenForm.uren - planned);
    const needsToelichting = diff > 0.5;
    if (needsToelichting && urenForm.toelichting.trim().length < 3) {
      toast.error("Geef een korte toelichting op de afwijking");
      return;
    }
    const beschrijving = needsToelichting
      ? `${urenForm.werkzaamheden} — afwijking ${urenForm.uren - planned > 0 ? '+' : ''}${(urenForm.uren - planned).toFixed(1)}u: ${urenForm.toelichting.trim()}`
      : urenForm.werkzaamheden;
    // Stap 1: altijd eerst als concept inserten (RLS staat alleen 'concept' toe bij insert)
    const { data: inserted, error: insertErr } = await supabase
      .from("uren_boekingen")
      .insert({
        medewerker_id: profileId,
        project_id: modalItem.project_id,
        datum: modalItem.datum,
        uren: urenForm.uren,
        type: urenForm.werkzaamheden,
        beschrijving,
        status: "concept",
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      toast.error(insertErr?.message || "Kon uren niet opslaan");
      return;
    }
    // Stap 2: bij direct indienen status updaten naar 'ingediend'
    if (submitDirect) {
      const { error: updErr } = await supabase
        .from("uren_boekingen")
        .update({ status: "ingediend" })
        .eq("id", inserted.id);
      if (updErr) {
        toast.error("Opgeslagen als concept, indienen mislukt: " + updErr.message);
        setShowUrenModal(false);
        fetchPlanning();
        return;
      }
    }
    toast.success(submitDirect ? "Verstuurd voor akkoord ✓" : "Uren opgeslagen");
    setShowUrenModal(false);
    fetchPlanning();
  };

  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    concept: { bg: "#102038", text: "#a0abc3", label: "Nog niet ingediend" },
    ingediend: { bg: "rgba(254,179,0,0.1)", text: "#feb300", label: "Wacht op akkoord" },
    goedgekeurd: { bg: "rgba(63,255,139,0.1)", text: "#3fff8b", label: "Goedgekeurd ✓" },
    afgekeurd: { bg: "rgba(255,113,108,0.1)", text: "#ff716c", label: "Niet goedgekeurd" },
  };

  const definitiefItems = items.filter(it => it.is_definitief);
  const allConcept = items.length > 0 && definitiefItems.length === 0;
  // Blokkade voor onboarding accounts
  if (profileData?.account_status === 'onboarding') {
    return (
      <PageShell>
        <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, rgba(10,26,48,0.7) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(106,118,140,0.15)" }}>
          <div className="px-4 py-3 flex items-center gap-2.5">
            <HeaderLogo />
            <span className="text-base font-bold tracking-tight" style={{ color: "#dae6ff" }}>Planning</span>
          </div>
        </header>
        <div style={{ padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
          <h2 className="text-lg font-bold" style={{ color: "#dae6ff", marginBottom: 8 }}>Account nog niet actief</h2>
          <p className="text-sm" style={{ color: "#a0abc3", lineHeight: 1.6, marginBottom: 20 }}>
            Je kunt je planning bekijken zodra je account door een manager is geverifieerd.
          </p>
          <button
            onClick={() => navigate("/onboarding-welkom")}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: "#3fff8b", color: "#fff", border: "none", cursor: "pointer" }}
          >
            Naar onboarding →
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div style={{ background: '#030e20', minHeight: '100dvh', paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 120px)" }}>
        <MobileHeader initials={profileData?.full_name?.charAt(0)?.toUpperCase() || 'U'} />

        <PullToRefresh onRefresh={async () => { await fetchPlanning(); }}>
          <main style={{ padding: '24px 20px' }}>
            {/* ── WEEK HEADER ── */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}>
              <div>
                <p style={{
                  fontSize: 10, fontWeight: 700,
                  fontFamily: 'Inter',
                  textTransform: 'uppercase',
                  letterSpacing: '0.2em',
                  color: '#3fff8b', marginBottom: 4,
                }}>
                  Jouw planning
                </p>
                <h2 style={{
                  fontFamily: 'Manrope',
                  fontWeight: 800, fontSize: 28,
                  color: '#dae6ff', lineHeight: 1,
                  letterSpacing: '-0.5px',
                  marginBottom: 5,
                }}>
                  Week {weekNumber}
                </h2>
                <p style={{
                  fontSize: 12, color: '#a0abc3',
                  fontFamily: 'Inter',
                }}>
                  {format(weekStart, 'EEE d MMM', { locale: nl })}
                  {' — '}
                  {format(addDays(weekStart, 4), 'EEE d MMM', { locale: nl })}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setWeekStart(w => addWeeks(w, -1))}
                  style={{
                    width: 40, height: 40,
                    borderRadius: 12,
                    background: '#0d1f38',
                    border: '1px solid rgba(255,255,255,0.07)',
                    color: '#dae6ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}>
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 20, fontVariationSettings: "'wght' 300" }}>
                    chevron_left
                  </span>
                </button>
                <button
                  onClick={() => setWeekStart(w => addWeeks(w, 1))}
                  style={{
                    width: 40, height: 40,
                    borderRadius: 12,
                    background: '#0d1f38',
                    border: '1px solid rgba(255,255,255,0.07)',
                    color: '#dae6ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}>
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 20, fontVariationSettings: "'wght' 300" }}>
                    chevron_right
                  </span>
                </button>
              </div>
            </div>

            {/* ── WEEK PROGRESS STRIP ── */}
            <div style={{
              display: 'flex', gap: 5,
              marginBottom: 28,
            }}>
              {Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)).map((day, i) => {
                const ds = format(day, 'yyyy-MM-dd');
                const isToday = ds === today;
                const hasItems = items.some(it => it.datum === ds);
                const barColor =
                  isToday ? '#3fff8b'
                  : hasItems ? '#feb300'
                  : 'rgba(255,255,255,0.07)';
                return (
                  <div key={i} style={{ flex: 1 }}>
                    <div style={{
                      height: 3, borderRadius: 2,
                      background: isToday
                        ? `linear-gradient(90deg, #3fff8b 50%, rgba(255,255,255,0.07) 50%)`
                        : barColor,
                      marginBottom: 6,
                    }} />
                    <div style={{
                      fontSize: 9.5,
                      fontFamily: 'Inter',
                      fontWeight: isToday ? 700 : 400,
                      color: isToday ? '#3fff8b' : '#54617A',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                    }}>
                      {['MA','DI','WO','DO','VR'][i]}
                      {' '}{format(day, 'd')}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* LOADING */}
            {loading && (
              <div style={{ textAlign: 'center', padding: 40, color: '#a0abc3', fontFamily: 'Inter' }}>Planning laden...</div>
            )}

            {/* PLANNING LIST */}
            {!loading && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
              }}>
                {Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)).map((day, i) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isToday = dateStr === today;
                  const dayItems = items.filter(it => it.datum === dateStr);
                  const beschItem = getBeschikbaarheidForDate(dateStr);
                  const DOW = ['MA','DI','WO','DO','VR'][i];
                  const isEmpty = !beschItem && dayItems.length === 0;

                  return (
                    <div key={dateStr} style={{
                      display: 'flex',
                      gap: 12,
                      paddingBottom: 16,
                    }}>
                      {/* LEFT RAIL */}
                      <div style={{
                        width: 44,
                        flexShrink: 0,
                        paddingTop: 2,
                      }}>
                        <div style={{
                          fontSize: 10,
                          letterSpacing: '0.8px',
                          fontWeight: 600,
                          fontFamily: 'Inter',
                          textTransform: 'uppercase',
                          color: isToday ? '#3fff8b' : '#54617A',
                          marginBottom: 2,
                        }}>
                          {DOW}
                        </div>
                        <div style={{
                          fontFamily: 'Manrope',
                          fontSize: 26,
                          fontWeight: 700,
                          color: isToday ? '#3fff8b' : '#dae6ff',
                          lineHeight: 1,
                          letterSpacing: '-0.5px',
                        }}>
                          {format(day, 'd')}
                        </div>
                        {isToday && (
                          <span
                            className="material-symbols-outlined"
                            style={{
                              fontSize: 8,
                              color: '#3fff8b',
                              marginTop: 4,
                              display: 'block',
                              fontVariationSettings: "'FILL' 1",
                            }}>
                            radio_button_checked
                          </span>
                        )}
                      </div>

                      {/* RIGHT CARD */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Absent */}
                        {beschItem && (
                          <div style={{
                            borderRadius: 12,
                            border: '1px solid rgba(255,255,255,0.07)',
                            background: '#0d1f38',
                            padding: '14px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            opacity: 0.5,
                          }}>
                            <span
                              className="material-symbols-outlined"
                              style={{
                                fontSize: 20,
                                color: '#a0abc3',
                                fontVariationSettings: "'wght' 300",
                              }}>
                              beach_access
                            </span>
                            <span style={{
                              fontSize: 13,
                              color: '#a0abc3',
                              fontFamily: 'Inter',
                              fontStyle: 'italic',
                            }}>
                              {beschItem.type === 'vakantie' ? 'Vakantie' : 'Afwezig'}
                            </span>
                          </div>
                        )}

                        {/* No planning */}
                        {isEmpty && (
                          <div style={{
                            borderRadius: 12,
                            border: '1px dashed rgba(255,255,255,0.07)',
                            padding: '14px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            opacity: 0.4,
                          }}>
                            <span
                              className="material-symbols-outlined"
                              style={{
                                fontSize: 18,
                                color: '#a0abc3',
                                fontVariationSettings: "'wght' 300",
                              }}>
                              event_busy
                            </span>
                            <span style={{
                              fontSize: 12,
                              color: '#a0abc3',
                              fontFamily: 'Inter',
                            }}>
                              Geen werk gepland
                            </span>
                          </div>
                        )}

                        {/* Project cards */}
                        {!beschItem && dayItems.length > 0 && (
                          <div style={{
                            borderRadius: 12,
                            border: `1px solid ${isToday ? 'rgba(63,255,139,0.25)' : 'rgba(255,255,255,0.07)'}`,
                            background: '#0d1f38',
                            overflow: 'hidden',
                            boxShadow: isToday ? 'inset 3px 0 0 #3fff8b' : 'none',
                          }}>
                            {dayItems.map((item, idx) => {
                              const boeking = existingBoekingen.get(`${dateStr}|${item.project_id}`);
                              const isGeboekt = !!boeking;
                              const isLast = idx === dayItems.length - 1;
                              const adres = volledigAdres({
                                straat: item.project_straat,
                                postcode: item.project_postcode,
                                stad: item.project_stad,
                                adres: item.project_adres,
                              });

                              return (
                                <div key={item.id}>
                                  <div
                                    onClick={() => {
                                      if (!isGeboekt && item.is_definitief) openUrenModal(item);
                                    }}
                                    style={{
                                      padding: '14px 16px',
                                      cursor: isGeboekt || !item.is_definitief ? 'default' : 'pointer',
                                      opacity: item.is_definitief ? 1 : 0.5,
                                    }}>
                                    {/* Top row */}
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'flex-start',
                                      justifyContent: 'space-between',
                                      gap: 8,
                                      marginBottom: 8,
                                    }}>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        {item.activiteit && (
                                          <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 5,
                                            padding: '2px 8px',
                                            borderRadius: 20,
                                            marginBottom: 6,
                                            background: item.activiteit_kleur
                                              ? `${item.activiteit_kleur}22`
                                              : 'rgba(63,255,139,0.1)',
                                            border: `1px solid ${item.activiteit_kleur || '#3fff8b'}44`,
                                          }}>
                                            <span
                                              className="material-symbols-outlined"
                                              style={{
                                                fontSize: 8,
                                                color: item.activiteit_kleur || '#3fff8b',
                                                fontVariationSettings: "'FILL' 1",
                                              }}>
                                              fiber_manual_record
                                            </span>
                                            <span style={{
                                              fontSize: 10,
                                              fontWeight: 600,
                                              fontFamily: 'Inter',
                                              color: item.activiteit_kleur || '#3fff8b',
                                            }}>
                                              {item.activiteit}
                                            </span>
                                          </div>
                                        )}
                                        <div style={{
                                          fontSize: 15,
                                          fontWeight: 700,
                                          fontFamily: 'Manrope',
                                          color: '#dae6ff',
                                          marginBottom: 2,
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                        }}>
                                          {item.project_naam}
                                        </div>
                                        <div style={{
                                          fontSize: 11,
                                          color: '#a0abc3',
                                          fontFamily: 'Inter',
                                        }}>
                                          #{item.project_nummer}
                                        </div>
                                      </div>

                                      {/* Status */}
                                      {isGeboekt ? (
                                        <div style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 4,
                                          padding: '4px 10px',
                                          borderRadius: 9999,
                                          background: 'rgba(63,255,139,0.1)',
                                          border: '1px solid rgba(63,255,139,0.25)',
                                          flexShrink: 0,
                                        }}>
                                          <span
                                            className="material-symbols-outlined"
                                            style={{
                                              fontSize: 13,
                                              color: '#3fff8b',
                                              fontVariationSettings: "'FILL' 1",
                                            }}>
                                            check_circle
                                          </span>
                                          <span style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            fontFamily: 'Inter',
                                            color: '#3fff8b',
                                          }}>
                                            {boeking!.uren}u
                                          </span>
                                        </div>
                                      ) : item.is_definitief ? (
                                        <div style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 4,
                                          padding: '4px 10px',
                                          borderRadius: 9999,
                                          background: isToday ? '#feb300' : 'rgba(254,179,0,0.1)',
                                          border: isToday ? 'none' : '1px solid rgba(254,179,0,0.25)',
                                          flexShrink: 0,
                                        }}>
                                          <span
                                            className="material-symbols-outlined"
                                            style={{
                                              fontSize: 13,
                                              color: isToday ? '#523700' : '#feb300',
                                              fontVariationSettings: "'wght' 300",
                                            }}>
                                            pending
                                          </span>
                                          <span style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            fontFamily: 'Inter',
                                            color: isToday ? '#523700' : '#feb300',
                                          }}>
                                            Boeken
                                          </span>
                                        </div>
                                      ) : (
                                        <div style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 4,
                                          padding: '4px 10px',
                                          borderRadius: 9999,
                                          background: 'rgba(255,255,255,0.04)',
                                          border: '1px solid rgba(255,255,255,0.08)',
                                          flexShrink: 0,
                                        }}>
                                          <span
                                            className="material-symbols-outlined"
                                            style={{
                                              fontSize: 13,
                                              color: '#a0abc3',
                                              fontVariationSettings: "'wght' 300",
                                            }}>
                                            lock
                                          </span>
                                          <span style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            fontFamily: 'Inter',
                                            color: '#a0abc3',
                                          }}>
                                            Concept
                                          </span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Meta */}
                                    <div style={{
                                      display: 'grid',
                                      gridTemplateColumns: '1fr 1fr',
                                      gap: '5px 12px',
                                      marginBottom:
                                        (item.notitie ||
                                         item.week_opmerking ||
                                         (item.collega_ids?.length ?? 0) > 0 ||
                                         adres)
                                          ? 10 : 0,
                                    }}>
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5,
                                      }}>
                                        <span
                                          className="material-symbols-outlined"
                                          style={{
                                            fontSize: 14,
                                            color: '#54617A',
                                            fontVariationSettings: "'wght' 300",
                                          }}>
                                          schedule
                                        </span>
                                        <span style={{
                                          fontSize: 12,
                                          color: '#a0abc3',
                                          fontFamily: 'Inter',
                                        }}>
                                          {item.starttijd}–{item.eindtijd}
                                        </span>
                                      </div>
                                      {item.project_stad && (
                                        <div style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 5,
                                        }}>
                                          <span
                                            className="material-symbols-outlined"
                                            style={{
                                              fontSize: 14,
                                              color: '#54617A',
                                              fontVariationSettings: "'wght' 300",
                                            }}>
                                            location_on
                                          </span>
                                          <span style={{
                                            fontSize: 12,
                                            color: '#a0abc3',
                                            fontFamily: 'Inter',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                          }}>
                                            {item.project_stad}
                                          </span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Colleagues */}
                                    {(item.collega_ids?.length ?? 0) > 0 && (
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        marginBottom: 8,
                                      }}>
                                        <span
                                          className="material-symbols-outlined"
                                          style={{
                                            fontSize: 14,
                                            color: '#54617A',
                                            fontVariationSettings: "'wght' 300",
                                          }}>
                                          group
                                        </span>
                                        <span style={{
                                          fontSize: 11,
                                          color: '#a0abc3',
                                          fontFamily: 'Inter',
                                        }}>
                                          {item.collega_ids!
                                            .map(id => (collegaMap.get(id) || 'Collega').split(' ')[0])
                                            .join(', ')}
                                        </span>
                                      </div>
                                    )}

                                    {/* Note */}
                                    {item.notitie && (
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 6,
                                        padding: '7px 10px',
                                        borderRadius: 8,
                                        background: 'rgba(254,179,0,0.06)',
                                        border: '1px solid rgba(254,179,0,0.15)',
                                        marginBottom: 6,
                                      }}>
                                        <span
                                          className="material-symbols-outlined"
                                          style={{
                                            fontSize: 14,
                                            color: '#feb300',
                                            fontVariationSettings: "'wght' 300",
                                            flexShrink: 0,
                                            marginTop: 1,
                                          }}>
                                          info
                                        </span>
                                        <span style={{
                                          fontSize: 11,
                                          color: '#feb300',
                                          fontFamily: 'Inter',
                                          lineHeight: 1.4,
                                        }}>
                                          {item.notitie}
                                        </span>
                                      </div>
                                    )}

                                    {/* Week remark */}
                                    {item.week_opmerking && (
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 6,
                                        padding: '7px 10px',
                                        borderRadius: 8,
                                        background: 'rgba(254,179,0,0.06)',
                                        border: '1px solid rgba(254,179,0,0.15)',
                                        marginBottom: 6,
                                      }}>
                                        <span
                                          className="material-symbols-outlined"
                                          style={{
                                            fontSize: 14,
                                            color: '#feb300',
                                            fontVariationSettings: "'wght' 300",
                                            flexShrink: 0,
                                            marginTop: 1,
                                          }}>
                                          info
                                        </span>
                                        <span style={{
                                          fontSize: 11,
                                          color: '#feb300',
                                          fontFamily: 'Inter',
                                          lineHeight: 1.4,
                                        }}>
                                          {item.week_opmerking}
                                        </span>
                                      </div>
                                    )}

                                    {/* Navigate */}
                                    {adres && (
                                      <button
                                        onClick={e => {
                                          e.stopPropagation();
                                          openNavigatie(adres);
                                        }}
                                        style={{
                                          marginTop: 4,
                                          width: '100%',
                                          padding: '9px 12px',
                                          borderRadius: 10,
                                          background: 'rgba(63,255,139,0.06)',
                                          border: '1px solid rgba(63,255,139,0.15)',
                                          color: '#3fff8b',
                                          fontSize: 12,
                                          fontWeight: 600,
                                          fontFamily: 'Inter',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: 6,
                                          cursor: 'pointer',
                                        }}>
                                        <span
                                          className="material-symbols-outlined"
                                          style={{
                                            fontSize: 16,
                                            fontVariationSettings: "'wght' 300",
                                          }}>
                                          near_me
                                        </span>
                                        Navigeer
                                      </button>
                                    )}
                                  </div>
                                  {!isLast && (
                                    <div style={{
                                      height: 1,
                                      background: 'rgba(61,72,93,0.5)',
                                      margin: '0 16px',
                                    }} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Empty full week */}
                {items.length === 0 && beschikbaarheid.length === 0 && !loading && (
                  <div style={{
                    textAlign: 'center',
                    padding: '48px 20px',
                  }}>
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: 48,
                        color: '#a0abc3',
                        marginBottom: 12,
                        display: 'block',
                        fontVariationSettings: "'wght' 300",
                      }}>
                      calendar_today
                    </span>
                    <p style={{
                      fontSize: 15,
                      fontWeight: 700,
                      fontFamily: 'Manrope',
                      color: '#dae6ff',
                      marginBottom: 6,
                    }}>
                      Geen bevestigde planning
                    </p>
                    <p style={{
                      fontSize: 13,
                      color: '#a0abc3',
                      fontFamily: 'Inter',
                      lineHeight: 1.6,
                    }}>
                      Je manager heeft de planning nog niet gepubliceerd voor deze week.
                    </p>
                  </div>
                )}
              </div>
            )}
          </main>
        </PullToRefresh>

        <BottomNav badges={badges} />

        {/* UREN MODAL */}
        {showUrenModal && modalItem && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
            onClick={() => setShowUrenModal(false)}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 480, background: 'rgba(10,26,48,0.97)', backdropFilter: 'blur(24px)',
                borderRadius: '40px 40px 0 0', borderTop: '1px solid rgba(255,255,255,0.1)',
                maxHeight: '92dvh',
                display: 'flex', flexDirection: 'column',
              }}
            >
              {/* SCROLLABLE CONTENT */}
              <div style={{ overflowY: 'auto', flex: 1, overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
                <div style={{ width: 48, height: 5, borderRadius: 9999, background: 'rgba(255,255,255,0.2)' }} />
              </div>
              <div style={{ padding: '0 24px' }}>
                <h2 style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 22, color: '#dae6ff', marginBottom: 14 }}>Uren boeken</h2>

                <div style={{ padding: 12, borderRadius: 14, background: '#061327', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 16 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#dae6ff', fontFamily: 'Inter' }}>{modalItem.project_naam}</p>
                  <p style={{ fontSize: 12, color: '#a0abc3', fontFamily: 'Inter', marginTop: 2 }}>
                    {format(new Date(modalItem.datum + 'T12:00:00'), 'EEEE d MMMM', { locale: nl })} · {modalItem.starttijd} – {modalItem.eindtijd}
                  </p>
                </div>

                <p style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a0abc3', marginBottom: 8 }}>Werkzaamheden</p>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  {['schakelen', 'monteren'].map(w => (
                    <button key={w} onClick={() => setUrenForm(f => ({ ...f, werkzaamheden: w }))} style={{
                      flex: 1, padding: '12px 0', borderRadius: 14,
                      border: urenForm.werkzaamheden === w ? '2px solid #3fff8b' : '1px solid rgba(255,255,255,0.07)',
                      background: urenForm.werkzaamheden === w ? 'rgba(63,255,139,0.05)' : '#061327',
                      color: urenForm.werkzaamheden === w ? '#3fff8b' : '#a0abc3',
                      fontFamily: 'Inter', fontWeight: 700, fontSize: 14, textTransform: 'capitalize', cursor: 'pointer',
                    }}>{w}</button>
                  ))}
                </div>

                <p style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a0abc3', marginBottom: 12, textAlign: 'center' }}>Aantal uren</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, marginBottom: 14 }}>
                  <button onClick={() => setUrenForm(f => ({ ...f, uren: Math.max(0.5, f.uren - 0.5) }))} style={{
                    width: 52, height: 52, borderRadius: '50%', background: '#142640', border: '2px solid rgba(255,113,108,0.3)',
                    color: '#dae6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 24 }}>remove</span>
                  </button>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 56, color: '#dae6ff', lineHeight: 1 }}>{urenForm.uren}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Inter', color: '#3fff8b', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 2 }}>UUR</div>
                  </div>
                  <button onClick={() => setUrenForm(f => ({ ...f, uren: Math.min(24, f.uren + 0.5) }))} style={{
                    width: 52, height: 52, borderRadius: '50%', background: 'rgba(63,255,139,0.2)', border: '2px solid rgba(63,255,139,0.3)',
                    color: '#3fff8b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    boxShadow: '0 0 20px rgba(63,255,139,0.15)',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 24 }}>add</span>
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                  {[4, 6, 8, 9, 10].map(h => (
                    <button key={h} onClick={() => setUrenForm(f => ({ ...f, uren: h }))} style={{
                      padding: '8px 16px', borderRadius: 9999,
                      border: urenForm.uren === h ? '2px solid #3fff8b' : '1px solid rgba(255,255,255,0.07)',
                      background: urenForm.uren === h ? 'rgba(63,255,139,0.1)' : '#061327',
                      color: urenForm.uren === h ? '#3fff8b' : '#dae6ff',
                      fontFamily: 'Manrope', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                    }}>{h}u</button>
                  ))}
                </div>

                {(() => {
                  const planned = calcDefaultUren(modalItem.starttijd, modalItem.eindtijd);
                  const delta = urenForm.uren - planned;
                  if (Math.abs(delta) <= 0.5) return null;
                  const isMore = delta > 0;
                  return (
                    <div style={{
                      marginBottom: 16, padding: 14, borderRadius: 14,
                      background: 'rgba(254,179,0,0.08)', border: '1px solid rgba(254,179,0,0.3)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#feb300' }}>warning</span>
                        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Inter', color: '#feb300' }}>
                          Afwijking van planning ({isMore ? '+' : ''}{delta.toFixed(1)}u — gepland {planned}u)
                        </span>
                      </div>
                      <p style={{ fontSize: 11, color: '#a0abc3', fontFamily: 'Inter', marginBottom: 8, lineHeight: 1.4 }}>
                        Geef een korte toelichting waarom je {isMore ? 'meer' : 'minder'} uren boekt dan ingepland.
                      </p>
                      <textarea
                        value={urenForm.toelichting}
                        onChange={e => setUrenForm(f => ({ ...f, toelichting: e.target.value.slice(0, 300) }))}
                        placeholder={isMore ? 'Bijv. extra werk uitgevoerd, uitloop wegens...' : 'Bijv. eerder klaar, kortere pauze...'}
                        rows={2}
                        maxLength={300}
                        style={{
                          width: '100%', padding: 10, borderRadius: 10, background: '#061327',
                          border: '1px solid rgba(254,179,0,0.3)', color: '#dae6ff',
                          fontFamily: 'Inter', fontSize: 13, resize: 'none', outline: 'none',
                        }}
                      />
                      <div style={{ fontSize: 10, color: '#a0abc3', fontFamily: 'Inter', marginTop: 4, textAlign: 'right' }}>
                        {urenForm.toelichting.length}/300
                      </div>
                    </div>
                  );
                })()}

              </div>
              </div>
              {/* STICKY FOOTER */}
              <div style={{
                flexShrink: 0,
                padding: '12px 24px',
                paddingBottom: 'calc(env(safe-area-inset-bottom, 34px) + 12px)',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(10,26,48,0.97)',
              }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => saveUren(false)} style={{
                    flex: 1, height: 56, borderRadius: 16, background: '#3fff8b', color: '#005d2c',
                    fontFamily: 'Manrope', fontWeight: 800, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.05em',
                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: '0 8px 32px rgba(63,255,139,0.2)',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>save</span>
                    CONCEPT
                  </button>
                  <button onClick={() => saveUren(true)} style={{
                    flex: 1, height: 56, borderRadius: 16, background: 'transparent',
                    border: '2px solid #3fff8b', color: '#3fff8b',
                    fontFamily: 'Manrope', fontWeight: 800, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.05em',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>send</span>
                    INDIENEN
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}