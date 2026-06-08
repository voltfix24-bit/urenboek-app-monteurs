ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS planning_partner_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.planning ADD COLUMN IF NOT EXISTS planning_group_id uuid;
CREATE INDEX IF NOT EXISTS idx_planning_group_id ON public.planning(planning_group_id);