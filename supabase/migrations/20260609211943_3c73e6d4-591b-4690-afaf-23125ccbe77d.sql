alter table public.profiles
  add column if not exists onderaannemer_startlocatie text,
  add column if not exists onderaannemer_vrije_km_per_dag numeric not null default 150,
  add column if not exists onderaannemer_km_tarief numeric not null default 0.46,
  add column if not exists onderaannemer_reiskosten_per_ploeg boolean not null default true;

alter table public.inkooporders
  add column if not exists order_type text not null default 'medewerker',
  add column if not exists week_jaar integer,
  add column if not exists week_nummer integer;

alter table public.inkooporder_regels
  add column if not exists regel_type text not null default 'uren',
  add column if not exists medewerker_id uuid references public.profiles(id) on delete set null,
  add column if not exists medewerker_naam text,
  add column if not exists kilometers numeric,
  add column if not exists retour_km numeric,
  add column if not exists vrije_km numeric,
  add column if not exists km_tarief numeric,
  add column if not exists afstand_bron text,
  add column if not exists startlocatie text,
  add column if not exists project_adres text;

alter table public.inkooporders
  drop constraint if exists inkooporders_order_type_check;

alter table public.inkooporders
  add constraint inkooporders_order_type_check
  check (order_type in ('medewerker', 'onderaannemer_week'));

alter table public.inkooporder_regels
  drop constraint if exists inkooporder_regels_regel_type_check;

alter table public.inkooporder_regels
  add constraint inkooporder_regels_regel_type_check
  check (regel_type in ('uren', 'reiskosten'));

create unique index if not exists uniq_onderaannemer_weekorder
  on public.inkooporders (medewerker_id, week_jaar, week_nummer, order_type)
  where order_type = 'onderaannemer_week';