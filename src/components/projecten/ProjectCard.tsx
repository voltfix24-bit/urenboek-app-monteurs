import { Pencil, ToggleLeft, ToggleRight, X, ChevronDown, ChevronUp, Building2, Lock, Phone, Mail, Download, MapPin, AlertTriangle } from "lucide-react";
import { volledigAdres } from "@/lib/utils";
import { CaseTypeBadge } from "./CaseTypeBadge";
import { generateProjectPdf } from "./projectPdf";

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[11px] font-medium w-24 shrink-0" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-xs" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

export function ProjectCard({ project, ogNaam, isManager, isEditing, isExpanded, isConfirmingDelete, renderFormFields, onEdit, onCancel, onSave, onToggle, onDelete, onCancelDelete, onToggleExpand }: any) {
  if (isEditing) {
    return (
      <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "var(--bg-surface)", border: "1px solid var(--info-border)" }}>
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Project bewerken</h3>
        {renderFormFields()}
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1" style={{ background: "var(--bg-base)", color: "var(--text-secondary)" }}><X className="h-3.5 w-3.5" /> Annuleren</button>
          <button onClick={onSave} className="flex-1 py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>✓ Opslaan</button>
        </div>
      </div>
    );
  }
  if (isConfirmingDelete) {
    return (
      <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "var(--danger-light)", border: "1px solid var(--danger-border)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>"{project.naam}" verwijderen?</p>
        <div className="flex gap-2">
          <button onClick={onCancelDelete} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Annuleren</button>
          <button onClick={onDelete} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "var(--danger)" }}>Verwijderen</button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl overflow-hidden transition-transform active:scale-[0.985]" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", opacity: project.active ? 1 : 0.5 }}>
      <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={onToggleExpand}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {project.naam}
              {(!project.straat || !project.stad) && <span title="Adres onvolledig — monteurs kunnen niet navigeren"><AlertTriangle className="h-3 w-3 inline ml-1" style={{ color: "var(--warn-text)" }} /></span>}
            </p>
            <CaseTypeBadge type={project.case_type} />
          </div>
          <p className="text-xs mt-0.5 font-mono" style={{ color: "var(--accent)" }}>{project.nummer}</p>
          {project.stationsnaam && <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{project.stationsnaam}</p>}
          {ogNaam && <p className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: "var(--text-muted)" }}><Building2 className="h-3 w-3 shrink-0" /> {ogNaam}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={onEdit} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface-2)" }}><Pencil className="h-3.5 w-3.5" style={{ color: "var(--text-secondary)" }} /></button>
          <button onClick={onToggle} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: project.active ? "var(--success-light)" : "var(--bg-surface-2)" }}>
            {project.active ? <ToggleRight className="h-4 w-4" style={{ color: "var(--success)" }} /> : <ToggleLeft className="h-4 w-4" style={{ color: "var(--text-muted)" }} />}
          </button>
          <button onClick={onDelete} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--danger-light)" }}><X className="h-3.5 w-3.5" style={{ color: "var(--danger)" }} /></button>
        </div>
        {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} /> : <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />}
      </div>
      {isExpanded && (
        <div className="px-4 pb-4 space-y-2 animate-fade-in" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="pt-3 space-y-1.5">
            {volledigAdres(project) ? (
              <>
                <DetailLine label="Straat" value={project.straat} />
                <DetailLine label="Postcode" value={project.postcode} />
                <DetailLine label="Stad" value={project.stad} />
                <a href={`https://maps.google.com/?q=${encodeURIComponent(volledigAdres(project))}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs mt-1" style={{ color: "var(--accent)" }}>
                  <MapPin className="h-3 w-3" /> Bekijk op kaart ↗
                </a>
              </>
            ) : project.adres ? (
              <DetailLine label="Adres" value={project.adres} />
            ) : null}
            {project.case_type && <DetailLine label="Case type" value={project.case_type} />}
            {project.stationsnaam && <DetailLine label="Station" value={project.stationsnaam} />}
            {ogNaam && <DetailLine label="Opdrachtgever" value={ogNaam} />}
          </div>
          {isManager && (project.contactpersoon_naam || project.contactpersoon_tel || project.contactpersoon_email) && (
            <div className="rounded-xl p-3 space-y-1.5 mt-2" style={{ background: "var(--warn-bg)", border: "1px solid var(--warn-border)" }}>
              <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: "var(--warn-text)" }}>
                <Lock className="h-3 w-3" /> Contactpersoon opdrachtgever
              </p>
              {project.contactpersoon_naam && <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{project.contactpersoon_naam}</p>}
              {project.contactpersoon_tel && (
                <a href={`tel:${project.contactpersoon_tel}`} className="text-xs flex items-center gap-1.5" style={{ color: "var(--accent)" }}>
                  <Phone className="h-3 w-3" /> {project.contactpersoon_tel}
                </a>
              )}
              {project.contactpersoon_email && (
                <a href={`mailto:${project.contactpersoon_email}`} className="text-xs flex items-center gap-1.5" style={{ color: "var(--accent)" }}>
                  <Mail className="h-3 w-3" /> {project.contactpersoon_email}
                </a>
              )}
            </div>
          )}
          <button onClick={() => generateProjectPdf(project, ogNaam, isManager)} className="w-full mt-2 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            <Download className="h-3.5 w-3.5" /> PDF downloaden
          </button>
        </div>
      )}
    </div>
  );
}
