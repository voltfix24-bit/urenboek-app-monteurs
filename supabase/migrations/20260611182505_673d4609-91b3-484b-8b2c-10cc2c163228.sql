
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS planner_sync_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS planner_sync_exclusion_reason text NULL;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_planner_sync_reason_chk;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_planner_sync_reason_chk
  CHECK (
    (planner_sync_enabled = true  AND planner_sync_exclusion_reason IS NULL)
    OR
    (planner_sync_enabled = false AND planner_sync_exclusion_reason IN ('urenregistratie','historisch_afgerond','anders'))
  );

DO $$
DECLARE
  v_expected jsonb := '[
    {"nummer":"001",     "naam":"Meeloopuren van Gelder",            "reden":"urenregistratie"},
    {"nummer":"0011",    "naam":"Verlet",                             "reden":"urenregistratie"},
    {"nummer":"Hanab",   "naam":"HANAB",                              "reden":"urenregistratie"},
    {"nummer":"0283757", "naam":"IJzerpad 1 Rutten",                  "reden":"historisch_afgerond"},
    {"nummer":"0311927", "naam":"Burgemeester van der Fletzlaan 12",  "reden":"historisch_afgerond"},
    {"nummer":"0332248", "naam":"RIJKSWEG 266",                       "reden":"historisch_afgerond"},
    {"nummer":"0335065", "naam":"Mackaylaan 1",                       "reden":"historisch_afgerond"},
    {"nummer":"318650",  "naam":"Dennenheuvel",                       "reden":"historisch_afgerond"},
    {"nummer":"0237253", "naam":"Hoenderparkweg 86",                  "reden":"historisch_afgerond"}
  ]'::jsonb;
  v_item jsonb;
  v_cnt int;
  v_found_naam text;
  v_upd_total int := 0;
  v_upd int;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_expected)
  LOOP
    SELECT count(*) INTO v_cnt FROM public.projects WHERE nummer = v_item->>'nummer';
    IF v_cnt = 0 THEN
      RAISE EXCEPTION 'Project ontbreekt: nummer=%', v_item->>'nummer';
    ELSIF v_cnt > 1 THEN
      RAISE EXCEPTION 'Dubbel projectnummer: %', v_item->>'nummer';
    END IF;

    SELECT naam INTO v_found_naam FROM public.projects WHERE nummer = v_item->>'nummer';
    IF v_found_naam IS DISTINCT FROM (v_item->>'naam') THEN
      RAISE EXCEPTION 'Naam wijkt af voor %: db="%", verwacht="%"',
        v_item->>'nummer', v_found_naam, v_item->>'naam';
    END IF;

    UPDATE public.projects
      SET planner_sync_enabled = false,
          planner_sync_exclusion_reason = v_item->>'reden'
      WHERE nummer = v_item->>'nummer'
        AND naam   = v_item->>'naam';

    GET DIAGNOSTICS v_upd = ROW_COUNT;
    IF v_upd <> 1 THEN
      RAISE EXCEPTION 'Update faalde voor % (rijen=%)', v_item->>'nummer', v_upd;
    END IF;
    v_upd_total := v_upd_total + v_upd;
  END LOOP;

  IF v_upd_total <> 9 THEN
    RAISE EXCEPTION 'Verwacht 9 uitsluitingen, kreeg %', v_upd_total;
  END IF;
END $$;
