# Checkpoint — Fase 2: migração uuid + banner de origem + seed de dados — 2026-06-08T17:03-03:00

> **Branch:** `main` · **Último commit:** `4c85fdd` chore(seed): add mock → Supabase data seeder (Fase 2)
> **Sessão anterior:** Claude Opus 4.8 · **Gerado em:** 2026-06-08T17:03-03:00
> **Sincronia:** `main` == `origin/main` (0 ahead / 0 behind — tudo pushado)

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-06-08-1703-fase2-uuid-migration-seed.md` na
íntegra e confirme em uma frase que entendeu: 1) o objetivo da sessão, 2) o estado
atual do código, 3) qual é a próxima tarefa. Não faça nenhuma ação até eu autorizar.
```

---

## 📌 Contexto do projeto

**GALLO BASE DIESEL** — SaaS de inteligência comercial (distribuidora de peças pesadas, Frederico Westphalen/RS). React 19 + Vite + TanStack Router/Query + Zustand + Tailwind v4/shadcn. SPA estática (Vercel). Arquitetura feature-driven (`features/`) com **Provider Pattern** (`@/providers/data`, switch `VITE_DATA_SOURCE=mock|supabase`). Estamos na **Fase 2** (migração Mock → Supabase). Projeto Supabase ref `njizaasajkdqptlxddqn`, conectado via MCP. App roda **`mock` por default**.

## 🎯 Objetivo da sessão

1. Decidir e executar a **convenção de chave primária** no Supabase (o usuário questionou PKs em `text`). Conclusão: o banco é **greenfield**, dados são **seed descartável** → migrar **tudo para `uuid`**.
2. Construir um **indicador de "quebra na origem dos dados"** na UI (destaque quando mock OU supabase falham ao carregar).
3. **Migrar os dados do mock para o Supabase** para a UI poder rodar em `data=supabase`.

## ✅ Progresso (o que foi feito)

- [x] **PK `uuid` — tabelas transacionais**, commit `f83bb62` — 33 tabelas transacionais `text → uuid` + `gen_random_uuid()`; FKs alinhadas; `create()` dos ~22 providers passou a gerar `crypto.randomUUID()` puro (sem prefixo).
- [x] **PK `uuid` — tabelas de referência**, commit `8cbafa7` — `stores`/`sellers`/`vehicle_models`/`whatsapp_accounts` → `uuid`. **Matriz fixada no sentinela** `00000000-0000-0000-0000-000000000001` (DB + `profiles.store_id` + mock). Literal `"store-matriz"` trocado pelo sentinela em **101 arquivos** (sed). Resultado: **36 PKs + 98 FKs todos `uuid`, 0 divergência**.
- [x] **Banner de quebra de origem (Passo 2)**, commit `393484d` — `useDataHealth` (assina o query cache, conta queries com erro observadas) + `DataSourceBanner` (faixa `severity-critical` no topo do `AppLayout`, mostra a origem ativa + "Tentar novamente", some ao recuperar) + `getActiveDataSource()` exposto no barrel.
- [x] **Seed de dados (Passo 3)**, commit `4c85fdd` — `scripts/seed-supabase.ts` inseriu **4468 linhas em 31 tabelas**; integridade de FK verificada (zero órfãos); `profile.store_id` = sentinela.
- [x] **Validação**: `bun run build` ✓, `bun run test` ✓ **244/244** (após cada etapa). `tsc`/`eslint` sem erro novo nos arquivos tocados.
- [x] Memória `project_fase2_supabase_kickoff.md` atualizada com tudo acima.

## 🔧 Estado do código

- **Branch:** `main` (== `origin/main`, tudo pushado).
- **Último commit:** `4c85fdd`.
- **Working tree:** só ruído — `src/routeTree.gen.ts` (M, gerado; **não commitar**) + `docs/relatorio-codigo-morto-2026-06-04.md` e `knip.json` (untracked, pré-existentes, não desta sessão).
- **Arquivos criados/centrais desta sessão:**
  - `scripts/seed-supabase.ts` (A) — seeder mock→Supabase (lê `SUPABASE_SERVICE_ROLE_KEY` do `.env.local`).
  - `src/features/shell/hooks/useDataHealth.ts` (A) — detecção de falha de origem.
  - `src/features/shell/components/DataSourceBanner.tsx` (A) — banner.
  - `src/features/shell/layouts/AppLayout.tsx` (M) — monta o banner.
  - `src/providers/data/factory.ts` + `index.ts` (M) — `getActiveDataSource()`.
  - `src/providers/data/impl/supabase/*.ts` (M, lote anterior) — `create()` gera uuid puro.
- **Migrations Supabase (no remoto, via MCP):** `convert_transactional_pks_to_uuid`, `convert_reference_pks_to_uuid`.
- **Build/testes:** PASS (build + 244 testes).
- **PRs abertos:** nenhum (trabalho direto na `main`).

## ⏳ Pendências (próximos passos, em ordem)

1. **(Opcional, imediato) Validar o seed na UI** — flipar `.env.local` `VITE_DATA_SOURCE=supabase` e **reiniciar o dev server 5173** (env é build-time). Critério de feito: telas (clientes, atendimento, pedidos) mostram os dados semeados. **Leitura funciona** (policies `*_select_poc_temp`); **escrita falha** até o PRD-103 — e o **banner do Passo 2 deve aparecer** ao tentar mutação. Reverter para `mock` depois se quiser.
2. **PRD-103 — write RLS policies** (marco principal). Substituir as policies permissivas temporárias `*_select_poc_temp` (`anon/authenticated using(true)`) por policies por-loja/RBAC (SELECT + INSERT/UPDATE/DELETE com `WITH CHECK`). Critério: mutações funcionam em `data=supabase` sem abrir escrita anônima. Arquivos: migrations via MCP; contexto de auth via `auth.uid()` + `profiles`. **Depende de:** habilitar o Custom Access Token Hook (claims no JWT) para RLS eficiente.
3. **Habilitar o Custom Access Token Hook** no dashboard Supabase (Auth → Hooks) — a função `public.custom_access_token_hook` já existe (`search_path=''`), mas **não está habilitada**; hoje o `SupabaseAuthProvider` resolve o perfil por query. Critério: claims (`role`/`store_id`) no JWT.
4. **(Opcional) Estender o banner** a `LojaLayout`/portal B2B/PWA do vendedor (one-liner: importar `<DataSourceBanner/>` em cada shell).
5. **PRD-108 — perf**: indexar FKs de ator/loja; otimizar `profiles_select_self` (advisor `auth_rls_initplan`). ~146 unused_index / 20 unindexed_fk pendentes (não bloqueantes).
6. **(Baixa prioridade) Seed de `vehicle_models`/`model_kits`** — NÃO foram semeados (vêm de seed estático, fora do `bootstrap()`). `vehicles.model_id` é `text` e já guarda o id-string canônico do mock (sem FK), então a UI de veículos funciona; `model_kits`/`model_kit_items` ficam vazios.

## ❓ Decisões pendentes

- **Flipar para `supabase` agora (testar) ou manter `mock`?** O usuário foi perguntado no fim da sessão e ainda não respondeu.
  - Opção A: flipar + reiniciar 5173 → valida o seed visualmente (leitura ok; escrita falha + banner aparece).
  - Opção B: manter `mock` e ir direto ao PRD-103.
  - Inclinação atual: nenhuma — aguardar o usuário.
- **Feature futura (já registrada):** toggle runtime mock↔supabase em Configurações (hoje é build-time). Fazer com protocolo PRE-TASK quando pedido.

## 🚧 Bloqueios / Riscos

- **Escrita em `data=supabase` ainda não funciona** (sem write policies — PRD-103). Só leitura.
- **Re-seed exige limpeza primeiro** (senão duplica): rodar via MCP `truncate <transacionais> cascade; delete from public.sellers;` e então `bun run scripts/seed-supabase.ts`. O `idMap` gera uuids novos a cada run (re-seed não é idempotente nos ids).
- **`store-matriz` legado:** o sentinela `00000000-…-0001` precisa permanecer idêntico no DB (`stores.id` + `profiles.store_id`) e no mock (`seedStore.ts` `SEED_STORE_ID`, `mock-users.ts` `MATRIZ_STORE_ID`, ~90 fallbacks). Não reverter o swap.

## ⚠️ Avisos do usuário (regras desta sessão)

- **"Muito cuidado com regressões"** — repetido várias vezes. Validar build+test a cada etapa; preferir adicionar a alterar.
- **Nunca `service_role` no cliente.** A publishable key (`sb_publishable_…`) é browser-safe (gated por RLS). O `service_role` fica SÓ no `.env.local` (sem prefixo `VITE_`, gitignored) e SÓ para o seeder. **Não ler o valor do `.env.local`** (o script lê do ambiente).
- **Abrir policy de escrita para `anon` é PROIBIDO** (foi negado pelo classificador, com razão). Não tentar de novo.
- **Ignorar completamente `.claude/worktrees/`** (worktrees de outras branches).
- **Usuário testa a UI manualmente** — não abrir browser/devtools/preview para validar.
- **`routeTree.gen.ts`** é gerado/ruído — **nunca commitar**.
- **CRLF** nos warnings do git/eslint é **falso-positivo** (git guarda LF; `bunfig`/autocrlf). Gate real = build + test.
- **`bunfig.toml`** impõe guarda de supply-chain de 24h — confirmar antes de adicionar a `minimumReleaseAgeExcludes`.
- Responder sempre em **português do Brasil com acentuação correta**.

## 🛡️ Não regredir (features que devem continuar funcionando)

- **Modo `mock` (default)** — 100% intacto; é o que o app usa por padrão. Os 101 arquivos do swap só trocaram o VALOR do id da loja (mock continua coerente).
- **Login Supabase vivo** (`admin@ailainteligente.com`, role `owner`, `store_id` = sentinela). `AUTH=supabase + DATA=mock` funciona porque o `store_id` do perfil bate com o id da loja no mock.
- **244 testes** (Vitest) verdes.
- **Build de produção** (Vite) sem erro.

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `scripts/seed-supabase.ts` — seeder; SCHEMA (colunas por tabela), `idMap`, deep-remap, ordem de FK, sentinelas. Re-rodar é a referência para a migração de dados.
- `src/features/shell/components/DataSourceBanner.tsx` + `src/features/shell/hooks/useDataHealth.ts` — o indicador do Passo 2.
- `src/providers/data/factory.ts` — `resolveDataSource()` + `getActiveDataSource()`.
- `.env.local` — `VITE_DATA_SOURCE=mock`, `VITE_AUTH_SOURCE=supabase`, URL + publishable + **`SUPABASE_SERVICE_ROLE_KEY`** (preenchida; gitignored; só para seed).
- `CLAUDE.md` — convenções do projeto.
- `docs/prds/` — PRD-103 (write RLS), PRD-108 (perf), PRD-107 (auth/hook).

## 🧠 Memórias relacionadas

- `project_fase2_supabase_kickoff.md` — **fonte de verdade** da Fase 2: convenção de PK revisada (uuid), sentinela da Matriz, desenho + execução do seed, gotchas, o que falta.
- `project_tsc_baseline_errors.md` — `tsc` tem ~315 erros baseline; gate real é build+test; avaliar código novo por delta.
- `project_git_autocrlf_subagents.md` — CRLF é falso-positivo.
- `feedback_manual_testing.md` — usuário testa UI manualmente.
- `project_devserver_stale_branch.md` — reiniciar dev server ao trocar env/branch; portas (gallo=5173).

## 📊 Atividade recente (telemetria)

Sem `.claude-metrics/annotations.jsonl` no projeto — telemetria não ativa.

## 📚 Referências

- Commits da sessão: `f83bb62` (uuid transacionais), `8cbafa7` (uuid referência + sentinela), `393484d` (banner), `4c85fdd` (seed).
- Migrations remotas (MCP): `convert_transactional_pks_to_uuid`, `convert_reference_pks_to_uuid`.
- Seed: 4468 linhas / 31 tabelas, FK verificada.
