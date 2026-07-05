-- Owner decision (2026-07-05): a collaborator should see the OTHER
-- collaborators of a conversation, not only their own row. cp_select (from
-- 20260615130200, deliberately frozen by the collaborators feature) allowed
-- staff, the seller's own row, or the conversation's assignee — so a non-staff
-- collaborator saw "Colaboradores (1)" (just themselves) while the assignee and
-- Owner saw the full list.
--
-- Add one branch: "or I am a participant of this conversation". Referencing
-- conversation_participants inside its own SELECT policy would infinite-recurse,
-- so route through the existing SECURITY DEFINER helper is_conversation_participant
-- (search_path '', bypasses RLS). The table is tiny (a handful of rows per
-- conversation) so the per-row helper call is cheap here.
drop policy if exists cp_select on public.conversation_participants;
create policy cp_select on public.conversation_participants
  for select to authenticated
  using (
    (select public.is_staff())
    or seller_id = (select public.current_seller_id())
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.assigned_seller_id = (select public.current_seller_id())
    )
    or public.is_conversation_participant(conversation_id)
  );
