import { useState } from "react";
import { Pencil, X, Trash2, Download, Lock, Phone, Mail, MapPin, Zap, AlertTriangle } from "lucide-react";
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

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "128px 1fr", alignItems: "baseline", gap: 12 }}>
      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontSize: 13, color: "var(--text-primary)", minWidth: 0 }}>{children}</span>
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
  const adres = volledigAdres(project);

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
    <div>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 500, color: "var(--text-primary)" }}>{project.naam}</h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
            {project.nummer}{ogNaam ? ` · ${ogNaam}` : ""}
          </p>
          <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
            <span
              className="px-2.5 py-0.5 rounded-full"
              style={{
                fontSize: 12,
                fontWeight: 500,
                background: project.active ? "var(--accent-light)" : "var(--bg-surface-2)",
                color: project.active ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              {project.active ? "Actief" : "Inactief"}
            </span>
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
          <button
            onClick={() => generateProjectPdf(project, ogNaam, isManager)}
            aria-label="Project als PDF downloaden"
            title="PDF downloaden"
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ border: "1px solid var(--planning-border-soft)", color: "var(--text-muted)" }}
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={onEdit}
            className="px-3 h-8 rounded-lg text-[13px] font-medium flex items-center gap-1.5"
            style={{ border: "1px solid var(--planning-border-soft)", color: "var(--text-muted)" }}
          >
            <Pencil className="h-3.5 w-3.5" /> Bewerken
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0" style={{ borderBottom: "1px solid var(--planning-border-soft)", marginTop: 20 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} className="px-4 py-2 text-sm transition-colors" style={{
            color: activeTab === t.key ? "var(--text-primary)" : "var(--text-muted)",
            fontWeight: activeTab === t.key ? 500 : 400,
            borderBottom: activeTab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
            marginBottom: -1,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "info" && (
        <div className="space-y-5" style={{ paddingTop: 20 }}>
          {/* Veldenlijst */}
          <div style={{ display: "grid", rowGap: 10 }}>
            <DetailRow label="Casenummer">
              <span className="font-mono">{project.nummer}</span>
            </DetailRow>
            {project.case_type && (
              <DetailRow label="Case type">
                <CaseTypeBadge type={project.case_type} />
              </DetailRow>
            )}
            {ogNaam && <DetailRow label="Opdrachtgever">{ogNaam}</DetailRow>}
            {project.stationsnaam && <DetailRow label="Stationsnaam">{project.stationsnaam}</DetailRow>}
            {adres && (
              <DetailRow label="Adres">
                <span>{adres}</span>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(adres)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1"
                  style={{ color: "var(--accent)", marginLeft: 8, fontSize: 13 }}
                >
                  <MapPin className="h-3 w-3" /> Kaart ↗
                </a>
              </DetailRow>
            )}
            <DetailRow label="Jaartal">
              {project.projectjaar != null ? (
                project.projectjaar
              ) : (
                <span className="inline-flex items-center gap-1" style={{ color: "var(--warn-text)" }}>
                  <AlertTriangle className="h-3.5 w-3.5" /> Niet ingevuld
                </span>
              )}
            </DetailRow>
          </div>

          {/* Forecast-melding */}
          {isManager && !project.intake_gedaan && (
            <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4" style={{ color: "var(--warn-text)" }} />
                <span className="text-xs font-medium" style={{ color: "var(--warn-text)" }}>Forecast intake nog niet gedaan</span>
              </div>
              <button
                onClick={onStartIntake}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: "transparent", border: "1px solid var(--warn-border)", color: "var(--warn-text)" }}
              >
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

          {/* Contactpersoon */}
          {isManager && (project.contactpersoon_naam || project.contactpersoon_tel || project.contactpersoon_email) && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
              <p className="text-xs font-medium flex items-center gap-1" style={{ color: "var(--warn-text)" }}>
                <Lock className="h-3 w-3" /> Contactpersoon opdrachtgever
              </p>
              <div className="grid grid-cols-3 gap-4">
                {project.contactpersoon_naam && (
                  <div>
                    <p className="text-[11px] mb-0.5" style={{ color: "var(--warn-text)" }}>Naam</p>
                    <p className="text-sm" style={{ color: "var(--text-primary)" }}>{project.contactpersoon_naam}</p>
                  </div>
                )}
                {project.contactpersoon_tel && (
                  <div>
                    <p className="text-[11px] mb-0.5" style={{ color: "var(--warn-text)" }}>Telefoon</p>
                    <a href={`tel:${project.contactpersoon_tel}`} className="text-sm flex items-center gap-1" style={{ color: "var(--accent)" }}>
                      <Phone className="h-3 w-3" /> {project.contactpersoon_tel}
                    </a>
                  </div>
                )}
                {project.contactpersoon_email && (
                  <div>
                    <p className="text-[11px] mb-0.5" style={{ color: "var(--warn-text)" }}>Email</p>
                    <a href={`mailto:${project.contactpersoon_email}`} className="text-sm flex items-center gap-1" style={{ color: "var(--accent)" }}>
                      <Mail className="h-3 w-3" /> {project.contactpersoon_email}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Voetbalk */}
          <div
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{ background: "var(--bg-surface-2)", borderTop: "1px solid var(--planning-border-soft)" }}
          >
            <button
              onClick={onToggle}
              className="text-[13px] font-medium"
              style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
            >
              {project.active ? "Deactiveren" : "Activeren"}
            </button>
            <button
              onClick={onDelete}
              className="text-[13px] font-medium flex items-center gap-1.5"
              style={{ color: "var(--danger)", background: "none", border: "none", cursor: "pointer" }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Verwijderen
            </button>
          </div>
        </div>
      )}

      {activeTab === "forecast" && isManager && (
        <div style={{ paddingTop: 20 }}>
          <ForecastTab projectId={project.id} />
        </div>
      )}

      {activeTab === "planning" && (
        <div style={{ paddingTop: 20 }}>
          <PlanningStatusTab projectId={project.id} profileId={undefined} />
        </div>
      )}

      {/* Verwijder-bevestiging */}
      {confirmDeleteId === project.id && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={onCancelDelete}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="verwijder-titel"
            className="rounded-2xl p-6"
            style={{ background: "var(--bg-surface)", maxWidth: 380, width: "calc(100% - 32px)" }}
            onClick={e => e.stopPropagation()}
          >
            <h3 id="verwijder-titel" style={{ fontSize: 16, fontWeight: 500, color: "var(--text-primary)" }}>
              Project verwijderen?
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
              “{project.naam}” wordt definitief verwijderd. Dit kan niet ongedaan worden gemaakt.
            </p>
            <div className="flex gap-3" style={{ marginTop: 20 }}>
              <button
                onClick={onCancelDelete}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ border: "1px solid var(--planning-border-soft)", color: "var(--text-muted)" }}
              >
                Annuleren
              </button>
              <button
                onClick={onDelete}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white"
                style={{ background: "var(--danger)" }}
              >
                Definitief verwijderen
              </button>
            </div>
          </div>
        </div>
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
        <button onClick={onCancel} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface-2)" }} aria-label="Sluiten">
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
