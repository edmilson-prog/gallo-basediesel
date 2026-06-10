-- Finish the uuid conversion: the 4 reference tables (stores, sellers,
-- vehicle_models, whatsapp_accounts) now also move text -> uuid, so every PK and
-- FK in public is uuid. The Matriz store gets a FIXED sentinel uuid because the
-- live Supabase auth profile (profiles.store_id) and the mock seed layer must
-- agree on it (the app runs AUTH=supabase + DATA=mock). The other reference rows
-- get fresh uuids — nothing cross-references them (transactional tables empty,
-- profiles.seller_id null, parent_seller_id null). Soft/polymorphic text columns
-- without a FK stay text on purpose.
set search_path = public;

do $$
declare
  matriz uuid := '00000000-0000-0000-0000-000000000001';
  r record;
begin
  -- 1. Capture & drop every FK that references one of the 4 reference tables.
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
    and tgt.relname in ('stores', 'sellers', 'vehicle_models', 'whatsapp_accounts');

  for r in select src_table, conname from _fk_backup loop
    execute format('alter table %s drop constraint %I', r.src_table, r.conname);
  end loop;

  -- 2. Remap seed ids to uuid-shaped text (+ fix the store_id cross-references).
  update stores            set id = matriz::text where id = 'store-matriz';
  update profiles          set store_id = matriz::text where store_id = 'store-matriz';
  update sellers           set store_id = matriz::text where store_id = 'store-matriz';
  update whatsapp_accounts set store_id = matriz::text where store_id = 'store-matriz';
  update sellers           set id = gen_random_uuid()::text;  -- no inbound non-null refs
  update vehicle_models    set id = gen_random_uuid()::text;
  update whatsapp_accounts set id = gen_random_uuid()::text;

  -- 3. Convert the reference PK columns text -> uuid (+ default generator).
  alter table stores            alter column id type uuid using id::uuid, alter column id set default gen_random_uuid();
  alter table sellers           alter column id type uuid using id::uuid, alter column id set default gen_random_uuid();
  alter table vehicle_models    alter column id type uuid using id::uuid, alter column id set default gen_random_uuid();
  alter table whatsapp_accounts alter column id type uuid using id::uuid, alter column id set default gen_random_uuid();

  -- 4. Convert every remaining text FK source column -> uuid.
  for r in
    select distinct b.src_table as src_table, col
    from _fk_backup b, unnest(b.src_cols) as col
  loop
    execute format('alter table %s alter column %I type uuid using %I::uuid', r.src_table, r.col, r.col);
  end loop;

  -- 5. Recreate the captured FKs (both ends are uuid now).
  for r in select src_table, conname, def from _fk_backup loop
    execute format('alter table %s add constraint %I %s', r.src_table, r.conname, r.def);
  end loop;
end $$;
