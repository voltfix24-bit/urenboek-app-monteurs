import { useState } from "react";
import { ChevronRight } from "lucide-react";

const roleLabels: Record<string, string> = {
  monteur: "Monteur", schakelmonteur: "Schakelmonteur",
  uitvoerder: "Uitvoerder", wv: "WV", manager: "Manager"
};
const AVATAR_COLORS = ['var(--accent)', 'var(--accent-mid)', 'var(--info-dark)', 'var(--warn-text)', 'var(--purple)'];

interface Employee {
  id: string; user_id: string; full_name: string; role: string;
  uurtarief: number | null; telefoon: string; adres: string;
  rijbewijs: boolean; account_status: string;
  invited_at: string | null; activated_at: string | null;
  noodcontact_naam: string | null; noodcontact_tel: string | null;
  contract_einddatum: string | null;
  kvk_nummer?: string | null; btw_nummer?: string | null;
  iban?: string | null; bedrijfsnaam?: string | null;
}

function StatusBadge({ emp }: { emp: Employee }) {
  if (emp.account_status === "onboarding") {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "var(--warn-light)", color: "var(--warn-text)", border: "1px solid var(--warn-border)" }}>⚠ Verificatie nodig</span>;
  }
  if (emp.account_status === "invited") {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "var(--warn-bg)", color: "var(--warn-text)" }}>📧 Uitgenodigd</span>;
  }
  if (emp.account_status === "inactive") {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "var(--danger-light)", color: "var(--danger)" }}>🔴 Inactief</span>;
  }
  if (emp.account_status === "active" && !emp.activated_at) {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>Nog niet ingelogd</span>;
  }
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "var(--success-light)", color: "var(--success)" }}>🟢 Actief</span>;
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
        background: isSelected ? "var(--accent-light)" : "var(--bg-surface)",
        border: isSelected ? "1px solid var(--accent-border)" : "1px solid var(--border)",
        opacity: emp.account_status === "inactive" ? 0.6 : 1,
      }}>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length], color: "#fff" }}>
          {emp.full_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{emp.full_name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] capitalize" style={{ color: "var(--text-muted)" }}>{roleLabels[emp.role] || emp.role}</span>
            <StatusBadge emp={emp} />
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
      </div>
    </div>
  );
}
