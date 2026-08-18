-- Customer attendance timeline, one call. Returns JSONB because the payload has
-- two granularities (conversation and event) and flattening would repeat each
-- conversation's aggregate on every event row.
--
-- Message aggregation lives here on purpose: it runs as an index-only scan over
-- messages_conversation_created_at_idx, and SECURITY DEFINER means it never pays
-- per-row RLS over 217k rows.
--
-- get_customer_activity is deliberately left untouched — rollback is to stop
-- calling this function.

create or replace function public.get_customer_timeline(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  with allowed as (
    select 1
    from public.customers cu
    where cu.id = p_customer_id
      and (
        public.is_staff()
        or cu.seller_id = public.current_seller_id()
        or exists (
          select 1 from public.conversations cc
          where cc.customer_id = p_customer_id
            and public.can_access_conversation(cc.id)
        )
      )
  ),
  conv as (
    select c.*
    from public.conversations c
    where c.customer_id = p_customer_id
      and exists (select 1 from allowed)
  ),
  msg as (
    select m.conversation_id,
           count(*) as message_count,
           max(m.created_at) as last_message_at
    from public.messages m
    join conv on conv.id = m.conversation_id
    group by m.conversation_id
  ),
  last_msg as (
    select distinct on (m.conversation_id)
           m.conversation_id,
           left(coalesce(m.text, ''), 120) as preview
    from public.messages m
    join conv on conv.id = m.conversation_id
    order by m.conversation_id, m.created_at desc
  )
  select coalesce(
    jsonb_build_object(
      'customerId', p_customer_id,
      'generatedAt', now(),
      'conversations', coalesce(jsonb_agg(x.payload order by x.created_at desc), '[]'::jsonb)
    ),
    jsonb_build_object('customerId', p_customer_id, 'generatedAt', now(),
                       'conversations', '[]'::jsonb)
  )
  from (
    select
      conv.created_at,
      jsonb_build_object(
        'id', conv.id,
        'channel', conv.channel,
        'status', conv.status,
        'createdAt', conv.created_at,
        'closedAt', conv.closed_at,
        'assignedSellerId', conv.assigned_seller_id,
        -- The marker is the timestamp of the first event the trigger ever wrote.
        'preRegistro', conv.created_at < timestamptz '2026-07-04 01:43:17+00',
        'messageCount', coalesce(msg.message_count, 0),
        'lastMessageAt', msg.last_message_at,
        'lastMessagePreview', coalesce(last_msg.preview, ''),
        'events', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', a.id, 'conversationId', a.conversation_id, 'storeId', a.store_id,
            'type', a.type, 'fromStatus', a.from_status, 'toStatus', a.to_status,
            'fromSellerId', a.from_seller_id, 'toSellerId', a.to_seller_id,
            'actorId', a.actor_id, 'actorKind', a.actor_kind, 'createdAt', a.created_at,
            'conversationChannel', conv.channel, 'conversationStatus', conv.status,
            'conversationCreatedAt', conv.created_at
          ) order by a.created_at asc)
          from public.conversation_activity a where a.conversation_id = conv.id
        ), '[]'::jsonb),
        'notes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', n.id, 'at', n.created_at, 'authorId', n.author_id, 'body', n.content
          ) order by n.created_at asc)
          from public.conversation_notes n where n.conversation_id = conv.id
        ), '[]'::jsonb),
        'quotes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', q.id, 'at', q.created_at, 'total', q.total, 'status', q.status
          ) order by q.created_at asc)
          from public.quotes q where q.conversation_id = conv.id
        ), '[]'::jsonb),
        'orders', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'at', o.created_at, 'total', o.total
          ) order by o.created_at asc)
          from public.orders o where o.conversation_id = conv.id
        ), '[]'::jsonb)
      ) as payload
    from conv
    left join msg on msg.conversation_id = conv.id
    left join last_msg on last_msg.conversation_id = conv.id
  ) x;
$$;

revoke all on function public.get_customer_timeline(uuid) from public, anon;
grant execute on function public.get_customer_timeline(uuid) to authenticated;
