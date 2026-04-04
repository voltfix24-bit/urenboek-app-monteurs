
-- Update DELETE policy to also allow deleting rejected entries
DROP POLICY "Users can delete own draft entries" ON public.time_entries;
CREATE POLICY "Users can delete own draft or rejected entries"
ON public.time_entries
FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND status IN ('concept', 'afgekeurd'));

-- Update UPDATE policy to also allow editing rejected entries
DROP POLICY "Users can update own draft entries" ON public.time_entries;
CREATE POLICY "Users can update own draft or rejected entries"
ON public.time_entries
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND status IN ('concept', 'ingediend', 'afgekeurd'));
