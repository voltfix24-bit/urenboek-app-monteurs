ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ploeg text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS benodigd_per_dag integer;
GRANT SELECT (benodigd_per_dag) ON public.projects TO authenticated;
ALTER TABLE public.bedrijfsgegevens ADD COLUMN IF NOT EXISTS planning_weekgrens integer NOT NULL DEFAULT 40;

CREATE TABLE public.planning_gelezen (
  medewerker_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  gelezen_op timestamptz,
  laatst_gepubliceerd_op timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.planning_gelezen TO authenticated;
GRANT ALL ON public.planning_gelezen TO service_role;
ALTER TABLE public.planning_gelezen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers lezen gelezen-status" ON public.planning_gelezen FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'manager'));
CREATE POLICY "Eigen gelezen-status lezen" ON public.planning_gelezen FOR SELECT TO authenticated
  USING (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Eigen gelezen-status invoegen" ON public.planning_gelezen FOR INSERT TO authenticated
  WITH CHECK (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Eigen gelezen-status bijwerken" ON public.planning_gelezen FOR UPDATE TO authenticated
  USING (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.bescherm_laatst_gepubliceerd()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'manager') THEN
    IF TG_OP = 'INSERT' THEN NEW.laatst_gepubliceerd_op := NULL;
    ELSE NEW.laatst_gepubliceerd_op := OLD.laatst_gepubliceerd_op; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER planning_gelezen_bescherm BEFORE INSERT OR UPDATE ON public.planning_gelezen
  FOR EACH ROW EXECUTE FUNCTION public.bescherm_laatst_gepubliceerd();

CREATE TABLE public.medewerker_meldingen_log (
  sleutel text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.medewerker_meldingen_log TO service_role;
ALTER TABLE public.medewerker_meldingen_log ENABLE ROW LEVEL SECURITY;

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

  INSERT INTO public.planning_gelezen (medewerker_id, laatst_gepubliceerd_op)
  SELECT DISTINCT m, now() FROM unnest(_medewerkers) m WHERE m IS NOT NULL
  ON CONFLICT (medewerker_id) DO UPDATE SET laatst_gepubliceerd_op = now();

  RETURN jsonb_build_object(
    'nieuw', _nieuw,
    'gewijzigd', _gewijzigd,
    'verwijderd', _verwijderd,
    'overgeslagen', _overgeslagen,
    'medewerker_ids', COALESCE((SELECT jsonb_agg(DISTINCT m) FROM unnest(_medewerkers) m), '[]'::jsonb)
  );
END;
$function$;