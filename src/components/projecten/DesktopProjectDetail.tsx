import { useState } from "react";
import { Pencil, ToggleLeft, ToggleRight, X, Trash2, Download, Lock, Phone, Mail, MapPin, Zap } from "lucide-react";
import { volledigAdres } from "@/lib/utils";
import { CaseTypeBadge } from "./CaseTypeBadge";
import { generateProjectPdf } from "./projectPdf";
import { ForecastTab } from "@/components/ForecastTab";
import { PlanningStatusTab } from "@/components/PlanningStatusTab";
import { StatusBadge } from "@/components/StatusBadge";
import { STATUS_TRANSITIONS, type ProjectStatus } from "@/lib/projectStatus";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
function InfoField({ label, value, mono, badge }: { label: string; value: string | null; mono?: boolean; badge?: boolean }) {
  if (!value) return (
    <div style={{ borderBottom: "1px solid var(--bg-surface)", paddingBottom: 8 }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-[13px] mt-0.5" style={{ color: "var(--planning-border-soft)" }}>—</p>
    </div>
  );
  return (
    <div style={{ borderBottom: "1px solid var(--bg-surface)", paddingBottom: 8 }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</p>
      {badge ? <CaseTypeBadge type={value} /> : (
        <p className={`text-[13px] mt-0.5 ${mono ? "font-mono" : ""}`} style={{ color: "var(--text-primary)" }}>{value}</p>
      )}
    </div>
  );
}

interface Props {
  project: any;
  ogNaam: string | null;
  isManager: boolean;
  confirmDeleteId: string | null;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
  navigate: (path: string) => void;
  onStartIntake: () => void;
}

export function DesktopProjectDetail({ project, ogNaam, isManager, confirmDeleteId, onEdit, onToggle, onDelete, onCancelDelete, navigate, onStartIntake }: Props) {
  const [activeTab, setActiveTab] = useState<"info" | "forecast" | "planning">("info");
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const { user } = useAuth();
  const { profileId } = useProfile();
  const tabs = [
    { key: "info" as const, label: "Projectinfo" },
    ...(isManager ? [{ key: "forecast" as const, label: "Forecast" }] : []),
    { key: "planning" as const, label: "Planning" },
  ];

  const currentStatus = (project.status || "nieuw") as ProjectStatus;
  const transitions = STATUS_TRANSITIONS[currentStatus] || [];

  const changeStatus = async (newStatus: ProjectStatus) => {
    const { error } = await supabase.from("projects").update({
      status: newStatus,
      status_gewijzigd_op: new Date().toISOString(),
      status_gewijzigd_door: profileId,
    } as any).eq("id", project.id);
    if (error) { toast.error("Fout bij statuswijziging"); return; }
    toast.success(`Status gewijzigd naar ${newStatus.replace(/_/g, " ")}`);
    setShowStatusMenu(false);
    // Trigger refetch via parent
    window.dispatchEvent(new CustomEvent("project-status-changed"));
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-medium" style={{ color: "var(--text-primary)" }}>{project.naam}</h2>
          <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>{project.nummer}</span>
          <div className="flex items-center gap-2 mt-2">
            <span className="w-2 h-2 rounded-full" style={{ background: project.active ? "var(--accent)" : "var(--text-muted)" }} />
            <span className="text-xs font-medium" style={{ color: project.active ? "var(--accent)" : "var(--text-muted)" }}>{project.active ? "Actief" : "Inactief"}</span>
            <div className="relative">
              <StatusBadge status={currentStatus} size="md" onClick={isManager ? () => setShowStatusMenu(!showStatusMenu) : undefined} />
              {showStatusMenu && transitions.length > 0 && (
                <div className="absolute top-full left-0 mt-1 z-50 rounded-xl p-1.5 min-w-[160px] shadow-lg" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
                  {transitions.map(t => (
                    <button key={t} onClick={() => changeStatus(t)} className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity" style={{ color: "var(--text-primary)" }}>
                      <StatusBadge status={t} size="sm" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => generateProjectPdf(project, ogNaam, isManager)} className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1" style={{ border: "1px solid var(--planning-border-soft)", color: "var(--text-muted)" }}>
            <Download className="h-3.5 w-3.5" /> PDF
          </button>
          <button onClick={onEdit} className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1" style={{ border: "1px solid var(--planning-border-soft)", color: "var(--text-muted)" }}>
            <Pencil className="h-3.5 w-3.5" /> Bewerken
          </button>
          <button onClick={onToggle} className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1" style={{ border: "1px solid var(--planning-border-soft)", color: "var(--text-muted)" }}>
            {project.active ? <ToggleRight className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} /> : <ToggleLeft className="h-3.5 w-3.5" />}
            {project.active ? "Deactiveren" : "Activeren"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0" style={{ borderBottom: "1px solid var(--planning-border-soft)" }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} className="px-4 py-2 text-sm transition-colors" style={{
            color: activeTab === t.key ? "var(--accent)" : "var(--text-muted)",
            fontWeight: activeTab === t.key ? 500 : 400,
            borderBottom: activeTab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
            marginBottom: -1,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "info" && (
        <>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            <InfoField label="Casenummer" value={project.nummer} mono />
            <InfoField label="Case type" value={project.case_type} badge />
            <InfoField label="Casenaam" value={project.naam} />
            <InfoField label="Opdrachtgever" value={ogNaam} />
            <InfoField label="Stationsnaam" value={project.stationsnaam} />
            <InfoField label="Straat" value={project.straat} />
            <InfoField label="Postcode" value={project.postcode} />
            <InfoField label="Stad" value={project.stad} />
          </div>
          {volledigAdres(project) && (
            <a href={`https://maps.google.com/?q=${encodeURIComponent(volledigAdres(project))}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs mt-2" style={{ color: "var(--accent)" }}>
              <MapPin className="h-3 w-3" /> Bekijk op kaart ↗
            </a>
          )}

          {isManager && !project.intake_gedaan && (
            <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4" style={{ color: "var(--warn-text)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--warn-text)" }}>Forecast intake nog niet gedaan</span>
              </div>
              <button onClick={onStartIntake} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
                Intake starten →
              </button>
            </div>
          )}
          {isManager && project.intake_gedaan && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>✓ Intake voltooid</span>
              <button onClick={onStartIntake} className="text-[11px]" style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>Opnieuw doen</button>
            </div>
          )}

          {isManager && (project.contactpersoon_naam || project.contactpersoon_tel || project.contactpersoon_email) && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
              <p className="text-xs font-semibold flex items-center gap-1" style={{ color: "var(--warn-text)" }}>
                <Lock className="h-3 w-3" /> Contactpersoon opdrachtgever
              </p>
              <div className="grid grid-cols-3 gap-4">
                {project.contactpersoon_naam && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--warn-text)" }}>Naam</p>
                    <p className="text-sm" style={{ color: "var(--text-primary)" }}>{project.contactpersoon_naam}</p>
                  </div>
                )}
                {project.contactpersoon_tel && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--warn-text)" }}>Telefoon</p>
                    <a href={`tel:${project.contactpersoon_tel}`} className="text-sm flex items-center gap-1" style={{ color: "var(--accent)" }}>
                      <Phone className="h-3 w-3" /> {project.contactpersoon_tel}
                    </a>
                  </div>
                )}
                {project.contactpersoon_email && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--warn-text)" }}>Email</p>
                    <a href={`mailto:${project.contactpersoon_email}`} className="text-sm flex items-center gap-1" style={{ color: "var(--accent)" }}>
                      <Mail className="h-3 w-3" /> {project.contactpersoon_email}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2">
            <button onClick={onEdit} className="w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5" style={{ border: "1px solid var(--planning-border-soft)", color: "var(--text-muted)" }}>
              <Pencil className="h-3.5 w-3.5" /> Project bewerken
            </button>
            <button onClick={onToggle} className="w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5" style={{ border: "1px solid var(--planning-border-soft)", color: "var(--text-muted)" }}>
              {project.active ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
              {project.active ? "Deactiveren" : "Activeren"}
            </button>
            {confirmDeleteId === project.id ? (
              <div className="flex gap-2">
                <button onClick={onCancelDelete} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)", color: "var(--text-muted)" }}>Annuleren</button>
                <button onClick={onDelete} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "var(--danger)" }}>Definitief verwijderen</button>
              </div>
            ) : (
              <button onClick={onDelete} className="w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5" style={{ border: "1px solid var(--danger-border)", color: "var(--danger)" }}>
                <Trash2 className="h-3.5 w-3.5" /> Verwijderen
              </button>
            )}
          </div>
        </>
      )}

      {activeTab === "forecast" && isManager && (
        <ForecastTab projectId={project.id} />
      )}

      {activeTab === "planning" && (
        <PlanningStatusTab projectId={project.id} profileId={undefined} />
      )}
    </div>
  );
}

export function DesktopFormPanel({ title, children, onCancel, onSubmit, submitLabel }: {
  title: string; children: React.ReactNode; onCancel: () => void; onSubmit: () => void; submitLabel: string;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>{title}</h2>
        <button onClick={onCancel} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface-2)" }}>
          <X className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
        </button>
      </div>
      <div className="space-y-3">{children}</div>
      <div className="flex gap-3 pt-2">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ border: "1px solid var(--planning-border-soft)", color: "var(--text-muted)" }}>Annuleren</button>
        <button onClick={onSubmit} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>{submitLabel}</button>
      </div>
    </div>
  );
}
