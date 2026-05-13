-- Explicit DELETE policy for contracten storage bucket: only managers may delete
CREATE POLICY "Managers can delete contracten files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'contracten' AND public.has_role(auth.uid(), 'manager'::app_role));