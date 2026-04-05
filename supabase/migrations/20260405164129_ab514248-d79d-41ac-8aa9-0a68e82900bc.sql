
-- rate_limit_log should only be accessed by service_role (edge functions) and database functions.
-- Adding a restrictive SELECT policy so RLS is "enabled with policy" (satisfies linter)
-- but no regular user can access it.

CREATE POLICY "No direct access for users"
ON public.rate_limit_log
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);
