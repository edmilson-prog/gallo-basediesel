-- Multi-funil fase 6: recurso RBAC `funnel`.
--
-- Governa a ADMINISTRAÇÃO de funis — criar, renomear, editar etapas, conceder
-- acesso, arquivar. É coisa distinta de ALCANÇAR um funil, que é governado por
-- `lead_funnel_access` e não passa por RBAC.
--
-- O grupo "Comercial" hoje vai de sort_order 0 a 10, em ordem alfabética por
-- rótulo. "Funis" cairia entre "Clientes" e "Indicadores", mas reordenar as
-- linhas existentes seria mexer em dados que não são desta entrega — entra com
-- sort_order 11 e a ordenação alfabética fica com quem exibe.
--
-- Idempotente de propósito: roda em ensaio antes de rodar valendo.

insert into public.rbac_resources (key, label, "group", sort_order)
values ('funnel', 'Funis', 'Comercial', 11)
on conflict (key) do update
   set label = excluded.label,
       "group" = excluded."group";
