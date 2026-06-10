
CREATE OR REPLACE FUNCTION public.prevent_protected_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
  THEN
    RAISE EXCEPTION 'Onvoldoende rechten: tarief/rol/koppelingsvelden mogen alleen door een manager gewijzigd worden';
  END IF;

  RETURN NEW;
END;
$$;
