-- Split the staff-only ALL policy on whatsapp_account_access_rules into a
-- same-store SELECT policy + a staff-only write policy.
--
-- WHY: the "Adicionar colaborador" dialog resolves invite candidates on the
-- client by reading these access rules (engine `passesInstanceGate`). The
-- responsável (conversation assignee) is allowed to invite collaborators even
-- when not staff (see `cp_insert` in
-- 20260704120000_conversation_participants_lifecycle.sql, mirrored by
-- `canManageCollaborators`), but the previous `waar_staff_all` policy let ONLY
-- staff read the rules. A non-staff responsável therefore read zero rules, so
-- the client instance gate (`resolveAccessRecipients([], …)`) filtered out
-- every valid candidate and the dialog showed an empty list.
--
-- Reads are org-internal routing config ("which sellers access which number"),
-- the same sensitivity as the already same-store-readable `sellers` list.
-- Writes stay staff-only — unchanged semantics.

drop policy if exists waar_staff_all on public.whatsapp_account_access_rules;
drop policy if exists waar_select on public.whatsapp_account_access_rules;
drop policy if exists waar_write on public.whatsapp_account_access_rules;

-- Same-store read: any authenticated seller of the account's store.
create policy waar_select on public.whatsapp_account_access_rules
  for select to authenticated
  using (
    exists (
      select 1
      from public.whatsapp_accounts a
      where a.id = whatsapp_account_access_rules.whatsapp_account_id
        and a.store_id = (select public.current_store_id())
    )
  );

-- Staff-only write (insert/update/delete): preserves the original policy's
-- guard. FOR ALL also grants staff SELECT, but the broader waar_select above
-- wins for reads (policies are OR'd).
create policy waar_write on public.whatsapp_account_access_rules
  for all to authenticated
  using (
    exists (
      select 1
      from public.whatsapp_accounts a
      where a.id = whatsapp_account_access_rules.whatsapp_account_id
        and a.store_id = (select public.current_store_id())
        and (select public.is_staff())
    )
  )
  with check (
    exists (
      select 1
      from public.whatsapp_accounts a
      where a.id = whatsapp_account_access_rules.whatsapp_account_id
        and a.store_id = (select public.current_store_id())
        and (select public.is_staff())
    )
  );
