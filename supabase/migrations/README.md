# Migrations — GALLO BASE DIESEL (Fase 2)

Estas migrations são a **transcrição fiel do histórico remoto** do projeto Supabase
(`supabase_migrations.schema_migrations`), exportadas em 2026-06-09 (PRD-101).

## Como este histórico nasceu

Durante a Fase 2 (cutover Mock → Supabase) as migrations foram aplicadas
**diretamente no projeto remoto via MCP** (`apply_migration`), que as registra na
tabela de histórico com versão e statements. Este diretório materializa esse
histórico no Git para reprodutibilidade — os nomes de arquivo seguem o padrão da
CLI (`<version>_<name>.sql`), então `supabase db push` / `supabase migration list`
reconhecem o estado como sincronizado.

## Regras

- **O remoto é a fonte da verdade do que está aplicado.** Nova migration via MCP
  (`apply_migration`) deve ser **exportada para cá no mesmo PR** (copie o SQL
  aplicado para `supabase/migrations/<version>_<name>.sql`).
- **Nunca edite uma migration já aplicada** — crie uma nova.
- O deploy automatizado (`.github/workflows/db-deploy.yml`) usa `supabase db push`,
  que aplica apenas versões ausentes no histórico remoto. Como o remoto já contém
  todas as versões deste diretório, o push é no-op até existir migration nova.
- Seeds de dados de demonstração **não** vivem aqui — ver `scripts/seed-supabase.ts`.

## Observações de conteúdo

- As primeiras migrations (POC) usam `text` como PK e policies `*_select_poc_temp`;
  ambas foram **superadas** por migrations posteriores (`convert_*_pks_to_uuid`,
  `rls_policies_*`). O replay completo em um banco vazio reproduz o estado final.
- Documentação do desenho de RLS: `docs/db/rls-policies-fase2-mvp.md`.
- Visão geral do schema: `docs/db/schema-overview.md`.
