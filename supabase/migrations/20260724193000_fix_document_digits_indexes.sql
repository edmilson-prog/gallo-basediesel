-- The digits-only indexes added in 20260724190000 are never used: they were
-- created as PARTIAL indexes (`where cnpj is not null`), and the planner can
-- only use a partial index when it can prove the predicate from the query's
-- own quals. find_customers_by_document filters on
-- `regexp_replace(coalesce(cnpj,''),'\D','','g') = <digits>`, which — thanks to
-- coalesce swallowing NULL — implies nothing about `cnpj is not null`, so the
-- lookup falls back to a sequential scan (verified with explain analyze against
-- the production table).
--
-- Dropping the predicate makes the index expression match the query exactly.
-- The rows it adds are the null-document ones, which are cheap to carry.

drop index if exists public.customers_cnpj_digits_idx;
drop index if exists public.customers_cpf_digits_idx;

create index if not exists customers_cnpj_digits_idx
  on public.customers ((regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')));

create index if not exists customers_cpf_digits_idx
  on public.customers ((regexp_replace(coalesce(cpf, ''), '\D', '', 'g')));
