# PRD-214: Fundação de Eventos de Status do Atendimento (`Pulse`)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | (mesmo da Fase 1/2) |
| **Codinome** | `Pulse` — o batimento (stream de transições) que alimenta toda a métrica de atendimento |
| **Objetivo** | Criar a fundação de dados do "atendimento como ciclo de status": event log de transições (`conversation_status_events`), trigger de captura, reconciliação da taxonomia de status, backfill do primeiro `ABERTO`, view `atendimento_cycles` e o provider/hooks — habilitando "novos atendimentos" e tempo-por-ciclo |
| **Tipo** | Feature (com migration sobre backend real) |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | Alta (P1) |
| **Épico** | Painel de Atendimento (Volume / Ciclo) |
| **Nº do PRD** | ⚠️ **214 — PROVISÓRIO.** Ancorado após o lote 211–213; reconciliar contra INDEX v1.7 |
| **PRDs Relacionados** | PRD-002 (tipos), PRD-005 (provider), PRD-010 (inbox), PRD-014 (`/app/inicio`), PRD-051 (análise histórica — consome hooks), PRD-215 (`Gauge` — UI consome `Pulse`) |
| **Padrão de código** | camelCase (TS) / snake_case (banco); tabelas plural; append-only para o event log |
| **Implementação** | 🔵 Claude Code CLI |

### Critérios de Complexidade Utilizados

> **Justificativa de Alta:** migration sobre banco em produção (829 conversas, 25.459 mensagens), nova tabela append-only com trigger, normalização de dado sujo (status em texto livre sem constraint), backfill idempotente, view derivada com window functions, e um provider novo com harness mock ↔ Supabase. Toca a fundação consumida por PRD-010, PRD-014, PRD-051 e PRD-215.

---

## Contexto do Problema

O cliente pediu um gráfico de **novos atendimentos** cuja regra de negócio é específica: um "atendimento" **não** é o chat — é um **ciclo de status**. Toda vez que a conversa (re)entra no status `ABERTO`, conta +1. O mesmo chat pode gerar vários atendimentos no mesmo dia (cliente fala de manhã → resolve → volta à tarde → conta de novo).

Contar "quantas vezes a conversa recebeu `ABERTO`" exige a **história das transições de status** — não basta o status atual.

A inspeção do banco real confirmou o gargalo: `public.conversations` guarda **apenas o status atual** (`status` em `text`, **sem `CHECK` constraint**), mais `created_at` / `updated_at` / `last_message_at`. **Não existe** tabela de histórico nem coluna de histórico. A `audit_logs` genérica tem **631 linhas no sistema inteiro** (todos os recursos) contra 829 conversas que transicionaram várias vezes cada — ou seja, não cobre e não permite reconstruir os ciclos com confiança.

Sem este PRD, a métrica central do painel é **impossível de calcular**. Este PRD cria a origem do dado (o "batimento") antes de qualquer UI.

---

## Conceito da Solução

### Situação Atual (As-Is)

- `public.conversations.status` é `text` livre, sem enum/constraint. Valores presumidos (do PRD-010/067): `aguardando`, `em_andamento`, `aguardando_cliente`, `resolvida`, `arquivada`, e possivelmente `aberta` — provavelmente com sujeira/nulos.
- `arquivada` é um **valor de status** (não há coluna de arquivamento).
- Não há `waitingOn` nem `resolutionReason`.
- Não há histórico de transições. `updated_at` muda em qualquer update (não isola mudança de status). Não há `status_changed_at`.
- `messages` (25.459 linhas) já tem `direction` (`in`/`out`) e `author_type` (`customer`/`seller`/`sdr`/`system`) — suficiente para mensagens enviadas/recebidas e por usuário (humano vs automação), **sem coluna nova**.

### Situação Desejada (To-Be)

Uma fundação em quatro partes, espelhando a filosofia do "prontuário" (cada entrada e alta registrada, não só o estado atual):

1. **Taxonomia reconciliada + colunas novas.** `conversations.status` normalizado para o conjunto canônico (`ABERTO` / `EM_ATENDIMENTO` / `AGUARDANDO` / `RESOLVIDO` / `SEM_STATUS`). Novas colunas: `waiting_on`, `resolution_reason`, `archived_at`. `arquivada` migra para `archived_at` (eixo ortogonal).
2. **Event log (`conversation_status_events`).** Tabela append-only: uma linha por transição de status, escrita por **trigger** (`AFTER INSERT/UPDATE OF status`). É a fonte de verdade dos ciclos (D1-C).
3. **Backfill do primeiro contato.** Para cada conversa existente, semear **1 evento `ABERTO`** no seu `created_at`. Garante que o gráfico nasça com o **volume histórico de primeiros contatos** (829 pontos) mesmo sem as reaberturas antigas.
4. **View derivada (`atendimento_cycles`) + provider/hooks.** A view agrupa eventos em ciclos (cada `ABERTO` abre um, o terminal/reabertura fecha) → `openedAt` / `closedAt` / `handleMs` / `closeStatus`. O `useAtendimentoMetricsProvider` expõe as agregações; o mock vira harness determinístico.

> **Limitação assumida e explícita (forward-only):** o contador de novos atendimentos é **preciso do deploy do trigger em diante**. Reaberturas anteriores ao deploy estão perdidas (não há de onde reconstruí-las). O backfill recupera apenas o **primeiro** `ABERTO` de cada conversa. O tempo-por-ciclo histórico idem: só o proxy grosso `last_message_at − created_at` continua disponível para o período antigo; o preciso é forward.

### Alternativas Consideradas

| Alternativa | Por que foi descartada |
|-------------|------------------------|
| Reconstruir ciclos a partir de `audit_logs` | 631 linhas no sistema todo — não cobre 829 conversas multi-transição; reconstrução não confiável |
| `status_history jsonb` dentro de `conversations` | Cresce sem limite na linha, dificulta agregação temporal e índices; event log é o padrão correto |
| Contar conversas únicas como "atendimentos" | É a métrica do PRD-051 (`totalConversations`), **diferente** da regra do cliente (ciclos de reabertura) |
| Tabela materializada de ciclos como fonte | Ciclo é **derivado** dos eventos (D1-C: event log = fonte de verdade, ciclo = view). Materializar só se performance exigir (Fase 5) |
| Só status atual + começar a contar do zero | Gráfico nasceria vazio; o backfill de primeiros contatos dá forma histórica sem custo |

---

## Modelo de Dados

> SQL **ilustrativo** (o agente desenvolvedor refina nomes/constraints e roda em **dev branch** primeiro). Mira `public.*` (realidade do banco).

### 1. Colunas novas + reconciliação da taxonomia

```sql
-- Colunas novas (eixos qualificadores + arquivamento ortogonal)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS waiting_on        text
    CHECK (waiting_on IS NULL OR waiting_on IN ('agent','customer')),
  ADD COLUMN IF NOT EXISTS resolution_reason text
    CHECK (resolution_reason IS NULL OR resolution_reason IN
          ('resolvido','abandonado','engano','spam','duplicado','outro')),
  ADD COLUMN IF NOT EXISTS archived_at       timestamptz;

-- Normalização (rodar DRY-RUN antes; confirmar valores distintos reais primeiro — ver Notas)
-- arquivada → flag + status do ciclo desconhecido → SEM_STATUS (decisão a confirmar; ver Notas)
UPDATE public.conversations SET archived_at = COALESCE(archived_at, updated_at), status = 'SEM_STATUS'
  WHERE status = 'arquivada';
UPDATE public.conversations SET status = 'EM_ATENDIMENTO' WHERE status = 'em_andamento';
UPDATE public.conversations SET status = 'AGUARDANDO', waiting_on = 'customer' WHERE status = 'aguardando_cliente';
UPDATE public.conversations SET status = 'AGUARDANDO', waiting_on = 'agent'     WHERE status = 'aguardando';
UPDATE public.conversations SET status = 'RESOLVIDO' WHERE status = 'resolvida';
UPDATE public.conversations SET status = 'ABERTO'    WHERE status = 'aberta';
-- Qualquer valor não-reconhecido (nulo/sujo) → fallback
UPDATE public.conversations SET status = 'SEM_STATUS'
  WHERE status IS NULL OR status NOT IN ('ABERTO','EM_ATENDIMENTO','AGUARDANDO','RESOLVIDO','SEM_STATUS');

-- Só DEPOIS da normalização, blindar com CHECK
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_status_canon_chk
  CHECK (status IN ('ABERTO','EM_ATENDIMENTO','AGUARDANDO','RESOLVIDO','SEM_STATUS'));
```

### 2. Event log (append-only)

```sql
CREATE TABLE IF NOT EXISTS public.conversation_status_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  store_id        uuid NOT NULL REFERENCES public.stores(id),
  from_status     text,           -- null na abertura inicial
  to_status       text NOT NULL,
  waiting_on      text,           -- snapshot do waiting_on quando to_status='AGUARDANDO'
  at              timestamptz NOT NULL DEFAULT now(),
  actor_id        text,           -- seller/sdr/etc; null para system/webhook
  actor_type      text NOT NULL DEFAULT 'system'
                    CHECK (actor_type IN ('seller','sdr','customer','system')),
  source          text NOT NULL DEFAULT 'app'
                    CHECK (source IN ('app','webhook','backfill','sdr'))
);

CREATE INDEX IF NOT EXISTS idx_cse_to_status_at  ON public.conversation_status_events (store_id, to_status, at);
CREATE INDEX IF NOT EXISTS idx_cse_conv_at       ON public.conversation_status_events (conversation_id, at);
```

### 3. Trigger de captura (fail-safe)

```sql
CREATE OR REPLACE FUNCTION public.log_conversation_status_event() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.conversation_status_events
      (conversation_id, store_id, from_status, to_status, waiting_on, at, source)
    VALUES (NEW.id, NEW.store_id, NULL, NEW.status, NEW.waiting_on, NEW.created_at, 'app');
  ELSIF (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.conversation_status_events
      (conversation_id, store_id, from_status, to_status, waiting_on, at, source)
    VALUES (NEW.id, NEW.store_id, OLD.status, NEW.status, NEW.waiting_on, now(), 'app');
  END IF;
  RETURN NEW;  -- nunca falha o UPDATE/INSERT principal
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_conversation_status_event
  AFTER INSERT OR UPDATE OF status ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.log_conversation_status_event();
```

### 4. Backfill idempotente (primeiro `ABERTO`)

```sql
-- Uma vez. Semeia o primeiro contato de cada conversa SEM nenhum evento ainda.
INSERT INTO public.conversation_status_events
  (conversation_id, store_id, from_status, to_status, at, source)
SELECT c.id, c.store_id, NULL, 'ABERTO', c.created_at, 'backfill'
FROM public.conversations c
WHERE NOT EXISTS (
  SELECT 1 FROM public.conversation_status_events e WHERE e.conversation_id = c.id
);
```

### 5. View de ciclos (derivada)

```sql
-- Cada to_status='ABERTO' abre um ciclo; fecha no PRÓXIMO evento ABERTO (reabertura)
-- ou no próximo RESOLVIDO. handle_ms = closed - opened.
CREATE OR REPLACE VIEW public.atendimento_cycles AS
WITH ev AS (
  SELECT *, lead(at) OVER (PARTITION BY conversation_id ORDER BY at) AS next_at,
            lead(to_status) OVER (PARTITION BY conversation_id ORDER BY at) AS next_status,
            row_number() OVER (PARTITION BY conversation_id, to_status ORDER BY at) AS aberto_seq
  FROM public.conversation_status_events
)
SELECT conversation_id, store_id,
       row_number() OVER (PARTITION BY conversation_id ORDER BY at) AS cycle_no,
       at AS opened_at,
       next_at AS closed_at,
       next_status AS close_status,
       EXTRACT(EPOCH FROM (next_at - at)) * 1000 AS handle_ms
FROM ev
WHERE to_status = 'ABERTO';
```

### Tipos TS (DELTA em PRD-002)

```typescript
type ConversationStatus = 'ABERTO' | 'EM_ATENDIMENTO' | 'AGUARDANDO' | 'RESOLVIDO' | 'SEM_STATUS';
type ResolutionReason = 'resolvido' | 'abandonado' | 'engano' | 'spam' | 'duplicado' | 'outro';

interface IConversationStatusEvent {
  id: ID; conversationId: ID; storeId: ID;
  fromStatus: ConversationStatus | null; toStatus: ConversationStatus;
  waitingOn?: 'agent' | 'customer';
  at: ISO8601; actorId?: ID; actorType: 'seller' | 'sdr' | 'customer' | 'system';
  source: 'app' | 'webhook' | 'backfill' | 'sdr';
}

interface IAtendimentoCycle {
  conversationId: ID; storeId: ID; cycleNo: number;
  openedAt: ISO8601; closedAt?: ISO8601;
  closeStatus?: ConversationStatus; handleMs?: number;
}
```

---

## Escopo

### Incluído

- ✅ Migration de schema em `public.conversations`: colunas `waiting_on`, `resolution_reason`, `archived_at` + `CHECK` da taxonomia canônica
- ✅ Normalização dos valores de status atuais (dry-run obrigatório)
- ✅ Migração de `arquivada` (status) → `archived_at` (flag ortogonal)
- ✅ Tabela `conversation_status_events` (append-only) + índices
- ✅ Trigger `AFTER INSERT/UPDATE OF status` fail-safe
- ✅ Backfill idempotente do primeiro `ABERTO` por conversa
- ✅ View `atendimento_cycles` (ciclos + handle_ms)
- ✅ `useAtendimentoMetricsProvider` + hooks de agregação (novos atendimentos, volume de mensagens, por usuário, distribuição de status, acumulado, handle-time)
- ✅ Harness mock determinístico (Provider Pattern, `VITE_DATA_SOURCE`)
- ✅ RLS store-scoped no event log (leitura) consistente com PRD-103
- ✅ Execução via **dev branch** primeiro

### Excluído

- ❌ UI do painel e card na Caixa → **PRD-215 (`Gauge`)**
- ❌ Reconstrução de reaberturas pré-deploy (impossível — assumido)
- ❌ Materialização da view de ciclos (só se Fase 5 indicar gargalo)
- ❌ Mudança na escrita de status pelo app (o app continua dando `update`; o trigger captura) — exceto setar `waiting_on`/`resolution_reason` onde já há semântica
- ❌ Análise histórica profunda de TMA/TMR → permanece no PRD-051

---

## Requisitos Funcionais

### Migration / schema

- **RF-001:** Adicionar colunas `waiting_on`, `resolution_reason`, `archived_at` em `public.conversations` com os `CHECK` indicados.
- **RF-002:** Antes de normalizar, **levantar e registrar** os valores distintos atuais de `status` (`SELECT status, count(*) ...`) para validar o mapa e quantificar o `SEM_STATUS`.
- **RF-003:** Normalizar `status` para `ABERTO`/`EM_ATENDIMENTO`/`AGUARDANDO`/`RESOLVIDO`/`SEM_STATUS` conforme o mapa; `aguardando`→`waiting_on='agent'`, `aguardando_cliente`→`waiting_on='customer'`.
- **RF-004:** Migrar `status='arquivada'` → setar `archived_at` + status do ciclo (default `SEM_STATUS`; ver decisão pendente).
- **RF-005:** Aplicar `CHECK` da taxonomia **somente após** a normalização passar 100% (zero linhas fora do conjunto).

### Event log + trigger + backfill

- **RF-006:** Criar `conversation_status_events` append-only com índices `(store_id,to_status,at)` e `(conversation_id,at)`.
- **RF-007:** Trigger registra evento no `INSERT` (`from=null`, `at=created_at`) e no `UPDATE` quando `status` muda (`from=OLD`, `to=NEW`, `at=now()`).
- **RF-008:** Trigger é **fail-safe**: erro no log nunca aborta o `INSERT/UPDATE` da conversa.
- **RF-009:** Backfill semeia **1 evento `ABERTO`** por conversa **sem** evento (`source='backfill'`, `at=created_at`); reexecutável sem duplicar.
- **RF-010:** Política append-only: `FOR DELETE/UPDATE USING (false)` no event log (trilha imutável, padrão do `audit_logs`).

### View + métrica

- **RF-011:** View `atendimento_cycles` deriva ciclos por conversa (abre em `ABERTO`, fecha no próximo `ABERTO` ou `RESOLVIDO`), com `handle_ms`.
- **RF-012:** **Novos atendimentos** = contagem de eventos `to_status='ABERTO'` agrupada por bucket temporal, com **média e total** por dia.
- **RF-013:** Transição para `SEM_STATUS` **nunca** conta como novo atendimento.

### Provider / hooks

- **RF-014:** `useAtendimentoMetricsProvider` com: `getNovosAtendimentos({storeId?,sellerId?,from,to,granularity})`, `getMessageVolume(...)` (`{sent,received}`), `getMessagesByUser({...,audience:'human'|'automation'|'all'})` (via `messages.author_type`), `getStatusDistribution(...)` (snapshot), `getAccumulatedChats(...)` (cumulativo via `conversations.created_at`), `getHandleTimeStats(...)`.
- **RF-015:** `granularity` suporta `day` (default) / `week` / `month` (D4-B).
- **RF-016:** Harness mock gera eventos/ciclos determinísticos plausíveis; troca via `VITE_DATA_SOURCE` sem o consumidor (PRD-215) saber a fonte.
- **RF-017:** Agregações respeitam scope de loja (PRD-007) e `service_volume.view` (leitura gated; Owner cross-store, Gestor loja).

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Agregação de novos atendimentos < 600ms para 12 meses; índices cobrem os group-by temporais.
- **RNF-002 (Imutabilidade):** Event log append-only; sem update/delete.
- **RNF-003 (Idempotência):** Backfill e migration reexecutáveis sem efeito duplicado.
- **RNF-004 (Segurança da migration):** Dry-run obrigatório em dev branch; rollback documentado.
- **RNF-005 (Tipagem):** Zero `any`; union literais (não `enum` TS); `ISO8601` string para tempo.
- **RNF-006 (Paridade):** Mock e Supabase retornam o mesmo shape; testes garantem paridade.

---

## Critérios de Aceitação

```gherkin
DADO uma conversa que entra em ABERTO, vai a EM_ATENDIMENTO e RESOLVIDO
QUANDO o cliente volta a falar e a conversa retorna a ABERTO no mesmo dia
ENTÃO conversation_status_events tem 2 eventos com to_status='ABERTO'
  E getNovosAtendimentos conta 2 atendimentos naquele dia para 1 único chat

DADO a normalização da taxonomia executada
QUANDO consulto a distribuição de status
ENTÃO toda conversa está em ABERTO/EM_ATENDIMENTO/AGUARDANDO/RESOLVIDO/SEM_STATUS
  E nenhuma linha viola o CHECK
  E conversas antes 'arquivada' têm archived_at preenchido e status do ciclo (não 'arquivada')

DADO o backfill executado sobre 829 conversas existentes
QUANDO conto eventos de backfill
ENTÃO existe exatamente 1 evento ABERTO (source='backfill') por conversa sem evento prévio
  E reexecutar o backfill não cria duplicatas

DADO uma transição de status que falha ao gravar no event log
QUANDO o UPDATE da conversa ocorre
ENTÃO o UPDATE da conversa é concluído normalmente (trigger fail-safe)

DADO VITE_DATA_SOURCE=mock
QUANDO o PRD-215 consome getNovosAtendimentos
ENTÃO recebe o mesmo shape que o Supabase retornaria (paridade)
```

### Cenários de Erro

```gherkin
DADO um valor de status sujo/nulo não mapeado
QUANDO a normalização roda
ENTÃO a linha vai para SEM_STATUS (nunca quebra a migration)

DADO transição para SEM_STATUS
QUANDO getNovosAtendimentos agrega
ENTÃO essa transição é ignorada na contagem
```

---

## Fases de Implementação

| Fase | Objetivo | Arquivos/Migrations Estimados |
|------|----------|-------------------------------|
| 1 | Levantamento de valores reais + colunas + normalização (dry-run em dev branch) | 1-2 migrations |
| 2 | Event log + trigger + backfill | 1-2 migrations |
| 3 | View `atendimento_cycles` + funções de agregação | 1 migration + RPCs |
| 4 | Provider + hooks + harness mock | 4-6 arquivos |
| 5 | Validação (paridade mock↔real, idempotência, performance) + decisão de materializar | testes |

### Detalhamento

#### Fase 1 — Schema + normalização
**Ações:** rodar `SELECT status, count(*)` real; criar dev branch; adicionar colunas; dry-run da normalização; conferir contagens; aplicar `CHECK`. **Validação:** zero linhas fora do conjunto canônico; `arquivada` zerado em `status`.

#### Fase 2 — Event log + trigger + backfill
**Ações:** criar tabela + índices + policies append-only; criar função + trigger; rodar backfill. **Validação:** 1 evento por conversa; transições reais geram eventos; trigger não aborta updates.

#### Fase 3 — View + agregações
**Ações:** criar `atendimento_cycles`; RPCs/queries de agregação (novos atendimentos, volume, por usuário, distribuição, acumulado, handle-time). **Validação:** contagem de novos atendimentos bate com eventos `→ABERTO`.

#### Fase 4 — Provider + hooks + mock
**Ações:** `useAtendimentoMetricsProvider` (Supabase) + harness mock determinístico; hooks por KPI; gating `service_volume.view`. **Validação:** troca de fonte transparente para o consumidor.

#### Fase 5 — Validação
**Ações:** testes de paridade, idempotência e performance; decidir materializar a view. **Validação:** RNF-001/003/006 atendidos.

---

## Dependências

| PRD | Descrição | Status |
|-----|-----------|--------|
| PRD-002 (DELTA) | Tipos `ConversationStatus`, `IConversationStatusEvent`, `IAtendimentoCycle`, campos novos | ⏳ (aplicar antes) |
| PRD-101/103 | Schema + RLS base | ✅ |
| PRD-005/104 | Provider Pattern + swap Supabase | ✅ |
| PRD-007 | Store scope | ✅ |
| PRD-010 (DELTA) | Arquivar vira flag; filtros de status | ⏳ (paralelo) |

### Decisões Pendentes

- [ ] **Valores distintos reais de `status`** (o `SELECT status, count(*)` ficou aguardando liberação de execução de SQL read-only) — confirma o mapa de normalização e quantifica o `SEM_STATUS`. Implementar levantando isso na **Fase 1** antes do dry-run.
- [ ] **`arquivada` → qual status do ciclo?** Default proposto `SEM_STATUS` (não sabemos o estado anterior ao arquivamento). Alternativa: `RESOLVIDO` (assumindo que se arquiva o resolvido). Owner/Arquiteto decide.

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Painel de Atendimento (Volume / Ciclo)"**.

| Ordem | PRD | Título | Status | Relação |
|-------|-----|--------|--------|---------|
| 1 | DELTA PRD-002 | Tipos/taxonomia | ⏳ | Base |
| **2** | **PRD-214 (`Pulse`)** | **Fundação de eventos de status** | **🔄 ATUAL** | Depende do DELTA 002 |
| 3 | DELTA PRD-010 | Filtros + arquivar-flag | ⏳ | Depende de 214 |
| 4 | DELTA PRD-014 | Shell de abas `/app/inicio` | ⏳ | Estrutural |
| 5 | PRD-215 (`Gauge`) | UI do Painel + card na Caixa | ⏳ | Consome hooks de 214 |

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Dados Sensíveis

| Dado | Classificação | Proteção |
|------|---------------|----------|
| `conversation_status_events` | Baixo PII (só ids + status + timestamp; **sem conteúdo de mensagem**) | RLS store-scoped; leitura gated por `service_volume.view` no consumo |
| Migration sobre prod | Crítico (dado real) | Dev branch + dry-run + rollback documentado; sem `UPDATE` direto em prod sem ensaio |

### Auditoria

- O event log **é** a trilha de transições de status — append-only (`DELETE/UPDATE USING (false)`), espelhando a política do `audit_logs`.
- Trigger `SECURITY DEFINER`; backfill marcado `source='backfill'` para distinguir de eventos reais.

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Claude Code CLI. Este PRD foi criado pelo Agente Arquiteto (Claude na web). Há **migration sobre banco em produção** — proceda com cuidado.

### Instruções Obrigatórias

> **⚠️ 1. ANTES DE IMPLEMENTAR:** explore o schema real, **crie um dev branch** (`create_branch`), e **levante os valores distintos de `status`** antes de escrever a normalização. Planeje, faça dry-run, revise contagens, só então aplique.

> **⚠️ 2. APÓS IMPLEMENTAR:** incrementar versão (SemVer — MINOR, é feature nova), atualizar `CHANGELOG.md` (Added: event log + métrica de atendimento; Changed: taxonomia de status + arquivar-como-flag), atualizar registro de versão, renomear este arquivo para `PRD-214-...-fundacao-eventos-atendimento_DONE.md`, e preencher Status de Implementação.

**Codinome do lote:** `Pulse`. Sugestão de bump: MINOR sobre a linha atual; codinome do app a critério do dev (ex.: manter a faixa de codinomes do lote).

### Orientações Gerais

| Aspecto | Orientação |
|---------|------------|
| **Schema real** | Tudo em `public` (não `crm`/`storefront`). Mire `public.conversations`. |
| **Forward-only** | Deixe claro no código/doc que novos atendimentos é preciso do deploy em diante; backfill cobre só o 1º ABERTO. |
| **Trigger fail-safe** | Nunca deixe o log abortar o update da conversa. |
| **Paridade** | Mock e Supabase com o mesmo shape; teste os dois. |

### O que NÃO Fazer

| ❌ Evitar |
|----------|
| Usar `audit_logs` como fonte de transições (não cobre) |
| Contar transição para `SEM_STATUS` como novo atendimento |
| Rodar a normalização direto em produção sem dry-run em dev branch |
| Tratar "arquivar" como status (é flag `archived_at`) |
| `DELETE`/`UPDATE` no event log (append-only) |
| Aplicar o `CHECK` da taxonomia antes da normalização passar 100% |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |
| **Data de Implementação** | - |
| **Versão do App** | - |
| **Implementado por** | - |
| **Observações** | - |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 18/06/2026 | v1 | Criação inicial — fundação de eventos de status do atendimento (event log + trigger + normalização + backfill + view + provider). Número 214 provisório (reconciliar INDEX v1.7). |

---

**AILA — Sistemas Inteligentes**
