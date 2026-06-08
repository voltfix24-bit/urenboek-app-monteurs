import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Search, X, FolderOpen, Users, Bell } from "lucide-react";

interface SearchResult {
  type: "project" | "medewerker" | "mededeling";
  id: string;
  title: string;
  subtitle: string;
}

export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { isManager } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    const searchTerm = `%${q}%`;

    const { data: projects } = await supabase.from("projects").select("id, naam, nummer, case_type").or(`naam.ilike.${searchTerm},nummer.ilike.${searchTerm}`).limit(4);
    const projectResults: SearchResult[] = (projects || []).map((p: any) => ({ type: "project", id: p.id, title: p.naam, subtitle: p.nummer + (p.case_type ? ` · ${p.case_type}` : "") }));

    let medResults: SearchResult[] = [];
    if (isManager) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").ilike("full_name", searchTerm).limit(3);
      medResults = (profiles || []).map((p: any) => ({ type: "medewerker", id: p.id, title: p.full_name, subtitle: "" }));
    }

    const { data: mededelingen } = await supabase.from("mededelingen").select("id, titel, created_at").or(`titel.ilike.${searchTerm},inhoud.ilike.${searchTerm}`).limit(3);
    const mededelingResults: SearchResult[] = (mededelingen || []).map((m: any) => ({ type: "mededeling", id: m.id, title: m.titel, subtitle: new Date(m.created_at).toLocaleDateString("nl-NL") }));

    setResults([...projectResults, ...medResults, ...mededelingResults]);
    setActiveIndex(-1);
  }, [isManager]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  const handleSelect = (r: SearchResult) => {
    onClose();
    if (r.type === "project") navigate("/projecten");
    else if (r.type === "medewerker") navigate("/medewerkers");
    else navigate("/mededelingen");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && activeIndex >= 0) { handleSelect(results[activeIndex]); }
  };

  const iconMap = { project: FolderOpen, medewerker: Users, mededeling: Bell };
  const sectionOrder = ["project", "medewerker", "mededeling"] as const;
  const sectionLabels: Record<string, string> = { project: "Projecten", medewerker: "Medewerkers", mededeling: "Mededelingen" };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--text-primary) 40%, transparent)", backdropFilter: "blur(8px)" }} />
      <div className="relative w-full rounded-2xl overflow-hidden" style={{ maxWidth: 560, maxHeight: "70vh", background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--planning-border-soft)" }}>
          <Search className="h-5 w-5 shrink-0" style={{ color: "var(--text-muted)" }} />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKeyDown} placeholder="Zoek projecten, medewerkers, mededelingen..." className="flex-1 text-base bg-transparent outline-none" style={{ color: "var(--text-primary)" }} />
          <button onClick={onClose}><X className="h-5 w-5" style={{ color: "var(--text-muted)" }} /></button>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: "calc(70vh - 56px)" }}>
          {!query.trim() ? (
            <p className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>Typ om te zoeken...</p>
          ) : results.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>Geen resultaten voor '{query}'</p>
          ) : (
            sectionOrder.map(type => {
              const items = results.filter(r => r.type === type);
              if (items.length === 0) return null;
              const Icon = iconMap[type];
              return (
                <div key={type}>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{sectionLabels[type]}</p>
                  {items.map(r => {
                    const gi = results.indexOf(r);
                    return (
                      <button key={r.id} onClick={() => handleSelect(r)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors" style={{ background: activeIndex === gi ? "var(--accent-light)" : "transparent" }}>
                        <Icon className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{r.title}</p>
                          {r.subtitle && <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{r.subtitle}</p>}
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
