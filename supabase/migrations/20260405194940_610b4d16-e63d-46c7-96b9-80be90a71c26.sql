-- 1. Drop the open profiles SELECT policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- 2. Own profile only for non-managers
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- 3. Managers see all profiles
CREATE POLICY "Managers can view all profiles"
ON public.profiles
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

-- 4. Public view with safe fields only (security_invoker bypasses RLS via view owner)
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = false)
AS SELECT id, user_id, full_name, telefoon
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated;

-- 5. Projects view without contact details for monteurs
CREATE OR REPLACE VIEW public.projects_monteur
WITH (security_invoker = false)
AS SELECT id, nummer, naam, active, opdrachtgever_id, stationsnaam,
  adres, straat, postcode, stad, case_type, created_at, updated_at
FROM public.projects;

GRANT SELECT ON public.projects_monteur TO authenticated;