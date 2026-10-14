ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS planbaar boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS planbaar_reden text,
  ADD COLUMN IF NOT EXISTS planbaar_tot date,
  ADD COLUMN IF NOT EXISTS uit_dienst_op date,
  ADD COLUMN IF NOT EXISTS uit_dienst_reden text,
  ADD COLUMN IF NOT EXISTS avb_polis_tot date,
  ADD COLUMN IF NOT EXISTS g_rekening text,
  ADD COLUMN IF NOT EXISTS verklaring_betalingsgedrag_op date,
  ADD COLUMN IF NOT EXISTS kvk_uittreksel_op date;

UPDATE public.profiles p SET planbaar = false
  FROM public.user_roles r WHERE r.user_id = p.user_id AND r.role = 'manager';

ALTER TABLE public.bedrijfsgegevens ADD COLUMN IF NOT EXISTS dba_signaal_weken integer NOT NULL DEFAULT 12;

CREATE TABLE public.aanwijs_partijen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam text UNIQUE NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aanwijs_partijen TO authenticated;
GRANT ALL ON public.aanwijs_partijen TO service_role;
ALTER TABLE public.aanwijs_partijen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers beheren partijen" ON public.aanwijs_partijen FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'manager')) WITH CHECK (public.has_role(auth.uid(),'manager'));
CREATE POLICY "Ingelogden lezen partijen" ON public.aanwijs_partijen FOR SELECT TO authenticated USING (true);

CREATE TABLE public.aanwijzingen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medewerker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  norm text NOT NULL CHECK (norm IN ('BEI','BEI BLS','BEI BHS')),
  rol text NOT NULL CHECK (rol IN ('VOP','VP','AVP','WV')),
  partij_id uuid NOT NULL REFERENCES public.aanwijs_partijen(id),
  aangewezen_door text NOT NULL,
  aangewezen_op date NOT NULL,
  geldig_tot date NOT NULL,
  brief_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (medewerker_id, norm, partij_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aanwijzingen TO authenticated;
GRANT ALL ON public.aanwijzingen TO service_role;
ALTER TABLE public.aanwijzingen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers beheren aanwijzingen" ON public.aanwijzingen FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'manager')) WITH CHECK (public.has_role(auth.uid(),'manager'));
CREATE POLICY "Eigen aanwijzingen lezen" ON public.aanwijzingen FOR SELECT TO authenticated
  USING (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE TABLE public.dba_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medewerker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vastgelegd_op date NOT NULL DEFAULT current_date,
  vastgelegd_door uuid REFERENCES public.profiles(id),
  antwoorden jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dba_checks TO authenticated;
GRANT ALL ON public.dba_checks TO service_role;
ALTER TABLE public.dba_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers beheren dba_checks" ON public.dba_checks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'manager')) WITH CHECK (public.has_role(auth.uid(),'manager'));
CREATE POLICY "Eigen dba_checks lezen" ON public.dba_checks FOR SELECT TO authenticated
  USING (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE TABLE public.tarieven (
  medewerker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  jaar integer NOT NULL,
  uurtarief numeric NOT NULL,
  PRIMARY KEY (medewerker_id, jaar)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarieven TO authenticated;
GRANT ALL ON public.tarieven TO service_role;
ALTER TABLE public.tarieven ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers beheren tarieven" ON public.tarieven FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'manager')) WITH CHECK (public.has_role(auth.uid(),'manager'));
CREATE POLICY "Eigen tarieven lezen" ON public.tarieven FOR SELECT TO authenticated
  USING (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.prevent_protected_profile_fields()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'manager') THEN
    RETURN NEW;
  END IF;
  IF NEW.uurtarief IS DISTINCT FROM OLD.uurtarief
     OR NEW.onderaannemer_km_tarief IS DISTINCT FROM OLD.onderaannemer_km_tarief
     OR NEW.onderaannemer_vrije_km_per_dag IS DISTINCT FROM OLD.onderaannemer_vrije_km_per_dag
     OR NEW.onderaannemer_reiskosten_per_ploeg IS DISTINCT FROM OLD.onderaannemer_reiskosten_per_ploeg
     OR NEW.onderaannemer_startlocatie IS DISTINCT FROM OLD.onderaannemer_startlocatie
     OR NEW.is_onderaannemer IS DISTINCT FROM OLD.is_onderaannemer
     OR NEW.onderaannemer_id IS DISTINCT FROM OLD.onderaannemer_id
     OR NEW.planning_partner_ids IS DISTINCT FROM OLD.planning_partner_ids
     OR NEW.account_status IS DISTINCT FROM OLD.account_status
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.geverifieerd_door IS DISTINCT FROM OLD.geverifieerd_door
     OR NEW.geverifieerd_op IS DISTINCT FROM OLD.geverifieerd_op
     OR NEW.contract_einddatum IS DISTINCT FROM OLD.contract_einddatum
     OR NEW.invited_at IS DISTINCT FROM OLD.invited_at
     OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
     OR NEW.planbaar IS DISTINCT FROM OLD.planbaar
     OR NEW.planbaar_reden IS DISTINCT FROM OLD.planbaar_reden
     OR NEW.planbaar_tot IS DISTINCT FROM OLD.planbaar_tot
     OR NEW.uit_dienst_op IS DISTINCT FROM OLD.uit_dienst_op
     OR NEW.uit_dienst_reden IS DISTINCT FROM OLD.uit_dienst_reden
  THEN
    RAISE EXCEPTION 'Onvoldoende rechten: tarief/rol/koppelingsvelden mogen alleen door een manager gewijzigd worden';
  END IF;
  RETURN NEW;
END;
$function$;