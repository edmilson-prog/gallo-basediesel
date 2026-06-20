# Checkpoint — Modelo de acesso (2 portões) + fixes de Atendimento — 2026-06-19T23:44

> **Branch:** `feat/access-model-two-gates` · **Último commit base:** `78017e6` (merge do PR #131)
> **Sessão anterior:** Claude Opus 4.8 · **Gerado em:** 2026-06-19T23:44 (BRT)

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-06-19-2344-modelo-acesso-2-portoes.md` na íntegra
e confirme em uma frase que entendeu: 1) o objetivo da sessão, 2) o estado atual do código,
3) qual é a próxima tarefa. Não faça nenhuma ação até eu autorizar.

A regra de negócio acordada também está na memória: `project_access_model_decision`.
O trabalho continua na branch `feat/access-model-two-gates` (worktree D:/claude/wt-access-model),
criada off origin/main já com o PR #131 mergeado.
```

---

## 📌 Contexto do projeto

GALLO BASE DIESEL — SaaS de inteligência comercial (React 19 + Vite + TanStack Router/Query + Zustand + Tailwind v4 + shadcn/ui; backend Supabase, projeto `njizaasajkdqptlxddqn`, prod em crm.gallobasediesel.com.br). Produção roda em `supabase` (dados + auth). Módulo em foco: **Atendimento (Inbox WhatsApp) + RLS por papel de vendedor**.

## 🎯 Objetivo da sessão

Começou como o bug **"Lead anônimo"** (vendedor não-staff via "Lead anônimo" em toda conversa de fila; Gestor via o nome). Ao corrigir, o dono percebeu que estávamos no **whack-a-mole** de RLS por-vendedor (cada superfície — nome, ficha, mensagens — quebrava de novo). Então **paramos e reescrevemos a regra de negócio de acesso de leitura**. O objetivo agora: **implementar o modelo de acesso acordado ("2 portões")** que resolve a classe inteira de bugs de forma definitiva.

## ✅ Progresso (o que foi feito)

- [x] **#131 MERGEADO em `main` (`78017e6`) + migration aplicada em prod** — "Lead anônimo" na LISTA, CABEÇALHO e BUSCA resolvido via RPCs `SECURITY DEFINER` gated por `can_access_conversation` (`conversation_contacts(uuid[])` + `search_conversations` virou DEFINER). Smoke real em prod OK (impersonação do vendedor Lucas). `/code-review` xhigh (5 finders) → 3 fixes aplicados. **NÃO mexeu no `customers_select` global** (protege o scan bulk que derrubou o #120). Worktree daquele trabalho já removida.
- [x] **#130 MERGEADO** (audit FK nas Edge Functions — `actor_id` = `profile.seller_id`).
- [x] **Regra de negócio de acesso REESCRITA com o dono** (debate Q&A completo) → salva na memória `project_access_model_decision`. **Nada implementado ainda.**
- [x] **2º gap descoberto e confirmado** (registrado p/ corrigir): desvincular o número de origem do Lucas tirou a fila ✅ mas ele **manteve os atribuídos** ❌. Causa: o ramo `assigned_seller_id = current_seller_id()` do `can_access_conversation` **não checa instância**.

## 🔧 Estado do código

- **Branch:** `feat/access-model-two-gates` (off `origin/main` @ `78017e6`, **limpa, sem implementação ainda** — só este checkpoint).
- **Working tree principal** (`D:/claude/gallo-basediesel`) está em `feat/multistore-crud-lojas` com mudanças PRÉ-EXISTENTES não relacionadas (vite.config.ts + docs untracked) — **NÃO commitar isso**.
- **Build/testes:** N/A nesta branch (nada novo). #131 fechou com build + 888 testes verdes.
- **PRs:** #131 (inbox pool names) e #130 (audit FK) MERGEADOS. Este checkpoint abre um PR draft próprio.

## ⏳ Pendências (próximos passos, em ordem) — IMPLEMENTAR O MODELO DE 2 PORTÕES

> ⚠️ **Antes de codar: confirmar com o dono a escolha Alt 1 vs Alt 2 da peça 3 (ver Decisões pendentes).** Inclinação = Alt 1.

1. **Peça 1 — `can_access_conversation`: instância vira o portão-mestre.** Adicionar o gate de instância (`whatsapp_account_id in current_seller_accessible_account_ids()`) **também no ramo dos atribuídos** (`assigned_seller_id = current_seller_id()`). Conserta o gap do Lucas e unifica (a RLS de `conversations`/`messages` já delega a essa função). **Critério de feito:** impersonando o Lucas SEM acesso à instância, `can_access_conversation` de uma conversa atribuída a ele = `false`; com acesso = `true`. Migration versionada em `supabase/migrations/` + aplicar em prod só com OK. **Edges a decidir:** conversa com `whatsapp_account_id` null (legado) e participante/co-responsável (`is_conversation_participant`) vs o gate de instância.
2. **Peça 2 — Batch do preview de mensagens da Inbox.** Hoje `useRelatedEntities` dispara ~50 queries `messages limit 1` concorrentes (uma por conversa) → para o vendedor cada uma reavalia `can_access` → satura → **500**. Trocar por **1 chamada** (último recado por conversa da página) — RPC `SECURITY DEFINER` (ex.: `last_messages_for_conversations(uuid[])`) gated por `can_access`, OU window function. **Critério de feito:** abrir a Inbox como vendedor não gera mais 500 em `/messages`; a lista enche os previews. Arquivo: `src/features/conversations/hooks/useRelatedEntities.ts` (já foi reescrito no #131 — estender com o batch de mensagens). Medir sob carga.
3. **Peça 3 — Ficha da conversa (mata o 406).** A ficha lê `customers.get(id)` direto → RLS por carteira → 0 linhas no pool → 406 "Cliente não encontrado". **Alt 1 (recomendada):** RPC `SECURITY DEFINER` de contexto (ex.: `conversation_customer(conv_id)` / estender `conversation_contacts` p/ payload completo) gated por `can_access`, e a ficha-aberta-da-conversa lê por ele — **sem** tocar `customers_select`. **Alt 2:** tornar `customers_select` ciente de conversa + matar o coletor de tags que varre 500 clientes (risco #120). **Critério de feito:** vendedor abre a ficha de um lead da fila e vê os dados (com o dono real exibido), sem 406. Arquivos: `src/features/conversations/hooks/useConversationDetail.ts`, componentes da ficha (`CustomerProfileFiche`/aba), provider de customers/conversations.
4. **(Opcional, confirmar) Devolver à fila** as conversas atribuídas órfãs quando o vendedor perde a instância.
5. **Validar por impersonação read-only + EXPLAIN sob carga** (lição do #120: medir bulk/concorrência, não só single-row). Build + test. Revisão adversarial / `/code-review`. PR. **Aplicar prod só com OK do dono.**

## ❓ Decisões pendentes

- **Peça 3 — Alt 1 (RPC de contexto) vs Alt 2 (RLS de `customers` ciente de conversa)?**
  - **Alt 1 (RPC DEFINER de contexto):** bounded, não toca a política global de `customers`, reusa o padrão já validado (41ms/50). Baixo risco. — **Inclinação atual.**
  - **Alt 2 (`customers_select` ciente de conversa + matar o scan de tags):** RLS uniforme, ficha "só funciona", mas é **exatamente** o que derrubou prod no #120; exige teste de carga e cuidado com todo read bulk de clientes. Alto risco.
  - **Pergunta feita ao dono, ainda sem resposta** (ele invocou o checkpoint em seguida). Confirmar antes de codar a peça 3.
- **Edges da Peça 1:** conversa sem instância (`whatsapp_account_id` null) → staff-only ou manter visível? Participante/co-responsável → exige instância ou o add explícito basta?

## 🚧 Bloqueios / Riscos

- **Risco de performance (lição #120):** qualquer predicado de RLS que chame função pesada POR LINHA estoura em scan bulk/concorrência. Medir sob carga, não só single-row. A peça 2 (batch) é o que de fato mata o 500.
- O 500 e o 406 são **pré-existentes** (lado vendedor), expostos agora que um vendedor usa de verdade — não são regressão do #131.

## ⚠️ Avisos do usuário (regras desta sessão)

- **NUNCA mergear sem autorização expressa; toda integração via PR.** Por extensão: **confirmar antes de `apply_migration` / deploy de edge em prod.** (memória `feedback_never_merge_pr_only`)
- **O usuário testa a UI manualmente** — NÃO abrir browser/preview/devtools pra validar; validar por build + test + impersonação SQL read-only. (memória `feedback_manual_testing`)
- **Sempre encerrar implementações com resumo** (entrega/desvios/validação/gate). (memória `feedback_final_summary`)
- **IGNORAR a pasta `.claude/worktrees/`** e qualquer caminho com `worktrees` ao explorar/buscar/editar (CLAUDE.md).
- **NÃO virar "loja inteira" (store-wide):** o dono **recusou** o modelo de leitura store-wide. É **por conversa + instância** (Portão A) e **por dono** (Portão B).
- O dono vai compactar a conversa após este checkpoint.

## 🛡️ Não regredir (features que devem continuar funcionando)

- **#131 — "Lead anônimo" resolvido:** lista/cabeçalho/busca mostram o nome real do pool pro vendedor. A migration `inbox_pool_contact_names` (RPCs `conversation_contacts` + `search_conversations` DEFINER) está APLICADA em prod.
- **Portão B (carteira) já funciona:** vendedor lê os próprios clientes (`customers_select` ramo `seller_id = me`). Externo depende disso. **NÃO quebrar.**
- **Exclusividade da conversa atribuída:** conversa atribuída some do pool dos outros (já funciona via `can_access_conversation`).
- **Isolamento entre vendedores:** interno NÃO deve ver cliente arbitrário de outro vendedor — só via carteira própria OU conversa que ele acessa. O modelo de 2 portões preserva isso.
- RLS/Auth/`base_role` seguem governando; staff (owner/manager) = `is_staff()`.

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- **DB (prod, via MCP Supabase):** função `public.can_access_conversation(uuid)` — o coração do Portão A (impersonar p/ ler: `set local role authenticated` + `set_config('request.jwt.claims', ...)`). Policies: `conversations_select`/`messages_select` = `can_access_conversation(id)`; `customers_select` = `store + (is_staff OR seller_id=me OR seller_handles_customer(id))`.
- `src/features/conversations/hooks/useRelatedEntities.ts` — resolve contato (já via `listContacts` RPC) + preview de mensagens (a estender com batch na peça 2).
- `src/features/conversations/hooks/useConversationDetail.ts` — carrega customer/lead/contact da conversa aberta (peça 3).
- `src/features/conversations/utils/conversationDisplay.ts` — `getConversationDisplay` / `displayFromContact`.
- `src/providers/data/impl/supabase/conversations.ts` — `listContacts` (RPC `conversation_contacts`), `searchConversations`.
- `src/providers/data/contracts/conversations.ts` — `IConversationsProvider`.
- `supabase/migrations/` — espelhar TODO `apply_migration` aqui no mesmo PR (regra CLAUDE.md). Última: `20260619210000_inbox_pool_contact_names.sql`.
- `CLAUDE.md` — convenções.

## 🧠 Memórias relacionadas

- `project_access_model_decision` — **a regra de negócio reescrita (2 portões), fonte da verdade.**
- `project_lead_anonimo_pool_rls` — saga #120/#124 (revert por perf) + a solução #131; a LIÇÃO de medir RLS sob carga.
- `project_role_assignment_architecture` — atribuição de papel, `base_role`, SDR/Financeiro não são `is_staff`.
- `project_whatsapp_multi_instance_planned` — Switchboard (acesso por instância, `whatsapp_account_access_rules`, painel "Quem acessa").
- `project_prd211_people_access_epic` — PRD-211/212/213 (papéis/horário/rodízio).
- `feedback_never_merge_pr_only`, `feedback_manual_testing`, `feedback_final_summary`.

## 📚 Referências

- PR #131 (inbox pool names, MERGEADO): https://github.com/edmilson-prog/gallo-basediesel/pull/131
- PR #130 (audit FK, MERGEADO): https://github.com/edmilson-prog/gallo-basediesel/pull/130
- Regra acordada: memória `project_access_model_decision`.
