-- PRD-216 (Tally) — notas fiscais de entrada: fornecedor, nota, itens e duplicatas.
--
-- NADA acontece ao aplicar: as tabelas nascem vazias e nenhuma feature escreve
-- nelas até a Fase 2. `entrada_compra` continua derivado de notas lançadas em
-- deriveInventoryMovements — não há tabela de movimentação aqui, de propósito.
--
-- Contas a pagar está fora do escopo do PRD-216. `fiscal_note_duplicates`
-- existe e é populada, mas nenhum consumidor lê dela ainda: o módulo
-- financeiro que vira título é outro PRD.
--
-- Tipos: stores.id, parts.id e profiles.id são UUID neste banco. A migration
-- 20260608150303_create_parts_table_v2.sql diz `text`, mas está obsoleta —
-- 20260608182429_convert_reference_pks_to_uuid.sql converteu. Verificado
-- contra o schema de produção em 17/08/2026 antes de escrever este arquivo.

create table public.suppliers (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id),
  cnpj                text not null,
  corporate_name      text not null,
  trade_name          text,
  state_registration  text,
  address             text,
  payment_terms       text,
  contact_name        text,
  contact_email       text,
  contact_phone       text,
  category            text,
  active              boolean not null default true,
  created_from_xml    boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.suppliers is
  'PRD-216: fornecedor de mercadoria. Vínculo da nota é pelo CNPJ.';
comment on column public.suppliers.created_from_xml is
  'true quando o cadastro nasceu do bloco <emit> de um XML. Contato e categoria ficam vazios de propósito — não vêm no arquivo e inventá-los é pior que deixar em branco.';

-- Um CNPJ por loja: é a chave de vínculo da importação.
create unique index suppliers_store_cnpj_uniq on public.suppliers (store_id, cnpj);

create table public.fiscal_notes (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores(id),
  access_key      text not null,
  number          text not null,
  series          text not null,
  supplier_id     uuid not null references public.suppliers(id),
  issued_at       timestamptz not null,
  entered_at      timestamptz not null default now(),
  status          text not null default 'conferencia'
    check (status in ('conferencia','lancada','cancelada')),
  origin          text not null
    check (origin in ('upload','upload_edge','email','sefaz','manual')),
  freight         numeric not null default 0,
  ipi             numeric not null default 0,
  discount        numeric not null default 0,
  products_total  numeric not null default 0,
  total           numeric not null default 0,
  xml_path        text,
  posted_at       timestamptz,
  posted_by       uuid references public.profiles(id),
  division        text not null default 'parts',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint fiscal_notes_access_key_len check (access_key ~ '^[0-9]{44}$')
);

comment on column public.fiscal_notes.access_key is
  'Chave de 44 dígitos. O unique abaixo é a barreira estrutural contra o mesmo XML entrar duas vezes — não confiar só na checagem da aplicação.';
comment on column public.fiscal_notes.origin is
  'manual fica reservado: nota digitada está fora do escopo do PRD-216 e não tem produtor.';

create unique index fiscal_notes_access_key_uniq on public.fiscal_notes (access_key);
create index fiscal_notes_store_status_idx on public.fiscal_notes (store_id, status);
create index fiscal_notes_supplier_idx on public.fiscal_notes (supplier_id, issued_at desc);

create table public.fiscal_note_items (
  id                        uuid primary key default gen_random_uuid(),
  note_id                   uuid not null references public.fiscal_notes(id) on delete cascade,
  seq                       integer not null,
  supplier_code             text not null,
  description               text not null,
  ncm                       text,
  cfop                      text,
  ean                       text,
  unit                      text not null,
  quantity                  numeric not null,
  unit_value                numeric not null,
  total_value               numeric not null,
  link_mode                 text not null default 'pend'
    check (link_mode in ('auto','ia','novo','pend')),
  part_id                   uuid references public.parts(id),
  new_part_draft            jsonb,
  conversion_mode           text not null default 'direto'
    check (conversion_mode in ('direto','conv','frac')),
  conversion_factor         numeric,
  conversion_unit           text,
  conversion_target_part_id uuid references public.parts(id),
  ai_confidence             smallint check (ai_confidence between 0 and 100),
  ai_evidence               text,
  alert                     text,
  confirmed                 boolean not null default false
);

comment on column public.fiscal_note_items.conversion_factor is
  'null bloqueia o lançamento de propósito: item sem fator não sabe quanto entra no estoque.';

create index fiscal_note_items_note_idx on public.fiscal_note_items (note_id, seq);
create index fiscal_note_items_part_idx on public.fiscal_note_items (part_id);

create table public.fiscal_note_duplicates (
  id        uuid primary key default gen_random_uuid(),
  note_id   uuid not null references public.fiscal_notes(id) on delete cascade,
  number    text not null,
  due_date  date not null,
  amount    numeric not null
);

create index fiscal_note_duplicates_note_idx on public.fiscal_note_duplicates (note_id, due_date);

-- ---------------------------------------------------------------- RLS

alter table public.suppliers enable row level security;
alter table public.fiscal_notes enable row level security;
alter table public.fiscal_note_items enable row level security;
alter table public.fiscal_note_duplicates enable row level security;

-- O wrapper (select fn()) faz o helper rodar UMA vez por query em vez de por
-- linha. Sem ele, este projeto já teve storm de statement_timeout.

create policy suppliers_select on public.suppliers for select to authenticated
using (
  store_id = (select public.current_store_id())
  and (select public.is_staff())
);

create policy suppliers_write on public.suppliers for all to authenticated
using (
  store_id = (select public.current_store_id())
  and (select public.is_staff())
)
with check (
  store_id = (select public.current_store_id())
  and (select public.is_staff())
);

create policy fiscal_notes_select on public.fiscal_notes for select to authenticated
using (
  store_id = (select public.current_store_id())
  and (select public.is_staff())
);

create policy fiscal_notes_write on public.fiscal_notes for all to authenticated
using (
  store_id = (select public.current_store_id())
  and (select public.is_staff())
)
with check (
  store_id = (select public.current_store_id())
  and (select public.is_staff())
);

-- Filhos herdam o alcance do pai por EXISTS. `exists` sobre a PK da nota usa
-- índice e não vira scan por linha.

create policy fiscal_note_items_all on public.fiscal_note_items for all to authenticated
using (
  exists (
    select 1 from public.fiscal_notes n
    where n.id = note_id
      and n.store_id = (select public.current_store_id())
      and (select public.is_staff())
  )
)
with check (
  exists (
    select 1 from public.fiscal_notes n
    where n.id = note_id
      and n.store_id = (select public.current_store_id())
      and (select public.is_staff())
  )
);

create policy fiscal_note_duplicates_all on public.fiscal_note_duplicates for all to authenticated
using (
  exists (
    select 1 from public.fiscal_notes n
    where n.id = note_id
      and n.store_id = (select public.current_store_id())
      and (select public.is_staff())
  )
)
with check (
  exists (
    select 1 from public.fiscal_notes n
    where n.id = note_id
      and n.store_id = (select public.current_store_id())
      and (select public.is_staff())
  )
);
