-- Convergência da tela de Fornecedores (ui_kit financeiro) com o fornecedor
-- do PRD-216. A tabela, o vínculo por CNPJ e o índice único são do Tally e
-- ficam como estão: aqui só entram as colunas comerciais que a tela precisa,
-- o alargamento da RLS para o papel Financeiro e o recurso RBAC.
--
-- Nada nesta migration pode quebrar a importação de NF-e: não há drop, não há
-- not null, não há alteração de índice.

------------------------------------------------------------- 1. colunas
alter table public.suppliers
  add column if not exists lead_time_days integer
    check (lead_time_days is null or lead_time_days >= 0),
  add column if not exists preferred_payment_method text
    check (preferred_payment_method is null or preferred_payment_method = any (array[
      'boleto','pix','transferencia','debito_automatico'
    ]::text[])),
  add column if not exists supplied_items text[],
  add column if not exists registry_status text,
  add column if not exists registry_activity text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists notes text;

comment on column public.suppliers.supplied_items is
  'O que se compra deste fornecedor. Anulável de propósito: um cadastro nascido
   do <emit> de um XML não tem essa informação, e inventá-la é pior que deixar
   em branco — mesma disciplina de created_from_xml.';

------------------------------------------------------------- 2. RLS
-- `is_staff()` é owner|manager e exclui `financeiro`. A tela de Fornecedores
-- foi decidida com o dono para Owner, Gestor e Financeiro, então as duas
-- policies do Tally ganham o ramo do papel. É alargamento, nunca restrição.
-- O embrulho (select …) é do Tally e se mantém: sem ele o helper roda por
-- linha, e este projeto já teve storm de statement_timeout por isso.
alter policy suppliers_select on public.suppliers
  using (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or (select public.current_app_role()) = 'financeiro')
  );

alter policy suppliers_write on public.suppliers
  using (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or (select public.current_app_role()) = 'financeiro')
  )
  with check (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or (select public.current_app_role()) = 'financeiro')
  );

------------------------------------------------------------- 3. RBAC
-- Chave `supplier`, no singular: `supplies` é do Tally e governa a tela de
-- notas de entrada. São recursos distintos de propósito — quem confere nota
-- não necessariamente administra cadastro de fornecedor.
insert into public.rbac_resources (key, label, "group", sort_order)
values ('supplier', 'Fornecedores', 'Financeiro', 27)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, resource, actions, scope)
values
  ('Owner',      'supplier', array['view','create','edit','delete'], 'all'),
  ('Gestor',     'supplier', array['view','create','edit'],          'store'),
  ('Financeiro', 'supplier', array['view','create','edit'],          'store')
on conflict (role_id, resource) do nothing;
