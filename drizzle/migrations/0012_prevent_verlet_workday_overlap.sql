CREATE OR REPLACE FUNCTION public.prevent_verlet_workday_overlap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _verlet boolean;
BEGIN
 IF NEW.status = 'afgekeurd' OR NEW.uren <= 0 THEN RETURN NEW; END IF;
 -- Serialize bookings for one employee, including requests arriving simultaneously.
 PERFORM 1 FROM public.profiles WHERE id = NEW.medewerker_id FOR UPDATE;
 SELECT lower(trim(naam)) = 'verlet' INTO _verlet FROM public.projects WHERE id = NEW.project_id;
 IF EXISTS (
   SELECT 1 FROM public.uren_boekingen b JOIN public.projects p ON p.id=b.project_id
   WHERE b.medewerker_id=NEW.medewerker_id AND b.datum=NEW.datum AND b.id<>NEW.id
     AND b.status<>'afgekeurd' AND b.uren>0
     AND (lower(trim(p.naam))='verlet') IS DISTINCT FROM _verlet
 ) THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Verlet vervangt de werkdag. Verwijder of keur de andere uren op deze dag af voordat je deze uren boekt of goedkeurt.';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_verlet_workday_overlap() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER prevent_verlet_workday_overlap BEFORE INSERT OR UPDATE OF medewerker_id, datum, project_id, uren, status ON public.uren_boekingen FOR EACH ROW EXECUTE FUNCTION public.prevent_verlet_workday_overlap();

CREATE OR REPLACE FUNCTION public.prevent_verlet_order_overlap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _booking public.uren_boekingen%ROWTYPE; _verlet boolean;
BEGIN
 IF NEW.uren_boeking_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO _booking FROM public.uren_boekingen WHERE id=NEW.uren_boeking_id;
 IF NOT FOUND THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.profiles WHERE id=_booking.medewerker_id FOR UPDATE;
 SELECT lower(trim(naam))='verlet' INTO _verlet FROM public.projects WHERE id=_booking.project_id;
 IF EXISTS (
   SELECT 1 FROM public.uren_boekingen b JOIN public.projects p ON p.id=b.project_id
   WHERE b.medewerker_id=_booking.medewerker_id AND b.datum=_booking.datum AND b.id<>_booking.id
     AND b.status<>'afgekeurd' AND b.uren>0
     AND (lower(trim(p.naam))='verlet') IS DISTINCT FROM _verlet
 ) THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Deze dag bevat zowel Verlet als werkuren. Corrigeer de dag voordat je een inkooporder maakt.';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_verlet_order_overlap() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER prevent_verlet_order_overlap BEFORE INSERT OR UPDATE OF uren_boeking_id ON public.inkooporder_regels FOR EACH ROW EXECUTE FUNCTION public.prevent_verlet_order_overlap();