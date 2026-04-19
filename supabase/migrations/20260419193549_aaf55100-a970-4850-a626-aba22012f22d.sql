-- Function: stuur mededeling naar alle managers bij ziekmelding
CREATE OR REPLACE FUNCTION public.notify_managers_ziekmelding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _naam text;
  _is_manager boolean;
  _manager_profiel record;
  _inhoud text;
  _periode text;
BEGIN
  -- Alleen voor type = 'ziek'
  IF NEW.type IS DISTINCT FROM 'ziek' THEN
    RETURN NEW;
  END IF;

  -- Naam van de monteur ophalen
  SELECT full_name INTO _naam
  FROM profiles
  WHERE id = NEW.medewerker_id;

  -- Als de melder zelf manager is, geen notificatie
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN profiles p ON p.user_id = ur.user_id
    WHERE p.id = NEW.medewerker_id AND ur.role = 'manager'
  ) INTO _is_manager;

  IF _is_manager THEN
    RETURN NEW;
  END IF;

  -- Periode tekst opbouwen
  IF NEW.datum_van = NEW.datum_tot THEN
    _periode := 'Vanaf ' || to_char(NEW.datum_van, 'DD-MM-YYYY');
  ELSE
    _periode := 'Van ' || to_char(NEW.datum_van, 'DD-MM-YYYY')
      || ' tot ' || to_char(NEW.datum_tot, 'DD-MM-YYYY');
  END IF;

  _inhoud := COALESCE(_naam, 'Een monteur')
    || ' heeft zich ziek gemeld. ' || _periode || '.'
    || CASE
         WHEN NEW.reden IS NOT NULL AND length(trim(NEW.reden)) > 0
           THEN E'\n\nOpmerking: ' || NEW.reden
         ELSE ''
       END;

  -- Voor elke manager een persoonlijke mededeling aanmaken
  FOR _manager_profiel IN
    SELECT DISTINCT p.id
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.user_id
    WHERE ur.role = 'manager'
  LOOP
    INSERT INTO mededelingen (
      titel, inhoud, verzonden_door,
      ontvanger_type, ontvanger_id, urgentie
    )
    VALUES (
      'Ziekmelding: ' || COALESCE(_naam, 'Monteur'),
      _inhoud,
      NEW.medewerker_id,
      'persoon',
      _manager_profiel.id,
      'hoog'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger op beschikbaarheid (alleen bij INSERT)
DROP TRIGGER IF EXISTS trg_notify_managers_ziekmelding ON public.beschikbaarheid;

CREATE TRIGGER trg_notify_managers_ziekmelding
AFTER INSERT ON public.beschikbaarheid
FOR EACH ROW
EXECUTE FUNCTION public.notify_managers_ziekmelding();