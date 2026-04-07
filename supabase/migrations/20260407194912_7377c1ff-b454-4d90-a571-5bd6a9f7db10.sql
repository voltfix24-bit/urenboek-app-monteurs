
CREATE OR REPLACE FUNCTION public.notify_manager_inkooporder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _naam text;
  _is_manager boolean;
  _manager_id uuid;
BEGIN
  SELECT full_name INTO _naam FROM profiles WHERE id = NEW.medewerker_id;

  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN profiles p ON p.user_id = ur.user_id
    WHERE p.id = NEW.medewerker_id AND ur.role = 'manager'
  ) INTO _is_manager;

  IF _is_manager THEN
    RETURN NEW;
  END IF;

  SELECT p.id INTO _manager_id
  FROM profiles p
  JOIN user_roles ur ON ur.user_id = p.user_id
  WHERE ur.role = 'manager'
  LIMIT 1;

  IF _manager_id IS NOT NULL THEN
    INSERT INTO mededelingen (titel, inhoud, verzonden_door, ontvanger_type, ontvanger_id, urgentie)
    VALUES (
      'Inkooporder aangevraagd: ' || NEW.order_nummer,
      COALESCE(_naam, 'Medewerker') || ' heeft inkooporder ' || NEW.order_nummer || ' aangevraagd (€' || COALESCE(NEW.totaal_incl_btw::text, '0') || ' incl. BTW).',
      NEW.medewerker_id,
      'persoon',
      _manager_id,
      'normaal'
    );
  END IF;

  RETURN NEW;
END;
$$;
