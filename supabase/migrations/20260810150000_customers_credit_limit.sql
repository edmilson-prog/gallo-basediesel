-- Platform-owned credit limit for customers.
--
-- Until now the only credit figure in the database was `dintec_credit_limit`,
-- a read-only snapshot of CLIENTE.CREDITO written by the assisted DINTEC CSV
-- import. That column stays exactly as it is: it remains the ERP's word.
--
-- `credit_limit` is the platform's own value, editable by staff from the
-- customer profile. It is seeded from the DINTEC snapshot so no existing
-- figure is lost, and takes precedence over it from then on.
--
-- The consumed portion is deliberately NOT stored. There is no accounts
-- receivable module yet, so "used" is derived at read time from orders whose
-- payment is still open — see src/features/customers/engine/customerCredit.ts.
-- Persisting a figure nothing keeps up to date would rot immediately.

alter table public.customers
  add column if not exists credit_limit numeric;

-- Seed from the ERP snapshot, without clobbering anything already set.
update public.customers
   set credit_limit = dintec_credit_limit
 where dintec_credit_limit is not null
   and credit_limit is null;

comment on column public.customers.credit_limit is
  'Credit limit granted by the platform, in BRL. Editable by staff; seeded from dintec_credit_limit. NULL = no limit ever defined (UI omits the cell); 0 = credit explicitly blocked. The consumed portion is derived from open-payment orders, never stored.';
