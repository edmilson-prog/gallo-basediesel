-- Tira `anon` (e `service_role`) da RPC de tratativa de detratores.
--
-- O `revoke all ... from public` da migration anterior não bastou, e vale
-- registrar por quê: as DEFAULT PRIVILEGES do Supabase no schema `public`
-- concedem EXECUTE a `anon`, `authenticated` e `service_role` no momento da
-- criação da função — como grants próprios de cada role, não pela entrada
-- PUBLIC. Revogar de PUBLIC não toca nesses três. O advisor de segurança
-- `anon_security_definer_function_executable` apontou exatamente isso depois
-- da aplicação em produção (13/08/2026).
--
-- A função já falhava fechada para anônimo: sem JWT, `is_staff()` é false e
-- `current_store_id()` é NULL, então o UPDATE não casaria linha nenhuma. Ainda
-- assim é um caminho de ESCRITA rodando como SECURITY DEFINER — quem não tem
-- sessão não deve nem conseguir invocá-lo. É o mesmo tratamento que
-- `nps_survey_candidates` já tinha.
revoke all on function public.nps_set_recovery(uuid, text, text) from anon;

-- `service_role` também sai: as Edge Functions criam e respondem pesquisas,
-- mas quem trata detrator é gente logada, e a função depende de claims de JWT
-- que o service_role não carrega.
revoke all on function public.nps_set_recovery(uuid, text, text) from service_role;
