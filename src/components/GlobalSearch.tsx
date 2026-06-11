import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Search, X, FolderOpen, Users, Bell, FileText, Briefcase,
  UserPlus, LayoutGrid, Building2,
} from "lucide-react";
import { SEARCH_PAGES } from "@/lib/searchPages";

type ResultType =
  | "page" | "project" | "inkooporder"
  | "medewerker" | "onderaannemer"
  | "opdrachtgever" | "kandidaat" | "mededeling";

interface SearchResult {
  type: ResultType;
  id: string;
  title: string;
  subtitle: string;
  path: string;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q || !text) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "var(--accent-light)", color: "var(--accent)", padding: 0, borderRadius: 2 }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

const SECTION_ORDER: ResultType[] = [
  "page", "project", "inkooporder", "medewerker",
  "onderaannemer", "opdrachtgever", "kandidaat", "mededeling",
];
const SECTION_LABELS: Record<ResultType, string> = {
  page: "Pagina's",
  project: "Projecten",
  inkooporder: "Inkooporders",
  medewerker: "Medewerkers",
  onderaannemer: "Onderaannemers",
  opdrachtgever: "Opdrachtgevers",
  kandidaat: "Kandidaten",
  mededeling: "Berichten",
};
const ICON_MAP: Record<ResultType, typeof Search> = {
  page: LayoutGrid,
  project: FolderOpen,
  inkooporder: FileText,
  medewerker: Users,
  onderaannemer: Briefcase,
  opdrachtgever: Building2,
  kandidaat: UserPlus,
  mededeling: Bell,
};

const MAX_PER_CATEGORY = 5;

export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { permissies } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const reqIdRef = useRef(0);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [onClose]);

  const doSearch = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (q.length < 2) {
      setResults([]); setError(null); setLoading(false);
      reqIdRef.current++;
      return;
    }
    const myReq = ++reqIdRef.current;
    setLoading(true); setError(null);
    const term = `%${q.replace(/[%_]/g, m => `\\${m}`)}%`;

    try {
      const tasks: Promise<SearchResult[]>[] = [];

      // ── statische pagina's
      const lower = q.toLowerCase();
      const pageHits = SEARCH_PAGES.filter(p =>
        p.check(permissies) &&
        (p.label.toLowerCase().includes(lower) || (p.keywords || []).some(k => k.includes(lower)))
      ).slice(0, MAX_PER_CATEGORY).map(p => ({
        type: "page" as const, id: p.path, title: p.label, subtitle: "Pagina", path: p.path,
      }));
      tasks.push(Promise.resolve(pageHits));

      // ── projecten
      if (permissies.zietProjecten) {
        tasks.push((async () => {
          const { data } = await supabase
            .from("projects")
            .select("id, naam, nummer, adres, stationsnaam")
            .or(`naam.ilike.${term},nummer.ilike.${term},adres.ilike.${term},stationsnaam.ilike.${term}`)
            .limit(MAX_PER_CATEGORY);
          return (data || []).map((p: any) => ({
            type: "project" as const,
            id: p.id,
            title: p.naam || p.nummer || "Project",
            subtitle: [p.nummer, p.stationsnaam, p.adres].filter(Boolean).join(" · "),
            path: `/projecten?focus=${encodeURIComponent(p.id)}`,
          }));
        })());
      }

      // ── medewerkers (geen onderaannemers)
      if (permissies.zietTeam) {
        tasks.push((async () => {
          const { data } = await supabase
            .from("profiles")
            .select("id, full_name, is_onderaannemer")
            .ilike("full_name", term)
            .limit(MAX_PER_CATEGORY * 2);
          return (data || [])
            .filter((p: any) => !p.is_onderaannemer)
            .slice(0, MAX_PER_CATEGORY)
            .map((p: any) => ({
              type: "medewerker" as const,
              id: p.id,
              title: p.full_name || "Medewerker",
              subtitle: "Medewerker",
              path: `/medewerkers?focus=${encodeURIComponent(p.id)}`,
            }));
        })());

        // ── onderaannemers (bedrijfsnaam + contactpersoon)
        tasks.push((async () => {
          const { data } = await supabase
            .from("profiles")
            .select("id, full_name, bedrijfsnaam")
            .eq("is_onderaannemer", true)
            .or(`full_name.ilike.${term},bedrijfsnaam.ilike.${term}`)
            .limit(MAX_PER_CATEGORY);
          return (data || []).map((p: any) => ({
            type: "onderaannemer" as const,
            id: p.id,
            title: p.bedrijfsnaam || p.full_name || "Onderaannemer",
            subtitle: p.bedrijfsnaam ? p.full_name : "Onderaannemer",
            path: `/onderaannemers?focus=${encodeURIComponent(p.id)}`,
          }));
        })());
      }

      // ── opdrachtgevers (alleen managers/team-beheer)
      if (permissies.magTeamBeheren) {
        tasks.push((async () => {
          const { data } = await supabase
            .from("opdrachtgevers")
            .select("id, naam, contactpersoon")
            .or(`naam.ilike.${term},contactpersoon.ilike.${term}`)
            .limit(MAX_PER_CATEGORY);
          return (data || []).map((o: any) => ({
            type: "opdrachtgever" as const,
            id: o.id,
            title: o.naam || "Opdrachtgever",
            subtitle: o.contactpersoon || "Opdrachtgever",
            path: `/opdrachtgevers?focus=${encodeURIComponent(o.id)}`,
          }));
        })());
      }

      // ── kandidaten
      if (permissies.zietKandidaten) {
        tasks.push((async () => {
          const { data } = await supabase
            .from("kandidaten")
            .select("id, voornaam, achternaam, email")
            .or(`voornaam.ilike.${term},achternaam.ilike.${term},email.ilike.${term}`)
            .limit(MAX_PER_CATEGORY);
          return (data || []).map((k: any) => ({
            type: "kandidaat" as const,
            id: k.id,
            title: `${k.voornaam || ""} ${k.achternaam || ""}`.trim() || k.email || "Kandidaat",
            subtitle: k.email || "Kandidaat",
            path: `/kandidaten?focus=${encodeURIComponent(k.id)}`,
          }));
        })());
      }

      // ── inkooporders (RLS bepaalt zichtbaarheid; concept verbergen voor niet-managers)
      if (permissies.zietInkooporders) {
        tasks.push((async () => {
          let qb = supabase
            .from("inkooporders")
            .select("id, order_nummer, status")
            .ilike("order_nummer", term);
          if (!permissies.zietAlleInkooporders) {
            qb = qb.neq("status", "concept");
          }
          const { data } = await qb.limit(MAX_PER_CATEGORY);
          const base = permissies.zietAlleInkooporders ? "/inkooporders" : "/mijn-orders";
          return (data || []).map((o: any) => ({
            type: "inkooporder" as const,
            id: o.id,
            title: o.order_nummer || "Order",
            subtitle: o.status ? `Status: ${o.status}` : "Inkooporder",
            path: `${base}?focus=${encodeURIComponent(o.id)}`,
          }));
        })());
      }

      // ── berichten / gesprekken
      if (permissies.zietMededelingen) {
        tasks.push((async () => {
          const { data } = await supabase
            .from("gesprekken")
            .select("id, onderwerp, laatste_bericht_preview, laatste_bericht_op")
            .or(`onderwerp.ilike.${term},laatste_bericht_preview.ilike.${term}`)
            .order("laatste_bericht_op", { ascending: false })
            .limit(MAX_PER_CATEGORY);
          return (data || []).map((m: any) => ({
            type: "mededeling" as const,
            id: m.id,
            title: m.onderwerp || "Gesprek",
            subtitle: m.laatste_bericht_preview || "Bericht",
            path: `/mededelingen?focus=${encodeURIComponent(m.id)}`,
          }));
        })());
      }

      const grouped = await Promise.all(tasks);
      if (myReq !== reqIdRef.current) return; // stale, negeer

      // Dedup op type+id
      const seen = new Set<string>();
      const flat: SearchResult[] = [];
      for (const arr of grouped) {
        for (const r of arr) {
          const key = `${r.type}:${r.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          flat.push(r);
        }
      }
      setResults(flat);
      setActiveIndex(flat.length > 0 ? 0 : -1);
    } catch (e) {
      if (myReq === reqIdRef.current) setError("Zoeken mislukt. Probeer opnieuw.");
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  }, [permissies]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  const handleSelect = (r: SearchResult) => {
    onClose();
    navigate(r.path);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      handleSelect(results[Math.max(0, activeIndex)]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center"
      style={{ paddingTop: isMobile ? 0 : "12vh" }}
      onClick={onClose}
    >
      <div
        className="absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--text-primary) 40%, transparent)", backdropFilter: "blur(8px)" }}
      />
      <div
        className="relative w-full flex flex-col overflow-hidden"
        style={{
          maxWidth: isMobile ? "100%" : 560,
          height: isMobile ? "100dvh" : "auto",
          maxHeight: isMobile ? "100dvh" : "75vh",
          borderRadius: isMobile ? 0 : 16,
          background: "var(--bg-surface)",
          border: "1px solid var(--planning-border-soft)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--planning-border-soft)" }}>
          <Search className="h-5 w-5 shrink-0" style={{ color: "var(--text-muted)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Zoek projecten, medewerkers, orders, berichten…"
            className="flex-1 text-base bg-transparent outline-none"
            style={{ color: "var(--text-primary)" }}
            aria-label="Globale zoekbalk"
          />
          {loading && (
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Zoeken…</span>
          )}
          <button onClick={onClose} aria-label="Sluiten">
            <X className="h-5 w-5" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {query.trim().length < 2 ? (
            <p className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>
              Typ minimaal 2 tekens om te zoeken…
            </p>
          ) : error ? (
            <p className="text-center py-8 text-sm" style={{ color: "var(--danger)" }}>{error}</p>
          ) : results.length === 0 && !loading ? (
            <p className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>
              Geen resultaten voor "{query}"
            </p>
          ) : (
            SECTION_ORDER.map(type => {
              const items = results.filter(r => r.type === type);
              if (items.length === 0) return null;
              const Icon = ICON_MAP[type];
              return (
                <div key={type}>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    {SECTION_LABELS[type]}
                  </p>
                  {items.map(r => {
                    const gi = results.indexOf(r);
                    return (
                      <button
                        key={`${r.type}:${r.id}`}
                        onClick={() => handleSelect(r)}
                        onMouseEnter={() => setActiveIndex(gi)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                        style={{ background: activeIndex === gi ? "var(--accent-light)" : "transparent" }}
                      >
                        <Icon className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                            <Highlight text={r.title} query={query} />
                          </p>
                          {r.subtitle && (
                            <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{r.subtitle}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
