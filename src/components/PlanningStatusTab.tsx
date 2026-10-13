import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  projectId: string;
  profileId?: string;
  onStatusChange?: () => void;
}

export function PlanningStatusTab({ projectId }: Props) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<{ is_definitief: boolean; definitief_op: string | null; definitief_door_naam: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("project_planning_status").select("*").eq("project_id", projectId).maybeSingle();
    if (data) {
      let naam: string | null = null;
      if (data.definitief_door) {
        const { data: p } = await supabase.from("profiles_public" as any).select("full_name").eq("id", data.definitief_door).single();
        naam = (p as any)?.full_name || null;
      }
      setStatus({ is_definitief: data.is_definitief, definitief_op: data.definitief_op, definitief_door_naam: naam });
    } else {
      setStatus(null);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-sm py-8 text-center" style={{ color: "var(--text-muted)" }}>Laden...</p>;

  const isDef = status?.is_definitief || false;

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Status</span>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: isDef ? "var(--accent-light)" : "var(--bg-surface-2)", color: isDef ? "var(--accent)" : "var(--text-muted)" }}>
            {isDef ? "Definitief" : "Concept"}
          </span>
        </div>

        {isDef ? (
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            Gepubliceerd op {status?.definitief_op ? new Date(status.definitief_op).toLocaleDateString("nl-NL") : "–"}{" "}
            {status?.definitief_door_naam && <>door {status.definitief_door_naam}</>}
          </p>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Planning nog niet gepubliceerd. Monteurs kunnen de planning nog niet inzien.</p>
        )}

        <button onClick={() => navigate(`/manager-planning?project=${projectId}`)} className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
          <CalendarDays className="h-4 w-4" /> Planning openen <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
