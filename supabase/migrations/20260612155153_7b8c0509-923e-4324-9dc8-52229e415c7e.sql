
CREATE TABLE public.planner_planning_sync_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_user_id uuid NOT NULL,
  external_id text NOT NULL,
  datum date NOT NULL,
  planning_id uuid,
  uitkomst text NOT NULL,
  fout_reden text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planner_planning_sync_audit_uitkomst_check
    CHECK (uitkomst = ANY (ARRAY['gesynchroniseerd','reeds_gesynchroniseerd','geweigerd','fout']))
);

CREATE INDEX idx_planner_planning_sync_audit_created
  ON public.planner_planning_sync_audit (created_at DESC);
CREATE INDEX idx_planner_planning_sync_audit_external
  ON public.planner_planning_sync_audit (external_id);

GRANT SELECT ON public.planner_planning_sync_audit TO authenticated;
GRANT ALL ON public.planner_planning_sync_audit TO service_role;

ALTER TABLE public.planner_planning_sync_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers kunnen planning-sync auditlog lezen"
  ON public.planner_planning_sync_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

CREATE OR REPLACE FUNCTION public.sync_planner_planning_item_v1(
  _manager_profile_id uuid,
  _external_id text,
  _datum date,
  _project_id uuid,
  _medewerker_id uuid,
  _activiteit text,
  _kleur text,
  _notitie text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_id uuid;
  _existing_id uuid;
  _handmatig_count int;
  _ander_planner_count int;
BEGIN
  -- Serialize concurrent attempts voor exact dezelfde externe ID
  PERFORM pg_advisory_xact_lock(hashtext('planner_planning_sync:' || _external_id));

  -- Idempotent: zelfde externe ID al aanwezig?
  SELECT id INTO _existing_id
    FROM public.planning
    WHERE external_source = 'terrevolt_planner'
      AND external_id = _external_id
    LIMIT 1;
  IF _existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'uitkomst', 'reeds_gesynchroniseerd',
      'planning_id', _existing_id
    );
  END IF;

  -- Handmatige planning voor zelfde monteur en datum?
  SELECT count(*) INTO _handmatig_count
    FROM public.planning
   WHERE medewerker_id = _medewerker_id
     AND datum = _datum
     AND (external_source IS NULL OR external_source <> 'terrevolt_planner');
  IF _handmatig_count > 0 THEN
    RETURN jsonb_build_object('uitkomst','geweigerd','fout_reden','overlap_handmatige_planning');
  END IF;

  -- Andere externe Planner-regel voor zelfde monteur en datum (ander project)?
  SELECT count(*) INTO _ander_planner_count
    FROM public.planning
   WHERE medewerker_id = _medewerker_id
     AND datum = _datum
     AND external_source = 'terrevolt_planner';
  IF _ander_planner_count > 0 THEN
    RETURN jsonb_build_object('uitkomst','geweigerd','fout_reden','andere_planner_regel_zelfde_dag');
  END IF;

  INSERT INTO public.planning (
    medewerker_id, project_id, datum,
    starttijd, eindtijd, notitie,
    created_by,
    activiteit, activiteit_kleur,
    external_source, external_id, external_updated_at, sync_locked
  ) VALUES (
    _medewerker_id, _project_id, _datum,
    '07:00:00', '16:00:00', COALESCE(_notitie, ''),
    _manager_profile_id,
    _activiteit, _kleur,
    'terrevolt_planner', _external_id, now(), true
  )
  RETURNING id INTO _new_id;

  RETURN jsonb_build_object('uitkomst','gesynchroniseerd','planning_id', _new_id);
EXCEPTION
  WHEN unique_violation THEN
    -- Race: andere transactie heeft net de externe ID ingevoegd.
    SELECT id INTO _existing_id
      FROM public.planning
      WHERE external_source = 'terrevolt_planner'
        AND external_id = _external_id
      LIMIT 1;
    RETURN jsonb_build_object('uitkomst','reeds_gesynchroniseerd','planning_id', _existing_id);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_planner_planning_item_v1(uuid,text,date,uuid,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_planner_planning_item_v1(uuid,text,date,uuid,uuid,text,text,text) TO service_role;
