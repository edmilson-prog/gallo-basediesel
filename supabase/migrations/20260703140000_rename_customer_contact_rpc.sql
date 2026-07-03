-- rename_customer_contact: rename a contact's DISPLAY name (full_name for B2C /
-- nome_fantasia for B2B) through a SECURITY DEFINER RPC gated by conversation
-- access, so a non-staff seller ATTENDING the contact (pool / instance) can
-- rename it. The direct customers UPDATE is RLS-blocked off the caller's
-- carteira: customers_update = is_staff() OR seller_id = current_seller_id(),
-- WITHOUT the seller_handles_customer branch that customers_select carries — so a
-- pool contact could be SEEN but not renamed. Same gate shape as
-- mark_contact_not_customer, plus the carteira-owner branch for the
-- /app/clientes fiche (which has no conversation). Only the display name is
-- written; whatsapp_name (webhook-owned) is never touched. RLS customers_update
-- remains untouched (Portão B intact).

create or replace function public.rename_customer_contact(p_customer_id uuid, p_name text)
returns setof public.customers
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_store uuid := public.current_store_id();
  v_seller uuid := public.current_seller_id();
  v_cust public.customers;
  v_name text := btrim(p_name);
  v_before text;
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
    or v_cust.seller_id = v_seller
    or exists (select 1 from public.conversations c
               where c.customer_id = p_customer_id and public.can_access_conversation(c.id))
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'name cannot be empty' using errcode = '22023';
  end if;

  if v_cust.type = 'B2B' then
    v_before := v_cust.nome_fantasia;
    return query
      update public.customers set nome_fantasia = v_name where id = p_customer_id returning *;
  else
    v_before := v_cust.full_name;
    return query
      update public.customers set full_name = v_name where id = p_customer_id returning *;
  end if;

  -- Server-side audit (mirrors the sibling convert/mark/restore RPCs): the mutation
  -- bypasses RLS and may act cross-carteira (a seller renaming a contact they only
  -- ATTEND), so the trail is written here, not only client-side.
  if v_seller is not null then
    insert into public.audit_logs (id, store_id, actor_id, action, resource, resource_id, before, after)
    values (gen_random_uuid(), v_store, v_seller, 'customer.rename', 'customer', p_customer_id::text,
            jsonb_build_object('name', v_before), jsonb_build_object('name', v_name));
  end if;
end;
$$;

-- Fail closed AND narrow the callable surface: drop the implicit PUBLIC/anon
-- EXECUTE, grant only to authenticated (matches the hardened can_access family).
revoke all on function public.rename_customer_contact(uuid, text) from public, anon;
grant execute on function public.rename_customer_contact(uuid, text) to authenticated;
