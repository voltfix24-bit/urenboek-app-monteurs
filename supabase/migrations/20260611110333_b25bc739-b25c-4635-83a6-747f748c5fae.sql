-- Auditlog voor onderaannemer-koppelingen
CREATE TABLE IF NOT EXISTS public.onderaannemer_koppeling_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monteur_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  oude_onderaannemer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  nieuwe_onderaannemer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  uitgevoerd_door uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reden text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.onderaannemer_koppeling_audit TO authenticated;
GRANT ALL ON public.onderaannemer_koppeling_audit TO service_role;

ALTER TABLE public.onderaannemer_koppeling_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers kunnen audit lezen"
  ON public.onderaannemer_koppeling_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

-- Inserts gebeuren via de RPC (security definer), geen client INSERT policy nodig.

CREATE INDEX IF NOT EXISTS idx_oa_audit_monteur ON public.onderaannemer_koppeling_audit(monteur_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oa_audit_oa ON public.onderaannemer_koppeling_audit(nieuwe_onderaannemer_id, created_at DESC);

-- Manager-only RPC: koppel/loskoppel/overplaats monteur aan onderaannemer.
-- _nieuwe_onderaannemer_id = NULL betekent loskoppelen.
CREATE OR REPLACE FUNCTION public.koppel_monteur_aan_onderaannemer(
  _monteur_id uuid,
  _nieuwe_onderaannemer_id uuid,
  _reden text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_uid uuid := auth.uid();
  _caller_profile_id uuid;
  _oud_id uuid;
  _monteur record;
  _target record;
BEGIN
  IF _caller_uid IS NULL THEN
    RAISE EXCEPTION 'Niet geautoriseerd' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_role(_caller_uid, 'manager') THEN
    RAISE EXCEPTION 'Alleen managers mogen monteurs koppelen' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO _caller_profile_id FROM public.profiles WHERE user_id = _caller_uid LIMIT 1;

  SELECT id, full_name, onderaannemer_id, is_onderaannemer
    INTO _monteur
  FROM public.profiles WHERE id = _monteur_id;

  IF _monteur.id IS NULL THEN
    RAISE EXCEPTION 'Monteurprofiel niet gevonden' USING ERRCODE = 'P0002';
  END IF;

  IF _monteur.is_onderaannemer THEN
    RAISE EXCEPTION 'Dit profiel is zelf een onderaannemer en kan niet als monteur worden gekoppeld'
      USING ERRCODE = '22023';
  END IF;

  IF _nieuwe_onderaannemer_id IS NOT NULL THEN
    SELECT id, full_name, is_onderaannemer, account_status
      INTO _target
    FROM public.profiles WHERE id = _nieuwe_onderaannemer_id;

    IF _target.id IS NULL THEN
      RAISE EXCEPTION 'Doelonderaannemer niet gevonden' USING ERRCODE = 'P0002';
    END IF;

    IF NOT _target.is_onderaannemer THEN
      RAISE EXCEPTION 'Doelprofiel is geen onderaannemer' USING ERRCODE = '22023';
    END IF;
  END IF;

  _oud_id := _monteur.onderaannemer_id;

  -- No-op
  IF _oud_id IS NOT DISTINCT FROM _nieuwe_onderaannemer_id THEN
    RETURN jsonb_build_object('changed', false, 'monteur_id', _monteur_id,
                              'onderaannemer_id', _nieuwe_onderaannemer_id);
  END IF;

  UPDATE public.profiles
    SET onderaannemer_id = _nieuwe_onderaannemer_id
  WHERE id = _monteur_id;

  INSERT INTO public.onderaannemer_koppeling_audit
    (monteur_id, oude_onderaannemer_id, nieuwe_onderaannemer_id, uitgevoerd_door, reden)
  VALUES (_monteur_id, _oud_id, _nieuwe_onderaannemer_id, _caller_profile_id, _reden);

  RETURN jsonb_build_object(
    'changed', true,
    'monteur_id', _monteur_id,
    'oude_onderaannemer_id', _oud_id,
    'nieuwe_onderaannemer_id', _nieuwe_onderaannemer_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.koppel_monteur_aan_onderaannemer(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.koppel_monteur_aan_onderaannemer(uuid, uuid, text) TO authenticated;