CREATE POLICY "Managers can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'manager'::app_role));