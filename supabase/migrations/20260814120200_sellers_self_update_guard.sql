-- Restringe o auto-update de `sellers` aos campos de perfil.
--
-- Problema (auditoria de segurança de 2026-08-14):
-- `sellers_update` permite que um vendedor edite a própria linha
-- (`auth_user_id = auth.uid()`), mas o WITH CHECK validava apenas `store_id`.
-- Sem restrição de coluna, ele podia reescrever `commission_rule`,
-- `commission_tier`, `type`, `department_id`, `rotation`, `active` e
-- `work_schedule` — integridade financeira e manipulação do rodízio de
-- atendimento. Não é escalada de RBAC (o papel vive em `profiles`, que não tem
-- policy de escrita alguma), mas é ganho indevido dentro da própria loja.
--
-- Por que WITH CHECK sozinho não resolve: RLS decide por LINHA, não por COLUNA.
-- Espelhar o USING no WITH CHECK impede mover a linha para outra loja ou trocar
-- o `auth_user_id`, mas não impede o vendedor de alterar a própria comissão.
-- Por isso as duas partes abaixo: o WITH CHECK completo fecha a troca de dono da
-- linha, e o trigger fecha a troca de coluna.
--
-- Column-level GRANT também não serve aqui: privilégio de coluna é por ROLE, e
-- staff e vendedor compartilham o role `authenticated` — revogar de um revogaria
-- do outro.
--
-- A lista é uma ALLOWLIST deliberadamente: coluna nova nasce bloqueada para
-- não-staff, e só é liberada por decisão explícita. Uma denylist erraria por
-- omissão no dia em que uma coluna sensível fosse adicionada.
--
-- Campos liberados = exatamente os que a tela "Meu perfil"
-- (src/features/admin-settings/pages/ProfileSettingsPage.tsx) e o toggle de
-- disponibilidade (src/features/distribution/components/AvailabilityToggle.tsx)
-- escrevem hoje.

alter policy sellers_update on public.sellers
  using (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or auth_user_id = (select auth.uid()))
  )
  with check (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or auth_user_id = (select auth.uid()))
  );

create or replace function public.guard_seller_self_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Campos que o próprio vendedor pode editar sobre si.
  editable_columns text[] := array[
    'full_name',
    'email',
    'phone',
    'region',
    'avatar_url',
    'attendant_name',
    'availability',
    'theme_preference',
    'updated_at'
  ];
begin
  -- service_role (Edge Functions) e o dono do banco (migrations) não passam por
  -- este guard; staff da loja edita a ficha inteira, que é a função dele.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if public.is_staff() then
    return new;
  end if;

  -- Remove as chaves liberadas dos dois lados e compara o restante: se algo
  -- fora da allowlist mudou, o update é de competência do staff.
  if (to_jsonb(new) - editable_columns) is distinct from (to_jsonb(old) - editable_columns) then
    raise exception
      'insufficient_privilege: auto-edição de vendedor limitada aos campos de perfil'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists sellers_guard_self_update on public.sellers;

create trigger sellers_guard_self_update
  before update on public.sellers
  for each row
  execute function public.guard_seller_self_update();
