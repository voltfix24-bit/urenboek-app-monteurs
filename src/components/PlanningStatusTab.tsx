import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CalendarDays, ArrowRight, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function PlanningStatusTab({ projectId, profileId }: { projectId: string; profileId?: string }) {
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

  async function toggleDefinitief(val: boolean) {
    const { data, error } = await supabase.functions.invoke("definitief-maken", {
      body: { projectId, profileId, makeConcept: !val },
    });
    if (error || !data?.success) { toast.error("Fout bij wijzigen status"); return; }
    toast.success(val ? "Planning gepubliceerd" : "Terug naar concept");
    load();
  }

  if (loading) return <p className="text-sm py-8 text-center" style={{ color: "#a0abc3" }}>Laden...</p>;

  const isDef = status?.is_definitief || false;

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Status</span>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: isDef ? "rgba(63,255,139,0.1)" : "#102038", color: isDef ? "#3fff8b" : "#a0abc3" }}>
            {isDef ? "Definitief" : "Concept"}
          </span>
        </div>

        {isDef ? (
          <>
            <p className="text-sm" style={{ color: "#dae6ff" }}>
              Gepubliceerd op {status?.definitief_op ? new Date(status.definitief_op).toLocaleDateString("nl-NL") : "–"}{" "}
              {status?.definitief_door_naam && <>door {status.definitief_door_naam}</>}
            </p>
            <button onClick={() => navigate(`/projecten/${projectId}/planning`)} className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 text-white" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)" }}>
              <CalendarDays className="h-4 w-4" /> Planning bekijken <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => toggleDefinitief(false)} className="w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5" style={{ border: "1px solid rgba(255,113,108,0.3)", color: "#ff716c" }}>
              <RotateCcw className="h-3.5 w-3.5" /> Terug naar concept
            </button>
          </>
        ) : (
          <>
            <p className="text-sm" style={{ color: "#a0abc3" }}>Planning nog niet gepubliceerd. Monteurs kunnen de planning nog niet inzien.</p>
            <button onClick={() => navigate(`/projecten/${projectId}/planning`)} className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 text-white" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)" }}>
              <CalendarDays className="h-4 w-4" /> Naar uitvoeringsplanning <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => toggleDefinitief(true)} className="w-full py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5" style={{ border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>
              Publiceren als definitief
            </button>
          </>
        )}
      </div>
    </div>
  );
}
