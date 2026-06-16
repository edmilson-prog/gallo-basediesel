-- Multi-instância — helpers de acesso. SECURITY DEFINER STABLE search_path=''
-- para bypassar a RLS das tabelas-base (sem recursão) e ser cacheável no plano.

-- Instâncias que o seller atual acessa (OU das regras + papel/loja do claim).
create or replace function public.current_seller_accessible_account_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select a.id
  from public.whatsapp_accounts a
  where a.store_id = public.current_store_id()
    and (
      public.is_staff()  -- owner/manager veem todas as instâncias da loja
      or exists (
        select 1 from public.whatsapp_account_access_rules r
        where r.whatsapp_account_id = a.id
          and (
            (r.kind = 'seller' and r.target_value = public.current_seller_id()::text)
            or (r.kind = 'role'   and r.target_value = public.current_app_role())
            or (r.kind = 'store'  and r.target_value = public.current_store_id()::text)
          )
      )
    );
$function$;

-- O seller atual é co-responsável (participante) da conversa?
create or replace function public.is_conversation_participant(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.conversation_participants p
    where p.conversation_id = conv
      and p.seller_id = public.current_seller_id()
  );
$function$;

-- Ponto ÚNICO de decisão de acesso a uma conversa.
create or replace function public.can_access_conversation(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.conversations c
    where c.id = conv
      and c.store_id = public.current_store_id()
      and (
        public.is_staff()
        or c.assigned_seller_id = public.current_seller_id()
        or public.is_conversation_participant(conv)
        -- Pool de uma instância que o seller acessa:
        or (
          c.assigned_seller_id is null
          and c.whatsapp_account_id is not null
          and c.whatsapp_account_id in (select public.current_seller_accessible_account_ids())
        )
        -- Pool de canal não-WhatsApp (sem instância): preserva o comportamento atual
        -- (qualquer seller da loja vê o pool).
        or (
          c.assigned_seller_id is null
          and c.whatsapp_account_id is null
        )
      )
  );
$function$;
