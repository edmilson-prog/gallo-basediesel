-- Papéis: nome único, case-insensitive (2026-08-07).
--
-- O editor já valida duplicidade no cliente (`existingNames` no RoleFormDialog),
-- mas o banco só tinha UNIQUE em `slug` — que para papel customizado é um uuid
-- gerado, portanto nunca colide. Dois Owners criando "Vendedor Sênior" ao mesmo
-- tempo, ou uma aba com a lista velha, passavam direto e produziam dois papéis
-- indistinguíveis na tela de atribuição.
--
-- Escopo do índice: (store_id, lower(name)). Papéis globais (store_id null) não
-- podem repetir nome entre si; um papel de loja pode repetir o nome de outra
-- loja. `coalesce` porque NULL nunca é igual a NULL num índice único.
--
-- Se houver duplicata pré-existente a criação do índice falha — deliberado, para
-- não mascarar dado sujo. Hoje não há: são 7 papéis de sistema + os customizados
-- criados nesta semana, todos com nomes distintos.

create unique index if not exists roles_unique_name_per_store
  on public.roles (coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
