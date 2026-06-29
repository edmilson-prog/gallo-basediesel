-- Fix mark_contact_not_customer audit 'after' (was hardcoded, dropping other tags)
-- and add restore_pending_contact (undo a discard: reviewed_not_customer -> pending_review).
-- Both SECURITY DEFINER, same gate as convert_pending_contact (is_staff() OR access to a
-- conversation anchored on the customer). RLS customers_update remains untouched.

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
  v_new_tags text[];
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
    or exists (select 1 from public.conversations c
               where c.customer_id = p_customer_id and public.can_access_conversation(c.id))
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not coalesce(v_cust.tags @> array['pending_review'], false) then
    raise exception 'contact is not pending review' using errcode = '22023';
  end if;

  v_new_tags := (
    select array(
      select distinct t
      from unnest(array_remove(v_cust.tags, 'pending_review') || array['reviewed_not_customer']) as t
    )
  );

  return query
    update public.customers set tags = v_new_tags where id = p_customer_id returning *;

  if v_seller is not null then
    insert into public.audit_logs (id, store_id, actor_id, action, resource, resource_id, before, after)
    values (gen_random_uuid(), v_store, v_seller, 'mark_contact_not_customer', 'customer', p_customer_id::text,
            jsonb_build_object('tags', v_cust.tags), jsonb_build_object('tags', v_new_tags));
  end if;
end;
$$;

create or replace function public.restore_pending_contact(p_customer_id uuid)
returns setof public.customers
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_store uuid := public.current_store_id();
  v_seller uuid := public.current_seller_id();
  v_cust public.customers;
  v_new_tags text[];
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
    or exists (select 1 from public.conversations c
               where c.customer_id = p_customer_id and public.can_access_conversation(c.id))
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not coalesce(v_cust.tags @> array['reviewed_not_customer'], false) then
    raise exception 'contact is not a reviewed non-customer' using errcode = '22023';
  end if;

  v_new_tags := (
    select array(
      select distinct t
      from unnest(array_remove(v_cust.tags, 'reviewed_not_customer') || array['pending_review']) as t
    )
  );

  return query
    update public.customers set tags = v_new_tags where id = p_customer_id returning *;

  if v_seller is not null then
    insert into public.audit_logs (id, store_id, actor_id, action, resource, resource_id, before, after)
    values (gen_random_uuid(), v_store, v_seller, 'restore_pending_contact', 'customer', p_customer_id::text,
            jsonb_build_object('tags', v_cust.tags), jsonb_build_object('tags', v_new_tags));
  end if;
end;
$$;

grant execute on function public.mark_contact_not_customer(uuid) to authenticated;
grant execute on function public.restore_pending_contact(uuid) to authenticated;
