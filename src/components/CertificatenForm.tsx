import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CERT_CONFIG, type CertConfig } from "@/lib/certificaten";
import { Info, AlertCircle, ExternalLink, X, Paperclip, Camera, FolderOpen, Loader2, Check } from "lucide-react";

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
  existingFileUrl: string | null;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
const IS_TOUCH = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;

export default function CertificatenForm({ medewerker_id, onSaved, onCancel }: Props) {
  const [state, setState] = useState<Record<string, CertState>>({});
  const [uploads, setUploads] = useState<Record<string, File | null>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPoortInfo, setShowPoortInfo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    loadExisting();
  }, [medewerker_id]);

  const loadExisting = async () => {
    const { data } = await supabase.from("certificaten").select("*").eq("medewerker_id", medewerker_id);
    const initial: Record<string, CertState> = {};
    for (const cfg of CERT_CONFIG) {
      initial[cfg.type] = { checked: false, niveaus: [], vervaldatum: "", gebieden: [], existingFileUrl: null };
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
        if (cert.bestand_url && !initial[t].existingFileUrl) {
          initial[t].existingFileUrl = cert.bestand_url;
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
      return { ...s, [type]: { ...s[type], niveaus: cur.includes(niveau) ? cur.filter(n => n !== niveau) : [...cur, niveau] } };
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
      return { ...s, [type]: { ...s[type], gebieden: cur.includes(code) ? cur.filter(g => g !== code) : [...cur, code] } };
    });
    setErrors(e => { const n = { ...e }; delete n[type]; return n; });
  };

  const handleFileSelect = (type: string, file: File | null) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Bestand is te groot. Max 10MB.");
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Alleen foto's (JPG, PNG, HEIC) of PDF toegestaan.");
      return;
    }
    setUploads(u => ({ ...u, [type]: file }));
  };

  const removeUpload = (type: string) => {
    setUploads(u => ({ ...u, [type]: null }));
  };

  const openSignedUrl = async (path: string) => {
    const { data } = await supabase.storage.from("certificaten").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    for (const cfg of CERT_CONFIG) {
      const s = state[cfg.type];
      if (!s?.checked) continue;
      if (cfg.heeftNiveau && s.niveaus.length === 0) errs[cfg.type] = "Selecteer minimaal één niveau";
      if (cfg.heeftVervaldatum && !s.vervaldatum) errs[cfg.type] = "Vul een geldigheidsdatum in";
      if (cfg.heeftGebieden && s.gebieden.length === 0) errs[cfg.type] = "Selecteer minimaal één gebied";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const uploadFile = async (type: string, file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop() || "bin";
    const path = `${medewerker_id}/${type}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("certificaten").upload(path, file, { upsert: true });
    if (error) {
      console.error("Upload error:", error);
      return null;
    }
    return path;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    const checkedTypes = CERT_CONFIG.filter(c => state[c.type]?.checked).map(c => c.type);
    const uncheckedTypes = CERT_CONFIG.filter(c => !state[c.type]?.checked).map(c => c.type);

    // Delete existing certs for all types
    const allTypes = [...checkedTypes, ...uncheckedTypes];
    if (allTypes.length > 0) {
      await supabase.from("certificaten").delete().eq("medewerker_id", medewerker_id).in("type", allTypes);
    }

    // Upload files first
    const uploadedPaths: Record<string, string> = {};
    for (const type of checkedTypes) {
      const file = uploads[type];
      if (file) {
        setUploading(u => ({ ...u, [type]: true }));
        const path = await uploadFile(type, file);
        if (path) uploadedPaths[type] = path;
        setUploading(u => ({ ...u, [type]: false }));
      }
    }

    const inserts: any[] = [];
    for (const cfg of CERT_CONFIG) {
      const s = state[cfg.type];
      if (!s?.checked) continue;
      const bestand_url = uploadedPaths[cfg.type] || s.existingFileUrl || null;

      if (cfg.heeftNiveau && s.niveaus.length > 0) {
        for (const niveau of s.niveaus) {
          inserts.push({ medewerker_id, type: cfg.type, subtype: niveau, naam: `${cfg.label} - ${niveau}`, vervaldatum: s.vervaldatum || null, bestand_url });
        }
      } else if (cfg.heeftGebieden && s.gebieden.length > 0) {
        const gebiedLabels = s.gebieden.map(g => cfg.gebieden?.find(gb => gb.code === g)?.label || g);
        inserts.push({ medewerker_id, type: cfg.type, naam: `GGI - ${gebiedLabels.join(", ")}`, ggi_gebieden: s.gebieden, vervaldatum: null, bestand_url });
      } else if (cfg.type === "POORT") {
        inserts.push({ medewerker_id, type: cfg.type, naam: cfg.kortLabel || cfg.label, vervaldatum: null, bestand_url });
      } else {
        inserts.push({ medewerker_id, type: cfg.type, naam: cfg.label, vervaldatum: s.vervaldatum || null, bestand_url });
      }
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from("certificaten").insert(inserts);
      if (error) { toast.error("Fout bij opslaan: " + error.message); setSaving(false); return; }
    }

    toast.success("Certificaten opgeslagen ✓");
    setSaving(false);
    onSaved();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderUploadZone = (cfg: CertConfig, s: CertState) => {
    const file = uploads[cfg.type];
    const isUploading = uploading[cfg.type];
    const hasExisting = !!s.existingFileUrl && !file;

    const uploadHint = cfg.type === "POORT"
      ? "Screenshot van behaalde instructie"
      : cfg.type === "GGI"
        ? "Screenshot vanuit Certwell"
        : "PDF, foto of screenshot";

    if (isUploading) {
      return (
        <div className="flex items-center gap-2 mt-2 p-3 rounded-[10px]" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)" }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#3fff8b" }} />
          <span className="text-xs" style={{ color: "#a0abc3" }}>Uploaden...</span>
        </div>
      );
    }

    if (file) {
      return (
        <div className="flex items-center gap-2 mt-2 p-3 rounded-[10px]" style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)" }}>
          <Check className="h-4 w-4 shrink-0" style={{ color: "#3fff8b" }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate" style={{ color: "#dae6ff" }}>{file.name}</p>
            <p className="text-[10px]" style={{ color: "#a0abc3" }}>{formatFileSize(file.size)}</p>
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); removeUpload(cfg.type); }} className="shrink-0">
            <X className="h-4 w-4" style={{ color: "#a0abc3" }} />
          </button>
        </div>
      );
    }

    if (hasExisting) {
      return (
        <div className="flex items-center gap-2 mt-2 p-3 rounded-[10px]" style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)" }}>
          <Paperclip className="h-4 w-4 shrink-0" style={{ color: "#3fff8b" }} />
          <span className="text-xs font-medium flex-1" style={{ color: "#3fff8b" }}>📎 Bewijs aanwezig</span>
          <button type="button" onClick={(e) => { e.stopPropagation(); openSignedUrl(s.existingFileUrl!); }}
            className="text-[10px] font-semibold px-2 py-1 rounded-lg" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>
            Bekijken
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); fileInputRefs.current[cfg.type]?.click(); }}
            className="text-[10px] font-semibold px-2 py-1 rounded-lg" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>
            Vervangen
          </button>
          <input ref={el => { fileInputRefs.current[cfg.type] = el; }} type="file" className="hidden"
            accept="image/*,application/pdf" onChange={e => handleFileSelect(cfg.type, e.target.files?.[0] || null)} />
        </div>
      );
    }

    // Empty upload zone
    if (IS_TOUCH) {
      return (
        <div className="mt-2 space-y-2" onClick={e => e.stopPropagation()}>
          <div className="flex gap-2">
            <button type="button" onClick={() => cameraInputRefs.current[cfg.type]?.click()}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-[9px] text-xs"
              style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>
              <Camera className="h-3.5 w-3.5" /> Foto maken
            </button>
            <button type="button" onClick={() => fileInputRefs.current[cfg.type]?.click()}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-[9px] text-xs"
              style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>
              <FolderOpen className="h-3.5 w-3.5" /> Bestand kiezen
            </button>
          </div>
          <p className="text-[10px] text-center" style={{ color: "#a0abc3" }}>{uploadHint}</p>
          <input ref={el => { cameraInputRefs.current[cfg.type] = el; }} type="file" className="hidden"
            accept="image/*" capture="environment" onChange={e => handleFileSelect(cfg.type, e.target.files?.[0] || null)} />
          <input ref={el => { fileInputRefs.current[cfg.type] = el; }} type="file" className="hidden"
            accept="image/*,application/pdf" onChange={e => handleFileSelect(cfg.type, e.target.files?.[0] || null)} />
        </div>
      );
    }

    return (
      <div className="mt-2" onClick={e => e.stopPropagation()}>
        <button type="button" onClick={() => fileInputRefs.current[cfg.type]?.click()}
          className="w-full p-3 rounded-[10px] text-center transition-colors group"
          style={{ background: "#030e20", border: "1.5px dashed rgba(106,118,140,0.15)", cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(63,255,139,0.3)"; e.currentTarget.style.background = "rgba(63,255,139,0.1)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(106,118,140,0.15)"; e.currentTarget.style.background = "#030e20"; }}>
          <Paperclip className="h-4 w-4 mx-auto mb-1" style={{ color: "#a0abc3" }} />
          <p className="text-xs font-medium" style={{ color: "#a0abc3" }}>Bewijs uploaden</p>
          <p className="text-[10px]" style={{ color: "#a0abc3" }}>{uploadHint}</p>
        </button>
        <input ref={el => { fileInputRefs.current[cfg.type] = el; }} type="file" className="hidden"
          accept="image/*,application/pdf" onChange={e => handleFileSelect(cfg.type, e.target.files?.[0] || null)} />
      </div>
    );
  };

  if (loading) return (
    <div className="flex items-center justify-center py-8">
      <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: "#3fff8b", borderTopColor: "transparent" }} />
    </div>
  );

  return (
    <div className="space-y-3">
      {CERT_CONFIG.map(cfg => {
        const s = state[cfg.type] || { checked: false, niveaus: [], vervaldatum: "", gebieden: [], existingFileUrl: null };
        const isChecked = s.checked;

        return (
          <div key={cfg.type} className="rounded-[14px] transition-all" style={{
            background: isChecked ? "rgba(63,255,139,0.1)" : "rgba(10,26,48,0.7)",
            border: isChecked ? "1.5px solid rgba(63,255,139,0.3)" : "1px solid rgba(106,118,140,0.15)",
            padding: "14px 16px",
            opacity: isChecked ? 1 : 0.8,
            cursor: "pointer",
          }}>
            <div className="flex items-center gap-3" onClick={() => toggle(cfg.type)}>
              <div className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{
                background: isChecked ? "#3fff8b" : "#030e20",
                border: isChecked ? "none" : "1.5px solid var(--border-strong)",
              }}>
                {isChecked && <span className="text-white text-xs font-bold">✓</span>}
              </div>
              <span className="text-sm font-semibold flex-1" style={{ color: "#dae6ff" }}>
                {cfg.kortLabel || cfg.label}
              </span>
              {cfg.type === "POORT" && (
                <button type="button" onClick={e => { e.stopPropagation(); setShowPoortInfo(true); }} className="shrink-0">
                  <AlertCircle className="h-4 w-4" style={{ color: "#feb300" }} />
                </button>
              )}
            </div>

            {isChecked && (
              <div className="mt-3 space-y-3" onClick={e => e.stopPropagation()}>
                {cfg.heeftNiveau && cfg.niveaus && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium" style={{ color: "#a0abc3" }}>Niveau</span>
                    <div className="flex gap-2 flex-wrap">
                      {cfg.niveaus.map(n => {
                        const sel = s.niveaus.includes(n);
                        return (
                          <button key={n} type="button" onClick={() => setNiveau(cfg.type, n)} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors" style={{
                            background: sel ? "rgba(63,255,139,0.1)" : "#030e20",
                            border: sel ? "1px solid rgba(63,255,139,0.3)" : "1px solid rgba(106,118,140,0.15)",
                            color: sel ? "#3fff8b" : "#a0abc3",
                            fontWeight: sel ? 600 : 400,
                          }}>{n}</button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {cfg.heeftGebieden && cfg.gebieden && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium" style={{ color: "#a0abc3" }}>
                      Vink aan welke gebieden je hebt (met screenshot vanuit Certwell)
                    </span>
                    <div className="flex gap-2 flex-wrap">
                      {cfg.gebieden.map(g => {
                        const sel = s.gebieden.includes(g.code);
                        return (
                          <button key={g.code} type="button" onClick={() => setGebied(cfg.type, g.code)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                            style={{
                              background: sel ? "rgba(63,255,139,0.1)" : "#030e20",
                              border: sel ? "1px solid rgba(63,255,139,0.3)" : "1px solid rgba(106,118,140,0.15)",
                              color: sel ? "#3fff8b" : "#a0abc3",
                              fontWeight: sel ? 600 : 400,
                            }}
                            title={g.info || undefined}
                          >
                            {g.label}
                            {g.info && <Info className="h-3 w-3" style={{ color: "#a0abc3" }} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {cfg.heeftVervaldatum && (
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium" style={{ color: "#a0abc3" }}>Geldig tot</span>
                    <input type="date" value={s.vervaldatum} onChange={e => setDatum(cfg.type, e.target.value)}
                      className="w-full px-3 py-2 rounded-[10px] text-[13px]"
                      style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff", colorScheme: "light", marginTop: 4 }}
                    />
                  </div>
                )}

                {cfg.type === "POORT" && (
                  <p className="text-xs" style={{ color: "#3fff8b" }}>✓ Geregistreerd als behaald</p>
                )}

                {/* Upload zone */}
                {renderUploadZone(cfg, s)}

                {errors[cfg.type] && (
                  <p className="text-xs font-medium" style={{ color: "#ff716c" }}>{errors[cfg.type]}</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      <button onClick={handleSave} disabled={saving}
        className="w-full py-[14px] rounded-[14px] text-[15px] font-bold text-white disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)", marginTop: 16 }}
      >
        {saving ? "Opslaan..." : "Opslaan"}
      </button>

      {onCancel && (
        <button onClick={onCancel} className="w-full py-2.5 text-xs font-medium" style={{ color: "#a0abc3" }}>
          Overslaan
        </button>
      )}

      {showPoortInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowPoortInfo(false)}>
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, #dae6ff 35%, transparent)", backdropFilter: "blur(6px)" }} />
          <div className="relative rounded-xl p-4 space-y-3 max-w-[300px] w-full" onClick={e => e.stopPropagation()} style={{
            background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", zIndex: 100,
          }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold" style={{ color: "#dae6ff" }}>Poortinstructie TSO/DSO</h3>
              <button onClick={() => setShowPoortInfo(false)}><X className="h-4 w-4" style={{ color: "#a0abc3" }} /></button>
            </div>
            <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: "#dae6ff" }}>
              {CERT_CONFIG.find(c => c.type === "POORT")?.info}
            </p>
            <a href="https://www.poortinstructienetbeheernederland.nl" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-semibold" style={{ color: "#3fff8b" }}>
              <ExternalLink className="h-3 w-3" /> www.poortinstructienetbeheernederland.nl
            </a>
            <button onClick={() => setShowPoortInfo(false)} className="w-full py-2 rounded-xl text-xs font-semibold"
              style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>
              Sluiten
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
