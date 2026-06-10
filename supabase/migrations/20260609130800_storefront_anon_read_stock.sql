-- PRD-110 / Storefront anon wiring fix.
-- The public B2C storefront (loja) needs stock signals to function: out-of-stock
-- badges, "pronta entrega / apenas X em estoque", the "só em estoque" filter, and
-- cart/checkout quantity clamping. The original storefront_anon_read migration
-- mistakenly revoked these from anon. Re-grant the two stock columns (read-only).
-- This does NOT expose cost/margin/suppliers/fiscal — those stay excluded.
grant select (stock_available, stock_minimum) on public.parts to anon;
