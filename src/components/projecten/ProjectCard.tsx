import { Pencil, ToggleLeft, ToggleRight, X, ChevronDown, ChevronUp, Building2, Lock, Phone, Mail, Download, MapPin, AlertTriangle } from "lucide-react";
import { volledigAdres } from "@/lib/utils";
import { CaseTypeBadge } from "./CaseTypeBadge";
import { generateProjectPdf } from "./projectPdf";
import { PlanningStatusTab } from "@/components/PlanningStatusTab";

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[11px] font-medium w-24 shrink-0" style={{ color: "#a0abc3" }}>{label}</span>
      <span className="text-xs" style={{ color: "#dae6ff" }}>{value}</span>
    </div>
  );
}

export function ProjectCard({ project, ogNaam, isManager, isEditing, isExpanded, isConfirmingDelete, renderFormFields, onEdit, onCancel, onSave, onToggle, onDelete, onCancelDelete, onToggleExpand }: any) {
  if (isEditing) {
    return (
      <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(110,155,255,0.3)" }}>
        <h3 className="text-sm font-semibold" style={{ color: "#dae6ff" }}>Project bewerken</h3>
        {renderFormFields()}
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1" style={{ background: "#030e20", color: "#a0abc3" }}><X className="h-3.5 w-3.5" /> Annuleren</button>
          <button onClick={onSave} className="flex-1 py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)" }}>✓ Opslaan</button>
        </div>
      </div>
    );
  }
  if (isConfirmingDelete) {
    return (
      <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "rgba(255,113,108,0.1)", border: "1px solid rgba(255,113,108,0.3)" }}>
        <p className="text-sm font-semibold" style={{ color: "#dae6ff" }}>"{project.naam}" verwijderen?</p>
        <div className="flex gap-2">
          <button onClick={onCancelDelete} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>Annuleren</button>
          <button onClick={onDelete} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "#ff716c" }}>Verwijderen</button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl overflow-hidden transition-transform active:scale-[0.985]" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", opacity: project.active ? 1 : 0.5 }}>
      <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={onToggleExpand}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold truncate" style={{ color: "#dae6ff" }}>
              {project.naam}
              {(!project.straat || !project.stad) && <span title="Adres onvolledig — monteurs kunnen niet navigeren"><AlertTriangle className="h-3 w-3 inline ml-1" style={{ color: "#feb300" }} /></span>}
            </p>
            <CaseTypeBadge type={project.case_type} />
          </div>
          <p className="text-xs mt-0.5 font-mono" style={{ color: "#3fff8b" }}>{project.nummer}</p>
          {project.stationsnaam && <p className="text-[11px] mt-0.5" style={{ color: "#a0abc3" }}>{project.stationsnaam}</p>}
          {ogNaam && <p className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: "#a0abc3" }}><Building2 className="h-3 w-3 shrink-0" /> {ogNaam}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={onEdit} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#102038" }}><Pencil className="h-3.5 w-3.5" style={{ color: "#a0abc3" }} /></button>
          <button onClick={onToggle} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: project.active ? "rgba(63,255,139,0.1)" : "#102038" }}>
            {project.active ? <ToggleRight className="h-4 w-4" style={{ color: "#3fff8b" }} /> : <ToggleLeft className="h-4 w-4" style={{ color: "#a0abc3" }} />}
          </button>
          <button onClick={onDelete} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,113,108,0.1)" }}><X className="h-3.5 w-3.5" style={{ color: "#ff716c" }} /></button>
        </div>
        {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0" style={{ color: "#a0abc3" }} /> : <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "#a0abc3" }} />}
      </div>
      {isExpanded && (
        <div className="px-4 pb-4 space-y-2 animate-fade-in" style={{ borderTop: "1px solid rgba(106,118,140,0.15)" }}>
          <div className="pt-3 space-y-1.5">
            {volledigAdres(project) ? (
              <>
                <DetailLine label="Straat" value={project.straat} />
                <DetailLine label="Postcode" value={project.postcode} />
                <DetailLine label="Stad" value={project.stad} />
                <a href={`https://maps.google.com/?q=${encodeURIComponent(volledigAdres(project))}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs mt-1" style={{ color: "#3fff8b" }}>
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
            <div className="rounded-xl p-3 space-y-1.5 mt-2" style={{ background: "rgba(254,179,0,0.08)", border: "1px solid rgba(254,179,0,0.3)" }}>
              <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: "#feb300" }}>
                <Lock className="h-3 w-3" /> Contactpersoon opdrachtgever
              </p>
              {project.contactpersoon_naam && <p className="text-sm font-medium" style={{ color: "#dae6ff" }}>{project.contactpersoon_naam}</p>}
              {project.contactpersoon_tel && (
                <a href={`tel:${project.contactpersoon_tel}`} className="text-xs flex items-center gap-1.5" style={{ color: "#3fff8b" }}>
                  <Phone className="h-3 w-3" /> {project.contactpersoon_tel}
                </a>
              )}
              {project.contactpersoon_email && (
                <a href={`mailto:${project.contactpersoon_email}`} className="text-xs flex items-center gap-1.5" style={{ color: "#3fff8b" }}>
                  <Mail className="h-3 w-3" /> {project.contactpersoon_email}
                </a>
              )}
            </div>
          )}
          {isManager && (
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(106,118,140,0.15)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#a0abc3" }}>Planning</p>
              <PlanningStatusTab projectId={project.id} profileId={undefined} />
            </div>
          )}
          <button onClick={() => generateProjectPdf(project, ogNaam, isManager)} className="w-full mt-2 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>
            <Download className="h-3.5 w-3.5" /> PDF downloaden
          </button>
        </div>
      )}
    </div>
  );
}
