-- Database regression test. Every temporary booking is rolled back by the
-- enclosing exception block; existing employee/project rows are read only.
DO $$
DECLARE
  _employee uuid := '7ea777e3-3f65-4b3d-a1a1-9dd1a17abf11';
  _work uuid := 'c29a527f-6df2-4f7e-a4d9-de09f8a0b392';
  _verlet uuid := 'e1531c7d-9e93-432a-98b2-d19224a0af81';
  _blocked boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM public.uren_boekingen WHERE medewerker_id=_employee AND datum BETWEEN '2000-01-05' AND '2000-01-07') THEN
    RAISE EXCEPTION 'Test dates are occupied';
  END IF;
  BEGIN
    -- Full workday plus Verlet is prohibited (8 + 8).
    INSERT INTO public.uren_boekingen(medewerker_id,project_id,datum,uren) VALUES (_employee,_work,'2000-01-05',8);
    _blocked := false;
    BEGIN
      INSERT INTO public.uren_boekingen(medewerker_id,project_id,datum,uren) VALUES (_employee,_verlet,'2000-01-05',8);
    EXCEPTION WHEN check_violation THEN _blocked := true;
    END;
    IF NOT _blocked THEN RAISE EXCEPTION '8 work + 8 Verlet was accepted'; END IF;

    -- Even partial work plus Verlet is prohibited, in reverse insert order.
    INSERT INTO public.uren_boekingen(medewerker_id,project_id,datum,uren) VALUES (_employee,_verlet,'2000-01-06',4);
    _blocked := false;
    BEGIN
      INSERT INTO public.uren_boekingen(medewerker_id,project_id,datum,uren) VALUES (_employee,_work,'2000-01-06',4);
    EXCEPTION WHEN check_violation THEN _blocked := true;
    END;
    IF NOT _blocked THEN RAISE EXCEPTION '4 Verlet + 4 work was accepted'; END IF;

    -- Rejected conflicting bookings may exist, but cannot be approved.
    INSERT INTO public.uren_boekingen(medewerker_id,project_id,datum,uren,status) VALUES (_employee,_work,'2000-01-06',4,'afgekeurd');
    _blocked := false;
    BEGIN
      UPDATE public.uren_boekingen SET status='goedgekeurd' WHERE medewerker_id=_employee AND datum='2000-01-06' AND project_id=_work;
    EXCEPTION WHEN check_violation THEN _blocked := true;
    END;
    IF NOT _blocked THEN RAISE EXCEPTION 'Conflicting work was approved'; END IF;

    -- Overtime without Verlet remains permitted (8 + 4 = 12).
    INSERT INTO public.uren_boekingen(medewerker_id,project_id,datum,uren) VALUES (_employee,_work,'2000-01-07',8),(_employee,_work,'2000-01-07',4);
    IF (SELECT sum(uren) FROM public.uren_boekingen WHERE medewerker_id=_employee AND datum='2000-01-07') <> 12 THEN
      RAISE EXCEPTION 'Legitimate 12-hour workday was not retained';
    END IF;
    RAISE EXCEPTION USING ERRCODE='ZX001', MESSAGE='Rollback successful tests';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.uren_boekingen WHERE medewerker_id=_employee AND datum BETWEEN '2000-01-05' AND '2000-01-07') THEN
    RAISE EXCEPTION 'Temporary test bookings remain';
  END IF;
END $$;