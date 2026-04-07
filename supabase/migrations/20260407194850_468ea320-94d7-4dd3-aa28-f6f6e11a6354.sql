
-- Function to notify managers when a new inkooporder is created by a medewerker
CREATE OR REPLACE FUNCTION public.notify_manager_inkooporder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _naam text;
  _is_manager boolean;
BEGIN
  -- Get the name of the medewerker
  SELECT full_name INTO _naam FROM profiles WHERE id = NEW.medewerker_id;

  -- Check if the creator is a manager (managers don't need self-notification)
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN profiles p ON p.user_id = ur.user_id
    WHERE p.id = NEW.medewerker_id AND ur.role = 'manager'
  ) INTO _is_manager;

  IF _is_manager THEN
    RETURN NEW;
  END IF;

  -- Insert a mededeling for managers
  INSERT INTO mededelingen (titel, inhoud, verzonden_door, ontvanger_type, urgentie)
  SELECT
    'Inkooporder aangevraagd: ' || NEW.order_nummer,
    COALESCE(_naam, 'Medewerker') || ' heeft inkooporder ' || NEW.order_nummer || ' aangevraagd (€ ' || COALESCE(NEW.totaal_incl_btw::text, '0') || ' incl. BTW).',
    p.id,
    'persoon',
    'normaal'
  FROM profiles p
  JOIN user_roles ur ON ur.user_id = p.user_id
  WHERE ur.role = 'manager'
  LIMIT 1;

  -- Set ontvanger_id to the manager
  UPDATE mededelingen
  SET ontvanger_id = (
    SELECT p.id FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.user_id
    WHERE ur.role = 'manager'
    LIMIT 1
  ),
  ontvanger_type = 'persoon'
  WHERE titel = 'Inkooporder aangevraagd: ' || NEW.order_nummer
  AND created_at >= now() - interval '5 seconds';

  RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER trg_notify_manager_inkooporder
AFTER INSERT ON public.inkooporders
FOR EACH ROW
EXECUTE FUNCTION public.notify_manager_inkooporder();
