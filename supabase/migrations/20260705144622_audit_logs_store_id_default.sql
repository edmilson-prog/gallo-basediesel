-- Root fix for the issue #231 bug class: derive audit_logs.store_id
-- server-side when the writer omits it.
--
-- current_store_id() reads the request JWT (app_metadata.store_id, minted by
-- the Custom Access Token Hook), which is exactly the only value the INSERT
-- policy WITH CHECK (store_id = current_store_id()) accepts. With the default
-- in place, a client that cannot read its own token (hydration race, decode
-- failure, held auth lock) simply omits the column and the row still lands in
-- the right store.
--
-- Writers that keep providing store_id explicitly (Edge Functions using the
-- service_role, whose JWT carries no store claim) are unaffected.
alter table public.audit_logs
  alter column store_id set default public.current_store_id();
