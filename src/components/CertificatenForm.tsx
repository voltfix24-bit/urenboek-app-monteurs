import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CERT_CONFIG, type CertConfig } from "@/lib/certificaten";
import { Info, AlertCircle, ExternalLink, X } from "lucide-react";

interface Props {
  medewerker_id: string;
  onSaved: () => void;
  onCancel?: () => void;
}

interface CertState {
  checked: boolean;
  niveaus: string[];
  vervaldatum: string;
  gebieden: string[];
}

export default function CertificatenForm({ medewerker_id, onSaved, onCancel }: Props) {
  const [state, setState] = useState<Record<string, CertState>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPoortInfo, setShowPoortInfo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExisting();
  }, [medewerker_id]);

  const loadExisting = async () => {
    const { data } = await supabase.from("certificaten").select("*").eq("medewerker_id", medewerker_id);
    const initial: Record<string, CertState> = {};
    for (const cfg of CERT_CONFIG) {
      initial[cfg.type] = { checked: false, niveaus: [], vervaldatum: "", gebieden: [] };
    }
    if (data) {
      for (const cert of data) {
        const t = cert.type as string;
        if (!initial[t]) continue;
        initial[t].checked = true;
        if (cert.subtype && !initial[t].niveaus.includes(cert.subtype)) {
          initial[t].niveaus.push(cert.subtype);
        }
        if (cert.vervaldatum) initial[t].vervaldatum = cert.vervaldatum;
        if (cert.ggi_gebieden) {
          for (const g of cert.ggi_gebieden as string[]) {
            if (!initial[t].gebieden.includes(g)) initial[t].gebieden.push(g);
          }
        }
      }
    }
    setState(initial);
    setLoading(false);
  };

  const toggle = (type: string) => {
    setState(s => ({
      ...s,
      [type]: { ...s[type], checked: !s[type]?.checked }
    }));
    setErrors(e => { const n = { ...e }; delete n[type]; return n; });
  };

  const setNiveau = (type: string, niveau: string) => {
    setState(s => {
      const cur = s[type]?.niveaus || [];
      return {
        ...s,
        [type]: {
          ...s[type],
          niveaus: cur.includes(niveau) ? cur.filter(n => n !== niveau) : [...cur, niveau]
        }
      };
    });
    setErrors(e => { const n = { ...e }; delete n[type]; return n; });
  };

  const setDatum = (type: string, datum: string) => {
    setState(s => ({ ...s, [type]: { ...s[type], vervaldatum: datum } }));
    setErrors(e => { const n = { ...e }; delete n[type]; return n; });
  };

  const setGebied = (type: string, code: string) => {
    setState(s => {
      const cur = s[type]?.gebieden || [];
      return {
        ...s,
        [type]: {
          ...s[type],
          gebieden: cur.includes(code) ? cur.filter(g => g !== code) : [...cur, code]
        }
      };
    });
    setErrors(e => { const n = { ...e }; delete n[type]; return n; });
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    for (const cfg of CERT_CONFIG) {
      const s = state[cfg.type];
      if (!s?.checked) continue;
      if (cfg.heeftNiveau && s.niveaus.length === 0) {
        errs[cfg.type] = "Selecteer minimaal één niveau";
      }
      if (cfg.heeftVervaldatum && !s.vervaldatum) {
        errs[cfg.type] = "Vul een geldigheidsdatum in";
      }
      if (cfg.heeftGebieden && s.gebieden.length === 0) {
        errs[cfg.type] = "Selecteer minimaal één gebied";
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    const checkedTypes = CERT_CONFIG.filter(c => state[c.type]?.checked).map(c => c.type);

    if (checkedTypes.length > 0) {
      await supabase.from("certificaten").delete()
        .eq("medewerker_id", medewerker_id)
        .in("type", checkedTypes);
    }

    const uncheckedTypes = CERT_CONFIG.filter(c => !state[c.type]?.checked).map(c => c.type);
    if (uncheckedTypes.length > 0) {
      await supabase.from("certificaten").delete()
        .eq("medewerker_id", medewerker_id)
        .in("type", uncheckedTypes);
    }

    const inserts: any[] = [];
    for (const cfg of CERT_CONFIG) {
      const s = state[cfg.type];
      if (!s?.checked) continue;

      if (cfg.heeftNiveau && s.niveaus.length > 0) {
        for (const niveau of s.niveaus) {
          inserts.push({
            medewerker_id,
            type: cfg.type,
            subtype: niveau,
            naam: `${cfg.label} - ${niveau}`,
            vervaldatum: s.vervaldatum || null,
          });
        }
      } else if (cfg.heeftGebieden && s.gebieden.length > 0) {
        for (const gebied of s.gebieden) {
          const gebiedLabel = cfg.gebieden?.find(g => g.code === gebied)?.label || gebied;
          inserts.push({
            medewerker_id,
            type: cfg.type,
            naam: `GGI - ${gebiedLabel}`,
            ggi_gebieden: s.gebieden,
            vervaldatum: null,
          });
        }
        const ggiInserts = inserts.filter(i => i.type === "GGI");
        if (ggiInserts.length > 1) {
          const allGebieden = s.gebieden;
          const removeCount = ggiInserts.length - 1;
          for (let i = 0; i < removeCount; i++) {
            const idx = inserts.findIndex(ins => ins.type === "GGI");
            if (idx > -1) inserts.splice(idx, 1);
          }
          const remaining = inserts.find(ins => ins.type === "GGI");
          if (remaining) {
            remaining.naam = `GGI - ${allGebieden.map(g => cfg.gebieden?.find(gb => gb.code === g)?.label || g).join(", ")}`;
            remaining.ggi_gebieden = allGebieden;
          }
        }
      } else if (cfg.type === "POORT") {
        inserts.push({
          medewerker_id,
          type: cfg.type,
          naam: cfg.kortLabel || cfg.label,
          vervaldatum: null,
        });
      } else {
        inserts.push({
          medewerker_id,
          type: cfg.type,
          naam: cfg.label,
          vervaldatum: s.vervaldatum || null,
        });
      }
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from("certificaten").insert(inserts);
      if (error) {
        toast.error("Fout bij opslaan: " + error.message);
        setSaving(false);
        return;
      }
    }

    toast.success("Certificaten opgeslagen ✓");
    setSaving(false);
    onSaved();
  };

  if (loading) return (
    <div className="flex items-center justify-center py-8">
      <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
    </div>
  );

  return (
    <div className="space-y-3">
      {CERT_CONFIG.map(cfg => {
        const s = state[cfg.type] || { checked: false, niveaus: [], vervaldatum: "", gebieden: [] };
        const isChecked = s.checked;

        return (
          <div key={cfg.type} className="rounded-[14px] transition-all" style={{
            background: isChecked ? "var(--accent-light)" : "var(--bg-surface)",
            border: isChecked ? "1.5px solid var(--accent-border)" : "1px solid var(--border)",
            padding: "14px 16px",
            opacity: isChecked ? 1 : 0.8,
            cursor: "pointer",
          }}>
            <div className="flex items-center gap-3" onClick={() => toggle(cfg.type)}>
              <div className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{
                background: isChecked ? "var(--accent)" : "var(--bg-base)",
                border: isChecked ? "none" : "1.5px solid var(--border-strong)",
              }}>
                {isChecked && <span className="text-white text-xs font-bold">✓</span>}
              </div>
              <span className="text-sm font-semibold flex-1" style={{ color: "var(--text-primary)" }}>
                {cfg.kortLabel || cfg.label}
              </span>
              {cfg.type === "POORT" && (
                <button type="button" onClick={e => { e.stopPropagation(); setShowPoortInfo(true); }} className="shrink-0">
                  <AlertCircle className="h-4 w-4" style={{ color: "var(--warn-text)" }} />
                </button>
              )}
            </div>

            {isChecked && (
              <div className="mt-3 space-y-3" onClick={e => e.stopPropagation()}>
                {cfg.heeftNiveau && cfg.niveaus && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Niveau</span>
                    <div className="flex gap-2 flex-wrap">
                      {cfg.niveaus.map(n => {
                        const sel = s.niveaus.includes(n);
                        return (
                          <button key={n} type="button" onClick={() => setNiveau(cfg.type, n)} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors" style={{
                            background: sel ? "var(--accent-light)" : "var(--bg-base)",
                            border: sel ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                            color: sel ? "var(--accent)" : "var(--text-muted)",
                            fontWeight: sel ? 600 : 400,
                          }}>{n}</button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {cfg.heeftGebieden && cfg.gebieden && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                      Vink aan welke gebieden je hebt (met screenshot vanuit Certwell)
                    </span>
                    <div className="flex gap-2 flex-wrap">
                      {cfg.gebieden.map(g => {
                        const sel = s.gebieden.includes(g.code);
                        return (
                          <button key={g.code} type="button" onClick={() => setGebied(cfg.type, g.code)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                            style={{
                              background: sel ? "var(--accent-light)" : "var(--bg-base)",
                              border: sel ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                              color: sel ? "var(--accent)" : "var(--text-muted)",
                              fontWeight: sel ? 600 : 400,
                            }}
                            title={g.info || undefined}
                          >
                            {g.label}
                            {g.info && <Info className="h-3 w-3" style={{ color: "var(--text-muted)" }} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {cfg.heeftVervaldatum && (
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Geldig tot</span>
                    <input type="date" value={s.vervaldatum} onChange={e => setDatum(cfg.type, e.target.value)}
                      className="w-full px-3 py-2 rounded-[10px] text-[13px]"
                      style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)", colorScheme: "light", marginTop: 4 }}
                    />
                  </div>
                )}

                {cfg.type === "POORT" && (
                  <p className="text-xs" style={{ color: "var(--success)" }}>✓ Geregistreerd als behaald</p>
                )}

                {errors[cfg.type] && (
                  <p className="text-xs font-medium" style={{ color: "var(--danger)" }}>{errors[cfg.type]}</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      <button onClick={handleSave} disabled={saving}
        className="w-full py-[14px] rounded-[14px] text-[15px] font-bold text-white disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", marginTop: 16 }}
      >
        {saving ? "Opslaan..." : "Opslaan"}
      </button>

      {onCancel && (
        <button onClick={onCancel} className="w-full py-2.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Overslaan
        </button>
      )}

      {showPoortInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowPoortInfo(false)}>
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--text-primary) 35%, transparent)", backdropFilter: "blur(6px)" }} />
          <div className="relative rounded-xl p-4 space-y-3 max-w-[300px] w-full" onClick={e => e.stopPropagation()} style={{
            background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", zIndex: 100,
          }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Poortinstructie TSO/DSO</h3>
              <button onClick={() => setShowPoortInfo(false)}><X className="h-4 w-4" style={{ color: "var(--text-muted)" }} /></button>
            </div>
            <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: "var(--text-primary)" }}>
              {CERT_CONFIG.find(c => c.type === "POORT")?.info}
            </p>
            <a href="https://www.poortinstructienetbeheernederland.nl" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent)" }}>
              <ExternalLink className="h-3 w-3" /> www.poortinstructienetbeheernederland.nl
            </a>
            <button onClick={() => setShowPoortInfo(false)} className="w-full py-2 rounded-xl text-xs font-semibold"
              style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              Sluiten
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
