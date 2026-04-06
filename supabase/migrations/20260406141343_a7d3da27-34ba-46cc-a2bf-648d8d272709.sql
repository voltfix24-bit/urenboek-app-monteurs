
-- Create contract_berichten table
CREATE TABLE public.contract_berichten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracten(id) ON DELETE CASCADE,
  richting text NOT NULL CHECK (richting IN ('kandidaat_naar_manager', 'manager_naar_kandidaat')),
  bericht_type text NOT NULL CHECK (bericht_type IN ('correctie_verzoek', 'reactie_manager', 'opnieuw_verstuurd')),
  wat_klopt_niet text[] DEFAULT '{}',
  toelichting text DEFAULT '',
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  gelezen_op timestamptz
);

-- Enable RLS
ALTER TABLE public.contract_berichten ENABLE ROW LEVEL SECURITY;

-- Managers full access
CREATE POLICY "Managers full access contract_berichten"
  ON public.contract_berichten FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

-- No direct client access (candidates use edge function)
CREATE POLICY "No direct client insert contract_berichten"
  ON public.contract_berichten FOR INSERT
  TO anon
  WITH CHECK (false);

-- Update contract status validation to include 'correctie_gevraagd'
CREATE OR REPLACE FUNCTION public.validate_contract_status()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('concept','verstuurd','ondertekend_ot','ondertekend_beiden','verlopen','opgezegd','correctie_gevraagd') THEN
    RAISE EXCEPTION 'Ongeldige contract status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$;
