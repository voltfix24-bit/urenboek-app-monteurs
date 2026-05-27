
-- 1) Backfill contracten.profiel_id vanuit kandidaten.profiel_id
UPDATE public.contracten c
SET profiel_id = k.profiel_id
FROM public.kandidaten k
WHERE c.kandidaat_id = k.id
  AND c.profiel_id IS NULL
  AND k.profiel_id IS NOT NULL;

-- 2) Backfill profielvelden vanuit het meest recente getekende/verstuurde contract,
--    alleen waar het profielveld nu leeg is.
WITH laatste_contract AS (
  SELECT DISTINCT ON (profiel_id)
    profiel_id,
    contract_data,
    einddatum
  FROM public.contracten
  WHERE profiel_id IS NOT NULL
  ORDER BY profiel_id, aangemaakt_op DESC
)
UPDATE public.profiles p
SET
  kvk_nummer         = COALESCE(p.kvk_nummer,         NULLIF(lc.contract_data->>'ot_kvk', '')),
  btw_nummer         = COALESCE(p.btw_nummer,         NULLIF(lc.contract_data->>'ot_btw', '')),
  bedrijfsnaam       = COALESCE(p.bedrijfsnaam,       NULLIF(lc.contract_data->>'ot_handelsnaam', '')),
  iban               = COALESCE(p.iban,               NULLIF(lc.contract_data->>'ot_iban', '')),
  adres              = CASE
                         WHEN COALESCE(p.adres, '') = '' AND NULLIF(lc.contract_data->>'ot_adres','') IS NOT NULL
                           THEN concat_ws(', ',
                                   lc.contract_data->>'ot_adres',
                                   nullif(trim(concat_ws(' ', lc.contract_data->>'ot_postcode', lc.contract_data->>'ot_stad')), ''))
                         ELSE p.adres
                       END,
  uurtarief          = COALESCE(p.uurtarief,          NULLIF(lc.contract_data->>'uurtarief', '')::numeric),
  contract_einddatum = COALESCE(p.contract_einddatum, lc.einddatum)
FROM laatste_contract lc
WHERE p.id = lc.profiel_id;
