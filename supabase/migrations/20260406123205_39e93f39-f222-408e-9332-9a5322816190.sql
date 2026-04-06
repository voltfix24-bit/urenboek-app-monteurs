
-- Kandidaten tabel
CREATE TABLE public.kandidaten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voornaam text NOT NULL,
  achternaam text NOT NULL,
  email text NOT NULL,
  telefoon text,
  notities text,
  status text NOT NULL DEFAULT 'gesprek',
  afgesproken_tarief numeric,
  aangemaakt_door uuid NOT NULL REFERENCES public.profiles(id),
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  profiel_id uuid REFERENCES public.profiles(id)
);

-- Validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_kandidaat_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('gesprek','tarief_afgesproken','uitgenodigd','gecontracteerd','afgewezen') THEN
    RAISE EXCEPTION 'Ongeldige kandidaat status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_kandidaat_status
BEFORE INSERT OR UPDATE ON public.kandidaten
FOR EACH ROW EXECUTE FUNCTION public.validate_kandidaat_status();

ALTER TABLE public.kandidaten ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers full access kandidaten" ON public.kandidaten
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'manager'));

-- Contracten tabel
CREATE TABLE public.contracten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_nummer text UNIQUE NOT NULL,
  kandidaat_id uuid REFERENCES public.kandidaten(id),
  profiel_id uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'concept',
  contract_data jsonb NOT NULL DEFAULT '{}',
  ot_naam text,
  ot_handtekening text,
  ot_ip text,
  ot_user_agent text,
  ot_timestamp timestamptz,
  og_profiel_id uuid REFERENCES public.profiles(id),
  og_naam text,
  og_handtekening text,
  og_ip text,
  og_user_agent text,
  og_timestamp timestamptz,
  pdf_path text,
  pdf_hash text,
  startdatum date,
  einddatum date,
  herinnering_verstuurd boolean NOT NULL DEFAULT false,
  aangemaakt_door uuid NOT NULL REFERENCES public.profiles(id),
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.validate_contract_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('concept','verstuurd','ondertekend_ot','ondertekend_beiden','verlopen','opgezegd') THEN
    RAISE EXCEPTION 'Ongeldige contract status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_contract_status
BEFORE INSERT OR UPDATE ON public.contracten
FOR EACH ROW EXECUTE FUNCTION public.validate_contract_status();

CREATE TRIGGER update_contracten_updated_at
BEFORE UPDATE ON public.contracten
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.contracten ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers full access contracten" ON public.contracten
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'manager'));

CREATE POLICY "Monteurs can view own contracten" ON public.contracten
  FOR SELECT TO authenticated
  USING (profiel_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Manager handtekeningen
CREATE TABLE public.manager_handtekeningen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profiel_id uuid UNIQUE NOT NULL REFERENCES public.profiles(id),
  handtekening text NOT NULL,
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  updated_op timestamptz
);

ALTER TABLE public.manager_handtekeningen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager sees own handtekening" ON public.manager_handtekeningen
  FOR SELECT TO authenticated
  USING (profiel_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Manager manages own handtekening" ON public.manager_handtekeningen
  FOR INSERT TO authenticated
  WITH CHECK (profiel_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Manager updates own handtekening" ON public.manager_handtekeningen
  FOR UPDATE TO authenticated
  USING (profiel_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Managers can also view all handtekeningen (for contract creation flow)
CREATE POLICY "Managers view all handtekeningen" ON public.manager_handtekeningen
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'manager'));

-- Contract tokens
CREATE TABLE public.contract_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracten(id),
  token text UNIQUE NOT NULL,
  geldig_tot timestamptz NOT NULL,
  gebruikt boolean NOT NULL DEFAULT false,
  gebruikt_op timestamptz
);

ALTER TABLE public.contract_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access tokens" ON public.contract_tokens
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('contracten', 'contracten', false);

CREATE POLICY "Managers can read contracten files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'contracten' AND has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can write contracten files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contracten' AND has_role(auth.uid(), 'manager'));

CREATE POLICY "Monteurs can read own contracten files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'contracten' AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM profiles WHERE user_id = auth.uid()
  ));

-- Contract nummer functie
CREATE OR REPLACE FUNCTION public.next_contract_nummer()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  jaar text := to_char(now(), 'YYYY');
  volg integer;
  nummer text;
BEGIN
  SELECT COUNT(*) + 1 INTO volg
  FROM contracten
  WHERE contract_nummer LIKE 'TV-CONTRACT-' || jaar || '-%';
  nummer := 'TV-CONTRACT-' || jaar || '-' || lpad(volg::text, 3, '0');
  RETURN nummer;
END;
$$;
