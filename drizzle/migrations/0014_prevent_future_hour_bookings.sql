CREATE OR REPLACE FUNCTION public.prevent_future_hour_booking()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.datum <= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Amsterdam')::date THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Retain existing records and allow administrative approval/rejection without adding work.
    IF NEW.medewerker_id = OLD.medewerker_id AND NEW.datum = OLD.datum AND NEW.project_id = OLD.project_id
       AND NEW.uren <= OLD.uren AND NEW.type IS NOT DISTINCT FROM OLD.type
       AND NEW.beschrijving IS NOT DISTINCT FROM OLD.beschrijving
       AND (NEW.status = OLD.status OR NEW.status IN ('goedgekeurd', 'afgekeurd')) THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Uren boeken kan pas op de geplande dag of daarna.';
END $$;
CREATE TRIGGER prevent_future_hour_booking BEFORE INSERT OR UPDATE OF datum, medewerker_id, project_id, uren, type, beschrijving, status ON public.uren_boekingen FOR EACH ROW EXECUTE FUNCTION public.prevent_future_hour_booking();