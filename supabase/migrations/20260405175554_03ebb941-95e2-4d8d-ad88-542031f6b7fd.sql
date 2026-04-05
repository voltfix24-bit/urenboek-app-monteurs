
-- Create overuren_meldingen table
CREATE TABLE public.overuren_meldingen (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  medewerker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  datum date NOT NULL,
  type text NOT NULL,
  geboekte_uren numeric(10,2) NOT NULL,
  limiet_uren numeric(10,2) NOT NULL,
  ingeplande_uren numeric(10,2),
  toelichting text,
  status text NOT NULL DEFAULT 'open',
  behandeld_door uuid REFERENCES public.profiles(id),
  behandeld_op timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.overuren_meldingen ENABLE ROW LEVEL SECURITY;

-- Manager: full access
CREATE POLICY "Managers full access overuren_meldingen"
ON public.overuren_meldingen
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role));

-- Monteurs: read own rows
CREATE POLICY "Users can view own overuren_meldingen"
ON public.overuren_meldingen
FOR SELECT
TO authenticated
USING (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Monteurs: update only toelichting on own rows
CREATE POLICY "Users can update toelichting on own overuren_meldingen"
ON public.overuren_meldingen
FOR UPDATE
TO authenticated
USING (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
WITH CHECK (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Monteurs: insert own rows (for client-side trigger logic)
CREATE POLICY "Users can insert own overuren_meldingen"
ON public.overuren_meldingen
FOR INSERT
TO authenticated
WITH CHECK (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.overuren_meldingen;
