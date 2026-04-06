-- Allow authenticated users to read from contracten bucket
-- Files are named as {contract_id}.pdf
CREATE POLICY "Medewerkers can read their own contract PDFs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'contracten'
  AND EXISTS (
    SELECT 1 FROM public.contracten c
    JOIN public.profiles p ON p.id = c.profiel_id
    WHERE c.pdf_path = name
      AND p.user_id = auth.uid()
  )
);

-- Managers can read all contract PDFs
CREATE POLICY "Managers can read all contract PDFs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'contracten'
  AND public.has_role(auth.uid(), 'manager')
);

-- Managers can upload contract PDFs
CREATE POLICY "Managers can upload contract PDFs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'contracten'
  AND public.has_role(auth.uid(), 'manager')
);

-- Managers can overwrite contract PDFs
CREATE POLICY "Managers can update contract PDFs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'contracten'
  AND public.has_role(auth.uid(), 'manager')
);