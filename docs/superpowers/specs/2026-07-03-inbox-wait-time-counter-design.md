# Contador de tempo de espera na fila — Design

**Data:** 2026-07-03
**Feature:** contador discreto de "tempo de espera" nos cards da fila do Atendimento (Inbox)
**Status:** design aprovado (brainstorming) — pronto para plano de implementação

---

## 1. Objetivo

Exibir, de forma **discreta**, há quanto tempo cada conversa **"Em fila"** está aguardando
atendimento, ajudando o time a priorizar quem espera há mais tempo. O contador:

- aparece **apenas** enquanto a conversa está na fila (`isQueuedConversation`);
- **some sozinho** quando alguém assume (atribuição) ou responde — nos dois casos a
  conversa deixa de ser "Em fila", então não há timestamp de parada a gravar;
- é um cronômetro **vivo**, atualizado a cada minuto.

### Decisão sobre "quando o cronômetro para"

Os dois eventos que o dono cogitou — primeira resposta do atendente **ou** atribuição —
ambos removem a conversa do estado "Em fila" (`isQueuedConversation = !assignedSellerId &&
!isSdrActive && status === "aguardando"`). Logo, **não é preciso escolher**: o contador
simplesmente desaparece do card quando a conversa sai da fila. Conceitualmente ele mede
"tempo até alguém assumir".

---

## 2. Decisões de produto (fechadas no brainstorming)

| Tema | Decisão |
|------|---------|
| Fonte do tempo | Coluna dedicada `queued_at` populada por **trigger no banco**. Frontend só lê. |
| Posição no card | **Canto superior direito**, abaixo da data (formato "C"). |
| Cor | **Semáforo de 3 níveis** (cinza → âmbar → vermelho). |
| Limites | 🟢 0–10 min · 🟡 10–30 min · 🔴 > 30 min. **Fixos no código** nesta versão. |
| Formato do texto | minutos até 1h (`45 min`), depois horas (`2h 10`), depois dias (`1 d`); prefixo `⏱`. |
| Escopo | Somente cards **"Em fila"**. |
| Atualização | A cada 60 s, reaproveitando o `useTimeTick(60_000)` que o card já usa. |

### Por que `queued_at` (e não um proxy sem backend)

- `lastMessageAt` **reinicia** a cada nova mensagem do cliente enquanto ele espera →
  subestima a urgência (mostra "1 min" quando ele espera há 40).
- `createdAt` **quebra na reabertura** → uma conversa reaberta hoje mas criada há semanas
  mostraria "há 21 dias".
- `queued_at` marca o instante em que a conversa **entrou (ou reentrou) na fila**, sendo
  robusto contra os dois casos. O custo é contido: uma migration; o frontend só lê.

---

## 3. Arquitetura de dados (backend)

Nova coluna + trigger em `public.conversations`. **Não toca** o webhook do WhatsApp, as
Edge Functions, nem o código de atendimento — a lógica de fila vive inteira no trigger.

### 3.1 Regra do trigger

Define-se "está na fila" no banco espelhando `isQueuedConversation`:

```
status = 'aguardando' AND assigned_seller_id IS NULL AND COALESCE(is_sdr_active,false) = false
```

Transições:

- **INSERT** com estado de fila → `queued_at = now()`; senão `NULL`.
- **UPDATE** de "não-fila" → "fila" (inclui reabertura resolvida→aguardando) → `queued_at = now()`.
- **UPDATE** que **sai** da fila → `queued_at = NULL`.
- **UPDATE** que **permanece** na fila (ex.: cliente manda outra mensagem, `last_message_at`
  muda) → **não mexe** em `queued_at` (preserva o valor acumulado). Como o app nunca escreve
  a coluna, `NEW.queued_at` já reflete `OLD.queued_at` nesses updates.

### 3.2 Ordem do migration (importante)

1. `ALTER TABLE ... ADD COLUMN queued_at timestamptz`
2. **Backfill** das conversas hoje em fila (roda **antes** do trigger existir, para não ser
   interceptado): `queued_at = COALESCE(last_message_at, created_at)`.
3. `CREATE FUNCTION` do trigger (com `SET search_path = ''`, tipos qualificados).
4. `CREATE TRIGGER ... BEFORE INSERT OR UPDATE`.

### 3.3 Esboço do SQL

```sql
-- 1. coluna
alter table public.conversations add column if not exists queued_at timestamptz;

-- 2. backfill (antes do trigger)
update public.conversations
set queued_at = coalesce(last_message_at, created_at)
where status = 'aguardando'
  and assigned_seller_id is null
  and coalesce(is_sdr_active, false) = false
  and queued_at is null;

-- 3. função
create or replace function public.set_conversation_queued_at()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  new_q boolean := (new.status = 'aguardando'
                    and new.assigned_seller_id is null
                    and coalesce(new.is_sdr_active, false) = false);
  old_q boolean;
begin
  if tg_op = 'INSERT' then
    new.queued_at := case when new_q then now() else null end;
    return new;
  end if;

  old_q := (old.status = 'aguardando'
            and old.assigned_seller_id is null
            and coalesce(old.is_sdr_active, false) = false);

  if new_q and not old_q then
    new.queued_at := now();      -- entrou (ou reentrou) na fila
  elsif not new_q then
    new.queued_at := null;       -- saiu da fila
  end if;
  -- permaneceu na fila → mantém new.queued_at (== old.queued_at)

  return new;
end;
$$;

-- 4. trigger
drop trigger if exists trg_set_conversation_queued_at on public.conversations;
create trigger trg_set_conversation_queued_at
before insert or update on public.conversations
for each row execute function public.set_conversation_queued_at();
```

Migration **versionada** em `supabase/migrations/` e aplicada via MCP **somente com OK do
dono** (regra do projeto: `apply_migration` manual + espelho no Git no mesmo PR).

---

## 4. Modelo de domínio e providers

- `src/shared/types/conversation.ts` → `IConversation.queuedAt?: ISO8601` (documentar
  semântica: instante de entrada na fila; ausente/`null` quando não está em fila).
- `src/providers/data/impl/supabase/conversations.ts`:
  - incluir `queued_at` na constante `SELECT_COLUMNS`;
  - mapear em `fromRow` (`queuedAt: row.queued_at ?? undefined`);
  - **não** escrever no `toRow`/patch (coluna é derivada pelo trigger).
- `src/mocks/generators/conversation.ts` → setar `queuedAt` quando a conversa nasce em
  fila (sem assignee, sem SDR, `status === "aguardando"`), usando `lastMessageAt` como
  aproximação (o mock não tem trigger). Garante o contador no modo Demonstração.

---

## 5. Lógica — engine puro (TDD)

Novo `src/features/conversations/engine/waitTime.ts`, testado com Vitest:

- `formatWaitTime(ms: number): string`
  - `< 1 min` → `"<1 min"`;
  - `< 60 min` → `"N min"`;
  - `< 24 h` → `"Hh MM"` (ex.: `"2h 05"`);
  - `>= 24 h` → `"N d"`.
- `waitSeverity(ms: number): "neutral" | "warning" | "critical"`
  - `< 10 min` → `neutral`; `< 30 min` → `warning`; senão `critical`.
  - Limites em constantes nomeadas (`WAIT_WARNING_MS`, `WAIT_CRITICAL_MS`).

Ambas as funções são puras (recebem `ms` já calculado), sem dependência de relógio — o
`now` vem do `useTimeTick` no componente.

---

## 6. Interface

No `src/features/conversations/components/ConversationListItem.tsx`:

- Já existe `const now = useTimeTick(60_000)` e a coluna da data no canto superior direito
  (`wa-row1`). Transformar essa célula da data numa coluna vertical (`flex-col items-end`)
  e adicionar, **abaixo da data**, o contador.
- Renderizar **apenas** quando `isQueuedConversation(conversation)` e houver base de tempo
  (`queuedAt`, com fallback defensivo para `lastMessageAt` caso `queuedAt` venha ausente —
  ex.: linha pré-backfill).
- `elapsed = now - Date.parse(base)`; texto = `formatWaitTime(elapsed)`; cor por
  `waitSeverity(elapsed)` mapeada aos tokens semânticos:
  - `neutral` → `text-muted-foreground`
  - `warning` → `text-severity-warning`
  - `critical` → `text-severity-critical`
- Ícone `mdi:timer-outline` (ou `⏱`) + rótulo. `aria-label` descritivo
  ("Aguardando há 12 minutos").

---

## 7. Fora de escopo / o que **não** muda

- **Ordenação** "Tempo de espera" (segue por `lastMessageAt asc`) — já ordena quem espera
  há mais tempo no topo; o contador casa naturalmente. Alinhar a ordenação a `queued_at`
  fica como possível follow-up.
- Webhook do WhatsApp, Edge Functions, cache do atendimento (signing em lote, Realtime,
  query keys, RPCs gated-once), RPCs de listagem/contagem — **intocados**.
- Limites configuráveis por loja — deferido; fixos no código nesta versão.

---

## 8. Testes e verificação

- Vitest para `waitTime.ts` (formatação nas 4 faixas + as 3 severidades, incluindo os
  limites exatos de 10 e 30 min).
- `bun run build` + `bun run test` como gate.
- Verificação manual pelo dono no modo Demonstração e/ou em produção após deploy.

---

## 9. Rollout

1. Branch dedicada para a feature (não misturar com a worktree `feat+inline-price-lookup`).
2. Implementar frontend + engine + mock; migration versionada em `supabase/migrations/`.
3. `bun run build` + `bun run test` verdes.
4. PR (sem merge sem OK do dono).
5. Aplicar a migration em produção via MCP **com OK explícito** (coluna + backfill + trigger).
6. Smoke: conferir contador nos cards em fila e o desaparecimento ao assumir/responder.

---

## 10. Riscos e mitigações

- **Trigger reverter o backfill:** evitado ao rodar o backfill **antes** de criar o trigger.
- **Linhas pré-backfill sem `queued_at`:** fallback para `lastMessageAt` no componente.
- **Reabertura:** coberta pela transição "não-fila → fila" no trigger.
- **Rajada de mensagens:** coberta pelo branch "permaneceu na fila" (não reinicia).
