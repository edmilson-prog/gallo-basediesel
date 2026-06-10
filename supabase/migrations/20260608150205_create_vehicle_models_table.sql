-- PRD-034 — canonical vehicle-model catalog (reference data, not store-scoped).
create table if not exists public.vehicle_models (
  id text primary key,
  brand text not null,
  model text not null,
  engine text not null,
  year_start integer,
  year_end integer,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create unique index if not exists vehicle_models_brand_model_engine_key
  on public.vehicle_models (lower(brand), lower(model), lower(engine));
create index if not exists vehicle_models_brand_idx on public.vehicle_models (brand);
create index if not exists vehicle_models_status_idx on public.vehicle_models (status);

alter table public.vehicle_models enable row level security;

drop policy if exists "vehicle_models_select_poc_temp" on public.vehicle_models;
create policy "vehicle_models_select_poc_temp"
  on public.vehicle_models for select to anon, authenticated using (true);

insert into public.vehicle_models
  (id, brand, model, engine, year_start, year_end, status, created_by, created_at, updated_at)
values
  ('vmodel-volvo-fh-460-d13k460', 'Volvo', 'FH 460', 'D13K460', 2015, 2024, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-volvo-fh-460-d13k500', 'Volvo', 'FH 460', 'D13K500', 2015, 2024, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-volvo-fh-540-d13k540', 'Volvo', 'FH 540', 'D13K540', 2017, 2024, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-volvo-fm-370-d11k370', 'Volvo', 'FM 370', 'D11K370', 2014, 2023, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-volvo-fm-370-d11k410', 'Volvo', 'FM 370', 'D11K410', 2014, 2023, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-volvo-vm-270-mwm-7-2', 'Volvo', 'VM 270', 'MWM 7.2', 2012, 2022, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-scania-r-450-dc13', 'Scania', 'R 450', 'DC13', 2014, 2024, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-scania-r-450-dc13-euro-5', 'Scania', 'R 450', 'DC13 EURO 5', 2014, 2024, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-scania-r-500-dc13-euro-6', 'Scania', 'R 500', 'DC13 EURO 6', 2018, 2024, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-scania-g-410-dc13', 'Scania', 'G 410', 'DC13', 2013, 2022, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-scania-p-320-dc09', 'Scania', 'P 320', 'DC09', 2012, 2023, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-mercedes-benz-actros-2651-om-473-la', 'Mercedes-Benz', 'Actros 2651', 'OM 473 LA', 2016, 2024, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-mercedes-benz-axor-2544-om-457-la', 'Mercedes-Benz', 'Axor 2544', 'OM 457 LA', 2012, 2022, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-mercedes-benz-atego-1719-om-924-la', 'Mercedes-Benz', 'Atego 1719', 'OM 924 LA', 2011, 2023, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-mercedes-benz-accelo-815-om-924', 'Mercedes-Benz', 'Accelo 815', 'OM 924', 2014, 2023, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-ford-cargo-1719-cummins-isbe4', 'Ford Cargo', '1719', 'Cummins ISBe4', 2012, 2019, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-ford-cargo-2842-cummins-isle', 'Ford Cargo', '2842', 'Cummins ISLe', 2013, 2019, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-ford-cargo-1119-cummins-isbe4', 'Ford Cargo', '1119', 'Cummins ISBe4', 2012, 2019, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-iveco-stralis-600s44t-cursor-13', 'Iveco', 'Stralis 600S44T', 'Cursor 13', 2014, 2023, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-iveco-tector-240e28-tector-6', 'Iveco', 'Tector 240E28', 'Tector 6', 2013, 2024, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vmodel-iveco-daily-70c17-f1c', 'Iveco', 'Daily 70C17', 'F1C', 2013, 2024, 'ativo', 'system', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
on conflict (id) do nothing;
