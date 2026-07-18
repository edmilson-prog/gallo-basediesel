# Transcrição automática de áudios (voice notes inbound) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda mensagem de áudio recebida de um cliente via WhatsApp é transcrita automaticamente em segundo plano (OpenRouter), e o texto aparece sozinho na bolha do Inbox assim que fica pronto — substituindo o placeholder fixo "Transcrição em breve".

**Architecture:** O webhook (`whatsapp-webhook`, compartilhado entre os 5 engines de WhatsApp) dispara em segundo plano (`EdgeRuntime.waitUntil`) um módulo compartilhado `_shared/ai/transcribeAudio.ts` assim que o download do áudio termina — sem bloquear a resposta HTTP. Esse módulo lê a configuração de roteamento já existente em `Configurações → IA → Funcionalidades`, baixa os bytes do áudio do Storage, chama o endpoint dedicado de transcrição do OpenRouter, grava o custo real em `ai_usage_events` e atualiza `messages.transcription`/`transcription_status`. A atualização chega à UI via o mesmo canal Realtime que já propaga status de entrega (merge raso no cache do TanStack Query, sem refetch). Um segundo caminho, manual, expõe a mesma lógica via uma nova Edge Function (`audio-transcribe`) para o botão de retry na bolha quando a transcrição falha.

**Tech Stack:** Deno Edge Functions (Supabase), Postgres/RLS, React 19 + TanStack Query, Vitest.

## Global Constraints

- Escopo: só áudio **inbound** (cliente → nós). Áudio outbound (vendedor) não é tocado.
- Transcrição NÃO é espelhada em `media_assets.transcription` (Vault/Biblioteca de mídia) — fica só em `messages`.
- Nenhuma migration é aplicada em produção automaticamente durante este plano — os arquivos SQL são escritos e commitados, mas `apply_migration`/deploy de Edge Function em produção exige confirmação explícita do dono do projeto antes de rodar (ver memória do projeto sobre migrations/deploys).
- A lógica de IA fica **inteiramente fora** de `src/providers/whatsapp/` e de `supabase/functions/_shared/whatsapp/webhook/core.ts` (camada runtime-agnostic compartilhada entre os 5 engines, sincronizada via `scripts/sync-whatsapp-shared.ts`) — nenhuma tarefa deste plano toca esses arquivos.
- Convenção de teste do projeto: só existem testes Vitest de lógica pura (`*.test.ts`); não há nenhum `*.test.tsx` no projeto inteiro nem testes automatizados para o handler HTTP (`index.ts`) de nenhuma Edge Function — este plano segue a mesma convenção (não introduz componente-teste nem teste de handler onde não existe precedente).
- camelCase em TS/JS, snake_case em SQL/colunas, `IPascalCase` para interfaces de domínio, comentários em inglês, texto de UI em português do Brasil com acentuação correta.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20260715120000_messages_transcription_columns.sql` | criar | Colunas `transcription`/`transcription_status` em `messages` |
| `supabase/migrations/20260715120100_ai_settings_audio_transcription_routing.sql` | criar | Backfill da 6ª entrada de `routing` no singleton `ai_settings` já existente em produção |
| `src/shared/types/ai.ts` | modificar | `AiFeatureKey` + `AI_FEATURE_LABELS` ganham `audio_transcription` |
| `src/providers/data/engine/aiCatalog.ts` | modificar | `FEATURES`, `MODELS.openrouter` (modelo de transcrição), `buildDefaultAiSettings` (seed da rota) |
| `src/providers/data/engine/aiCatalog.test.ts` | modificar | Cobre a nova rota nos dois branches de `buildDefaultAiSettings` |
| `src/shared/types/conversation.ts` | modificar | `IMessage` ganha `transcription?`/`transcriptionStatus?` |
| `src/providers/data/impl/supabase/messages.ts` | modificar | `MessageRow`, `COLUMNS`, `rowToMessage`, novo método `retryTranscription` |
| `src/features/conversations/hooks/useRealtimeMessages.ts` | modificar | `IMessageRealtimeRow` + `rowToMessage` local ganham os 2 campos |
| `src/providers/data/contracts/messages.ts` | modificar | `IMessagesProvider` ganha `retryTranscription(messageId)` |
| `src/providers/data/impl/mock/messages.ts` | modificar | `retryTranscription` no-op (mock nunca chega a `failed`) |
| `src/providers/data/impl/mock/messages.test.ts` | modificar | Cobre o no-op |
| `supabase/functions/_shared/ai/adapters.ts` | modificar | Novo adapter `callOpenRouterTranscription` |
| `supabase/functions/_shared/ai/transcribeAudio.ts` | criar | `transcribeMessageAudio(admin, messageId)` — orquestração completa |
| `supabase/functions/whatsapp-webhook/index.ts` | modificar | `setMessageMedia` dispara a transcrição em segundo plano quando `media_type === 'audio'` |
| `supabase/functions/audio-transcribe/index.ts` | criar | Edge Function nova (13ª) — HTTP wrapper para o retry manual |
| `src/features/conversations/i18n/pt-BR.ts` | modificar | Remove `audioTranscription` fixo; entram `transcribingAudio`/`transcriptionUnavailable` |
| `src/features/conversations/hooks/useRetryTranscription.ts` | criar | `useMutation` fino sobre `provider.retryTranscription` |
| `src/features/conversations/components/bubbles/AudioBubble.tsx` | modificar | `RealAudioPlayer` mostra os 3 estados reais; `SimulatedAudioPlayer` perde a legenda fixa |

---

### Task 1: Migration — colunas de transcrição em `messages`

**Files:**
- Create: `supabase/migrations/20260715120000_messages_transcription_columns.sql`

**Interfaces:**
- Produces: colunas `messages.transcription text` e `messages.transcription_status text check (transcription_status in ('pending','done','failed'))`, consumidas pelas Tasks 4, 7, 8, 9, 10.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/20260715120000_messages_transcription_columns.sql
-- Transcrição automática de áudios inbound (OpenRouter). Additive + idempotent.
-- transcription_status NULL = "não se aplica" (mensagem antiga, não-áudio, ou
-- funcionalidade desligada no momento do recebimento) — a bolha não mostra
-- nenhuma legenda nesse caso. Sem mudança de RLS: as policies messages_select/
-- insert/update/delete já delegam para can_access_conversation(conversation_id)
-- (20260615130400_whatsapp_multi_rls_delegate.sql), que cobre a linha inteira.

alter table public.messages
  add column if not exists transcription text,
  add column if not exists transcription_status text
    check (transcription_status in ('pending', 'done', 'failed'));

comment on column public.messages.transcription is
  'Texto transcrito do áudio inbound via OpenRouter (audio_transcription feature). NULL até a transcrição terminar ou se não se aplica.';
comment on column public.messages.transcription_status is
  'pending = transcrevendo; done = transcription preenchido; failed = erro/orçamento/desligado após tentativa; NULL = não se aplica.';
```

- [ ] **Step 2: Verificar a sintaxe e o idempotente**

Confira visualmente que o arquivo:
- usa `if not exists` (idempotente, seguro rodar 2x);
- não altera nenhuma policy de RLS (não deve haver `create policy`/`alter policy` neste arquivo);
- o `check` lista exatamente os 3 valores do design (`pending`, `done`, `failed`).

Não aplique a migration em produção nesta tarefa (ver Global Constraints) — só o arquivo é criado e commitado.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260715120000_messages_transcription_columns.sql
git commit -m "feat(db): add messages.transcription and transcription_status columns"
```

---

### Task 2: Migration — backfill da rota `audio_transcription` em `ai_settings`

**Files:**
- Create: `supabase/migrations/20260715120100_ai_settings_audio_transcription_routing.sql`

**Interfaces:**
- Consumes: nenhuma (migration independente).
- Produces: uma 6ª entrada em `ai_settings.routing` (jsonb) no registro singleton já existente em produção, com `feature: 'audio_transcription'`, `enabled: false`. Consumida pela Task 9 (Edge Function lê essa rota) e pela tela `AiFeaturesTab.tsx` (já existente, sem mudança de código — só passa a desenhar a linha nova porque o dado passa a existir).

- [ ] **Step 1: Escrever a migration de dados**

```sql
-- supabase/migrations/20260715120100_ai_settings_audio_transcription_routing.sql
-- A tela Configurações → IA → Funcionalidades (AiFeaturesTab.tsx) só desenha o
-- que já está persistido em ai_settings.routing (settings.routing.map(...)), e
-- updateFeatureRouting só EDITA uma entrada existente — não cria. Como o
-- registro id=1 já existe em produção com 5 entradas, é preciso empurrar a 6ª
-- via UPDATE (idempotente: só insere se ainda não existir).
--
-- Fica desligada por padrão (enabled=false) — o dono liga manualmente na tela
-- depois de confirmar a chave OPENROUTER_API_KEY no Vault. providerId é fixado
-- em 'openrouter' porque é o único provedor com adapter de transcrição
-- (callOpenRouterTranscription); trocar de provedor pela UI genérica não tem
-- efeito real até outro adapter existir (mesmo comportamento já aceito hoje
-- para a rota part_identification, roteada a 'google' sem adapter Google).
-- params/systemPrompt não têm uso em transcrição — ficam neutros só para
-- satisfazer o tipo IAiFeatureRouting, que os exige.

update public.ai_settings
set routing = routing || jsonb_build_object(
  'feature', 'audio_transcription',
  'enabled', false,
  'providerId', 'openrouter',
  'model', 'openai/whisper-1',
  'params', jsonb_build_object('temperature', 0, 'maxTokens', 0),
  'systemPrompt', ''
)
where id = 1
  and not exists (
    select 1 from jsonb_array_elements(routing) r
    where r ->> 'feature' = 'audio_transcription'
  );
```

- [ ] **Step 2: Verificar idempotência e escopo**

Confira que:
- o `where ... not exists (...)` garante que rodar a migration 2x não duplica a entrada;
- nenhuma outra entrada de `routing` é tocada (o `||` só concatena, não substitui o array);
- `enabled` está `false` (não liga a funcionalidade sozinha).

Não aplique em produção nesta tarefa.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260715120100_ai_settings_audio_transcription_routing.sql
git commit -m "feat(db): backfill audio_transcription routing entry into ai_settings"
```

---

### Task 3: Catálogo e tipos de IA — `audio_transcription`

**Files:**
- Modify: `src/shared/types/ai.ts:5-10` e `:123-129`
- Modify: `src/providers/data/engine/aiCatalog.ts:18-38`, `:52-58`, `:189-195`
- Test: `src/providers/data/engine/aiCatalog.test.ts`

**Interfaces:**
- Consumes: nenhuma.
- Produces: `AiFeatureKey` inclui `"audio_transcription"`; `AI_FEATURE_LABELS.audio_transcription: string`; `FEATURES` (array) inclui o novo key; `MODELS.openrouter` ganha `{id: "openai/whisper-1", ...}`; `buildDefaultAiSettings(env).routing` inclui uma entrada com `feature: "audio_transcription"` em ambos os branches (`'mock'` e `'supabase'`). Consumido pela Task 9 (validação do `SUPPORTED`/routing) e pela UI existente (`AiFeaturesTab.tsx`, sem mudança de código).

- [ ] **Step 1: Escrever/estender o teste (falha esperada)**

Adicione ao final do arquivo `src/providers/data/engine/aiCatalog.test.ts` (dentro do primeiro `describe("aiCatalog", ...)`, após o teste `buildDefaultAiSettings('mock') mantém o comportamento de demo`):

```ts
  it("buildDefaultAiSettings inclui a rota audio_transcription (desligada) nos dois ambientes", () => {
    for (const env of ["mock", "supabase"] as const) {
      const s = buildDefaultAiSettings(env);
      const route = s.routing.find((r) => r.feature === "audio_transcription");
      expect(route).toBeDefined();
      expect(route!.enabled).toBe(false);
      expect(route!.providerId).toBe("openrouter");
    }
  });

  it("MODELS.openrouter inclui um modelo de transcrição", () => {
    expect(modelsFor("openrouter").some((m) => m.id === "openai/whisper-1")).toBe(true);
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun run test aiCatalog`
Expected: FAIL — `route` é `undefined` (a chave `audio_transcription` ainda não existe em `AiFeatureKey`/`FEATURES`/`buildDefaultAiSettings`, então o teste `AiFeatureKey`-derivado também deve estar falhando por tipo se você rodar `bunx tsc --noEmit` neste ponto, já que o teste referencia uma string que ainda não é um `AiFeatureKey` válido — é esperado até o Step 3).

- [ ] **Step 3: Atualizar `src/shared/types/ai.ts`**

```ts
// src/shared/types/ai.ts:5-10 — antes:
export type AiFeatureKey =
  | "conversation_copilot"
  | "analytics_copilot"
  | "sdr"
  | "part_identification"
  | "insights";

// depois:
export type AiFeatureKey =
  | "conversation_copilot"
  | "analytics_copilot"
  | "sdr"
  | "part_identification"
  | "insights"
  | "audio_transcription";
```

```ts
// src/shared/types/ai.ts:123-129 — antes:
export const AI_FEATURE_LABELS: Record<AiFeatureKey, string> = {
  conversation_copilot: "Copiloto de conversa",
  analytics_copilot: "Copiloto analítico",
  sdr: "SDR (qualificação automática)",
  part_identification: "Identificação de peça",
  insights: "Insights",
};

// depois:
export const AI_FEATURE_LABELS: Record<AiFeatureKey, string> = {
  conversation_copilot: "Copiloto de conversa",
  analytics_copilot: "Copiloto analítico",
  sdr: "SDR (qualificação automática)",
  part_identification: "Identificação de peça",
  insights: "Insights",
  audio_transcription: "Transcrição de áudio",
};
```

- [ ] **Step 4: Atualizar `src/providers/data/engine/aiCatalog.ts`**

Adicione o modelo de transcrição em `MODELS.openrouter` (linha 30-33). Preço fica `0`/`0` de propósito — o custo real vem de `usage.cost` da resposta do OpenRouter (`usdCostOverride`), não de tabela de preço por token (transcrição não é cobrada por token):

```ts
// antes (linha 30-33):
  openrouter: [
    { id: "anthropic/claude-opus-4.8", label: "Anthropic: Claude Opus 4.8", inputPricePer1kUsd: 0.015, outputPricePer1kUsd: 0.075 },
    { id: "google/gemini-2.5-pro", label: "Google: Gemini 2.5 Pro", inputPricePer1kUsd: 0.0035, outputPricePer1kUsd: 0.0105 },
  ],

// depois:
  openrouter: [
    { id: "anthropic/claude-opus-4.8", label: "Anthropic: Claude Opus 4.8", inputPricePer1kUsd: 0.015, outputPricePer1kUsd: 0.075 },
    { id: "google/gemini-2.5-pro", label: "Google: Gemini 2.5 Pro", inputPricePer1kUsd: 0.0035, outputPricePer1kUsd: 0.0105 },
    { id: "openai/whisper-1", label: "OpenAI: Whisper (transcrição)", inputPricePer1kUsd: 0, outputPricePer1kUsd: 0 },
  ],
```

Adicione `"audio_transcription"` a `FEATURES` (linha 52-58):

```ts
// antes:
export const FEATURES: AiFeatureKey[] = [
  "conversation_copilot",
  "analytics_copilot",
  "sdr",
  "part_identification",
  "insights",
];

// depois:
export const FEATURES: AiFeatureKey[] = [
  "conversation_copilot",
  "analytics_copilot",
  "sdr",
  "part_identification",
  "insights",
  "audio_transcription",
];
```

Adicione a rota ao `routing` seed dentro de `buildDefaultAiSettings` (linha 189-195, dentro do array `routing: [...]`, após a entrada `insights`):

```ts
// depois da entrada "insights" (linha 194), antes do `],` de fechamento:
      { feature: "audio_transcription", enabled: false, providerId: "openrouter", model: "openai/whisper-1", params: { temperature: 0, maxTokens: 0 }, systemPrompt: "" },
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `bun run test aiCatalog`
Expected: PASS — incluindo o teste pré-existente `"FEATURES cobre todas as AiFeatureKey"` (`aiCatalog.test.ts:17-20`), que agora também cobre `audio_transcription` automaticamente.

- [ ] **Step 6: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep -i "aiCatalog\|shared/types/ai.ts"`
Expected: nenhuma linha nova de erro nesses dois arquivos (baseline de erros pré-existentes do projeto é tratado à parte, conforme CLAUDE.md).

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/ai.ts src/providers/data/engine/aiCatalog.ts src/providers/data/engine/aiCatalog.test.ts
git commit -m "feat(ai): add audio_transcription feature key and routing seed"
```

---

### Task 4: `IMessage` + camada de dados (colunas de transcrição)

**Files:**
- Modify: `src/shared/types/conversation.ts:211-244`
- Modify: `src/providers/data/impl/supabase/messages.ts:37-93`
- Modify: `src/features/conversations/hooks/useRealtimeMessages.ts:10-71`

**Interfaces:**
- Consumes: nenhuma nova (só estende tipos/mapeamentos já existentes).
- Produces: `IMessage.transcription?: string`, `IMessage.transcriptionStatus?: 'pending' | 'done' | 'failed'`, populados tanto no fetch inicial (provider) quanto via Realtime. Consumido pela Task 5 (retry) e pela Task 10 (UI).

- [ ] **Step 1: Estender `IMessage`**

```ts
// src/shared/types/conversation.ts:240-244 — antes:
  /** Human-readable reason of a failed dispatch (PRD-114/118). */
  failureReason?: string;
  /** Semantic provider error code of a failed dispatch (e.g. "131026"). */
  failureCode?: string;
}

// depois:
  /** Human-readable reason of a failed dispatch (PRD-114/118). */
  failureReason?: string;
  /** Semantic provider error code of a failed dispatch (e.g. "131026"). */
  failureCode?: string;
  /** Transcribed text of an inbound audio message (OpenRouter). Undefined until done. */
  transcription?: string;
  /** 'pending' while transcribing, 'done' when `transcription` is set, 'failed' on error/budget/disabled. Undefined = not applicable (non-audio, old message, or feature was off on arrival). */
  transcriptionStatus?: "pending" | "done" | "failed";
}
```

- [ ] **Step 2: Estender o provider Supabase (`messages.ts`)**

```ts
// src/providers/data/impl/supabase/messages.ts:37-55 — MessageRow, antes:
interface MessageRow {
  id: string;
  conversation_id: string;
  direction: IMessage["direction"];
  author_type: IMessage["authorType"];
  author_id: string | null;
  provider: IMessage["provider"];
  text: string;
  media_type: MessageMediaType | null;
  media_url: string | null;
  media_filename: string | null;
  status: IMessage["status"];
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  failure_reason: string | null;
  failure_code: string | null;
  created_at: string;
}

// depois:
interface MessageRow {
  id: string;
  conversation_id: string;
  direction: IMessage["direction"];
  author_type: IMessage["authorType"];
  author_id: string | null;
  provider: IMessage["provider"];
  text: string;
  media_type: MessageMediaType | null;
  media_url: string | null;
  media_filename: string | null;
  status: IMessage["status"];
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  failure_reason: string | null;
  failure_code: string | null;
  transcription: string | null;
  transcription_status: IMessage["transcriptionStatus"] | null;
  created_at: string;
}
```

```ts
// src/providers/data/impl/supabase/messages.ts:57-60 — COLUMNS, antes:
const COLUMNS =
  "id, conversation_id, direction, author_type, author_id, provider, text, media_type, " +
  "media_url, media_filename, status, sent_at, delivered_at, read_at, failure_reason, failure_code, created_at";

// depois:
const COLUMNS =
  "id, conversation_id, direction, author_type, author_id, provider, text, media_type, " +
  "media_url, media_filename, status, sent_at, delivered_at, read_at, failure_reason, failure_code, " +
  "transcription, transcription_status, created_at";
```

```ts
// src/providers/data/impl/supabase/messages.ts:70-93 — rowToMessage, antes:
function rowToMessage(row: MessageRow): IMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction,
    authorType: row.author_type,
    authorId: row.author_id ?? undefined,
    provider: row.provider,
    text: row.text,
    mediaType: row.media_type ?? undefined,
    mediaUrl: row.media_url ?? undefined,
    mediaFilename: row.media_filename ?? undefined,
    status: row.status,
    sentAt: row.sent_at,
    receivedAt: row.created_at,
    deliveredAt: row.delivered_at ?? undefined,
    readAt: row.read_at ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    failureCode: row.failure_code ?? undefined,
  };
}

// depois:
function rowToMessage(row: MessageRow): IMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction,
    authorType: row.author_type,
    authorId: row.author_id ?? undefined,
    provider: row.provider,
    text: row.text,
    mediaType: row.media_type ?? undefined,
    mediaUrl: row.media_url ?? undefined,
    mediaFilename: row.media_filename ?? undefined,
    status: row.status,
    sentAt: row.sent_at,
    receivedAt: row.created_at,
    deliveredAt: row.delivered_at ?? undefined,
    readAt: row.read_at ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    failureCode: row.failure_code ?? undefined,
    transcription: row.transcription ?? undefined,
    transcriptionStatus: row.transcription_status ?? undefined,
  };
}
```

- [ ] **Step 3: Estender o mapeamento Realtime**

```ts
// src/features/conversations/hooks/useRealtimeMessages.ts:10-27 — antes:
interface IMessageRealtimeRow {
  id: string;
  conversation_id: string;
  direction: IMessage["direction"];
  author_type: IMessage["authorType"];
  author_id: string | null;
  provider: IMessage["provider"];
  text: string;
  media_type: IMessage["mediaType"] | null;
  media_url: string | null;
  media_filename: string | null;
  status: IMessage["status"];
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  failure_reason: string | null;
  failure_code: string | null;
}

// depois:
interface IMessageRealtimeRow {
  id: string;
  conversation_id: string;
  direction: IMessage["direction"];
  author_type: IMessage["authorType"];
  author_id: string | null;
  provider: IMessage["provider"];
  text: string;
  media_type: IMessage["mediaType"] | null;
  media_url: string | null;
  media_filename: string | null;
  status: IMessage["status"];
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  failure_reason: string | null;
  failure_code: string | null;
  transcription: string | null;
  transcription_status: IMessage["transcriptionStatus"] | null;
}
```

```ts
// src/features/conversations/hooks/useRealtimeMessages.ts:52-71 — rowToMessage local, antes:
function rowToMessage(row: IMessageRealtimeRow): IMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction,
    authorType: row.author_type,
    authorId: row.author_id ?? undefined,
    provider: row.provider,
    text: row.text,
    mediaType: row.media_type ?? undefined,
    mediaUrl: row.media_url ?? undefined,
    mediaFilename: row.media_filename ?? undefined,
    status: row.status,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at ?? undefined,
    readAt: row.read_at ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    failureCode: row.failure_code ?? undefined,
  };
}

// depois:
function rowToMessage(row: IMessageRealtimeRow): IMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction,
    authorType: row.author_type,
    authorId: row.author_id ?? undefined,
    provider: row.provider,
    text: row.text,
    mediaType: row.media_type ?? undefined,
    mediaUrl: row.media_url ?? undefined,
    mediaFilename: row.media_filename ?? undefined,
    status: row.status,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at ?? undefined,
    readAt: row.read_at ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    failureCode: row.failure_code ?? undefined,
    transcription: row.transcription ?? undefined,
    transcriptionStatus: row.transcription_status ?? undefined,
  };
}
```

- [ ] **Step 4: Rodar os testes existentes (regressão)**

Run: `bun run test useRealtimeMessages`
Expected: PASS (o arquivo de teste só cobre `messageRowMatches`/`conversationTouchMatches`, que não mudaram — este passo confirma que a extensão do tipo/mapeamento não quebrou nada).

Run: `bunx tsc --noEmit 2>&1 | grep -iE "conversation\.ts|impl/supabase/messages\.ts|useRealtimeMessages\.ts"`
Expected: nenhuma linha nova de erro.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/conversation.ts src/providers/data/impl/supabase/messages.ts src/features/conversations/hooks/useRealtimeMessages.ts
git commit -m "feat(conversations): thread transcription/transcriptionStatus through IMessage"
```

---

### Task 5: `IMessagesProvider.retryTranscription`

**Files:**
- Modify: `src/providers/data/contracts/messages.ts:26-102`
- Modify: `src/providers/data/impl/mock/messages.ts`
- Modify: `src/providers/data/impl/mock/messages.test.ts`
- Modify: `src/providers/data/impl/supabase/messages.ts`

**Interfaces:**
- Consumes: `IMessage.transcriptionStatus` (Task 4).
- Produces: `IMessagesProvider.retryTranscription(messageId: ID): Promise<void>`. Consumido pela Task 10 (botão de retry na bolha).

- [ ] **Step 1: Escrever o teste do mock (falha esperada)**

Adicione ao final de `src/providers/data/impl/mock/messages.test.ts`:

```ts
describe("mockMessagesProvider.retryTranscription", () => {
  it("resolves without throwing (mock audio never reaches a failed transcription state)", async () => {
    await expect(mockMessagesProvider.retryTranscription("m1")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun run test impl/mock/messages`
Expected: FAIL — `mockMessagesProvider.retryTranscription is not a function`.

- [ ] **Step 3: Adicionar o método ao contrato**

```ts
// src/providers/data/contracts/messages.ts — no final da interface IMessagesProvider (depois de listLastMessages, antes do `}` de fechamento, linha ~101):
  /**
   * Re-dispara a transcrição de uma mensagem de áudio inbound cuja tentativa
   * anterior falhou (`transcriptionStatus === 'failed'`). Sob demanda, disparado
   * pelo botão de retry na bolha — sem retry automático em loop. O mock nunca
   * marca `transcriptionStatus: 'failed'` em nenhuma mensagem gerada, então este
   * método é inalcançável pela UI em demonstração; existe só para satisfazer o
   * contrato.
   */
  retryTranscription(messageId: ID): Promise<void>;
```

- [ ] **Step 4: Implementar no mock**

```ts
// src/providers/data/impl/mock/messages.ts — dentro do objeto mockMessagesProvider,
// como último método (depois de listLastMessages):
  retryTranscription: async () => {
    // No-op: nenhuma mensagem mock chega a transcriptionStatus 'failed', então o
    // botão de retry nunca aparece em demonstração. Existe só para satisfazer o
    // contrato IMessagesProvider.
  },
```

- [ ] **Step 5: Implementar no provider Supabase**

```ts
// src/providers/data/impl/supabase/messages.ts — dentro do objeto supabaseMessagesProvider,
// como último método (depois de listLastMessages):
  async retryTranscription(messageId) {
    const { error } = await getSupabaseClient().functions.invoke("audio-transcribe", {
      body: { messageId },
    });
    if (error) throw new Error(`[supabase] messages.retryTranscription failed: ${error.message}`);
  },
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `bun run test impl/mock/messages`
Expected: PASS

- [ ] **Step 7: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "contracts/messages\.ts|impl/mock/messages\.ts|impl/supabase/messages\.ts"`
Expected: nenhuma linha nova de erro (o TS deve acusar erro se QUALQUER outro provider que implemente `IMessagesProvider` esquecer o novo método — confirme que só `mock` e `supabase` existem para esta interface).

- [ ] **Step 8: Commit**

```bash
git add src/providers/data/contracts/messages.ts src/providers/data/impl/mock/messages.ts src/providers/data/impl/mock/messages.test.ts src/providers/data/impl/supabase/messages.ts
git commit -m "feat(conversations): add IMessagesProvider.retryTranscription"
```

---

### Task 6: Adapter OpenRouter de transcrição (`_shared/ai/adapters.ts`)

**Files:**
- Modify: `supabase/functions/_shared/ai/adapters.ts`

**Interfaces:**
- Consumes: nenhuma nova.
- Produces: `callOpenRouterTranscription(apiKey: string, audioBytes: Uint8Array, mimeType: string, model: string, signal: AbortSignal): Promise<{ text: string; usdCost?: number }>`. Consumido pela Task 7.

- [ ] **Step 1: Adicionar o adapter**

Sem teste dedicado nesta task — os 3 adapters irmãos já existentes neste mesmo arquivo (`callAnthropic`, `callOpenRouter`, `callOpenAI`) não têm cobertura Vitest hoje (chamadas `fetch` reais, sem infraestrutura de mock de rede no projeto para Edge Functions); esta função segue a mesma convenção, validada por smoke manual no rollout (Task 9/§ verificação final).

```ts
// supabase/functions/_shared/ai/adapters.ts — acrescentar ao final do arquivo:

/**
 * Extensão de arquivo por mimetype, só para o nome do campo `file` no multipart
 * (o OpenRouter também recebe o Content-Type real do Blob). Cobre os formatos
 * de voice note do WhatsApp — espelha (sem importar) o MIME_EXTENSIONS de
 * _shared/whatsapp/webhook/core.ts para não acoplar o módulo de IA ao de
 * WhatsApp.
 */
const TRANSCRIPTION_EXT_BY_MIME: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
};

/**
 * OpenRouter's dedicated transcription endpoint (multipart upload — avoids the
 * ~33% base64 overhead of the chat-completions input_audio route). Mirrors the
 * `usdCostOverride` contract of callOpenRouter: when `usage.cost` comes back,
 * computeCostBRL() prefers it over token×price (transcription isn't priced per
 * token anyway).
 */
export async function callOpenRouterTranscription(
  apiKey: string,
  audioBytes: Uint8Array,
  mimeType: string,
  model: string,
  signal: AbortSignal,
): Promise<{ text: string; usdCost?: number }> {
  const ext = TRANSCRIPTION_EXT_BY_MIME[mimeType] ?? "bin";
  const form = new FormData();
  form.append("model", model);
  form.append("file", new Blob([audioBytes], { type: mimeType }), `audio.${ext}`);

  const res = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://crm.gallobasediesel.com.br",
      "X-Title": "GALLO BASE DIESEL",
    },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`openrouter-transcription ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as { text?: string; usage?: { cost?: number } };
  return { text: data.text ?? "", usdCost: data.usage?.cost };
}
```

- [ ] **Step 2: Type-check (Deno usa `tsc` do projeto? confirmar via lint do editor)**

Este arquivo roda em Deno (imports `https://esm.sh/...`), fora do `tsconfig.json` do Vite — não é coberto por `bunx tsc --noEmit`. Revise manualmente: `FormData`, `Blob` e `fetch` são Web APIs padrão, disponíveis tanto em Deno quanto no editor; não há import quebrado (nenhum import novo foi adicionado, só código local ao arquivo).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/ai/adapters.ts
git commit -m "feat(ai): add callOpenRouterTranscription adapter"
```

---

### Task 7: Orquestração — `_shared/ai/transcribeAudio.ts`

**Files:**
- Create: `supabase/functions/_shared/ai/transcribeAudio.ts`

**Interfaces:**
- Consumes: `callOpenRouterTranscription`, `computeCostBRL` (Task 6, `_shared/ai/adapters.ts`); `createSecretResolver` (`_shared/secrets.ts`, já existente).
- Produces: `transcribeMessageAudio(admin: SupabaseClient, messageId: string): Promise<{ status: 'done' | 'failed' | 'skipped' }>`. Consumido pela Task 8 (gatilho automático) e Task 9 (retry manual).

- [ ] **Step 1: Escrever o módulo**

Sem teste Vitest dedicado — função de orquestração I/O-pesada (Storage download, fetch externo, múltiplos UPDATEs), na mesma categoria de `copilot-generate/index.ts`/`ai-generate/index.ts`, que também não têm teste automatizado (só os helpers puros que extraem, como `prompt.ts`, são testados). Validação por smoke manual no rollout.

```ts
// supabase/functions/_shared/ai/transcribeAudio.ts
/**
 * Orquestração central da transcrição de áudio inbound (feature `audio_transcription`).
 * Chamada por dois caminhos: automático (whatsapp-webhook, fire-and-forget via
 * runInBackground) e manual (Edge Function audio-transcribe, retry a partir da UI).
 * Sempre com o client `admin` (service_role) — nunca exposta diretamente ao browser.
 */

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { createSecretResolver } from "../secrets.ts";
import { callOpenRouterTranscription, computeCostBRL } from "./adapters.ts";

const FEATURE = "audio_transcription";
const MEDIA_BUCKET = "whatsapp-media";
const TRANSCRIBE_TIMEOUT_MS = 60_000;

interface RoutingEntry {
  feature: string;
  enabled: boolean;
  providerId: string;
  model: string;
}
interface SettingsRow {
  master_enabled: boolean;
  budget: { monthlyCapBRL: number; usdToBrl: number };
  routing: RoutingEntry[];
}

async function monthSpendBRL(admin: SupabaseClient): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data, error } = await admin
    .from("ai_usage_events")
    .select("cost_brl")
    .gte("ts", start.toISOString());
  if (error) throw new Error(`budget read failed: ${error.message}`);
  return (data ?? []).reduce((a: number, r: { cost_brl: number | string }) => a + Number(r.cost_brl), 0);
}

async function markStatus(
  admin: SupabaseClient,
  messageId: string,
  status: "done" | "failed" | "skipped",
  transcription?: string,
): Promise<{ status: "done" | "failed" | "skipped" }> {
  await admin
    .from("messages")
    .update({
      transcription_status: status === "skipped" ? null : status,
      ...(transcription !== undefined ? { transcription } : {}),
    })
    .eq("id", messageId);
  return { status };
}

async function insertUsageEvent(
  admin: SupabaseClient,
  input: {
    providerId: string;
    model: string;
    costBRL: number;
    latencyMs: number;
    status: "ok" | "error";
    storeId: string | null;
  },
): Promise<void> {
  await admin.from("ai_usage_events").insert({
    source: "routed",
    feature: FEATURE,
    provider_id: input.providerId,
    model: input.model,
    input_tokens: 0,
    output_tokens: 0,
    cost_brl: input.costBRL,
    latency_ms: input.latencyMs,
    status: input.status,
    caller_id: null, // system-triggered (webhook) or retry — no end-user caller to attribute
    store_id: input.storeId,
  });
}

export async function transcribeMessageAudio(
  admin: SupabaseClient,
  messageId: string,
): Promise<{ status: "done" | "failed" | "skipped" }> {
  const { data: settings, error: sErr } = await admin
    .from("ai_settings")
    .select("master_enabled, budget, routing")
    .eq("id", 1)
    .maybeSingle<SettingsRow>();
  if (sErr || !settings) return markStatus(admin, messageId, "skipped");

  const route = settings.routing.find((r) => r.feature === FEATURE);
  if (!settings.master_enabled || !route || !route.enabled) {
    return markStatus(admin, messageId, "skipped");
  }
  if (route.providerId !== "openrouter") {
    // Only OpenRouter has a transcription adapter today (mirrors the
    // part_identification precedent: an unsupported provider fails cleanly
    // rather than silently no-op-ing).
    return markStatus(admin, messageId, "failed");
  }

  const spent = await monthSpendBRL(admin);
  if (settings.budget.monthlyCapBRL > 0 && spent >= settings.budget.monthlyCapBRL) {
    return markStatus(admin, messageId, "failed");
  }

  const { data: message, error: mErr } = await admin
    .from("messages")
    .select("media_url, conversation_id")
    .eq("id", messageId)
    .maybeSingle<{ media_url: string | null; conversation_id: string }>();
  if (mErr || !message?.media_url) return markStatus(admin, messageId, "failed");

  let storeId: string | null = null;
  const { data: conv } = await admin
    .from("conversations")
    .select("store_id")
    .eq("id", message.conversation_id)
    .maybeSingle<{ store_id: string | null }>();
  storeId = conv?.store_id ?? null;

  const { data: file, error: dlErr } = await admin.storage
    .from(MEDIA_BUCKET)
    .download(message.media_url);
  if (dlErr || !file) return markStatus(admin, messageId, "failed");

  const resolveSecret = createSecretResolver(admin);
  const apiKey = await resolveSecret("OPENROUTER_API_KEY");
  if (!apiKey) return markStatus(admin, messageId, "failed");

  const started = Date.now();
  const controller = AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS);
  try {
    const audioBytes = new Uint8Array(await file.arrayBuffer());
    const result = await callOpenRouterTranscription(
      apiKey,
      audioBytes,
      file.type || "audio/ogg",
      route.model,
      controller,
    );
    const latencyMs = Date.now() - started;
    const costBRL = computeCostBRL(
      0,
      0,
      { inputPricePer1kUsd: 0, outputPricePer1kUsd: 0 },
      settings.budget.usdToBrl,
      result.usdCost ?? 0,
    );
    await insertUsageEvent(admin, {
      providerId: route.providerId,
      model: route.model,
      costBRL,
      latencyMs,
      status: "ok",
      storeId,
    });
    if (!result.text) return markStatus(admin, messageId, "failed");
    return markStatus(admin, messageId, "done", result.text);
  } catch (_err) {
    const latencyMs = Date.now() - started;
    await insertUsageEvent(admin, {
      providerId: route.providerId,
      model: route.model,
      costBRL: 0,
      latencyMs,
      status: "error",
      storeId,
    });
    return markStatus(admin, messageId, "failed");
  }
}
```

- [ ] **Step 2: Revisão manual**

Confira que:
- toda saída passa por `markStatus`, então `transcription_status` nunca fica travado em `'pending'` indefinidamente (todo caminho — sucesso, erro, orçamento, desligado, provedor não suportado — termina em `done`/`failed`/`skipped`);
- `skipped` grava `transcription_status = null` (volta a "não se aplica"), não a string `'skipped'` (esse valor não existe no `check` da Task 1 de propósito — é um estado interno desta função, não um estado da UI);
- nenhum import de `src/providers/whatsapp/` ou `_shared/whatsapp/` — o módulo é autocontido.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/ai/transcribeAudio.ts
git commit -m "feat(ai): add transcribeMessageAudio orchestration"
```

---

### Task 8: Gatilho automático no webhook

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts:501-506` (método `setMessageMedia`)
- Modify: `supabase/functions/whatsapp-webhook/index.ts` (import no topo do arquivo)

**Interfaces:**
- Consumes: `transcribeMessageAudio` (Task 7); `runInBackground` (já existe neste arquivo, ~linha 710, function declaration hoisted — nenhuma mudança nela).
- Produces: toda mensagem inbound com download de áudio bem-sucedido dispara `transcribeMessageAudio` em segundo plano, sem bloquear a resposta HTTP.

- [ ] **Step 1: Adicionar o import**

```ts
// supabase/functions/whatsapp-webhook/index.ts — no bloco de imports do topo
// (depois da linha 43, junto aos demais imports de _shared):
import { transcribeMessageAudio } from "../_shared/ai/transcribeAudio.ts";
```

- [ ] **Step 2: Estender `setMessageMedia`**

```ts
// supabase/functions/whatsapp-webhook/index.ts:501-506 — antes:
    async setMessageMedia(messageId, mediaUrl, downloadStatus) {
      await admin
        .from("messages")
        .update({ media_url: mediaUrl, media_download_status: downloadStatus })
        .eq("id", messageId);
    },

// depois:
    async setMessageMedia(messageId, mediaUrl, downloadStatus) {
      const { data } = await admin
        .from("messages")
        .update({ media_url: mediaUrl, media_download_status: downloadStatus })
        .eq("id", messageId)
        .select("media_type")
        .maybeSingle<{ media_type: string | null }>();
      if (downloadStatus === "ok" && data?.media_type === "audio") {
        await admin.from("messages").update({ transcription_status: "pending" }).eq("id", messageId);
        runInBackground(transcribeMessageAudio(admin, messageId));
      }
    },
```

- [ ] **Step 3: Revisão manual**

Confira que:
- `core.ts` (`_shared/whatsapp/webhook/core.ts`) **não foi tocado** — `git diff --stat` não deve listar esse arquivo nem `src/providers/whatsapp/webhook/core.ts`;
- `runInBackground` já está definida neste mesmo arquivo (busque `function runInBackground` — deve haver exatamente 1 ocorrência, a já existente; esta task não duplica nem move essa função);
- o caminho de falha de download (`setMessageMedia(id, null, "failed")`, chamado por `core.ts` no catch) cai no `downloadStatus === "ok"` como `false` — não dispara transcrição, como esperado.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/whatsapp-webhook/index.ts
git commit -m "feat(whatsapp): trigger background audio transcription after successful media download"
```

---

### Task 9: Edge Function `audio-transcribe` (retry manual)

**Files:**
- Create: `supabase/functions/audio-transcribe/index.ts`

**Interfaces:**
- Consumes: `requireAnyCaller` (`_shared/auth.ts`), `HttpError`/`json`/`parseJsonBody` (`_shared/http.ts`), `servePost` (`_shared/serve.ts`), `transcribeMessageAudio` (Task 7).
- Produces: endpoint HTTP `POST /audio-transcribe` (`verify_jwt: true`, default), body `{ messageId: string }`, resposta `{ ok: true, status: 'done'|'failed'|'skipped' }`. Consumido pelo `retryTranscription` do provider Supabase (Task 5).

- [ ] **Step 1: Escrever a Edge Function**

Sem teste dedicado — mesma convenção de `copilot-generate/index.ts`/`ai-generate/index.ts` (handler HTTP sem cobertura Vitest no projeto). Precedente direto de auth+RLS: `copilot-generate/index.ts:88-101`.

```ts
// supabase/functions/audio-transcribe/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * audio-transcribe — 13ª Edge Function. Retry manual da transcrição de áudio
 * inbound (feature `audio_transcription`). O caminho automático (webhook) chama
 * transcribeMessageAudio diretamente, sem HTTP; este endpoint existe só para o
 * botão de retry da UI quando a tentativa automática falhou.
 */

import { requireAnyCaller } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import { transcribeMessageAudio } from "../_shared/ai/transcribeAudio.ts";

servePost(async (req) => {
  const { admin, callerClient } = await requireAnyCaller(req);
  const body = await parseJsonBody(req);
  const messageId = String(body.messageId ?? "");
  if (!messageId) throw new HttpError(400, "messageId é obrigatório");

  // Access check via RLS: the caller can only retry a message in a conversation
  // they can read (can_access_conversation, delegated by messages_select).
  const { data: msg, error: msgErr } = await callerClient
    .from("messages")
    .select("id")
    .eq("id", messageId)
    .maybeSingle();
  if (msgErr) throw new HttpError(500, `message read failed: ${msgErr.message}`);
  if (!msg) throw new HttpError(403, "sem acesso a esta mensagem");

  const result = await transcribeMessageAudio(admin, messageId);
  return json({ ok: true, status: result.status });
});
```

- [ ] **Step 2: Revisão manual**

Confira que:
- a checagem de acesso usa `callerClient` (RLS do chamador), não `admin` — mesmo padrão de `copilot-generate/index.ts:95-101`;
- `transcribeMessageAudio` é chamada com `admin` (service_role), não `callerClient` — precisa bypassar RLS para ler `ai_settings` (owner-only) e escrever em `messages`/`ai_usage_events`;
- não há checagem de papel (`requireAnyCaller`, não `requireCaller`) — qualquer atendente autenticado pode retry, igual ao copiloto.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/audio-transcribe/index.ts
git commit -m "feat(ai): add audio-transcribe Edge Function for manual retry"
```

---

### Task 10: UI — `AudioBubble` com estados reais + retry

**Files:**
- Modify: `src/features/conversations/i18n/pt-BR.ts:305`
- Create: `src/features/conversations/hooks/useRetryTranscription.ts`
- Modify: `src/features/conversations/components/bubbles/AudioBubble.tsx`

**Interfaces:**
- Consumes: `IMessage.transcription`/`transcriptionStatus` (Task 4); `useMessagesProvider().retryTranscription` (Task 5).
- Produces: `useRetryTranscription(): { retry: (messageId: ID) => void; isPending: boolean; pendingMessageId: ID | null }`. Bolha de áudio real (`RealAudioPlayer`) mostra "Transcrevendo…"/texto real/"Transcrição indisponível" + retry; `SimulatedAudioPlayer` (demo) perde a legenda fixa.

- [ ] **Step 1: Atualizar as strings de i18n**

```ts
// src/features/conversations/i18n/pt-BR.ts:305 — antes:
  audioTranscription: "Transcrição em breve",

// depois:
  transcribingAudio: "Transcrevendo…",
  transcriptionUnavailable: "Transcrição indisponível",
  retryTranscription: "Tentar transcrever de novo",
```

- [ ] **Step 2: Criar o hook de retry**

```ts
// src/features/conversations/hooks/useRetryTranscription.ts
import { useMutation } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useMessagesProvider } from "@/providers/data";

/**
 * Thin mutation wrapper over `IMessagesProvider.retryTranscription`. No cache
 * invalidation on success: the Edge Function's UPDATE on `messages` arrives via
 * the existing Realtime channel (useRealtimeMessages), which already patches
 * the bubble in place — same mechanism as delivery-status updates.
 */
export function useRetryTranscription() {
  const messages = useMessagesProvider();
  const mutation = useMutation({
    mutationFn: (messageId: ID) => messages.retryTranscription(messageId),
  });
  return {
    retry: mutation.mutate,
    isPending: mutation.isPending,
    pendingMessageId: (mutation.variables as ID | undefined) ?? null,
  };
}
```

- [ ] **Step 3: Atualizar `RealAudioPlayer` (estados reais)**

```tsx
// src/features/conversations/components/bubbles/AudioBubble.tsx:1-17 — imports, antes:
import { useEffect, useMemo, useRef, useState } from "react";
import type { IMessage } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { getActiveDataSource } from "@/providers/data";
import { BubbleChrome } from "./bubbleChrome";
import { fakeAudioSeconds, formatDuration } from "../../utils/messageDisplay";
import {
  PLAYBACK_RATE_STORAGE_KEY,
  formatPlaybackRate,
  nextPlaybackRate,
  sanitizePlaybackRate,
} from "../../utils/audioPlayback";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl";
import { downloadFileName, triggerMediaDownload } from "../../utils/mediaDownload";

// depois (acrescenta o novo hook):
import { useEffect, useMemo, useRef, useState } from "react";
import type { IMessage } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { getActiveDataSource } from "@/providers/data";
import { BubbleChrome } from "./bubbleChrome";
import { fakeAudioSeconds, formatDuration } from "../../utils/messageDisplay";
import {
  PLAYBACK_RATE_STORAGE_KEY,
  formatPlaybackRate,
  nextPlaybackRate,
  sanitizePlaybackRate,
} from "../../utils/audioPlayback";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl";
import { useRetryTranscription } from "../../hooks/useRetryTranscription";
import { downloadFileName, triggerMediaDownload } from "../../utils/mediaDownload";
```

```tsx
// src/features/conversations/components/bubbles/AudioBubble.tsx:262-264 — antes:
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        {CONVERSATION_STRINGS.audioTranscription}
      </p>
    </BubbleChrome>
  );
}

// depois:
      <TranscriptionCaption message={message} />
    </BubbleChrome>
  );
}

/**
 * Renders the transcription state below the waveform, or nothing when it
 * doesn't apply (old message, non-audio, or the feature was off on arrival).
 * `pending`/`done`/`failed` come from `IMessage.transcriptionStatus`, written
 * server-side by transcribeMessageAudio (webhook trigger or manual retry) and
 * delivered here via Realtime — no polling, no local state for the value itself.
 */
function TranscriptionCaption({ message }: { message: IMessage }) {
  const { retry, isPending, pendingMessageId } = useRetryTranscription();
  const status = message.transcriptionStatus;

  if (!status) return null;

  if (status === "pending") {
    return (
      <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon icon="mdi:loading" size={11} className="animate-spin" />
        {CONVERSATION_STRINGS.transcribingAudio}
      </p>
    );
  }

  if (status === "done") {
    return <p className="mt-1.5 text-[10px] text-muted-foreground">{message.transcription}</p>;
  }

  const retrying = isPending && pendingMessageId === message.id;
  return (
    <button
      type="button"
      onClick={() => retry(message.id)}
      disabled={retrying}
      aria-label={CONVERSATION_STRINGS.retryTranscription}
      className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-60"
    >
      <Icon icon={retrying ? "mdi:loading" : "mdi:refresh"} size={11} className={retrying ? "animate-spin" : undefined} />
      {CONVERSATION_STRINGS.transcriptionUnavailable}
    </button>
  );
}
```

- [ ] **Step 4: Remover a legenda fixa do `SimulatedAudioPlayer` (demo)**

```tsx
// src/features/conversations/components/bubbles/AudioBubble.tsx:301-321 — antes:
  return (
    <BubbleChrome message={message} onRetry={onRetry}>
      <div className="flex items-center gap-2.5">
        <PlayPauseButton
          playing={playing}
          heard={heard}
          onClick={() => {
            if (progress >= totalSeconds) setProgress(0);
            setPlaying((p) => !p);
          }}
        />
        <WaveBars bars={bars} playedRatio={playedRatio} />
        <span className="shrink-0 min-w-[34px] text-right text-[11px] font-medium leading-none text-muted-foreground tabular-nums">
          {formatDuration(playing ? progress : totalSeconds - progress)}
        </span>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        {CONVERSATION_STRINGS.audioTranscription}
      </p>
    </BubbleChrome>
  );
}

// depois (remove o <p> — mock nunca tem transcriptionStatus real, então a
// legenda fixa era sempre falsa; sem legenda nenhuma é mais honesto que uma
// promessa "em breve" eterna, coerente com a regra de esconder quando não se aplica):
  return (
    <BubbleChrome message={message} onRetry={onRetry}>
      <div className="flex items-center gap-2.5">
        <PlayPauseButton
          playing={playing}
          heard={heard}
          onClick={() => {
            if (progress >= totalSeconds) setProgress(0);
            setPlaying((p) => !p);
          }}
        />
        <WaveBars bars={bars} playedRatio={playedRatio} />
        <span className="shrink-0 min-w-[34px] text-right text-[11px] font-medium leading-none text-muted-foreground tabular-nums">
          {formatDuration(playing ? progress : totalSeconds - progress)}
        </span>
      </div>
    </BubbleChrome>
  );
}
```

- [ ] **Step 5: Type-check e regressão**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "AudioBubble|useRetryTranscription|i18n/pt-BR"`
Expected: nenhuma linha nova de erro (confirme em particular que não sobrou nenhuma referência a `CONVERSATION_STRINGS.audioTranscription`, removida no Step 1 — `bunx tsc` acusaria "Property 'audioTranscription' does not exist" em qualquer uso esquecido).

Run: `bun run test`
Expected: PASS (suíte completa — nenhuma mudança de comportamento em outros bubbles/hooks).

Run: `bun run lint`
Expected: sem novos erros nos arquivos tocados.

- [ ] **Step 6: Verificação manual (você, não o agente)**

Este é um passo de UI — a validação visual (bolha exibindo "Transcrevendo…"/texto real/erro+retry) é feita por você no navegador, não pelo agente (não há teste de componente automatizado no projeto para esta família de bubbles, e a verificação de UI é sempre manual por instrução do projeto). Sugestão de roteiro depois do deploy completo (Tasks 1-9 aplicadas em produção): mandar um áudio de teste, observar "Transcrevendo…" aparecer em segundos e virar o texto real sozinho, sem recarregar a página.

- [ ] **Step 7: Commit**

```bash
git add src/features/conversations/i18n/pt-BR.ts src/features/conversations/hooks/useRetryTranscription.ts src/features/conversations/components/bubbles/AudioBubble.tsx
git commit -m "feat(conversations): show real transcription state in AudioBubble"
```

---

## Rollout (fora do escopo de execução automática deste plano)

As Tasks 1-10 deixam tudo implementado, testado e commitado localmente. Para ir ao ar, faltam ações que exigem confirmação explícita do dono do projeto (não devem ser executadas por um subagente sem essa confirmação):

1. Aplicar as 2 migrations (Tasks 1 e 2) no projeto Supabase de produção.
2. Deploy de `whatsapp-webhook` (Task 8) e `audio-transcribe` (Task 9, nova função).
3. Confirmar `OPENROUTER_API_KEY` no Vault (Configurações → Integrações → Chaves & API) — as 5 funcionalidades já em produção usam OpenRouter/OpenAI, então a chave provavelmente já existe.
4. Owner liga manualmente o toggle "Transcrição de áudio" em Configurações → IA → Funcionalidades.
5. Smoke: mandar um áudio de teste, confirmar a transcrição na bolha e a linha em `ai_usage_events`.
