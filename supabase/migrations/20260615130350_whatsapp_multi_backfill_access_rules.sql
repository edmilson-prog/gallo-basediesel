-- Multi-instância — backfill que PRESERVA o pool atual ao ativar can_access (130400).
-- Cada instância EXISTENTE recebe uma regra kind=store (todos da loja acessam),
-- replicando o comportamento legado (pool aberto a todos da loja). Instâncias NOVAS
-- (criadas pela UI) nascem sem regras = visíveis só a Owner/Gestor, por design.
-- Idempotente: on conflict não duplica.
insert into public.whatsapp_account_access_rules (whatsapp_account_id, kind, target_value)
select a.id, 'store', a.store_id::text
from public.whatsapp_accounts a
on conflict (whatsapp_account_id, kind, target_value) do nothing;
