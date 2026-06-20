
CREATE OR REPLACE FUNCTION public.planner_impact_check_v1(_external_ids text[])
RETURNS TABLE(
  external_id text,
  has_planning boolean,
  uren_totaal numeric,
  statussen text[],
  laatste_boeking_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ids AS (
    SELECT DISTINCT x AS ext_id FROM unnest(_external_ids) AS x
  ),
  pl AS (
    SELECT i.ext_id,
           p.id AS planning_id,
           p.medewerker_id,
           p.project_id,
           p.datum,
           pr.nummer AS project_nummer,
           mo.user_id AS monteur_user_id
      FROM ids i
      LEFT JOIN public.planning p
        ON p.external_source = 'terrevolt_planner'
       AND p.external_id = i.ext_id
      LEFT JOIN public.projects pr ON pr.id = p.project_id
      LEFT JOIN public.profiles mo ON mo.id = p.medewerker_id
  ),
  ub AS (
    SELECT pl.ext_id, u.uren::numeric AS h, u.status::text AS status, u.created_at
      FROM pl
      JOIN public.uren_boekingen u
        ON u.medewerker_id = pl.medewerker_id
       AND u.project_id  = pl.project_id
       AND u.datum       = pl.datum
     WHERE pl.planning_id IS NOT NULL
  ),
  te AS (
    SELECT pl.ext_id, t.hours::numeric AS h, t.status::text AS status, t.created_at
      FROM pl
      JOIN public.time_entries t
        ON t.user_id = pl.monteur_user_id
       AND t.project_number = pl.project_nummer
       AND t.date = pl.datum
     WHERE pl.planning_id IS NOT NULL
       AND pl.monteur_user_id IS NOT NULL
       AND pl.project_nummer IS NOT NULL
  ),
  bookings AS (SELECT * FROM ub UNION ALL SELECT * FROM te)
  SELECT pl.ext_id::text AS external_id,
         (pl.planning_id IS NOT NULL) AS has_planning,
         COALESCE(SUM(b.h), 0)::numeric AS uren_totaal,
         COALESCE(
           array_agg(DISTINCT b.status) FILTER (WHERE b.status IS NOT NULL),
           ARRAY[]::text[]
         ) AS statussen,
         MAX(b.created_at) AS laatste_boeking_at
    FROM pl
    LEFT JOIN bookings b ON b.ext_id = pl.ext_id
   GROUP BY pl.ext_id, pl.planning_id;
END;
$$;

REVOKE ALL ON FUNCTION public.planner_impact_check_v1(text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.planner_impact_check_v1(text[]) TO service_role;

CREATE INDEX IF NOT EXISTS idx_uren_boekingen_mpd
  ON public.uren_boekingen (medewerker_id, project_id, datum);

CREATE INDEX IF NOT EXISTS idx_time_entries_upd
  ON public.time_entries (user_id, project_number, date);
