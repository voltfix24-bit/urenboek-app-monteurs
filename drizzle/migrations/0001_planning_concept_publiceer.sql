DO $$ BEGIN
  CREATE TYPE public.planning_concept_actie AS ENUM ('nieuw','wijzig','verwijder');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.planning_concept (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actie public.planning_concept_actie NOT NULL,
  planning_id uuid REFERENCES public.planning(id) ON DELETE CASCADE,
  medewerker_id uuid NOT NULL REFERENCES public.profiles(id),
  datum date NOT NULL,
  project_id uuid REFERENCES public.projects(id),
  starttijd time,
  eindtijd time,
  notitie text DEFAULT '',
  activiteit text,
  activiteit_kleur text,
  planning_group_id uuid,
  collega_ids uuid[],
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planning_concept_medewerker_datum_key UNIQUE (medewerker_id, datum),
  CONSTRAINT planning_concept_actie_velden CHECK (
    (actie = 'nieuw' AND planning_id IS NULL AND project_id IS NOT NULL AND starttijd IS NOT NULL AND eindtijd IS NOT NULL)
    OR (actie = 'wijzig' AND planning_id IS NOT NULL AND project_id IS NOT NULL AND starttijd IS NOT NULL AND eindtijd IS NOT NULL)
    OR (actie = 'verwijder' AND planning_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS planning_concept_datum_idx ON public.planning_concept (datum);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning_concept TO authenticated;
GRANT ALL ON public.planning_concept TO service_role;
REVOKE ALL ON public.planning_concept FROM anon;

ALTER TABLE public.planning_concept ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers beheren concept" ON public.planning_concept;
CREATE POLICY "managers beheren concept" ON public.planning_concept
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'manager'::public.app_role));

DROP TRIGGER IF EXISTS planning_concept_updated_at ON public.planning_concept;
CREATE TRIGGER planning_concept_updated_at BEFORE UPDATE ON public.planning_concept
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.bedrijfsgegevens ADD COLUMN IF NOT EXISTS planning_conceptmodus boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.publiceer_planning(p_van date, p_tot date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profiel uuid;
  _c record;
  _doel record;
  _nieuw int := 0;
  _gewijzigd int := 0;
  _verwijderd int := 0;
  _overgeslagen jsonb := '[]'::jsonb;
  _medewerkers uuid[] := '{}';
  _projecten uuid[] := '{}';
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'manager'::public.app_role) THEN
    RAISE EXCEPTION 'Alleen managers' USING ERRCODE = '42501';
  END IF;
  IF p_van IS NULL OR p_tot IS NULL OR p_tot < p_van THEN
    RAISE EXCEPTION 'Ongeldig bereik' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO _profiel FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF _profiel IS NULL THEN
    RAISE EXCEPTION 'Geen profiel gevonden' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('publiceer_planning'));

  FOR _c IN
    SELECT * FROM public.planning_concept
     WHERE datum BETWEEN p_van AND p_tot
     ORDER BY datum, medewerker_id
     FOR UPDATE
  LOOP
    IF _c.actie = 'nieuw' THEN
      INSERT INTO public.planning
        (medewerker_id, project_id, datum, starttijd, eindtijd, notitie,
         activiteit, activiteit_kleur, planning_group_id, collega_ids, created_by)
      VALUES
        (_c.medewerker_id, _c.project_id, _c.datum, _c.starttijd, _c.eindtijd, COALESCE(_c.notitie, ''),
         _c.activiteit, _c.activiteit_kleur, _c.planning_group_id, _c.collega_ids, _profiel);
      _nieuw := _nieuw + 1;
      _medewerkers := array_append(_medewerkers, _c.medewerker_id);
      _projecten := array_append(_projecten, _c.project_id);
    ELSE
      SELECT id, external_source, sync_locked INTO _doel
        FROM public.planning WHERE id = _c.planning_id FOR UPDATE;

      IF NOT FOUND THEN
        _overgeslagen := _overgeslagen || jsonb_build_object(
          'medewerker_id', _c.medewerker_id, 'datum', _c.datum, 'reden', 'regel_bestaat_niet');
      ELSIF _doel.external_source = 'terrevolt_planner' OR _doel.sync_locked THEN
        _overgeslagen := _overgeslagen || jsonb_build_object(
          'medewerker_id', _c.medewerker_id, 'datum', _c.datum, 'reden', 'planner_beschermd');
      ELSIF _c.actie = 'wijzig' THEN
        UPDATE public.planning SET
          project_id = _c.project_id,
          medewerker_id = _c.medewerker_id,
          datum = _c.datum,
          starttijd = _c.starttijd,
          eindtijd = _c.eindtijd,
          notitie = COALESCE(_c.notitie, ''),
          activiteit = _c.activiteit,
          activiteit_kleur = _c.activiteit_kleur,
          planning_group_id = _c.planning_group_id,
          collega_ids = _c.collega_ids,
          updated_at = now()
        WHERE id = _c.planning_id;
        _gewijzigd := _gewijzigd + 1;
        _medewerkers := array_append(_medewerkers, _c.medewerker_id);
      ELSE
        DELETE FROM public.planning WHERE id = _c.planning_id;
        _verwijderd := _verwijderd + 1;
        _medewerkers := array_append(_medewerkers, _c.medewerker_id);
      END IF;
    END IF;
  END LOOP;

  DELETE FROM public.planning_concept WHERE datum BETWEEN p_van AND p_tot;

  IF array_length(_projecten, 1) > 0 THEN
    UPDATE public.projects SET
      status = 'in_uitvoering',
      status_gewijzigd_op = now(),
      status_gewijzigd_door = _profiel
    WHERE id = ANY(_projecten) AND status IN ('nieuw','gepland');
  END IF;

  RETURN jsonb_build_object(
    'nieuw', _nieuw,
    'gewijzigd', _gewijzigd,
    'verwijderd', _verwijderd,
    'overgeslagen', _overgeslagen,
    'medewerker_ids', COALESCE((SELECT jsonb_agg(DISTINCT m) FROM unnest(_medewerkers) m), '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.publiceer_planning(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publiceer_planning(date, date) TO authenticated, service_role;