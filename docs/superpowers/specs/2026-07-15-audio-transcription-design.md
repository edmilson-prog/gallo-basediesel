# Design — Transcrição automática de áudios (voice notes inbound)

> **Data:** 2026-07-15
> **Status:** aprovado (brainstorming) — aguardando revisão da spec
> **Feature key de IA:** `audio_transcription`
> **Escopo:** só inbound (cliente → nós); outbound (vendedor grava e envia) fica fora

## 1. Contexto

A bolha de áudio do Inbox (`AudioBubble.tsx`) toca o arquivo real via signed URL, mas
sempre mostra uma legenda **fixa e hardcoded** abaixo do player:

```tsx
// src/features/conversations/components/bubbles/AudioBubble.tsx:262-264 e 317-319
<p className="mt-1.5 text-[10px] text-muted-foreground">
  {CONVERSATION_STRINGS.audioTranscription}
</p>
```

`CONVERSATION_STRINGS.audioTranscription = "Transcrição em breve"`
(`src/features/conversations/i18n/pt-BR.ts:305`) — nunca lê nenhum dado real, porque
**não existe nenhum campo de transcrição em `IMessage`/tabela `messages`** hoje.

A área **Configurações → Inteligência artificial → Funcionalidades**
(`/app/configuracoes/ia`, aba `AiFeaturesTab.tsx`) já roteia 5 funcionalidades reais em
produção — Copiloto de conversa, Copiloto analítico, SDR, Identificação de peça e
Insights — todas hoje configuradas via **OpenRouter/OpenAI**, com liga/desliga por linha,
teto de orçamento mensal e dashboard de uso (`ai_usage_events`). Essa tela é o lugar onde
o dono escolhe o LLM de cada funcionalidade, e é onde a nova funcionalidade de transcrição
deve aparecer como uma 6ª linha.

Existe um contrato de transcrição já pronto — mas em outra superfície: `IMediaAsset.transcription`
(Vault/Biblioteca de mídia, PRD-026) tem tipo, coluna real no banco
(`media_assets.transcription`) e leitura/escrita completas no provider, porém **nunca é
escrito em produção** — é preenchido só pelo gerador mock. Por decisão explícita (ver §2),
esta feature **não** mexe nessa segunda superfície.

O OpenRouter lançou recentemente um endpoint dedicado de transcrição
(`POST /api/v1/audio/transcriptions`), que devolve `usage.cost` real em USD — o mesmo
mecanismo que `_shared/ai/adapters.ts:computeCostBRL()` já sabe consumir via
`usdCostOverride` (usado hoje pelo `callOpenRouter` do chat). Isso elimina a necessidade
de uma tabela de preço por minuto de áudio: o custo vem pronto do provedor.

## 2. Escopo

### Entra

- Toda mensagem inbound com `mediaType === 'audio'` e download de mídia bem-sucedido
  passa a ser transcrita **automaticamente em segundo plano**, assim que o download
  termina no webhook — sem atrasar a resposta HTTP ao provedor (Meta/Evolution/etc.).
- Nova funcionalidade roteada **"Transcrição de áudio"** na aba Funcionalidades
  (Configurações → IA), com liga/desliga, escolha de modelo (fixado no provedor
  **OpenRouter** — único com adapter de transcrição), teto de orçamento e dashboard de
  uso reaproveitados sem nenhuma mudança.
- `AudioBubble` passa a ter 3 estados reais em vez do texto fixo: "Transcrevendo…"
  (pending), texto real da transcrição (done), "Transcrição indisponível" + retry manual
  (failed). Legenda **some completamente** quando não se aplica (mensagem antiga,
  não-áudio, ou funcionalidade desligada no momento do recebimento).
- Nova Edge Function `audio-transcribe` (a 13ª), exposta via HTTP **só para o retry
  manual** disparado pelo atendente na UI.
- Novo módulo compartilhado `_shared/ai/transcribeAudio.ts` com a lógica central
  (baixar bytes do Storage, resolver chave, checar orçamento, chamar OpenRouter, gravar
  uso, atualizar a mensagem) — reaproveitado pelos dois chamadores (automático e manual).
- 2 migrations: (a) colunas novas em `messages`; (b) backfill de uma linha nova em
  `ai_settings.routing` (jsonb) do singleton já existente em produção, **desligada por
  padrão**.

### Não entra (deferido)

- Áudio outbound (nota de voz que o próprio atendente grava e envia).
- Espelhar a transcrição em `media_assets.transcription` (Vault/Biblioteca de mídia) —
  decisão explícita do dono; essa segunda superfície continua mock-only por enquanto.
- Detecção de idioma / tradução automática (a transcrição sai no idioma falado).
- Outro provedor de STT fora do OpenRouter (Groq, Deepgram, Azure Speech etc.).
- Retry automático em loop — só manual, um clique por vez, para não gerar custo repetido
  em áudio sistematicamente problemático.
- Streaming ou transcrição parcial enquanto o áudio ainda está sendo baixado.
- Esconder campos de temperatura/prompt (que não fazem sentido pra transcrição) na tela
  de Funcionalidades — cosmético, fica pra depois se incomodar.

## 3. Modelo de dados

### 3.1 `messages` (migration nova)

```sql
alter table public.messages
  add column transcription text,
  add column transcription_status text
    check (transcription_status in ('pending', 'done', 'failed'));
```

Sem mudança de RLS: as policies `messages_select/insert/update/delete` já delegam para
`can_access_conversation(conversation_id)` (`supabase/migrations/20260615130400_whatsapp_multi_rls_delegate.sql:9-33`),
que cobre a linha inteira — qualquer coluna nova herda a mesma proteção automaticamente.

`NULL` (o default) = **"não se aplica"**: mensagem antiga, mensagem não-áudio, ou a
funcionalidade estava desligada no momento em que o áudio chegou. A bolha não mostra
nenhuma legenda nesse caso — resolve o "em breve" eterno do print original.

### 3.2 `ai_settings.routing` (migration de dados — backfill do singleton)

O registro `id=1` já existe em produção com 5 entradas em `routing` (confirmado no
print da tela: Copiloto de conversa, Copiloto analítico, SDR, Identificação de peça,
Insights — todas já ativas via OpenRouter/OpenAI). A tela só desenha o que já está
persistido:

```tsx
// src/features/ai-settings/pages/AiFeaturesTab.tsx:19
{settings.routing.map((r) => (
  <FeatureRoutingRow key={r.feature} route={r} providers={settings.providers} onChanged={reload} />
))}
```

E `updateFeatureRouting` só **edita** uma entrada existente — não cria:

```ts
// src/providers/data/impl/supabase/ai.ts:172-179
async updateFeatureRouting(feature, patch) {
  const s = rowToSettings(await loadSettingsRow());
  const routing = s.routing.map((r) => (r.feature === feature ? { ...r, ...patch } : r));
  const updated = routing.find((r) => r.feature === feature);
  if (!updated) throw new Error(`routing ${feature} não encontrado`);
  ...
}
```

Ou seja: só adicionar `"audio_transcription"` no código **não é suficiente** — a linha
não aparece na tela em produção até o registro já persistido ganhar essa entrada. Migration
de dados:

```sql
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

- Fica **desligada por padrão** (`enabled: false`) — o Owner liga manualmente na tela
  quando confirmar a chave `OPENROUTER_API_KEY` no Vault, igual ao fluxo das outras 5.
- `model: 'openai/whisper-1'` é só o seed inicial — o nome exato do modelo/slug precisa
  ser confirmado no OpenRouter durante a implementação (ver §7).
- `params`/`systemPrompt` não têm uso real em transcrição, mas o tipo `IAiFeatureRouting`
  os exige — ficam com valores neutros só para não quebrar o contrato.

## 4. Arquitetura & fluxo — caminho automático

```
[qualquer engine WhatsApp: Meta / Evolution / EvolutionGo / OpenWA / WAHA]
        │  webhook chega em supabase/functions/whatsapp-webhook/index.ts
        ▼
core.ts (runtime-agnostic, compartilhado entre os 5 engines — INTOCADO por esta feature)
   baixa o áudio (downloadInboundMedia) → db.uploadMedia(...) → db.setMessageMedia(id, path, 'ok')
        │  (db.setMessageMedia é dependência INJETADA, implementada em index.ts — não no core)
        ▼
whatsapp-webhook/index.ts: setMessageMedia(messageId, mediaUrl, downloadStatus)  [~linha 501]
   UPDATE messages SET media_url=…, media_download_status=…
     .select("media_type")        ← extensão pontual: pega media_type de volta na mesma query
   se downloadStatus === 'ok' && media_type === 'audio':
     UPDATE messages SET transcription_status = 'pending' WHERE id = messageId
     runInBackground(transcribeMessageAudio(admin, messageId))
        │  runInBackground já existe neste arquivo (~linha 710, usa EdgeRuntime.waitUntil)
        │  NÃO bloqueia a resposta HTTP — o webhook já respondeu 200 pro provedor
        ▼
_shared/ai/transcribeAudio.ts → transcribeMessageAudio(admin, messageId):
   1. lê ai_settings (master_enabled + routing['audio_transcription'])
      → desligado/ausente: UPDATE transcription_status = null (volta a "não se aplica"), sai
   2. teto de orçamento mensal (mesmo cálculo de copilot-generate: soma cost_brl do mês)
      → estourado: transcription_status = 'failed', sai
   3. busca media_url da mensagem e baixa os bytes reais:
        admin.storage.from('whatsapp-media').download(path)   ← service_role, sem signed URL
   4. resolve OPENROUTER_API_KEY no Vault (createSecretResolver — mesmo padrão dos outros)
   5. POST https://openrouter.ai/api/v1/audio/transcriptions (multipart: file + model)
   6. grava ai_usage_events (source='routed', feature='audio_transcription', cost via usage.cost)
   7. sucesso → UPDATE messages SET transcription = texto, transcription_status = 'done'
      falha/timeout → UPDATE messages SET transcription_status = 'failed'
        ▼
Postgres Changes (evento UPDATE em messages) → useRealtimeMessages.ts → merge no cache
        ▼
AudioBubble re-renderiza sozinha com o texto (ou o estado de erro) — sem ação do usuário
```

Ponto de design importante: a lógica de IA fica **inteiramente fora** de
`src/providers/whatsapp/` (a camada runtime-agnostic compartilhada entre os 5 engines via
`scripts/sync-whatsapp-shared.ts`). O gatilho vive só na implementação de
`setMessageMedia` dentro de `whatsapp-webhook/index.ts` — uma dependência injetada que já
pertence à camada Supabase-specific, não ao core. Isso evita qualquer risco na área mais
sensível e compartilhada do projeto.

## 5. Arquitetura & fluxo — caminho manual (retry)

```
AudioBubble (estado failed) → botão retry
        ▼
supabase.functions.invoke('audio-transcribe', { messageId })   ← JWT do atendente
        ▼
Edge audio-transcribe (NOVA, 13ª, verify_jwt=true)
   1. requireAnyCaller(req)                     → callerClient com RLS (qualquer atendente, não Owner-only)
   2. valida acesso à mensagem/conversa          → SELECT via callerClient (can_access_conversation)
   3. chama a MESMA transcribeMessageAudio(admin, messageId) do módulo compartilhado (§4)
   4. retorna { ok, status }
```

Precedente direto: `copilot-generate/index.ts` (12ª Edge Function) — mesmo padrão de
`requireAnyCaller` + validação de acesso via `callerClient` + leitura de `ai_settings`
via `admin` + budget cap + Vault + `ai_usage_events`. `audio-transcribe` só delega a
chamada ao LLM/provedor para o módulo compartilhado em vez de repetir a lógica.

## 6. Backend — detalhamento

- **`supabase/functions/_shared/ai/transcribeAudio.ts`** (novo): exporta
  `transcribeMessageAudio(admin: SupabaseClient, messageId: string): Promise<{status: 'done'|'failed'|'skipped'}>`.
  Reaproveita `createSecretResolver` (`_shared/secrets.ts`) e `computeCostBRL`
  (`_shared/ai/adapters.ts`) tal como estão hoje.
- **`supabase/functions/_shared/ai/adapters.ts`**: novo adapter
  `callOpenRouterTranscription(apiKey, audioBytes, mimeType, model, signal): Promise<{text: string, usdCost?: number}>`
  — `multipart/form-data` (evita ~33% de overhead do base64 em arquivos de áudio),
  campos `model` + `file`. Response shape exato (nome do campo de texto, presença de
  `usage.cost`) a confirmar contra a doc/teste real do OpenRouter (§7).
- **`whatsapp-webhook/index.ts`**: extensão pontual de `setMessageMedia` (linha ~501) —
  acrescenta `.select("media_type").maybeSingle()` ao update existente e, quando
  `downloadStatus === 'ok' && media_type === 'audio'`, marca `transcription_status='pending'`
  e dispara `runInBackground(transcribeMessageAudio(admin, messageId))`. Zero mudança em
  `core.ts` ou no arquivo espelhado `_shared/whatsapp/webhook/core.ts`.
- **`supabase/functions/audio-transcribe/index.ts`** (novo): thin wrapper HTTP, ver §5.
- **`ai_usage_events`**: nenhuma migration de schema — `input_tokens`/`output_tokens`
  ficam `0` (não fazem sentido em transcrição), `cost_brl` vem do `usage.cost` do
  OpenRouter via `computeCostBRL(..., usdCostOverride)`, sem tocar em pricing por token.

## 7. Frontend — detalhamento

- **`src/shared/types/ai.ts`**: `AiFeatureKey` ganha `"audio_transcription"` (linha 5-10);
  `AI_FEATURE_LABELS` ganha `audio_transcription: "Transcrição de áudio"` (linha 123-129).
- **`src/providers/data/engine/aiCatalog.ts`**: `FEATURES` ganha o novo key (linha 52-58).
- **`src/shared/types/conversation.ts`**: `IMessage` ganha
  `transcription?: string` e `transcriptionStatus?: 'pending' | 'done' | 'failed'`
  (ao lado dos campos de mídia existentes, linha ~221-224).
- **`src/providers/data/impl/supabase/messages.ts`**: `MessageRow` + `COLUMNS` (linha
  57-60) + `rowToMessage` (linha 70-93) ganham as 2 colunas novas.
- **`src/features/conversations/hooks/useRealtimeMessages.ts`**: `IMessageRealtimeRow`
  (linha 10-27) + `rowToMessage` local (linha 52-71) ganham os mesmos 2 campos — mesmo
  padrão já usado para `failure_reason`/`failure_code`, que chegam via `UPDATE` e fazem
  merge raso no cache do TanStack Query sem refetch completo.
- **`src/features/conversations/components/bubbles/AudioBubble.tsx`**: a legenda fixa
  (linhas 262-264 e 317-319) vira uma renderização condicional por `transcriptionStatus`:
  - `undefined`/`null` → nada.
  - `'pending'` → "Transcrevendo…" com ícone discreto (sem alterar a altura da bolha).
  - `'done'` → texto de `message.transcription`.
  - `'failed'` → "Transcrição indisponível" + ícone de retry clicável, reaproveitando o
    padrão `onRetry` que a bolha já usa para falha de download de mídia; o clique chama
    `audio-transcribe` (§5).
- **`src/features/conversations/i18n/pt-BR.ts`**: `audioTranscription` (linha 305) some
  do texto fixo; entram `transcribingAudio`, `transcriptionUnavailable`,
  `retryTranscription` (nomes de exemplo, ajustar durante o plano).

## 8. Itens em aberto para a fase de implementação

- Confirmar o(s) modelo(s) de transcrição realmente disponíveis no OpenRouter e seus
  slugs exatos (`openai/whisper-1` é um chute razoável, não confirmado) — via
  `GET /api/v1/models` filtrando por capacidade de áudio, ou pela doc de transcrição.
- Confirmar o shape exato da resposta de `POST /api/v1/audio/transcriptions` (nome do
  campo de texto — Whisper da OpenAI usa `text`; assumir o mesmo até confirmar) e se
  `usage.cost` realmente vem populado nesse endpoint como já vem no `/chat/completions`.
- Confirmar se o engine WAHA implementa `downloadInboundMedia` para áudio — não foi
  encontrada implementação explícita durante a exploração; pode estar caindo em um
  fallback genérico. Vale um teste pontual antes do rollout, não bloqueia o desenho.
- Decidir, durante o plano, o nome final das chaves i18n e o ícone exato de "Transcrevendo…"
  (cosmético).

## 9. Testes

- Não existe hoje nenhum teste automatizado para `AudioBubble.tsx` (nem para os demais
  bubbles de mídia) — este seria o primeiro. Cobrir com Vitest + Testing Library os 3
  estados condicionais (`pending`/`done`/`failed`/ausente) é viável e será incluído no
  plano; o player de áudio em si (elemento `<audio>`) segue sem cobertura automatizada,
  como já é hoje.
- `transcribeMessageAudio` e o novo adapter `callOpenRouterTranscription`: sem infra de
  teste automatizado para Edge Functions Deno hoje no projeto (mesma limitação de
  `copilot-generate`/`ai-generate`) — validação por smoke manual, igual aos demais Edge
  Functions de IA.
- Engines puros existentes (nenhum novo necessário além do adapter — a lógica de
  decisão de estado já é coberta pelos 3 estados da UI acima).

## 10. Rollout

1. Aplicar as 2 migrations (colunas em `messages` + backfill de `ai_settings.routing`).
2. Deploy de `whatsapp-webhook` (index.ts atualizado) + `audio-transcribe` (função nova).
3. Confirmar `OPENROUTER_API_KEY` no Vault (já deve existir — as 5 funcionalidades atuais
   já rodam OpenRouter em produção).
4. Owner liga manualmente o toggle "Transcrição de áudio" na aba Funcionalidades.
5. Smoke: mandar um áudio de teste para um número conectado, confirmar que a transcrição
   aparece na bolha em poucos segundos, confirmar a linha correspondente em
   `ai_usage_events`.
