-- convert_lead_mark: marks a lead as converted (stage + converted_to_customer_id)
-- on behalf of staff, the lead's owner, OR the assigned attendant of a
-- conversation anchored on this lead. The customer INSERT itself passes the
-- normal customers RLS because the converted customer belongs to whoever
-- converts (seller_id = current_seller_id()); only this lead UPDATE needs to
-- cross the per-owner leads RLS, so it lives in a SECURITY DEFINER function.
-- See docs/superpowers/specs/2026-07-23-lead-convert-assigned-attendant-design.md

create or replace function public.convert_lead_mark(
  p_lead_id     uuid,
  p_customer_id uuid,
  p_stage       jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v_store  uuid;
begin
  select seller_id, store_id into v_seller, v_store
  from leads where id = p_lead_id;
  if not found then
    raise exception 'lead % not found', p_lead_id using errcode = 'P0002';
  end if;

  -- Same-store guard (mirror of the RLS store predicate).
  if v_store is distinct from current_store_id() then
    raise exception 'cross-store conversion blocked' using errcode = '42501';
  end if;

  -- Authorization: staff, the lead owner, or the assigned attendant of a
  -- conversation anchored on this lead.
  if not (
    is_staff()
    or v_seller = current_seller_id()
    or seller_handles_lead(p_lead_id)
  ) then
    raise exception 'not authorized to convert lead %', p_lead_id using errcode = '42501';
  end if;

  -- Target customer must exist in the same store (guards "link" mode and a
  -- freshly-inserted customer alike).
  if not exists (
    select 1 from customers c where c.id = p_customer_id and c.store_id = v_store
  ) then
    raise exception 'customer % not found in store', p_customer_id using errcode = 'P0002';
  end if;

  update leads
     set stage = p_stage,
         converted_to_customer_id = p_customer_id,
         updated_at = now()
   where id = p_lead_id;
end;
$$;

revoke all on function public.convert_lead_mark(uuid, uuid, jsonb) from public, anon;
grant execute on function public.convert_lead_mark(uuid, uuid, jsonb) to authenticated;
