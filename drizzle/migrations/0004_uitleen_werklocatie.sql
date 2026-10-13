ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS soort text NOT NULL DEFAULT 'project';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_soort_check') THEN
    ALTER TABLE public.projects ADD CONSTRAINT projects_soort_check CHECK (soort IN ('project','uitleen'));
  END IF;
END $$;
GRANT SELECT (soort) ON public.projects TO authenticated;
ALTER TABLE public.planning ADD COLUMN IF NOT EXISTS werklocatie text, ADD COLUMN IF NOT EXISTS contactpersoon text, ADD COLUMN IF NOT EXISTS contact_telefoon text;
ALTER TABLE public.planning_concept ADD COLUMN IF NOT EXISTS werklocatie text, ADD COLUMN IF NOT EXISTS contactpersoon text, ADD COLUMN IF NOT EXISTS contact_telefoon text;

CREATE OR REPLACE FUNCTION public.publiceer_planning(p_van date, p_tot date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  _definitief uuid[] := '{}';
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
      IF EXISTS (SELECT 1 FROM public.planning WHERE medewerker_id = _c.medewerker_id AND datum = _c.datum) THEN
        _overgeslagen := _overgeslagen || jsonb_build_object(
          'medewerker_id', _c.medewerker_id, 'datum', _c.datum, 'reden', 'al_ingepland');
        CONTINUE;
      END IF;
      INSERT INTO public.planning
        (medewerker_id, project_id, datum, starttijd, eindtijd, notitie,
         activiteit, activiteit_kleur, planning_group_id, collega_ids, created_by,
         werklocatie, contactpersoon, contact_telefoon)
      VALUES
        (_c.medewerker_id, _c.project_id, _c.datum, _c.starttijd, _c.eindtijd, COALESCE(_c.notitie, ''),
         _c.activiteit, _c.activiteit_kleur, _c.planning_group_id, _c.collega_ids, _profiel,
         _c.werklocatie, _c.contactpersoon, _c.contact_telefoon);
      _nieuw := _nieuw + 1;
      _medewerkers := array_append(_medewerkers, _c.medewerker_id);
      _projecten := array_append(_projecten, _c.project_id);
      _definitief := array_append(_definitief, _c.project_id);
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
          werklocatie = _c.werklocatie,
          contactpersoon = _c.contactpersoon,
          contact_telefoon = _c.contact_telefoon,
          updated_at = now()
        WHERE id = _c.planning_id;
        _gewijzigd := _gewijzigd + 1;
        _medewerkers := array_append(_medewerkers, _c.medewerker_id);
        _definitief := array_append(_definitief, _c.project_id);
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

  INSERT INTO public.project_planning_status (project_id, is_definitief, definitief_op, definitief_door)
  SELECT DISTINCT p, true, now(), _profiel FROM unnest(_definitief) p WHERE p IS NOT NULL
  ON CONFLICT (project_id) DO UPDATE SET
    is_definitief = true, definitief_op = now(), definitief_door = EXCLUDED.definitief_door;

  RETURN jsonb_build_object(
    'nieuw', _nieuw,
    'gewijzigd', _gewijzigd,
    'verwijderd', _verwijderd,
    'overgeslagen', _overgeslagen,
    'medewerker_ids', COALESCE((SELECT jsonb_agg(DISTINCT m) FROM unnest(_medewerkers) m), '[]'::jsonb)
  );
END;
$function$;