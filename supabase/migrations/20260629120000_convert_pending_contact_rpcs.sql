-- Manual conversion of an imported contact (pending_review) → customer, plus discard.
-- Two SECURITY DEFINER RPCs, gated by is_staff() OR conversation access
-- (can_access_conversation), mirroring the public.transfer_conversation pattern.
-- They are the only door that mutates an owner-less contact; the customers_update
-- RLS stays untouched. Everything in one atomic transaction + an audit_logs trail.

create or replace function public.convert_pending_contact(
  p_customer_id uuid,
  p_type text,
  p_full_name text default null,
  p_cpf text default null,
  p_razao_social text default null,
  p_nome_fantasia text default null,
  p_cnpj text default null,
  p_contact_name text default null,
  p_seller_id uuid default null
)
returns setof public.customers
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_store uuid := public.current_store_id();
  v_seller uuid := public.current_seller_id();
  v_cust public.customers;
  v_target uuid;
begin
  select * into v_cust from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'customer % not found', p_customer_id using errcode = 'P0002';
  end if;

  if v_cust.store_id is distinct from v_store then
    raise exception 'not allowed to convert this contact' using errcode = '42501';
  end if;

  -- Authorization: staff OR has access to a conversation anchored on this customer.
  if not (
    public.is_staff()
    or exists (
      select 1 from public.conversations c
      where c.customer_id = p_customer_id
        and public.can_access_conversation(c.id)
    )
  ) then
    raise exception 'not allowed to convert this contact' using errcode = '42501';
  end if;

  -- Idempotency / race guard: must still be a pending contact.
  if not coalesce(v_cust.tags @> array['pending_review'], false) then
    raise exception 'contact is not pending review' using errcode = '22023';
  end if;

  if p_type not in ('B2C', 'B2B') then
    raise exception 'invalid type %', p_type using errcode = '22023';
  end if;

  -- Wallet owner: non-staff always becomes the owner; staff may pick another.
  if public.is_staff() then
    v_target := coalesce(p_seller_id, v_seller);
  else
    v_target := v_seller;
  end if;

  -- Validate the target seller (when set) belongs to the store and is active.
  if v_target is not null and not exists (
    select 1 from public.sellers s
    where s.id = v_target and s.store_id = v_store and coalesce(s.active, true)
  ) then
    raise exception 'invalid wallet owner' using errcode = '22023';
  end if;

  -- Apply identity + owner, dropping ONLY the pending_review tag (preserve others).
  return query
    update public.customers
       set type = p_type,
           seller_id = v_target,
           full_name = case when p_type = 'B2C' then p_full_name else full_name end,
           cpf = case when p_type = 'B2C' then p_cpf else cpf end,
           razao_social = case when p_type = 'B2B' then p_razao_social else razao_social end,
           nome_fantasia = case when p_type = 'B2B' then p_nome_fantasia else nome_fantasia end,
           cnpj = case when p_type = 'B2B' then p_cnpj else cnpj end,
           contact_name = case when p_type = 'B2B' then p_contact_name else contact_name end,
           tags = array_remove(tags, 'pending_review')
     where id = p_customer_id
    returning *;

  -- Audit (best-effort: actor_id is NOT NULL → only when caller maps to a seller).
  if v_seller is not null then
    insert into public.audit_logs (id, store_id, actor_id, action, resource, resource_id, before, after)
    values (
      gen_random_uuid(), v_store, v_seller,
      'convert_pending_contact', 'customer', p_customer_id::text,
      jsonb_build_object('tags', v_cust.tags, 'seller_id', v_cust.seller_id, 'type', v_cust.type),
      jsonb_build_object('seller_id', v_target, 'type', p_type, 'tags', array_remove(v_cust.tags, 'pending_review'))
    );
  end if;
end;
$$;

create or replace function public.mark_contact_not_customer(p_customer_id uuid)
returns setof public.customers
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_store uuid := public.current_store_id();
  v_seller uuid := public.current_seller_id();
  v_cust public.customers;
begin
  select * into v_cust from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'customer % not found', p_customer_id using errcode = 'P0002';
  end if;

  if v_cust.store_id is distinct from v_store then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not (
    public.is_staff()
    or exists (
      select 1 from public.conversations c
      where c.customer_id = p_customer_id
        and public.can_access_conversation(c.id)
    )
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not coalesce(v_cust.tags @> array['pending_review'], false) then
    raise exception 'contact is not pending review' using errcode = '22023';
  end if;

  return query
    update public.customers
       set tags = (
             select array(
               select distinct t
               from unnest(array_remove(tags, 'pending_review') || array['reviewed_not_customer']) as t
             )
           )
     where id = p_customer_id
    returning *;

  if v_seller is not null then
    insert into public.audit_logs (id, store_id, actor_id, action, resource, resource_id, before, after)
    values (
      gen_random_uuid(), v_store, v_seller,
      'mark_contact_not_customer', 'customer', p_customer_id::text,
      jsonb_build_object('tags', v_cust.tags),
      jsonb_build_object('tags', array['reviewed_not_customer'])
    );
  end if;
end;
$$;

grant execute on function public.convert_pending_contact(uuid,text,text,text,text,text,text,text,uuid) to authenticated;
grant execute on function public.mark_contact_not_customer(uuid) to authenticated;
