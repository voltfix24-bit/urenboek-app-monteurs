CREATE OR REPLACE FUNCTION public.validate_kandidaat_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('gesprek','tarief_afgesproken','uitgenodigd','gecontracteerd','afgewezen','on_hold') THEN
    RAISE EXCEPTION 'Ongeldige kandidaat status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$;