
-- Create the certificaten storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificaten', 'certificaten', false);

-- Users can upload to their own medewerker folder
CREATE POLICY "Users can upload own certificaten files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'certificaten'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Users can view their own files
CREATE POLICY "Users can view own certificaten files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'certificaten'
  AND (
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.profiles WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'manager')
  )
);

-- Users can update their own files
CREATE POLICY "Users can update own certificaten files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'certificaten'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Users can delete their own files
CREATE POLICY "Users can delete own certificaten files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'certificaten'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Managers can upload for any medewerker
CREATE POLICY "Managers can upload any certificaten files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'certificaten'
  AND public.has_role(auth.uid(), 'manager')
);

-- Managers can update any files
CREATE POLICY "Managers can update any certificaten files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'certificaten'
  AND public.has_role(auth.uid(), 'manager')
);

-- Managers can delete any files
CREATE POLICY "Managers can delete any certificaten files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'certificaten'
  AND public.has_role(auth.uid(), 'manager')
);
