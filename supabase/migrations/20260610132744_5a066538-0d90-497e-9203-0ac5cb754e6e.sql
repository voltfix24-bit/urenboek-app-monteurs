DO $$
DECLARE
  v_regels_gecorrigeerd int := 0;
  v_orders_gecorrigeerd int := 0;
BEGIN
  -- Stap 1: corrigeer reiskostenregels in concept-orders
  WITH updated AS (
    UPDATE public.inkooporder_regels r
    SET
      retour_km  = ROUND(r.retour_km),
      vrije_km   = ROUND(COALESCE(r.vrije_km, 0)),
      kilometers = GREATEST(0, ROUND(r.retour_km) - ROUND(COALESCE(r.vrije_km, 0))),
      bedrag     = ROUND(
        GREATEST(0, ROUND(r.retour_km) - ROUND(COALESCE(r.vrije_km, 0)))
        * COALESCE(r.km_tarief, 0)
        * 100
      ) / 100.0
    FROM public.inkooporders o
    WHERE o.id = r.inkooporder_id
      AND o.status = 'concept'
      AND r.regel_type = 'reiskosten'
      AND r.retour_km IS NOT NULL
      AND (
           r.retour_km  <> ROUND(r.retour_km)
        OR COALESCE(r.vrije_km, 0) <> ROUND(COALESCE(r.vrije_km, 0))
        OR COALESCE(r.kilometers, -1) <> GREATEST(0, ROUND(r.retour_km) - ROUND(COALESCE(r.vrije_km, 0)))
        OR r.bedrag <> ROUND(
             GREATEST(0, ROUND(r.retour_km) - ROUND(COALESCE(r.vrije_km, 0)))
             * COALESCE(r.km_tarief, 0) * 100
           ) / 100.0
      )
    RETURNING r.id
  )
  SELECT count(*) INTO v_regels_gecorrigeerd FROM updated;

  -- Stap 2: herbereken ordertotalen voor alle concept-orders
  WITH sommen AS (
    SELECT
      o.id AS order_id,
      COALESCE(SUM(r.bedrag), 0) AS totaal_bedrag,
      COALESCE(SUM(CASE WHEN r.regel_type = 'uren' THEN r.uren ELSE 0 END), 0) AS totaal_uren
    FROM public.inkooporders o
    LEFT JOIN public.inkooporder_regels r ON r.inkooporder_id = o.id
    WHERE o.status = 'concept'
    GROUP BY o.id
  ),
  updated_orders AS (
    UPDATE public.inkooporders o
    SET
      totaal_excl_btw = s.totaal_bedrag,
      totaal_incl_btw = s.totaal_bedrag,
      totaal_uren     = s.totaal_uren
    FROM sommen s
    WHERE o.id = s.order_id
      AND (
           o.totaal_excl_btw IS DISTINCT FROM s.totaal_bedrag
        OR o.totaal_incl_btw IS DISTINCT FROM s.totaal_bedrag
        OR o.totaal_uren     IS DISTINCT FROM s.totaal_uren
      )
    RETURNING o.id
  )
  SELECT count(*) INTO v_orders_gecorrigeerd FROM updated_orders;

  RAISE NOTICE 'Reiskostenregels gecorrigeerd: %, conceptorders met nieuw totaal: %',
    v_regels_gecorrigeerd, v_orders_gecorrigeerd;
END $$;