
-- Gesprekken (conversation threads)
CREATE TABLE public.gesprekken (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  medewerker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  onderwerp text NOT NULL DEFAULT '',
  laatste_bericht_op timestamptz NOT NULL DEFAULT now(),
  laatste_bericht_preview text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gesprekken ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Medewerkers zien eigen gesprekken" ON public.gesprekken
  FOR SELECT USING (
    medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Medewerkers kunnen gesprek starten" ON public.gesprekken
  FOR INSERT WITH CHECK (
    medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Update gesprekken" ON public.gesprekken
  FOR UPDATE USING (
    medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR has_role(auth.uid(), 'manager')
  );

-- Chat berichten
CREATE TABLE public.chat_berichten (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gesprek_id uuid NOT NULL REFERENCES public.gesprekken(id) ON DELETE CASCADE,
  afzender_id uuid NOT NULL REFERENCES public.profiles(id),
  inhoud text NOT NULL,
  gelezen_op timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_berichten ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lees berichten in eigen gesprekken" ON public.chat_berichten
  FOR SELECT USING (
    gesprek_id IN (
      SELECT id FROM gesprekken WHERE medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
    OR has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Stuur berichten in eigen gesprekken" ON public.chat_berichten
  FOR INSERT WITH CHECK (
    afzender_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND (
      gesprek_id IN (
        SELECT id FROM gesprekken WHERE medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
      )
      OR has_role(auth.uid(), 'manager')
    )
  );

CREATE POLICY "Update eigen berichten gelezen" ON public.chat_berichten
  FOR UPDATE USING (
    gesprek_id IN (
      SELECT id FROM gesprekken WHERE medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
    OR has_role(auth.uid(), 'manager')
  );

-- Index for fast lookups
CREATE INDEX idx_chat_berichten_gesprek ON public.chat_berichten(gesprek_id, created_at);
CREATE INDEX idx_gesprekken_medewerker ON public.gesprekken(medewerker_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_berichten;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gesprekken;
