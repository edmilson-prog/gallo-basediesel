-- ============================================================================
-- Pool de não-atribuídos (RBAC fino). A loja já expõe os filtros "Sem
-- atribuição"/"Em fila"; o RLS precisa deixar o vendedor não-staff VER e
-- REIVINDICAR conversas sem dono (assigned_seller_id IS NULL), sem expor a
-- carteira ATRIBUÍDA a outros vendedores (preserva os Slices 1–4).
-- messages cascata automaticamente (sua policy delega a conversations).
-- Helpers ficam envelopados em (select ...) (consistente com Part C).
-- ============================================================================

-- SELECT: own + pool (+ staff vê tudo).
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select to authenticated
  using (
    store_id = (select current_store_id())
    and (
      (select is_staff())
      or assigned_seller_id = (select current_seller_id())
      or assigned_seller_id is null
    )
  );

-- UPDATE: a non-staff seller may target own + pool rows (USING), but the row
-- must END UP owned by them (WITH CHECK) — so they can claim null->self, can't
-- assign to others, and can't edit a pool row without claiming it. Staff: any.
drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update to authenticated
  using (
    store_id = (select current_store_id())
    and (
      (select is_staff())
      or assigned_seller_id = (select current_seller_id())
      or assigned_seller_id is null
    )
  )
  with check (
    store_id = (select current_store_id())
    and (
      (select is_staff())
      or assigned_seller_id = (select current_seller_id())
    )
  );
