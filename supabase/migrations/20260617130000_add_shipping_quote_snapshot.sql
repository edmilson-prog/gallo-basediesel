-- Persist the shipping-quote snapshot (Épico "Melhor Envio" · Fase A).
--
-- IQuote/IOrder carry an optional `shippingQuote` (IShippingQuoteSnapshot):
-- source + carrier/service + price + delivery + quotedAt. Stored as jsonb so it
-- evolves with the type (no per-field columns). Reused by the deferred Fase B
-- (label purchase). Additive + nullable — backward compatible.

alter table public.quotes add column if not exists shipping_quote jsonb;
alter table public.orders add column if not exists shipping_quote jsonb;
