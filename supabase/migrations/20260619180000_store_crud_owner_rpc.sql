-- Bloco A1 (gestão multi-loja Fase 2) — CRUD de lojas Owner-only + soft-delete.
-- Mantém a RLS base intacta: escrita cross-loja só via RPC SECURITY DEFINER.
-- @see docs/superpowers/plans/2026-06-19-bloco-a1-crud-lojas.md

-- 1. Soft-delete flag (nunca DELETE físico — 33 FKs dependem de stores).
alter table public.stores
  add column if not exists is_active boolean not null default true;

-- 2. Owner pode LER todas as lojas (necessário para gerenciar filiais).
--    Aditivo: com 1 loja o resultado é idêntico ao atual.
drop policy if exists stores_select on public.stores;
create policy stores_select on public.stores
  for select to authenticated
  using (id = public.current_store_id() or public.current_app_role() = 'owner');

-- 3. RPC: criar loja (filial/parceira). Owner-only.
--    O id é fornecido pelo cliente (crypto.randomUUID) para que settings.storeId
--    case com o id real da loja — espelha o padrão de createInputToRow do customers.
create or replace function public.create_store(
  p_id uuid,
  p_name text,
  p_type text,
  p_cnpj text,
  p_address text,
  p_manager_id uuid,
  p_active_divisions text[],
  p_settings jsonb
) returns public.stores
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.stores;
begin
  if public.current_app_role() <> 'owner' then
    raise exception 'Apenas o proprietario pode criar lojas' using errcode = '42501';
  end if;
  if p_type not in ('filial', 'parceira') then
    raise exception 'Tipo de loja invalido para criacao: %', p_type using errcode = '22023';
  end if;
  insert into public.stores (id, name, type, cnpj, address, manager_id, active_divisions, settings, is_active)
  values (p_id, p_name, p_type, p_cnpj, p_address, p_manager_id,
          coalesce(p_active_divisions, array['parts']), p_settings, true)
  returning * into v_row;
  return v_row;
end;
$$;

-- 4. RPC: editar loja existente (qualquer loja). Owner-only. Nunca muda id/type.
create or replace function public.update_store(
  p_id uuid,
  p_name text,
  p_cnpj text,
  p_address text,
  p_manager_id uuid,
  p_active_divisions text[]
) returns public.stores
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.stores;
begin
  if public.current_app_role() <> 'owner' then
    raise exception 'Apenas o proprietario pode editar lojas' using errcode = '42501';
  end if;
  update public.stores set
    name = coalesce(p_name, name),
    cnpj = coalesce(p_cnpj, cnpj),
    address = coalesce(p_address, address),
    manager_id = p_manager_id,
    active_divisions = coalesce(p_active_divisions, active_divisions)
  where id = p_id
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Loja nao encontrada: %', p_id using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- 5. RPC: ativar/desativar loja. Owner-only. Guarda matriz e última ativa.
create or replace function public.set_store_active(
  p_id uuid,
  p_active boolean
) returns public.stores
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.stores;
  v_active_count int;
begin
  if public.current_app_role() <> 'owner' then
    raise exception 'Apenas o proprietario pode ativar/desativar lojas' using errcode = '42501';
  end if;
  if p_active = false then
    if exists (select 1 from public.stores where id = p_id and type = 'matriz') then
      raise exception 'A matriz nao pode ser desativada' using errcode = '22023';
    end if;
    select count(*) into v_active_count from public.stores where is_active = true;
    if v_active_count <= 1 then
      raise exception 'Nao e possivel desativar a ultima loja ativa' using errcode = '22023';
    end if;
  end if;
  update public.stores set is_active = p_active where id = p_id returning * into v_row;
  if v_row.id is null then
    raise exception 'Loja nao encontrada: %', p_id using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- 6. Bloquear execução por anon; liberar para authenticated (gate owner é interno).
revoke all on function public.create_store(uuid,text,text,text,text,uuid,text[],jsonb) from anon;
revoke all on function public.update_store(uuid,text,text,text,uuid,text[]) from anon;
revoke all on function public.set_store_active(uuid,boolean) from anon;
grant execute on function public.create_store(uuid,text,text,text,text,uuid,text[],jsonb) to authenticated;
grant execute on function public.update_store(uuid,text,text,text,uuid,text[]) to authenticated;
grant execute on function public.set_store_active(uuid,boolean) to authenticated;
