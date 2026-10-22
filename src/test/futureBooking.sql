-- All temporary bookings roll back; existing rows remain untouched.
DO $$
DECLARE
  _m uuid; _p uuid; _blocked boolean;
  _day date := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Amsterdam')::date + 1;
BEGIN
  SELECT id INTO _m FROM public.profiles ORDER BY id LIMIT 1;
  SELECT id INTO _p FROM public.projects ORDER BY id LIMIT 1;
  BEGIN
    _blocked := false;
    BEGIN
      INSERT INTO public.uren_boekingen(medewerker_id, project_id, datum, uren, status)
      VALUES (_m, _p, _day, 1, 'concept');
    EXCEPTION WHEN check_violation THEN
      IF SQLERRM <> 'Uren boeken kan pas op de geplande dag of daarna.' THEN RAISE; END IF;
      _blocked := true;
    END;
    IF NOT _blocked THEN RAISE EXCEPTION 'Future booking accepted'; END IF;
    RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'Rollback successful tests';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;
END $$;