CREATE TABLE public.verkooptarieven (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opdrachtgever_id uuid NOT NULL REFERENCES public.opdrachtgevers(id),
  rol text,
  uurtarief numeric NOT NULL CHECK (uurtarief >= 0),
  g_rekening_pct numeric NOT NULL DEFAULT 0 CHECK (g_rekening_pct BETWEEN 0 AND 100),
  geldig_vanaf date NOT NULL,
  notitie text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verkooptarieven_uniek UNIQUE NULLS NOT DISTINCT (opdrachtgever_id, rol, geldig_vanaf)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.verkooptarieven TO authenticated;
GRANT ALL ON public.verkooptarieven TO service_role;
ALTER TABLE public.verkooptarieven ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers beheren verkooptarieven" ON public.verkooptarieven FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager')) WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE TABLE public.kostentarieven (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medewerker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  uurtarief numeric NOT NULL CHECK (uurtarief >= 0),
  geldig_vanaf date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (medewerker_id, geldig_vanaf)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kostentarieven TO authenticated;
GRANT ALL ON public.kostentarieven TO service_role;
ALTER TABLE public.kostentarieven ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers beheren kostentarieven" ON public.kostentarieven FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager')) WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE TABLE public.detacheringen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medewerker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  opdrachtgever_id uuid NOT NULL REFERENCES public.opdrachtgevers(id),
  project_id uuid REFERENCES public.projects(id),
  rol text NOT NULL,
  van date NOT NULL,
  tot date,
  uren_per_week numeric DEFAULT 40,
  tarief_override numeric,
  notitie text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (tot IS NULL OR tot >= van)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.detacheringen TO authenticated;
GRANT ALL ON public.detacheringen TO service_role;
ALTER TABLE public.detacheringen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers beheren detacheringen" ON public.detacheringen FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager')) WITH CHECK (public.has_role(auth.uid(), 'manager'));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_eigenaar boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fictief_uurtarief numeric;

-- Tariefbepaling: draait met rechten van de aanroeper, dus RLS (alleen managers) geldt.
CREATE OR REPLACE FUNCTION public.verkooptarief(_opdrachtgever_id uuid, _rol text, _datum date)
RETURNS TABLE(uurtarief numeric, g_rekening_pct numeric, rol text, geldig_vanaf date)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT v.uurtarief, v.g_rekening_pct, v.rol, v.geldig_vanaf
  FROM public.verkooptarieven v
  WHERE v.opdrachtgever_id = _opdrachtgever_id
    AND v.geldig_vanaf <= _datum
    AND (v.rol IS NOT DISTINCT FROM _rol OR v.rol IS NULL)
  ORDER BY (v.rol IS NULL), v.geldig_vanaf DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.kostentarief(_medewerker_id uuid, _datum date)
RETURNS numeric
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT CASE WHEN p.is_eigenaar THEN 0::numeric ELSE (
    SELECT k.uurtarief FROM public.kostentarieven k
    WHERE k.medewerker_id = _medewerker_id AND k.geldig_vanaf <= _datum
    ORDER BY k.geldig_vanaf DESC LIMIT 1) END
  FROM public.profiles p WHERE p.id = _medewerker_id
$$;

REVOKE ALL ON FUNCTION public.verkooptarief(uuid, text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.kostentarief(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verkooptarief(uuid, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kostentarief(uuid, date) TO authenticated, service_role;