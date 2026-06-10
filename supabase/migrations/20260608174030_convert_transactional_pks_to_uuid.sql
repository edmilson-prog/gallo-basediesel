-- Convert transactional table PKs (and the FK columns that reference them) from text to uuid.
-- Reference tables (stores, sellers, vehicle_models, whatsapp_accounts) and profiles keep their
-- current key types on purpose: they are small, statically-seeded, and the live Supabase auth
-- profile + the mock layer both depend on their stable text ids. Soft/actor/polymorphic text
-- columns WITHOUT a foreign key are intentionally left as text (they hold heterogeneous ids).
-- Safe because every transactional table is currently empty (faker tables ship without seed).
set search_path = public;

do $$
declare
  excluded_tables text[] := array['stores', 'sellers', 'vehicle_models', 'whatsapp_accounts', 'profiles'];
  trans_tables text[];
  r record;
begin
  -- Transactional set = all base tables in public minus the reference/auth tables above.
  select array_agg(table_name) into trans_tables
  from information_schema.tables
  where table_schema = 'public'
    and table_type = 'BASE TABLE'
    and not (table_name = any(excluded_tables));

  -- 1. Capture every FK whose REFERENCED (target) table is transactional, then drop it.
  create temp table _fk_backup on commit drop as
  select
    con.conrelid::regclass::text as src_table,
    con.conname as conname,
    pg_get_constraintdef(con.oid) as def,
    (
      select array_agg(att.attname order by k.ord)
      from unnest(con.conkey) with ordinality as k(attnum, ord)
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
    ) as src_cols
  from pg_constraint con
  join pg_class tgt on tgt.oid = con.confrelid
  join pg_namespace ns on ns.oid = tgt.relnamespace
  where con.contype = 'f'
    and ns.nspname = 'public'
    and tgt.relname = any(trans_tables);

  for r in select src_table, conname from _fk_backup loop
    execute format('alter table %s drop constraint %I', r.src_table, r.conname);
  end loop;

  -- 2. Convert each transactional PK `id` column text -> uuid (+ default generator).
  for r in
    select table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'id'
      and data_type = 'text'
      and table_name = any(trans_tables)
  loop
    execute format('alter table public.%I alter column id type uuid using id::uuid', r.table_name);
    execute format('alter table public.%I alter column id set default gen_random_uuid()', r.table_name);
  end loop;

  -- 3. Convert each FK source column that pointed at a transactional table text -> uuid.
  for r in
    select distinct b.src_table as src_table, col
    from _fk_backup b, unnest(b.src_cols) as col
  loop
    execute format('alter table %s alter column %I type uuid using %I::uuid', r.src_table, r.col, r.col);
  end loop;

  -- 4. Recreate the captured FKs (both ends are uuid now; on-delete actions preserved via def).
  for r in select src_table, conname, def from _fk_backup loop
    execute format('alter table %s add constraint %I %s', r.src_table, r.conname, r.def);
  end loop;
end $$;
