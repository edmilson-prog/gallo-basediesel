# Checkpoint — Fase 2: Storefront anon + Perf (InitPlan) + Pool de não-atribuídos — 2026-06-09T09:34-03:00

> **Branch:** `feat/fase2-supabase-cutover` · **Último commit:** `3504bea` docs(fase2): mark pool done in backend roadmap
> **Sessão anterior:** Claude Opus 4.8 · **Gerado em:** 2026-06-09T09:34-03:00

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-06-09-0934-fase2-storefront-anon-perf-pool.md` na íntegra e
confirme em uma frase que entendeu: 1) o objetivo da sessão, 2) o estado atual do código, 3) qual é
a próxima tarefa. Não faça nenhuma ação até eu autorizar.

PR relacionado: https://github.com/edmilson-prog/gallo-basediesel/pull/39
```

---

## 📌 Contexto do projeto

GALLO BASE DIESEL — SaaS de inteligência comercial (Vite + React 19 + TS strict, TanStack Router/Query, Zustand, Tailwind v4/shadcn). **Fase 2 (Mock → Supabase)**, branch de longa duração `feat/fase2-supabase-cutover` na **draft PR #39 (NUNCA mergear até a Fase 2 fechar)**. Backend materializado (33 providers + notificações, 39 tabelas schema `public` com RLS, auth real switchável `VITE_AUTH_SOURCE`/`VITE_DATA_SOURCE`). Hook do JWT **universal** → claims (`role`/`seller_id`/`store_id`) em `app_metadata`. App roda em `supabase` para o owner logado; default segue `mock`. Project ref Supabase: `njizaasajkdqptlxddqn`.

## 🎯 Objetivo da sessão

Avançar a Fase 2 seguindo a fila de pendências (sempre via protocolo AILA: explore→plano→"confirma"), e — a pedido do usuário ("preciso implementar todo o backend") — **mapear o que realmente falta** para o cutover completo (gap analysis).

## ✅ Progresso (o que foi feito) — 7 commits, 4 migrations, 1 Edge Function

- [x] `245ac7e` **feat(rls): storefront anon** — migration `storefront_anon_read`. Catálogo público por **grant de coluna** em `parts` (30 colunas públicas; esconde custo/margem/fornecedor/estoque) + policy `parts_select_anon` (`active=true`) + RPC `storefront_config(uuid)` SECURITY DEFINER (retorna só `settings->'storefront'`, nunca cnpj/comissões). `orders`/`vehicle_models` não expostos. Validado por impersonação `anon`. **2 WARN novos esperados** (RPC público definer) — aceitos.
- [x] `1ce0b31` **perf(rls): Part C InitPlan** — migration `perf_initplan_wrap_helpers`. Envelopou `current_*()`/`is_staff()` em `(select …)` nas **151** policies que os usam (de 157), via bloco `DO` + temp-table snapshot. `still_unwrapped` 151→0; `EXPLAIN` mostra `InitPlan 1/2/3`. Paridade de impersonação idêntica ao baseline.
- [x] `bf14110` **refactor(rls): remover fallback profiles** — migration `rls_helpers_drop_profiles_fallback`. As 3 helpers de identidade leem só o claim do JWT (sem `coalesce(claim, subquery profiles)`); `is_staff()` inalterada. Fail-closed validado (sem `app_metadata` → 0 linhas).
- [x] `cfa3beb` **feat(admin): scaffold convite por email (PRD-141)** — Edge Function `invite-seller-email` (v1 ACTIVE, `verify_jwt:true`, **INERTE** sem `RESEND_API_KEY`). Usa `generateLink({type:'invite'})` + Resend, template pt-BR, rollback. `invite-seller` (senha temp) **intacto**.
- [x] `82dc2a7` **docs: gap analysis roadmap** — `docs/prds/ROADMAP-FASE2-BACKEND-GAP-2026-06-09.md`.
- [x] `21d1c11` **feat(rls): pool de não-atribuídos** — migration `rls_conversations_pool`. Claim model: não-staff vê+reivindica conversas `assigned_seller_id IS NULL`; `messages` cascateia; carteira de outros segue oculta. Validado (Lucas 28→42 convos, 230→326 msgs; claim null→self OK, null→outro `42501`).
- [x] `3504bea` **docs: pool concluído no roadmap**.

> **Gap analysis (achado central):** o backend está **muito mais completo** do que o `CLAUDE.md` sugere. **32/33 providers implementados** (só `copilot` tem código defensivo vestigial; os `throw new Error` são tratamento de erro, não stubs). **Write policies completas** exceto 2 **por design** (`profiles` = escrita via Edge Functions; `stores` = sem INSERT/DELETE, app nunca cria/apaga loja). **Cutover é só env.** O único item grande restante é **Mídia → Supabase Storage** (hoje `storage_ref` é texto fake — não há bucket/upload real).

## 🔧 Estado do código

- **Branch:** `feat/fase2-supabase-cutover` (26 commits à frente da `main`; 7 desta sessão sobre o checkpoint anterior `688f802`).
- **Último commit:** `3504bea`.
- **Arquivos tocados nesta sessão:**
  - `docs/db/rls-policies-fase2-mvp.md` (M) — documentadas as 4 migrations + seções (storefront anon, Part C, fallback, pool).
  - `docs/prds/ROADMAP-FASE2-BACKEND-GAP-2026-06-09.md` (A) — roadmap do backend.
  - `supabase/functions/invite-seller-email/index.ts` (A) — scaffold de convite por email.
- **Migrations remotas aplicadas (MCP):** `storefront_anon_read`, `perf_initplan_wrap_helpers`, `rls_helpers_drop_profiles_fallback`, `rls_conversations_pool`.
- **Edge Function deployada (MCP):** `invite-seller-email` (v1, inerte).
- **Build/testes:** não rodados — todas as frentes foram **DB-only / Edge** (sem código de app). Sem gate de `build`/`test`/`tsc` aplicável.
- **Working tree:** só ruído — `M src/routeTree.gen.ts` (gerado, NÃO commitar). **Untracked não-meus:** `docs/prds/PRD-111-whatsapp-provider-interface.md`, `PRD-112-meta-cloud-api-provider.md`, `PRD-113-evolution-api-provider.md` (PRDs novos de WhatsApp — apareceram durante a sessão, **não criados por mim**, deixados untracked) + `docs/relatorio-codigo-morto-2026-06-04.md` e `knip.json` (pré-existentes).
- **PR aberto:** #39 (draft).

## ⏳ Pendências (próximos passos, em ordem — do roadmap)

1. **Storefront anon wiring** — **PRIMEIRO item que toca CÓDIGO DE APP** (risco de regressão). Provider de `parts` (supabase) deve selecionar **colunas explícitas** (não `select *`, que falha sob grant-de-coluna do `anon`); provider de settings deve chamar o RPC `storefront_config` em vez de ler `stores` direto. Arquivos: `src/providers/data/impl/supabase/parts.ts`, `.../settings.ts`, e os hooks da loja (`src/features/storefront*/`). Critério: loja pública (`/loja/*`) renderiza catálogo + config como `anon` no Supabase, sem `42501`.
2. **Decisão de Mídia/Storage** — mídia real (buckets + storage RLS + upload/signed URL) entra na Fase 2 ou fica simulada (`storage_ref` fake)? Define se existe o item grande. Arquivos: `src/providers/data/impl/supabase/media.ts`.
3. **Ativar convite por email** — `supabase secrets set RESEND_API_KEY/RESEND_FROM/INVITE_REDIRECT_URL` + wiring client (`inviteSellerByEmail` em `sellerAccess.ts`) + dialog na tela Usuários + rota `/auth/definir-senha`. Bloqueio: conta Resend + domínio (usuário).
4. **pgTAP + CI** (`rls-tests.yml`) — testes de RLS versionados. Bloqueio: decisão de secrets/runner do CI.
5. **Flip do cutover + smoke test** — defaults → `supabase` (`VITE_DATA_SOURCE`/`VITE_AUTH_SOURCE`) + regressão geral (owner + vendedor logados). Marco final; depende de 1–4.

## ❓ Decisões pendentes

- **Mídia real (Supabase Storage) entra na Fase 2 ou fica simulada?**
  - Opção A (entra): trabalho grande (buckets, storage RLS, upload real, signed URLs); torna a mídia/WhatsApp utilizável de verdade.
  - Opção B (simulada): mantém `storage_ref` fake; cutover não bloqueia, mas mídia não é real.
  - Inclinação: nenhuma — decisão de produto do usuário.
- **PRDs 111/112/113 (WhatsApp providers)** apareceram untracked — provavelmente uma nova frente que o usuário quer planejar. Confirmar se entram no escopo e quando.

## 🚧 Bloqueios / Riscos

- **Storefront anon wiring** mexe em provider de `parts` usado pelo app logado → testar que o caminho `authenticated` não regride (owner lê tudo, incl. custo/margem).
- **Criar `auth.users` via SQL do agente com credenciais inventadas é BLOQUEADO pelo classificador** — usar SEMPRE as Edge Functions (invite/reset) que o owner dispara.
- Convite por email depende de conta/ domínio Resend (externo).

## ⚠️ Avisos do usuário (regras desta sessão — preservar)

- **PR #39 fica DRAFT; NÃO mergear até a Fase 2 fechar.**
- **"muito cuidado com regressões."**
- **`service_role` NUNCA no cliente** — só em `.env.local` (sem prefixo `VITE_`, gitignored; **não ler o valor**). Edge Functions pegam do env do servidor.
- **Abrir policy de WRITE anônima é PROIBIDO** (anon só READ).
- **Ignorar `.claude/worktrees/` por completo.**
- **O usuário testa a UI manualmente** (cola erros do console) — **NÃO abrir browser/preview.** Frentes DB-only não têm validação de UI (validadas por impersonação).
- `src/routeTree.gen.ts` é ruído gerado — **nunca commitar.** Avisos CRLF são falso-positivo.
- `bunfig.toml` impõe guard de 24h supply-chain — **confirmar antes** de mexer em `minimumReleaseAgeExcludes`.
- **Protocolo AILA pre-task:** explorar → plano → aguardar **"confirma"** antes de implementação substantiva.
- Responder sempre em **pt-BR com acentuação correta**.
- Trailer de commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## 🛡️ Não regredir (deve continuar funcionando)

- **Isolamento per-seller (Slices 1–4):** staff vê tudo; não-staff vê só a própria carteira + agora o **pool** (conversas sem dono) + assets/segmentos próprios (+ `shared`).
- **Pool:** não-staff vê+reivindica `assigned_seller_id IS NULL`; `with check` impede claim-pra-outro; carteira atribuída a outros segue oculta.
- **Storefront anon:** `anon` lê só colunas públicas de `parts` ativas + `storefront_config`; custo/margem/`stores`/`orders` fechados.
- **Helpers** leem só o claim do JWT (fail-closed); policies envelopadas `(select …)` (InitPlan).
- **Gestão de usuários (Owner):** criar acesso, redefinir senha, desligar/reativar, trocar papel — todos gated via Edge Functions.
- **`invite-seller` (senha temp)** segue funcionando; `invite-seller-email` é scaffold inerte e NÃO está no fluxo da UI.

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `docs/prds/ROADMAP-FASE2-BACKEND-GAP-2026-06-09.md` — **roadmap do backend** (o que falta, em ordem).
- `docs/db/rls-policies-fase2-mvp.md` — **bíblia de RLS** (migrations, predicados, validações de todas as frentes).
- `src/providers/data/impl/supabase/{parts,settings,media}.ts` — alvos do próximo wiring (storefront anon) e da decisão de mídia.
- `src/features/storefront*/` — hooks/páginas da loja pública.
- `supabase/functions/invite-seller-email/index.ts` — scaffold do convite por email.
- `CLAUDE.md` — convenções (⚠️ desatualizado quanto a "providers = stubs").

## 🧠 Memórias relacionadas

- `project_fase2_supabase_kickoff.md` — kickoff da Fase 2.
- `feedback_manual_testing.md` — o usuário testa a UI manualmente.
- `project_tsc_baseline_errors.md` — gate real é `bun run build`; código novo por delta.
- `project_routetree_merge_block.md` — `routeTree.gen.ts` suja a working tree.

## 📚 Referências

- PR: https://github.com/edmilson-prog/gallo-basediesel/pull/39 (draft)
- Checkpoint anterior: `docs/checkpoints/2026-06-08-2323-prd107-rbac-perf.md`
- PRDs: PRD-103 (RLS), PRD-107 (Auth/identidade), PRD-108 (perf), PRD-141 (email), PRD-060 (storefront), PRD-010 (atendimento/pool). Novos untracked: PRD-111/112/113 (WhatsApp providers).
