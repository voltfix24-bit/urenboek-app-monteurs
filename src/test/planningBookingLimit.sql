-- Transactional regressions: all temporary rows roll back in the exception block.
DO $$
DECLARE
  _m uuid; _p uuid; _creator uuid; _b uuid; _blocked boolean;
BEGIN
  SELECT id INTO _m FROM public.profiles ORDER BY id LIMIT 1;
  SELECT id INTO _p FROM public.projects ORDER BY id LIMIT 1;
  _creator := _m;
  IF EXISTS (SELECT 1 FROM public.planning WHERE medewerker_id=_m AND datum='2099-02-03')
     OR EXISTS (SELECT 1 FROM public.uren_boekingen WHERE medewerker_id=_m AND datum='2099-02-03')
     OR EXISTS (SELECT 1 FROM public.planning_concept WHERE medewerker_id=_m AND datum='2099-02-03') THEN
    RAISE EXCEPTION 'Test date occupied';
  END IF;
  BEGIN
    INSERT INTO public.planning(medewerker_id,project_id,datum,starttijd,eindtijd,created_by)
    VALUES (_m,_p,'2099-02-03','07:00','13:00',_creator);
    -- Draft 8h must not override published 5h.
    INSERT INTO public.planning_concept(medewerker_id,project_id,datum,starttijd,eindtijd,actie,created_by)
    VALUES (_m,_p,'2099-02-03','07:00','16:00','nieuw',_creator);
    INSERT INTO public.uren_boekingen(medewerker_id,project_id,datum,uren,status)
    VALUES (_m,_p,'2099-02-03',5,'concept') RETURNING id INTO _b;
    _blocked := false;
    BEGIN
      UPDATE public.uren_boekingen SET uren=6,beschrijving='extra met toelichting' WHERE id=_b;
    EXCEPTION WHEN check_violation THEN _blocked := true; END;
    IF NOT _blocked THEN RAISE EXCEPTION '6 hours accepted against published 5'; END IF;
    _blocked := false;
    BEGIN
      INSERT INTO public.uren_boekingen(medewerker_id,project_id,datum,uren,status) VALUES (_m,_p,'2099-02-03',1,'concept');
    EXCEPTION WHEN check_violation THEN _blocked := true; END;
    IF NOT _blocked THEN RAISE EXCEPTION 'Split booking bypassed 5 hour cap'; END IF;
    UPDATE public.uren_boekingen SET uren=4 WHERE id=_b;
    INSERT INTO public.uren_boekingen(medewerker_id,project_id,datum,uren,status) VALUES (_m,_p,'2099-02-03',1,'concept');
    INSERT INTO public.uren_boekingen(medewerker_id,project_id,datum,uren,status) VALUES (_m,_p,'2099-02-03',1,'afgekeurd');
    _blocked := false;
    BEGIN
      UPDATE public.uren_boekingen SET status='ingediend' WHERE medewerker_id=_m AND datum='2099-02-03' AND status='afgekeurd';
    EXCEPTION WHEN check_violation THEN _blocked := true; END;
    IF NOT _blocked THEN RAISE EXCEPTION 'Reactivation bypassed cap'; END IF;
    -- Lowering planning keeps existing hours, but never allows increases.
    UPDATE public.planning SET eindtijd='12:00' WHERE medewerker_id=_m AND datum='2099-02-03';
    UPDATE public.uren_boekingen SET status='ingediend' WHERE id=_b;
    UPDATE public.uren_boekingen SET uren=3 WHERE id=_b;
    IF (SELECT sum(uren) FROM public.uren_boekingen WHERE medewerker_id=_m AND datum='2099-02-03' AND status<>'afgekeurd') <> 4 THEN
      RAISE EXCEPTION 'Correction did not yield 4 hours';
    END IF;
    RAISE EXCEPTION USING ERRCODE='ZX001', MESSAGE='Rollback successful tests';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;
END $$;