-- Drop the old broken policy that uses foldername (file is at root, not in a folder)
DROP POLICY IF EXISTS "Monteurs can read own contracten files" ON storage.objects;

-- The existing "Medewerkers can read their own contract PDFs" policy should work,
-- but let's recreate it to be sure it's clean
DROP POLICY IF EXISTS "Medewerkers can read their own contract PDFs" ON storage.objects;

CREATE POLICY "Medewerkers can read their own contract PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'contracten'
  AND EXISTS (
    SELECT 1 FROM public.contracten c
    JOIN public.profiles p ON p.id = c.profiel_id
    WHERE c.pdf_path = objects.name
    AND p.user_id = auth.uid()
  )
);