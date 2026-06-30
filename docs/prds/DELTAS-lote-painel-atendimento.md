# DELTAS — Lote Painel de Atendimento (Volume / Ciclo de Status)

> **Addendum** ao `DELTAS-PRDs-Gallo-Base-Diesel.md`
> **Projeto:** GALLO BASE DIESEL — Plataforma de Inteligência Comercial
> **Origem (PRDs deste lote):** PRD-214 (`Pulse`) · PRD-215 (`Gauge`)
> **Status de numeração:** ⚠️ **PROVISÓRIO** — números 214/215 ancorados logo após o lote 211–213. Reconciliar contra o INDEX v1.7 (não anexado ao project knowledge no momento da redação) antes de implementar.
> **Convenção:** mesma do §2 do `DELTAS-PRDs-Gallo-Base-Diesel.md` (Origem / Tipo / Descrição). Tipos: `extend` (adiciona) / `replace` (substitui) / `enhance` (melhora) / `migrate` (move).

---

## ⚠️ Nota de realidade do schema (reconciliação)

O INDEX v1.6 e o briefing v1.3 planejavam schemas `crm` (operação interna) e `storefront` (e-commerce), com `public` "deliberadamente vazio". **A inspeção do banco real (`Gallo Base Diesel`, ref `njizaasajkdqptlxddqn`) mostra que todas as tabelas estão em `public`** — inclusive `public.conversations` e `public.messages`.

As migrations deste lote **miram `public.conversations`** (a realidade implementada), não `crm.conversations`. Esta divergência doc↔realidade deve ser reconciliada no INDEX/briefing à parte; não bloqueia este lote.

---

## 3.1+ PRD-002 — Modelo Conceitual

| Origem | Tipo | Descrição |
|--------|------|-----------|
| PRD-214 | `replace` | Reconciliar a union de status de `IConversation` para o conjunto canônico: `'ABERTO' \| 'EM_ATENDIMENTO' \| 'AGUARDANDO' \| 'RESOLVIDO' \| 'SEM_STATUS'`. Substitui os literais antigos (`aguardando` / `em_andamento` / `aguardando_cliente` / `resolvida` / `arquivada`). `ABERTO` é o **gatilho** do contador de novos atendimentos; `SEM_STATUS` é fallback inerte (nunca conta). |
| PRD-214 | `extend` | Adicionar em `IConversation`: `waitingOn?: 'agent' \| 'customer'` (qualifica `AGUARDANDO`); `resolutionReason?: ResolutionReason` (qualifica `RESOLVIDO`); `archivedAt?: ISO8601` (+ `isArchived` derivado = `archivedAt != null`). **`arquivada` deixa de ser status** — vira eixo ortogonal. |
| PRD-214 | `extend` | Adicionar `ResolutionReason = 'resolvido' \| 'abandonado' \| 'engano' \| 'spam' \| 'duplicado' \| 'outro'`. |
| PRD-214 | `extend` | Adicionar entidade `IConversationStatusEvent` (event log append-only) — ver Modelo de Dados do PRD-214. |
| PRD-214 | `extend` | Adicionar tipo derivado `IAtendimentoCycle` (não é tabela-base editável; deriva da view `atendimento_cycles`). |

> Manter `src/shared/types/` modular: tipos de atendimento/ciclo em arquivo próprio (ex.: `service-analytics.ts`), coerentes com `IConversation` em `conversations.ts`.

---

## 3.2+ PRD-005 — Provider Pattern

| Origem | Provider novo |
|--------|---------------|
| PRD-214 | `useAtendimentoMetricsProvider` — interface estável (`getNovosAtendimentos`, `getMessageVolume`, `getMessagesByUser`, `getStatusDistribution`, `getAccumulatedChats`, `getHandleTimeStats`). Drop-in Mock ↔ Supabase. O mock continua vivo como **harness determinístico** de dev/teste (D5-A+B), com Supabase real como caminho primário (D5-B). |

---

## 3.3+ PRD-006 — RBAC

| Origem | Permissões adicionadas |
|--------|------------------------|
| PRD-215 | `service_volume.view` (**Owner / Gestor**; **Vendedor BLOQUEADO**) — governa o Painel de Atendimento (aba em `/app/inicio`) **e** o card-resumo no topo da Caixa. Consistente com o bloqueio de Vendedor já aplicado a PRD-040/048/049/050/051/052/053. |

---

## 3.5+ PRD-014 — Painel do Gestor (`/app/inicio`)

| Origem | Tipo | Descrição |
|--------|------|-----------|
| PRD-215 | `enhance` | `/app/inicio` ganha **shell de abas**: aba **"Operação"** (todo o conteúdo atual implementado do PRD-014 — snapshot tempo real) + aba **"Atendimento"** (o novo Painel de Volume, PRD-215). A aba "Atendimento" exige `service_volume.view` (Owner/Gestor). **DELTA estrutural, não rewrite** — embrulhar a página atual num container de abas e abrir o slot da segunda aba. |

> Guardrail: não transformar `/app/inicio` em catch-all. A aba "Atendimento" é volume **operacional** — distinta do histórico estratégico (PRD-051, `/app/atendimento-analise`) e do cockpit executivo (PRD-040).

---

## 3.x PRD-010 — Inbox (Caixa)

| Origem | Tipo | Descrição |
|--------|------|-----------|
| PRD-214 | `replace` | Filtro **Status** passa a usar a taxonomia canônica (`ABERTO` / `EM_ATENDIMENTO` / `AGUARDANDO` / `RESOLVIDO` / `SEM_STATUS`). O `AGUARDANDO` pode exibir sub-distinção opcional por `waitingOn` (agente vs cliente). |
| PRD-214 | `enhance` | A ação **"Arquivar"** passa a setar `archivedAt` (flag ortogonal), **não** `status='arquivada'`. O filtro default da inbox continua escondendo arquivadas (critério: `archivedAt IS NULL`), agora desacoplado do status do ciclo. |
| PRD-215 | `extend` | **Card-resumo** no topo da Caixa: distribuição de status (snapshot atual), **Owner/Gestor only** (`service_volume.view`), clicável → `/app/inicio` aba "Atendimento". Card condicional por papel (≠ aba inteira), portanto sem fricção de RBAC para o Vendedor (que simplesmente não vê o card). |

---

## Aplicação durante implementação

Conforme §6.2 do `DELTAS-PRDs-Gallo-Base-Diesel.md`: **aplicar cada delta no PRD-alvo ANTES de marcar o PRD de origem (214/215) como concluído.**

Ordem de dependência do lote:

1. **DELTA PRD-002** (tipos/taxonomia) — fundação
2. **PRD-214 (`Pulse`)** — migration + event log + trigger + view + provider/hooks (consome a fundação)
3. **DELTA PRD-010** (filtros + arquivar-como-flag) — depende da fundação
4. **DELTA PRD-014** (shell de abas) — estrutural
5. **PRD-215 (`Gauge`)** — UI do painel + card na Caixa (consome os hooks do `Pulse`)

---

**AILA — Sistemas Inteligentes**
