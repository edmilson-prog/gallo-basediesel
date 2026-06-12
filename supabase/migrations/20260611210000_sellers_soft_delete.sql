-- Soft delete for sellers (users CRUD). NULL = alive. Rows with deleted_at set
-- are hidden from every provider list() but stay referencable by historical FKs.
alter table public.sellers add column if not exists deleted_at timestamptz;
