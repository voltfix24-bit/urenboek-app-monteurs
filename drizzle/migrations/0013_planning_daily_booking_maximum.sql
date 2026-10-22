CREATE OR REPLACE FUNCTION public.prevent_booking_above_planning() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _max numeric; _other numeric; _old numeric := 0;
BEGIN
  IF NEW.status = 'afgekeurd' OR NEW.uren <= 0 THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.profiles WHERE id = NEW.medewerker_id FOR UPDATE;
  SELECT sum(round(greatest(0,extract(epoch from (eindtijd-starttijd))/3600-1)*2)/2) INTO _max FROM public.planning WHERE medewerker_id=NEW.medewerker_id AND datum=NEW.datum;
  IF _max IS NULL THEN RETURN NEW; END IF;
  SELECT coalesce(sum(uren),0) INTO _other FROM public.uren_boekingen WHERE medewerker_id=NEW.medewerker_id AND datum=NEW.datum AND status<>'afgekeurd' AND uren>0 AND id IS DISTINCT FROM NEW.id;
  IF TG_OP='UPDATE' AND OLD.medewerker_id=NEW.medewerker_id AND OLD.datum=NEW.datum AND OLD.status<>'afgekeurd' THEN _old := greatest(0,OLD.uren); END IF;
  IF _other+NEW.uren > _max AND NEW.uren > _old THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE=format('Maximaal %s uur boekbaar op %s; %s uur is al geboekt. Laat de gepubliceerde planning aanpassen voor extra uren.',_max,NEW.datum,_other);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.prevent_booking_above_planning() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER prevent_booking_above_planning BEFORE INSERT OR UPDATE OF medewerker_id, datum, uren, status ON public.uren_boekingen FOR EACH ROW EXECUTE FUNCTION public.prevent_booking_above_planning();
CREATE OR REPLACE FUNCTION public.lock_planning_employee_day() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM 1 FROM public.profiles WHERE id=OLD.medewerker_id FOR UPDATE;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
    PERFORM 1 FROM public.profiles WHERE id IN (OLD.medewerker_id,NEW.medewerker_id) ORDER BY id FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.profiles WHERE id=NEW.medewerker_id FOR UPDATE;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.lock_planning_employee_day() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER lock_planning_employee_day BEFORE INSERT OR UPDATE OR DELETE ON public.planning FOR EACH ROW EXECUTE FUNCTION public.lock_planning_employee_day();