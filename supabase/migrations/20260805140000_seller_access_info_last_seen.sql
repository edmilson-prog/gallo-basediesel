-- "Último acesso" na tela de Usuários mostrava o último LOGIN, não o último uso.
--
-- `auth.users.last_sign_in_at` só é escrito num sign-in EXPLÍCITO (senha/OTP/
-- OAuth). Sessão persistente renovada por refresh token não o toca, então um
-- usuário que trabalha o dia inteiro sem deslogar continua exibindo a data em
-- que digitou a senha pela última vez — dias atrás (verificado em 2026-08-05:
-- last_sign_in_at de 04/08 13:32 BRT para sessões renovadas às 09:34 de 05/08).
--
-- A atividade real vive em `auth.sessions`: `refreshed_at`/`updated_at` avançam
-- a cada renovação de token enquanto o app está aberto. `last_seen_at` passa a
-- ser o maior entre o login explícito e a atividade de qualquer sessão viva do
-- usuário; NULL apenas para quem nunca acessou (GREATEST ignora NULLs).
--
-- Granularidade: a renovação ocorre a cada ~1h de app aberto, então o valor é
-- "ativo por volta de", não um heartbeat ao minuto. Para "está online AGORA" a
-- tela usa Realtime Presence, não este campo.
--
-- `last_sign_in_at` continua exposto (o cliente cai nele quando `last_seen_at`
-- ainda não existe, mantendo o app compatível com o banco antes desta migration).
--
-- `refreshed_at` é `timestamp without time zone` (gravado em UTC pelo GoTrue) —
-- o `at time zone 'utc'` o converte para timestamptz sem depender do TimeZone
-- da sessão que executa a função.

-- Adicionar uma coluna OUT muda o tipo de retorno: drop + recreate.
drop function if exists public.seller_access_info();

create function public.seller_access_info()
  returns table (
    seller_id uuid,
    role text,
    role_id text,
    last_sign_in_at timestamptz,
    last_seen_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select
    p.seller_id,
    p.role,
    p.role_id,
    u.last_sign_in_at,
    greatest(
      u.last_sign_in_at,
      (
        select max(greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'utc'))
        from auth.sessions s
        where s.user_id = u.id
      )
    ) as last_seen_at
  from public.profiles p
  join auth.users u on u.id = p.auth_user_id
  where p.store_id = public.current_store_id()
    and p.seller_id is not null
    and public.is_staff();
$$;

-- Recreate drops the original grants; restore the locked-down posture (the
-- bare CREATE would otherwise leave EXECUTE granted to PUBLIC).
revoke execute on function public.seller_access_info() from public, anon;
grant execute on function public.seller_access_info() to authenticated;
