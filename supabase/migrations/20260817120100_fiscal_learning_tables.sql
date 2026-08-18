-- PRD-216 (Tally) — o que a conferência aprende, e a fila das quatro origens.
--
-- supplier_part_codes e supplier_conversion_rules são a razão de a segunda
-- nota do mesmo fornecedor dar trabalho perto de zero: a primeira conferência
-- grava o vínculo e o fator, e a importação seguinte aplica sozinha.

create table public.supplier_part_codes (
  id            uuid primary key default gen_random_uuid(),
  supplier_id   uuid not null references public.suppliers(id) on delete cascade,
  supplier_code text not null,
  part_id       uuid not null references public.parts(id) on delete cascade,
  created_at    timestamptz not null default now(),
  -- sellers(id) pelo mesmo motivo de fiscal_notes.posted_by: profiles não tem
  -- coluna `id`, e autoria de negócio aponta para sellers neste schema.
  created_by    uuid references public.sellers(id)
);

comment on table public.supplier_part_codes is
  'PRD-216: mapa cProd → SKU por fornecedor, gravado no lançamento da primeira nota que confirmou o par.';

create unique index supplier_part_codes_uniq
  on public.supplier_part_codes (supplier_id, supplier_code);

create table public.supplier_conversion_rules (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     uuid not null references public.suppliers(id) on delete cascade,
  part_id         uuid not null references public.parts(id) on delete cascade,
  mode            text not null check (mode in ('conv','frac')),
  from_unit       text not null,
  factor          numeric not null check (factor > 0),
  to_unit         text not null,
  target_part_id  uuid references public.parts(id),
  applied_count   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Fracionar sem SKU de destino não diz para onde vai o saldo.
  constraint supplier_conversion_rules_frac_target
    check (mode <> 'frac' or target_part_id is not null)
);

create unique index supplier_conversion_rules_uniq
  on public.supplier_conversion_rules (supplier_id, part_id, from_unit);

create table public.fiscal_note_ingestion_queue (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id),
  source        text not null check (source in ('upload','upload_edge','email','sefaz')),
  filename      text,
  size_bytes    integer,
  raw_xml_path  text,
  access_key    text,
  status        text not null default 'pending'
    check (status in ('pending','processing','imported','failed','duplicate')),
  error         text,
  note_id       uuid references public.fiscal_notes(id) on delete set null,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

comment on table public.fiscal_note_ingestion_queue is
  'PRD-216: fila única das quatro origens. Na Fase 1 nenhuma escreve — email e sefaz nascem desligadas por falta de credencial e certificado A1 no Vault.';

create index fiscal_note_ingestion_queue_store_status_idx
  on public.fiscal_note_ingestion_queue (store_id, status, created_at desc);

-- ---------------------------------------------------------------- RLS

alter table public.supplier_part_codes enable row level security;
alter table public.supplier_conversion_rules enable row level security;
alter table public.fiscal_note_ingestion_queue enable row level security;

create policy supplier_part_codes_all on public.supplier_part_codes for all to authenticated
using (
  exists (
    select 1 from public.suppliers s
    where s.id = supplier_id
      and s.store_id = (select public.current_store_id())
      and (select public.is_staff())
  )
)
with check (
  exists (
    select 1 from public.suppliers s
    where s.id = supplier_id
      and s.store_id = (select public.current_store_id())
      and (select public.is_staff())
  )
);

create policy supplier_conversion_rules_all on public.supplier_conversion_rules for all to authenticated
using (
  exists (
    select 1 from public.suppliers s
    where s.id = supplier_id
      and s.store_id = (select public.current_store_id())
      and (select public.is_staff())
  )
)
with check (
  exists (
    select 1 from public.suppliers s
    where s.id = supplier_id
      and s.store_id = (select public.current_store_id())
      and (select public.is_staff())
  )
);

create policy fiscal_note_ingestion_queue_all on public.fiscal_note_ingestion_queue for all to authenticated
using (
  store_id = (select public.current_store_id())
  and (select public.is_staff())
)
with check (
  store_id = (select public.current_store_id())
  and (select public.is_staff())
);
