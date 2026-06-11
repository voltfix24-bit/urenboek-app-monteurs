CREATE TABLE public.planner_match_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('project','monteur')),
  urenapp_id uuid NOT NULL,
  planner_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('exact','waarschijnlijk')),
  uitkomst text NOT NULL CHECK (uitkomst IN ('gekoppeld','rolled_back','geweigerd','reeds_gekoppeld')),
  fout_reden text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.planner_match_audit TO authenticated;
GRANT ALL ON public.planner_match_audit TO service_role;

ALTER TABLE public.planner_match_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers kunnen auditlog lezen"
  ON public.planner_match_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

CREATE INDEX idx_planner_match_audit_created ON public.planner_match_audit (created_at DESC);
CREATE INDEX idx_planner_match_audit_kind_urenapp ON public.planner_match_audit (kind, urenapp_id);