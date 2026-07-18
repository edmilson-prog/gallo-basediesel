-- Reusable, dry-run-capable repoint of a WhatsApp account's conversations onto
-- another account. Extracted from the evolution-go -> Evolution migration's ad-hoc
-- "SQL assistido" (docs/integracoes/evo-go/ENCERRAMENTO-EVO-GO-2026-07-07.md),
-- now versioned because the Evolution -> WAHA migration repeats this per account
-- (Teste-AILA, Vendas, VendasExterna, Comercial Lucas, GALLO Site).
--
-- Moves conversations.whatsapp_account_id (the sole FK tying a conversation to an
-- instance) and copies whatsapp_account_access_rules (ON DELETE CASCADE — does not
-- migrate on its own, and losing it makes staff lose access to their own assigned
-- conversations under the "instância é o portão-mestre" rule). messages,
-- scheduled_sends, distribution_traces and conversation_participants have no
-- whatsapp_account_id column of their own — they follow conversation_id for free.
--
-- dry_run defaults to true (same convention as waha-connect action=backfillLids):
-- call once to see the counts, again with dry_run:=false to apply.

create or replace function public.migrate_whatsapp_account(
  p_old_account_id uuid,
  p_new_account_id uuid,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_store uuid;
  v_new_store uuid;
  v_conversations_before int;
  v_conversations_moved int := 0;
  v_rules_before int;
  v_rules_copied int := 0;
  v_templates_linked int;
begin
  select store_id into v_old_store from public.whatsapp_accounts where id = p_old_account_id;
  select store_id into v_new_store from public.whatsapp_accounts where id = p_new_account_id;
  if v_old_store is null then raise exception 'OLD_ACCOUNT_NOT_FOUND'; end if;
  if v_new_store is null then raise exception 'NEW_ACCOUNT_NOT_FOUND'; end if;
  if v_old_store <> v_new_store then raise exception 'STORE_MISMATCH'; end if;
  if p_old_account_id = p_new_account_id then raise exception 'SAME_ACCOUNT'; end if;

  select count(*) into v_conversations_before
    from public.conversations where whatsapp_account_id = p_old_account_id;
  select count(*) into v_rules_before
    from public.whatsapp_account_access_rules where whatsapp_account_id = p_old_account_id;
  select count(*) into v_templates_linked
    from public.message_templates where whatsapp_account_id = p_old_account_id;

  if not p_dry_run then
    update public.conversations
       set whatsapp_account_id = p_new_account_id
     where whatsapp_account_id = p_old_account_id;
    get diagnostics v_conversations_moved = row_count;

    insert into public.whatsapp_account_access_rules (whatsapp_account_id, kind, target_value)
    select p_new_account_id, kind, target_value
      from public.whatsapp_account_access_rules
     where whatsapp_account_id = p_old_account_id
    on conflict (whatsapp_account_id, kind, target_value) do nothing;
    get diagnostics v_rules_copied = row_count;
  end if;

  return jsonb_build_object(
    'dryRun', p_dry_run,
    'oldAccountId', p_old_account_id,
    'newAccountId', p_new_account_id,
    'conversationsBefore', v_conversations_before,
    'conversationsMoved', case when p_dry_run then v_conversations_before else v_conversations_moved end,
    'accessRulesBefore', v_rules_before,
    'accessRulesCopied', case when p_dry_run then v_rules_before else v_rules_copied end,
    'messageTemplatesLinkedToOld', v_templates_linked
  );
end;
$$;

-- service_role (SQL editor / MCP, operator-run) is the only caller.
revoke all on function public.migrate_whatsapp_account(uuid, uuid, boolean) from public;
revoke all on function public.migrate_whatsapp_account(uuid, uuid, boolean) from anon;
revoke all on function public.migrate_whatsapp_account(uuid, uuid, boolean) from authenticated;
