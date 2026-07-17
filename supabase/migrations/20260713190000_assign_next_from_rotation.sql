-- supabase/migrations/20260713190000_assign_next_from_rotation.sql
--
-- Frente 2 (webhook cria Lead): a fila de rodízio real (PRD-213) só roda no
-- cliente (src/features/rotation/engine/) — inacessível ao webhook, que roda
-- como Edge Function no servidor. Estas funções espelham fielmente
-- selectNextFromRotation.ts + eligibility.ts em SQL, no mesmo padrão já usado
-- por whatsapp_health_tick (lógica SQL-only quando o runtime do Edge não serve).

create or replace function public.parse_hhmm_minutes(p_value text)
returns int
language sql
immutable
set search_path to ''
as $$
  select case
    when p_value ~ '^\d{1,2}:\d{2}$' then
      (split_part(p_value, ':', 1)::int) * 60 + (split_part(p_value, ':', 2)::int)
    else null
  end;
$$;

-- Mirrors isWithinWorkSchedule (src/features/access/engine/workSchedule.ts) +
-- isSellerEligible (src/features/rotation/engine/eligibility.ts), minus the
-- participant-enabled check (that's the caller's job, per participant row).
create or replace function public.is_seller_eligible_now(p_seller_id uuid)
returns boolean
language plpgsql
stable
set search_path to ''
as $$
declare
  v_active boolean;
  v_availability text;
  v_schedule jsonb;
  v_overrides jsonb;
  v_now_sp timestamptz := now() - interval '3 hours';
  v_weekday int := extract(dow from v_now_sp)::int;
  v_minutes int := extract(hour from v_now_sp)::int * 60 + extract(minute from v_now_sp)::int;
  v_ymd text := to_char(v_now_sp, 'YYYY-MM-DD');
  v_override jsonb;
  v_win jsonb;
  v_open int;
  v_close int;
begin
  select active, availability, coalesce(work_schedule, '[]'::jsonb), coalesce(schedule_overrides, '[]'::jsonb)
    into v_active, v_availability, v_schedule, v_overrides
  from public.sellers
  where id = p_seller_id;

  if not found or not coalesce(v_active, false) then
    return false;
  end if;
  if v_availability is distinct from 'online' then
    return false;
  end if;

  if jsonb_array_length(v_schedule) = 0 and jsonb_array_length(v_overrides) = 0 then
    return true;
  end if;

  select o into v_override
  from jsonb_array_elements(v_overrides) o
  where o->>'date' = v_ymd
  limit 1;

  if v_override is not null then
    if v_override->>'type' = 'block' then
      return false;
    end if;
    v_open := coalesce(public.parse_hhmm_minutes(v_override->>'openAt'), 0);
    v_close := coalesce(public.parse_hhmm_minutes(v_override->>'closeAt'), 24*60);
    return v_minutes >= v_open and v_minutes < v_close;
  end if;

  if jsonb_array_length(v_schedule) = 0 then
    return true;
  end if;

  for v_win in select * from jsonb_array_elements(v_schedule)
  loop
    if (v_win->>'enabled')::boolean and (v_win->>'weekday')::int = v_weekday then
      v_open := public.parse_hhmm_minutes(v_win->>'openAt');
      v_close := public.parse_hhmm_minutes(v_win->>'closeAt');
      if v_open is not null and v_close is not null and v_minutes >= v_open and v_minutes < v_close then
        return true;
      end if;
    end if;
  end loop;

  return false;
end;
$$;

-- Rotated order of participants in one scope (top-level sellers/departments,
-- or a department's members), starting AFTER p_pointer with wrap-around —
-- mirrors rotatedOrder() in selectNextFromRotation.ts. p_pointer null or not
-- found among current participants => natural order (stale-pointer fallback).
create or replace function public.rotation_order(
  p_queue_id uuid,
  p_ref_type text,
  p_scope_department_id text,
  p_pointer text
)
returns table(ref_id text, enabled boolean, rotation_rn bigint)
language sql
stable
set search_path to ''
as $$
  with ordered as (
    select ref_id, enabled,
           row_number() over (order by "order") as rn,
           count(*) over () as cnt
    from public.rotation_participants
    where queue_id = p_queue_id
      and ref_type = p_ref_type
      and scope_department_id is not distinct from p_scope_department_id
  ),
  pointer_rn as (
    select rn from ordered where ref_id = p_pointer
  )
  select
    o.ref_id,
    o.enabled,
    case
      when (select rn from pointer_rn) is null then o.rn
      else (((o.rn - (select rn from pointer_rn) - 1 + o.cnt) % o.cnt) + 1)
    end as rotation_rn
  from ordered o
  order by rotation_rn;
$$;

-- Entry point used by the webhook. Advances the queue's pointer(s) atomically
-- on selection. Falls back to Fernando (the real business owner — NOT
-- profiles.role='owner', which is the technical admin) when nobody is
-- eligible (empty/misconfigured queue, everyone offline/off-hours).
create or replace function public.assign_next_from_rotation(p_store_id uuid)
returns uuid
language plpgsql
set search_path to ''
as $$
declare
  v_queue record;
  v_row record;
  v_dept_row record;
  v_dept_last_member text;
  v_member_row record;
  v_selected uuid;
begin
  select * into v_queue from public.rotation_queues where store_id = p_store_id limit 1;

  if found then
    if v_queue.target_mode = 'direct' then
      for v_row in
        select * from public.rotation_order(v_queue.id, 'seller', null, v_queue.last_assigned_ref_id)
      loop
        if v_row.enabled and public.is_seller_eligible_now(v_row.ref_id::uuid) then
          v_selected := v_row.ref_id::uuid;
          update public.rotation_queues
            set last_assigned_ref_id = v_selected::text, updated_at = now()
            where id = v_queue.id;
          return v_selected;
        end if;
      end loop;
    else
      for v_dept_row in
        select * from public.rotation_order(v_queue.id, 'department', null, v_queue.last_assigned_ref_id)
      loop
        if not v_dept_row.enabled then
          continue;
        end if;

        select last_assigned_member_id into v_dept_last_member
        from public.rotation_participants
        where queue_id = v_queue.id and ref_type = 'department' and ref_id = v_dept_row.ref_id;

        for v_member_row in
          select * from public.rotation_order(v_queue.id, 'seller', v_dept_row.ref_id, v_dept_last_member)
        loop
          if v_member_row.enabled and public.is_seller_eligible_now(v_member_row.ref_id::uuid) then
            v_selected := v_member_row.ref_id::uuid;
            update public.rotation_participants
              set last_assigned_member_id = v_selected::text
              where queue_id = v_queue.id and ref_type = 'department' and ref_id = v_dept_row.ref_id;
            update public.rotation_queues
              set last_assigned_ref_id = v_dept_row.ref_id, updated_at = now()
              where id = v_queue.id;
            return v_selected;
          end if;
        end loop;
      end loop;
    end if;
  end if;

  return '57706ecc-01b5-4a96-b403-0359a4bb767f'::uuid;
end;
$$;

revoke all on function public.assign_next_from_rotation(uuid) from public, anon;
grant execute on function public.assign_next_from_rotation(uuid) to authenticated, service_role;
