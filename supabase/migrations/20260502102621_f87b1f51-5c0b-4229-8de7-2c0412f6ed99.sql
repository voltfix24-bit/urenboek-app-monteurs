-- 1. Veilige ordernummer-generatie (vergrendelt rij tijdens berekening)
CREATE OR REPLACE FUNCTION public.next_inkooporder_nummer()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jaar text := to_char(now(), 'YYYY');
  volg integer;
  nummer text;
BEGIN
  -- Lock op tabel-niveau om race-condities te voorkomen
  PERFORM pg_advisory_xact_lock(hashtext('inkooporder_nummer_' || jaar));

  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(order_nummer, '^TV-' || jaar || '-', ''), '')::int
  ), 0) + 1
  INTO volg
  FROM inkooporders
  WHERE order_nummer ~ ('^TV-' || jaar || '-\d+$');

  nummer := 'TV-' || jaar || '-' || lpad(volg::text, 4, '0');
  RETURN nummer;
END;
$$;

-- Alleen managers (authenticated) mogen 'm aanroepen
REVOKE ALL ON FUNCTION public.next_inkooporder_nummer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_inkooporder_nummer() TO authenticated;

-- 2. Voorkom dubbel-gebruik van een uren-boeking op meerdere inkooporders
CREATE UNIQUE INDEX IF NOT EXISTS inkooporder_regels_uren_boeking_id_unique
  ON public.inkooporder_regels (uren_boeking_id)
  WHERE uren_boeking_id IS NOT NULL;