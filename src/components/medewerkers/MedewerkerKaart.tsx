import { useState } from "react";
import { ChevronRight } from "lucide-react";

const roleLabels: Record<string, string> = {
  monteur: "Monteur", schakelmonteur: "Schakelmonteur",
  uitvoerder: "Uitvoerder", wv: "WV", manager: "Manager"
};
const AVATAR_COLORS = ['#3fff8b', '#22c55e', '#6e9bff', '#feb300', '#a78bfa'];

interface Employee {
  id: string; user_id: string; full_name: string; role: string;
  uurtarief: number | null; telefoon: string; adres: string;
  rijbewijs: boolean; account_status: string;
  invited_at: string | null; activated_at: string | null;
  noodcontact_naam: string | null; noodcontact_tel: string | null;
  contract_einddatum: string | null;
  kvk_nummer?: string | null; btw_nummer?: string | null;
  iban?: string | null; bedrijfsnaam?: string | null;
  email?: string | null;
}

function StatusBadge({ emp }: { emp: Employee }) {
  if (emp.account_status === "onboarding") {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "rgba(254,179,0,0.1)", color: "#feb300", border: "1px solid rgba(254,179,0,0.3)" }}>⚠ Verificatie nodig</span>;
  }
  if (emp.account_status === "invited") {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "rgba(254,179,0,0.08)", color: "#feb300" }}>📧 Uitgenodigd</span>;
  }
  if (emp.account_status === "inactive") {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "rgba(255,113,108,0.1)", color: "#ff716c" }}>🔴 Inactief</span>;
  }
  if (emp.account_status === "active" && !emp.activated_at) {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "#102038", color: "#a0abc3" }}>Nog niet ingelogd</span>;
  }
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "rgba(63,255,139,0.1)", color: "#3fff8b" }}>🟢 Actief</span>;
}

export { StatusBadge, roleLabels, AVATAR_COLORS };
export type { Employee };

interface Props {
  emp: Employee;
  idx: number;
  isSelected: boolean;
  onSelect: () => void;
}

export function MedewerkerKaart({ emp, idx, isSelected, onSelect }: Props) {
  return (
    <div className="rounded-2xl p-3.5 transition-all cursor-pointer" onClick={onSelect}
      style={{
        background: isSelected ? "rgba(63,255,139,0.1)" : "rgba(10,26,48,0.7)",
        border: isSelected ? "1px solid rgba(63,255,139,0.3)" : "1px solid rgba(106,118,140,0.15)",
        opacity: emp.account_status === "inactive" ? 0.6 : 1,
      }}>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length], color: "#fff" }}>
          {emp.full_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "#dae6ff" }}>{emp.full_name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] capitalize" style={{ color: "#a0abc3" }}>{roleLabels[emp.role] || emp.role}</span>
            <StatusBadge emp={emp} />
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "#a0abc3" }} />
      </div>
    </div>
  );
}
