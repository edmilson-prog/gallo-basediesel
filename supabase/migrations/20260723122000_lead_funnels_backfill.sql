-- Backfill: materialise the default "Geral" triage funnel per store from
-- stores.settings->'pipelineStages', then give every existing lead exactly one
-- membership. Idempotent: re-running is a no-op.

do $$
declare
  store_row record;
  funnel uuid;
  stage_json jsonb;
  stage_count int;
  closing_seen boolean;
  next_position int;
  won_stage uuid;
  lost_stage uuid;
  entry_stage uuid;
  last_open_stage uuid;
begin
  for store_row in select id, settings from public.stores loop

    -- Already migrated?
    select id into funnel from public.lead_funnels
     where store_id = store_row.id and is_default limit 1;
    if funnel is not null then
      continue;
    end if;

    insert into public.lead_funnels
      (store_id, name, description, accent, icon, position, is_default, open_to_store)
    values
      (store_row.id, 'Geral', 'Todo lead novo entra aqui até ser direcionado.',
       0, 'mdi:inbox-outline', 0, true, true)
    returning id into funnel;

    next_position := 0;
    closing_seen := false;
    entry_stage := null;
    last_open_stage := null;
    won_stage := null;
    lost_stage := null;

    -- Legacy stages, in order. The terminal one is identified by NAME, not by a
    -- literal id: 'stage-fechado' comes from the frontend fallback and may not
    -- exist in a given store's settings.
    for stage_json in
      select value from jsonb_array_elements(
        coalesce(store_row.settings->'pipelineStages', '[]'::jsonb)
      ) order by (value->>'order')::int
    loop
      if lower(stage_json->>'name') ~ '(fechad|convertid|perdid)' then
        -- Only the FIRST terminal match creates the Convertido/Perdido pair: the
        -- unique indexes on (funnel_id) where kind in ('ganho','perda') allow only
        -- one of each per funnel, so a store whose pipeline has multiple stages
        -- matching this regex (e.g. separate "Convertido" and "Perdido" stages)
        -- must skip the rest. Their leads still resolve correctly via the
        -- converted_to_customer_id/loss_reason branches below.
        if not closing_seen then
          -- The legacy stage conflated both outcomes; split it in two.
          insert into public.lead_funnel_stages (funnel_id, name, accent, position, kind)
          values (funnel, 'Convertido', 3, next_position, 'ganho') returning id into won_stage;
          next_position := next_position + 1;
          insert into public.lead_funnel_stages (funnel_id, name, accent, position, kind)
          values (funnel, 'Perdido', 1, next_position, 'perda') returning id into lost_stage;
          next_position := next_position + 1;
        end if;
        closing_seen := true;
      else
        insert into public.lead_funnel_stages (funnel_id, name, accent, position, kind)
        values (
          funnel,
          left(stage_json->>'name', 24),
          -- Map the legacy free-form hex to its funnel accent slot (mirrors the
          -- TS engine hexToAccentSlot's HSL-hue buckets — see src/features/
          -- funnels/engine/legacyStageColor.ts). Case-insensitive; anything
          -- unrecognised (including a missing/malformed colour) defaults to
          -- neutral slot 0 rather than failing the backfill.
          case lower(stage_json->>'color')
            when '#5b6b7a' then 0
            when '#c4151c' then 1
            when '#c8262c' then 1
            when '#d2a809' then 2
            when '#c79c2c' then 2
            when '#337648' then 3
            else 0
          end,
          next_position,
          -- Explicit cast: a CASE resolves to text, and text->enum is not an
          -- implicit cast in Postgres (a bare literal would be coerced, a CASE
          -- result is not). Caught by the pre-apply rehearsal.
          (case when entry_stage is null then 'entrada' else 'aberta' end)::public.lead_funnel_stage_kind
        )
        returning id into last_open_stage;
        if entry_stage is null then
          entry_stage := last_open_stage;
          last_open_stage := null;
        end if;
        next_position := next_position + 1;
      end if;
    end loop;

    -- Store with no configured pipeline, or one whose stages were all terminal.
    if entry_stage is null then
      insert into public.lead_funnel_stages (funnel_id, name, accent, position, kind)
      values (funnel, 'Novo', 0, next_position, 'entrada') returning id into entry_stage;
      next_position := next_position + 1;
    end if;

    if not closing_seen then
      insert into public.lead_funnel_stages (funnel_id, name, accent, position, kind)
      values (funnel, 'Convertido', 3, next_position, 'ganho') returning id into won_stage;
      next_position := next_position + 1;
      insert into public.lead_funnel_stages (funnel_id, name, accent, position, kind)
      values (funnel, 'Perdido', 1, next_position, 'perda') returning id into lost_stage;
    end if;

    -- Fail loud rather than leave a funnel that leads can enter but never close.
    if won_stage is null or lost_stage is null or entry_stage is null then
      raise exception 'store % ended with an incomplete funnel', store_row.id;
    end if;

    -- One membership per lead. Destination:
    --   converted            -> won
    --   has a loss reason    -> lost
    --   otherwise            -> the stage matching its legacy snapshot, or the
    --                           entry stage when no name matches.
    -- A lead parked on the legacy closing stage with NEITHER outcome lands on
    -- the last open stage, never on 'lost': inventing a loss would poison the
    -- historical conversion rate.
    insert into public.lead_funnel_entries
      (lead_id, funnel_id, stage_id, store_id, seller_id, estimated_value,
       converted_to_customer_id, loss_reason, loss_notes, entered_stage_at)
    select
      l.id,
      funnel,
      case
        when l.converted_to_customer_id is not null then won_stage
        when l.loss_reason is not null then lost_stage
        else coalesce(
          (select s.id from public.lead_funnel_stages s
            where s.funnel_id = funnel
              and lower(s.name) = lower(left(l.stage->>'name', 24))
              and s.kind not in ('ganho','perda')
            limit 1),
          coalesce(last_open_stage, entry_stage)
        )
      end,
      l.store_id,
      l.seller_id,
      l.estimated_value,
      l.converted_to_customer_id,
      l.loss_reason,
      l.loss_notes,
      l.updated_at
    from public.leads l
    where l.store_id = store_row.id
      and not exists (
        select 1 from public.lead_funnel_entries e
         where e.lead_id = l.id and e.funnel_id = funnel
      );

  end loop;

  -- Every lead must have landed somewhere.
  select count(*) into stage_count
    from public.leads l
   where not exists (select 1 from public.lead_funnel_entries e where e.lead_id = l.id);
  if stage_count > 0 then
    raise exception '% lead(s) ended with no funnel membership', stage_count;
  end if;
end $$;
