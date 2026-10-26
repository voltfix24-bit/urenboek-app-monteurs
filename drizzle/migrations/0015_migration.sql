CREATE OR REPLACE FUNCTION public.next_contract_nummer()
 RETURNS text LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  jaar text := to_char(now(), 'YYYY');
  volg integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('next_contract_nummer'));
  SELECT COALESCE(MAX((substring(contract_nummer from '(\d+)$'))::int), 0) + 1 INTO volg
  FROM contracten
  WHERE contract_nummer ~ ('^TV-CONTRACT-' || jaar || '-\d+$');
  RETURN 'TV-CONTRACT-' || jaar || '-' || lpad(volg::text, 3, '0');
END;
$function$;