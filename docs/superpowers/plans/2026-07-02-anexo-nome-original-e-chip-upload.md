# Anexos: nome original + chip de envio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir o nome original de arquivos de mídia em `messages.media_filename` (enviados, recebidos e importados) e exibi-lo na bolha/galeria/viewer/download; adicionar um chip "Enviando anexo…" no composer durante o upload.

**Architecture:** Coluna nova nullable em `messages` flui automaticamente pelas RPCs (`SETOF public.messages` + `m.*`). O nome já viaja pelo pipeline de envio e pelos payloads crus dos webhooks — as mudanças são pontos de captura/persistência + mapeamentos row→`IMessage` + fallback `mediaFilename ?? fileNameFromUrl(url)` na UI. O chip replica o padrão `sendingVoice` já validado no composer.

**Tech Stack:** React 19 + TS strict, Vitest (node env, sem @testing-library), Supabase (Postgres + Edge Functions Deno), espelho `_shared/whatsapp/` gerado por `scripts/sync-whatsapp-shared.ts`.

**Spec:** `docs/superpowers/specs/2026-07-02-anexo-nome-original-e-chip-upload-design.md`

## Global Constraints

- Branch de trabalho: `feat/attachment-filename-upload-chip` (já criada). NUNCA commitar em `main`, NUNCA mergear.
- Commits: Conventional Commits em inglês, atômicos, terminando com a linha `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- `git add` SEMPRE com caminhos explícitos — nunca `git add .` (o working tree tem `src/routeTree.gen.ts` regenerado e untracked alheios: `.serena/`, `graphify-out/`, `knip.json`, `package-lock.json` etc. — NÃO tocar).
- UI/strings de usuário: pt-BR com acentos corretos. Comentários de código: inglês. Tokens semânticos apenas (`bg-muted`, `text-foreground`…), nunca `--gallo-*`/hex.
- Testes: Vitest node env, co-localizados, sem DOM/@testing-library — testar apenas funções puras exportadas. Rodar via `bun run test` (suíte inteira) ou `bunx vitest run <arquivo>` (pontual).
- `bun run build` NÃO type-checka; `bunx tsc --noEmit` tem ~315 erros de baseline — avaliar SÓ por delta nos arquivos tocados.
- Zona congelada do atendimento (cache/query keys/RPCs/signing #137): tocar APENAS os pontos aditivos listados (2 linhas no mapper local de `useRealtimeMessages.ts`). Nada além.
- `src/providers/whatsapp/**` mudou ⇒ o espelho `supabase/functions/_shared/whatsapp/**` fica stale até a Task 12 rodar o sync — NÃO editar o espelho à mão (banner AUTO-GENERATED).
- NÃO aplicar migration em prod e NÃO deployar Edge Functions durante as tasks — isso é a Fase de Rollout, gated no OK do dono.

## File Map

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `supabase/migrations/20260702130000_messages_media_filename.sql` | Create | Coluna `media_filename` |
| `src/shared/types/conversation.ts` | Modify | `IMessage.mediaFilename?` |
| `src/providers/data/impl/supabase/messages.ts` | Modify | Row/COLUMNS/mapeamento/insert |
| `src/features/conversations/hooks/useRealtimeMessages.ts` | Modify | Mapper local (aditivo) |
| `src/features/conversations/engine/conversationMedia.ts` (+test) | Modify | `IConversationMediaItem.fileName?` |
| `src/features/conversations/components/bubbles/DocumentBubble.tsx` | Modify | Nome/ícone/download |
| `src/features/conversations/components/media/MediaThumb.tsx` | Modify | Tile documento |
| `src/features/conversations/components/media/MediaViewerDialog.tsx` | Modify | Header/download |
| `src/providers/whatsapp/send/core.ts` (+test) | Modify | Persistir fileName no insert |
| `src/features/conversations/hooks/useMessageSend.ts` | Modify | Otimista + ramo mock |
| `src/features/quick-send/hooks/useSendAsset.ts` | Modify | fileName no envio de ativo |
| `src/providers/whatsapp/types.ts` | Modify | `mediaFilename?` nos shapes inbound |
| `src/providers/whatsapp/evolution/parser.ts` (+test) | Modify | Extrair fileName |
| `src/providers/whatsapp/evolution-go/parser.ts` (+test) | Modify | Extrair fileName |
| `src/providers/whatsapp/meta/parser.ts` (+`MetaCloudProvider.test.ts`) | Modify | Extrair filename |
| `src/providers/whatsapp/webhook/core.ts` (+test) | Modify | Contratos + passthrough |
| `src/providers/whatsapp/import/core.ts` (+test) | Modify | `INormalizedRecord.mediaFilename?` |
| `src/providers/whatsapp/import/history-core.ts` (+test) | Modify | Idem (Go HistorySync) |
| `supabase/functions/_shared/import-db.ts` | Modify | INSERT import (à mão, fora do espelho) |
| `supabase/functions/_shared/whatsappSendAdapter.ts` | Modify | INSERT outbound (à mão) |
| `supabase/functions/whatsapp-webhook/index.ts` | Modify | INSERTs inbound/echo (à mão) |
| `src/features/conversations/i18n/pt-BR.ts` | Modify | Strings do chip |
| `src/features/conversations/components/MessageInput.tsx` | Modify | Chip + travas |
| `supabase/functions/_shared/whatsapp/**` | Regenerate | `scripts/sync-whatsapp-shared.ts` (Task 12) |

---

### Task 1: Migration `messages.media_filename`

**Files:**
- Create: `supabase/migrations/20260702130000_messages_media_filename.sql`

**Interfaces:**
- Produces: coluna `public.messages.media_filename text` (nullable) — todas as tasks seguintes assumem que ela existirá em prod no rollout.

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- Original filename of a media message (document label in the bubble/gallery/
-- download). Nullable: legacy rows and media without a client-provided name
-- degrade to the current behavior (name derived from the storage path).
-- Read path needs NO function change: `conversation_messages` and
-- `last_messages_for_conversations` RETURN SETOF public.messages with m.*.
alter table public.messages
  add column if not exists media_filename text;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260702130000_messages_media_filename.sql
git commit -m "feat(db): add messages.media_filename for original attachment names"
```

⚠️ NÃO aplicar em prod agora — Fase de Rollout (gated no OK do dono).

---

### Task 2: `IMessage.mediaFilename` + provider supabase

**Files:**
- Modify: `src/shared/types/conversation.ts:136-137`
- Modify: `src/providers/data/impl/supabase/messages.ts:37-59,69-91,133-147`

**Interfaces:**
- Produces: `IMessage.mediaFilename?: string` (todas as tasks de UI/hooks consomem); `MessageRow.media_filename: string | null`.

- [ ] **Step 1: Adicionar o campo ao tipo de domínio**

Em `src/shared/types/conversation.ts`, logo após `mediaUrl?: string;` (linha 137):

```ts
  mediaType?: MessageMediaType;
  mediaUrl?: string;
  /** Original filename of the media (documents) — falls back to the storage path tail when absent. */
  mediaFilename?: string;
```

- [ ] **Step 2: Estender o provider supabase**

Em `src/providers/data/impl/supabase/messages.ts`:

(a) `MessageRow` — após `media_url: string | null;` (linha 46):

```ts
  media_url: string | null;
  media_filename: string | null;
```

(b) `COLUMNS` (linhas 57-59) — acrescentar a coluna:

```ts
const COLUMNS =
  "id, conversation_id, direction, author_type, author_id, provider, text, media_type, " +
  "media_url, media_filename, status, sent_at, delivered_at, read_at, failure_reason, failure_code, created_at";
```

(c) `rowToMessage` — após `mediaUrl: row.media_url ?? undefined,` (linha 79):

```ts
    mediaUrl: row.media_url ?? undefined,
    mediaFilename: row.media_filename ?? undefined,
```

(d) row de INSERT do método `send` — após `media_url: input.mediaUrl ?? null,` (linha 142):

```ts
      media_url: input.mediaUrl ?? null,
      media_filename: input.mediaFilename ?? null,
```

(`MessageSendInput` é `Omit<IMessage, …>` — ganha `mediaFilename` automaticamente.)

- [ ] **Step 3: Verificar tipos por delta e commitar**

Run: `bunx tsc --noEmit 2>&1 | grep -E "conversation\.ts|impl/supabase/messages\.ts"`
Expected: nenhuma linha nova (silêncio).

```bash
git add src/shared/types/conversation.ts src/providers/data/impl/supabase/messages.ts
git commit -m "feat(messages): mediaFilename field on IMessage + supabase row mapping"
```

---

### Task 3: Mapper local do Realtime (aditivo — zona congelada)

**Files:**
- Modify: `src/features/conversations/hooks/useRealtimeMessages.ts:10-26,51-69`

**Interfaces:**
- Consumes: `IMessage.mediaFilename?` (Task 2).
- Produces: bolhas chegadas via postgres_changes carregam o nome sem refetch.

- [ ] **Step 1: Estender interface e mapper (SOMENTE isto — zona congelada)**

Em `IMessageRealtimeRow`, após `media_url: string | null;` (linha 19):

```ts
  media_url: string | null;
  media_filename: string | null;
```

No `rowToMessage` local, após `mediaUrl: row.media_url ?? undefined,` (linha 61):

```ts
    mediaUrl: row.media_url ?? undefined,
    mediaFilename: row.media_filename ?? undefined,
```

- [ ] **Step 2: Rodar a suite do hook (sem regressão)**

Run: `bunx vitest run src/features/conversations/hooks/useRealtimeMessages.test.ts`
Expected: PASS (todos os casos existentes).

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/hooks/useRealtimeMessages.ts
git commit -m "feat(realtime): map media_filename on the local message row mapper"
```

---

### Task 4: `IConversationMediaItem.fileName` + UI (bolha, tile, viewer)

**Files:**
- Modify: `src/features/conversations/engine/conversationMedia.ts:7-19,44-63`
- Test: `src/features/conversations/engine/conversationMedia.test.ts`
- Modify: `src/features/conversations/components/bubbles/DocumentBubble.tsx:21`
- Modify: `src/features/conversations/components/media/MediaThumb.tsx:62-80`
- Modify: `src/features/conversations/components/media/MediaViewerDialog.tsx:39-44`

**Interfaces:**
- Consumes: `IMessage.mediaFilename?` (Task 2).
- Produces: `IConversationMediaItem.fileName?: string` populado por `messageToMediaItem`.

- [ ] **Step 1: Escrever o teste que falha (engine)**

Em `conversationMedia.test.ts`, dentro do describe de `messageToMediaItem` (seguir o factory de mensagem que o arquivo já usa; se não houver, montar o `IMessage` mínimo inline como abaixo):

```ts
it("propagates the original mediaFilename to the media item", () => {
  const item = messageToMediaItem({
    id: "m1",
    conversationId: "c1",
    direction: "in",
    authorType: "customer",
    provider: "evolution",
    text: "",
    mediaType: "document",
    mediaUrl: "conversations/c1/m1/media.pdf",
    mediaFilename: "Catalogo-UFI.pdf",
    status: "delivered",
    sentAt: "2026-07-02T12:00:00.000Z",
  });
  expect(item?.fileName).toBe("Catalogo-UFI.pdf");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/features/conversations/engine/conversationMedia.test.ts`
Expected: FAIL — `fileName` é `undefined` (propriedade inexistente).

- [ ] **Step 3: Implementar no engine**

Em `IConversationMediaItem`, após `caption?: string;` (linha 15):

```ts
  caption?: string;
  /** Original filename (documents) — preferred over deriving from mediaUrl. */
  fileName?: string;
```

Em `messageToMediaItem`, após `caption: message.text ? message.text : undefined,` (linha 58):

```ts
    caption: message.text ? message.text : undefined,
    fileName: message.mediaFilename,
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bunx vitest run src/features/conversations/engine/conversationMedia.test.ts`
Expected: PASS.

- [ ] **Step 5: Aplicar nos 3 pontos de UI**

(a) `DocumentBubble.tsx` linha 21:

```ts
  const fileName = message.mediaFilename ?? (fileNameFromUrl(message.mediaUrl) || "anexo.pdf");
```

(b) `MediaThumb.tsx` — no branch de documento: `existingName` (linha 70) e o rótulo do tile (linha 79) + aria-label (linha 75):

```ts
              existingName: item.fileName ?? fileNameFromUrl(item.mediaUrl),
```

```tsx
        aria-label={`${CONVERSATION_STRINGS.downloadDocument}: ${item.fileName || item.caption || "documento"}`}
```

```tsx
        <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1 py-0.5 text-center text-[10px]">
          {item.fileName || item.caption || "Documento"}
        </span>
```

(c) `MediaViewerDialog.tsx` linha 43:

```ts
    existingName: item.kind === "document" ? (item.fileName ?? fileNameFromUrl(item.mediaUrl)) : undefined,
```

- [ ] **Step 6: Gate e commit**

Run: `bun run build` — Expected: sucesso.
Run: `bunx tsc --noEmit 2>&1 | grep -E "conversationMedia|DocumentBubble|MediaThumb|MediaViewerDialog"` — Expected: silêncio.

```bash
git add src/features/conversations/engine/conversationMedia.ts src/features/conversations/engine/conversationMedia.test.ts src/features/conversations/components/bubbles/DocumentBubble.tsx src/features/conversations/components/media/MediaThumb.tsx src/features/conversations/components/media/MediaViewerDialog.tsx
git commit -m "feat(conversations): show original attachment filename in bubble, gallery and viewer"
```

---

### Task 5: Persistir `fileName` no send core (TDD)

**Files:**
- Modify: `src/providers/whatsapp/send/core.ts:97-106,300-308`
- Test: `src/providers/whatsapp/send/core.test.ts` (após o teste da linha 176-197)

**Interfaces:**
- Produces: `ISendDb.insertQueuedMessage` input ganha `fileName?: string | null` — a Task 12 fará o adapter gravar `media_filename`. Campo OPCIONAL para não quebrar fakes/adapters existentes.

- [ ] **Step 1: Escrever o teste que falha**

Em `core.test.ts`, logo após o teste `"media: forwards the original fileName to the engine for documents (PRD-119)"` (usa os mesmos helpers `makeDb`/`send`/`SELLER` do arquivo; `calls.queued` registra os inputs de `insertQueuedMessage`):

```ts
  it("media: persists the original fileName on the queued row", async () => {
    const { db, calls } = makeDb();
    const engine = new MockWhatsAppProvider();

    await send(
      {
        kind: "media",
        mediaPath: "https://signed.test/quote.pdf",
        mediaType: "document",
        text: "",
        fileName: "orçamento.pdf",
      },
      db,
      SELLER,
      engine,
    );

    expect(calls.queued[0]).toMatchObject({ fileName: "orçamento.pdf" });
  });

  it("text: persists fileName as null on the queued row", async () => {
    const { db, calls } = makeDb();

    await send({ kind: "text", text: "olá" }, db);

    expect(calls.queued[0]).toMatchObject({ fileName: null });
  });
```

(Se `calls.queued` registrar outro shape, adaptar a asserção ao registro real do harness — mas manter o comportamento asserido: media → nome, text → null.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/providers/whatsapp/send/core.test.ts`
Expected: FAIL — `fileName` ausente do input registrado.

- [ ] **Step 3: Implementar**

Em `ISendDb.insertQueuedMessage` (linhas 97-106), após `mediaUrl: string | null;`:

```ts
    mediaUrl: string | null;
    /** Original filename (documents) persisted as messages.media_filename. */
    fileName?: string | null;
```

Na chamada (linhas 300-308), após `mediaUrl: …`:

```ts
    mediaUrl: input.kind === "media" ? (input.mediaPath ?? null) : null,
    fileName: input.kind === "media" ? (input.fileName ?? null) : null,
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bunx vitest run src/providers/whatsapp/send/core.test.ts`
Expected: PASS (novos + existentes).

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/send/core.ts src/providers/whatsapp/send/core.test.ts
git commit -m "feat(whatsapp-send): thread fileName into the queued message insert"
```

---

### Task 6: Otimista + ramo mock + biblioteca de ativos

**Files:**
- Modify: `src/features/conversations/hooks/useMessageSend.ts:135-155,201-208`
- Modify: `src/features/quick-send/hooks/useSendAsset.ts:142-146`

**Interfaces:**
- Consumes: `IMessage.mediaFilename?` (Task 2); `ISendOptions.fileName?` (já existe, useMessageSend.ts:73).

- [ ] **Step 1: Mensagem otimista com o nome**

Em `useMessageSend.ts`, no objeto `optimistic` (linhas 149-150), após `mediaUrl,`:

```ts
        mediaType,
        mediaUrl,
        mediaFilename: fileName,
```

- [ ] **Step 2: Ramo mock repassa o nome**

No `provider.send` do ramo não-supabase (linhas 202-208):

```ts
        const real = await provider.send(conversation.id, {
          authorType: "seller",
          authorId: currentUser?.id,
          text: optimistic.text,
          mediaType,
          mediaUrl,
          mediaFilename: fileName,
        });
```

(`messagesApi.send` do mock persiste via spread `...input` — nenhuma mudança na camada mock.)

- [ ] **Step 3: Biblioteca de ativos envia o título como nome**

Em `useSendAsset.ts` (linhas 142-146):

```ts
          await send({
            text,
            mediaType: assetKindToMediaType(sendable),
            mediaUrl,
            fileName: sendable.title,
          });
```

- [ ] **Step 4: Gate e commit**

Run: `bun run build` — Expected: sucesso.
Run: `bunx tsc --noEmit 2>&1 | grep -E "useMessageSend|useSendAsset"` — Expected: silêncio.

```bash
git add src/features/conversations/hooks/useMessageSend.ts src/features/quick-send/hooks/useSendAsset.ts
git commit -m "feat(conversations): carry attachment filename on optimistic bubble, mock send and asset send"
```

---

### Task 7: Parser Evolution + tipos normalizados (TDD)

**Files:**
- Modify: `src/providers/whatsapp/types.ts:141-147,179-180`
- Modify: `src/providers/whatsapp/evolution/parser.ts:76-104,159-191`
- Test: `src/providers/whatsapp/evolution/parser.test.ts`

**Interfaces:**
- Produces: `IInboundMessage.mediaFilename?: string`, `IOutboundEcho.mediaFilename?: string`, `IEvolutionContent.mediaFilename?: string` — consumidos pelas Tasks 8-11.

- [ ] **Step 1: Escrever os testes que falham**

Em `evolution/parser.test.ts` (seguir o estilo dos casos existentes de `parseEvolutionInbound`):

```ts
  it("inbound document exposes the original fileName as mediaFilename", () => {
    const parsed = parseEvolutionInbound(
      {
        event: "messages.upsert",
        sender: "5555911111111@s.whatsapp.net",
        data: {
          key: { id: "M-doc", remoteJid: "5555988887777@s.whatsapp.net", fromMe: false },
          message: { documentMessage: { fileName: "Catalogo-UFI.pdf", caption: "segue" } },
          messageTimestamp: 1750000000,
        },
      },
      "acc-1",
    );
    expect(parsed).toMatchObject({
      type: "message",
      contentType: "document",
      mediaFilename: "Catalogo-UFI.pdf",
    });
  });

  it("outbound-echo document also carries mediaFilename", () => {
    const parsed = parseEvolutionInbound(
      {
        event: "messages.upsert",
        data: {
          key: { id: "M-echo", remoteJid: "5555988887777@s.whatsapp.net", fromMe: true },
          message: { documentMessage: { fileName: "Tabela-precos.xlsx" } },
          messageTimestamp: 1750000000,
        },
      },
      "acc-1",
    );
    expect(parsed).toMatchObject({ type: "outbound-echo", mediaFilename: "Tabela-precos.xlsx" });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/providers/whatsapp/evolution/parser.test.ts`
Expected: FAIL — `mediaFilename` undefined.

- [ ] **Step 3: Implementar tipos + parser**

(a) `types.ts` — em `IInboundMessage`, após `mediaCaption?: string;` (linha 141):

```ts
  mediaCaption?: string;
  /** Original filename of an inbound document (Meta `document.filename`, Baileys `documentMessage.fileName`). */
  mediaFilename?: string;
```

Em `IOutboundEcho`, após `mediaCaption?: string;` (linha 179):

```ts
  mediaCaption?: string;
  mediaFilename?: string;
```

(b) `evolution/parser.ts` — `IEvolutionContent` (linhas 76-80):

```ts
export interface IEvolutionContent {
  contentType: InboundContentType;
  text?: string;
  mediaCaption?: string;
  /** documentMessage.fileName — the original document name. */
  mediaFilename?: string;
}
```

Branch de documento (linhas 92-93):

```ts
  if (message.documentMessage)
    return {
      contentType: "document",
      mediaCaption: message.documentMessage.caption,
      mediaFilename: message.documentMessage.fileName,
    };
```

Return do echo (após `mediaCaption: content.mediaCaption,`, linha 166):

```ts
      mediaCaption: content.mediaCaption,
      mediaFilename: content.mediaFilename,
```

Return da mensagem inbound (após `mediaCaption: content.mediaCaption,`, linha 186):

```ts
    mediaCaption: content.mediaCaption,
    mediaFilename: content.mediaFilename,
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bunx vitest run src/providers/whatsapp/evolution/parser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/types.ts src/providers/whatsapp/evolution/parser.ts src/providers/whatsapp/evolution/parser.test.ts
git commit -m "feat(whatsapp): extract document fileName on the Evolution parser + normalized shapes"
```

---

### Task 8: Parser Evolution Go (TDD)

**Files:**
- Modify: `src/providers/whatsapp/evolution-go/parser.ts:99-125,174-201`
- Test: `src/providers/whatsapp/evolution-go/parser.test.ts`

**Interfaces:**
- Consumes: `IInboundMessage.mediaFilename?`/`IOutboundEcho.mediaFilename?` (Task 7).
- Produces: `IGoContent.mediaFilename?: string` (consumido pela Task 11 via `extractContent`).

- [ ] **Step 1: Escrever o teste que falha**

Em `evolution-go/parser.test.ts`:

```ts
  it("inbound document exposes the original fileName as mediaFilename", () => {
    const parsed = parseEvolutionGoInbound(
      {
        event: "Message",
        data: {
          Info: {
            Chat: "5555988887777@s.whatsapp.net",
            Sender: "5555988887777@s.whatsapp.net",
            IsFromMe: false,
            ID: "G-doc",
            Timestamp: 1750000000,
          },
          Message: {
            documentMessage: { fileName: "NF-4321.pdf", caption: "nota", url: "u", mediaKey: "k" },
          },
        },
      },
      "acc-1",
    );
    expect(parsed).toMatchObject({
      type: "message",
      contentType: "document",
      mediaFilename: "NF-4321.pdf",
    });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/providers/whatsapp/evolution-go/parser.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`IGoContent` (linhas 99-104):

```ts
export interface IGoContent {
  contentType: InboundContentType;
  text?: string;
  mediaCaption?: string;
  mediaId?: string;
  /** documentMessage.fileName — the original document name. */
  mediaFilename?: string;
}
```

Branch de documento em `extractContent` (linhas 115-116):

```ts
  if (msg.documentMessage)
    return {
      contentType: "document",
      mediaCaption: msg.documentMessage.caption,
      mediaId: mediaRefFrom("documentMessage", msg.documentMessage),
      mediaFilename: msg.documentMessage.fileName,
    };
```

Return do echo (após `mediaCaption: content.mediaCaption,`, linha 181):

```ts
      mediaCaption: content.mediaCaption,
      mediaFilename: content.mediaFilename,
```

Return da mensagem inbound (após `mediaCaption: content.mediaCaption,`, linha 197):

```ts
    mediaCaption: content.mediaCaption,
    mediaFilename: content.mediaFilename,
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bunx vitest run src/providers/whatsapp/evolution-go/parser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/evolution-go/parser.ts src/providers/whatsapp/evolution-go/parser.test.ts
git commit -m "feat(whatsapp): extract document fileName on the Evolution Go parser"
```

---

### Task 9: Parser Meta (TDD)

**Files:**
- Modify: `src/providers/whatsapp/meta/parser.ts:130-141`
- Test: `src/providers/whatsapp/meta/MetaCloudProvider.test.ts`

**Interfaces:**
- Consumes: `IInboundMessage.mediaFilename?` (Task 7).

- [ ] **Step 1: Escrever o teste que falha**

Em `MetaCloudProvider.test.ts` (que já importa/exercita `parseMetaInbound`; se importar apenas o provider, adicionar `import { parseMetaInbound } from "./parser";`):

```ts
  it("inbound document exposes the original filename as mediaFilename", () => {
    const parsed = parseMetaInbound(
      {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { display_phone_number: "5555911111111" },
                  messages: [
                    {
                      id: "wamid.doc",
                      from: "5555988887777",
                      timestamp: "1750000000",
                      type: "document",
                      document: { id: "med-1", caption: "segue", filename: "Orcamento-123.pdf" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      "acc-1",
    );
    expect(parsed).toMatchObject({
      type: "message",
      contentType: "document",
      mediaFilename: "Orcamento-123.pdf",
    });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/providers/whatsapp/meta/MetaCloudProvider.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

No branch de mídia de `parseMetaInbound` (linhas 130-141):

```ts
  if ((MEDIA_TYPES as readonly string[]).includes(type)) {
    const media = message[type as (typeof MEDIA_TYPES)[number]];
    // Stickers ride as images in the normalized model (no dedicated kind).
    const contentType: InboundContentType =
      type === "sticker" ? "image" : (type as InboundContentType);
    return {
      ...base,
      contentType,
      mediaId: media?.id,
      mediaCaption: media?.caption,
      mediaFilename: type === "document" ? message.document?.filename : undefined,
    };
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bunx vitest run src/providers/whatsapp/meta/MetaCloudProvider.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/meta/parser.ts src/providers/whatsapp/meta/MetaCloudProvider.test.ts
git commit -m "feat(whatsapp): extract document filename on the Meta parser"
```

---

### Task 10: Webhook core — contratos + passthrough (TDD)

**Files:**
- Modify: `src/providers/whatsapp/webhook/core.ts:92-112,545-553,645-654`
- Test: `src/providers/whatsapp/webhook/core.test.ts`

**Interfaces:**
- Consumes: `parsed.mediaFilename` (Tasks 7-9).
- Produces: `IWebhookDb.insertInboundMessage`/`insertOutboundEchoMessage` inputs ganham `mediaFilename?: string | null` (OPCIONAL — fakes existentes seguem compilando). A Task 12 grava a coluna no edge.

- [ ] **Step 1: Escrever o teste que falha**

Em `webhook/core.test.ts`, localizar o caso inbound de mídia existente (o fake `db` do arquivo registra as chamadas de `insertInboundMessage`) e adicionar um caso novo no mesmo padrão, com payload Evolution de documento (mesma factory de evento usada pelos vizinhos), asserindo:

```ts
    expect(recordedInsertInboundInput).toMatchObject({ mediaFilename: "Catalogo-UFI.pdf" });
```

O payload do evento deve conter `message: { documentMessage: { fileName: "Catalogo-UFI.pdf" } }`. Se o harness registrar as chamadas em um array (ex.: `calls.inserted`), asserir no último elemento. Manter o comportamento asserido: documento inbound → `mediaFilename` no input do insert; mensagem de texto → `mediaFilename: null`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/providers/whatsapp/webhook/core.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

(a) Contrato `insertInboundMessage` (linhas 92-101), após `mediaType: string | null;`:

```ts
    mediaType: string | null;
    /** Original document filename (messages.media_filename). */
    mediaFilename?: string | null;
```

(b) Contrato `insertOutboundEchoMessage` (linhas 104-112), após `mediaType: string | null;`:

```ts
    mediaType: string | null;
    mediaFilename?: string | null;
```

(c) Chamada do echo (linhas 545-553), após `mediaType: …`:

```ts
      mediaType: toMediaType(parsed.contentType),
      mediaFilename: parsed.mediaFilename ?? null,
```

(d) Chamada inbound (linhas 645-654), após `mediaType: …`:

```ts
    mediaType: toMediaType(parsed.contentType),
    mediaFilename: parsed.mediaFilename ?? null,
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bunx vitest run src/providers/whatsapp/webhook/core.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/webhook/core.ts src/providers/whatsapp/webhook/core.test.ts
git commit -m "feat(whatsapp-webhook): thread mediaFilename through the inbound/echo inserts"
```

---

### Task 11: Import de histórico (TDD)

**Files:**
- Modify: `src/providers/whatsapp/import/core.ts:105-131,165-199,403-412`
- Modify: `src/providers/whatsapp/import/history-core.ts:88-115`
- Test: `src/providers/whatsapp/import/history-core.test.ts` (direto) e `src/providers/whatsapp/import/core.test.ts` (via harness)
- Modify: `supabase/functions/_shared/import-db.ts:101-117` (fora do espelho — editar à mão)

**Interfaces:**
- Consumes: `IEvolutionContent.mediaFilename`/`IGoContent.mediaFilename` (Tasks 7-8).
- Produces: `INormalizedRecord.mediaFilename?: string`; rows de `IImportDb.insertImportedMessages` ganham `mediaFilename?: string | null`.

- [ ] **Step 1: Escrever o teste que falha (history-core, função exportada)**

Em `history-core.test.ts`:

```ts
  it("imported document carries the original mediaFilename", () => {
    const rec = normalizeWhatsmeowRecord({
      key: { ID: "H-doc", fromMe: false },
      messageTimestamp: 1750000000,
      message: { documentMessage: { fileName: "Historico.pdf", url: "u", mediaKey: "k" } },
    });
    expect(rec).toMatchObject({ mediaType: "document", mediaFilename: "Historico.pdf" });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/providers/whatsapp/import/history-core.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

(a) `import/core.ts` — `INormalizedRecord` (linhas 124-131):

```ts
export interface INormalizedRecord {
  providerMessageId: string;
  direction: "in" | "out";
  text: string;
  mediaType: string | null;
  /** Original document filename, when the raw record carried one. */
  mediaFilename?: string;
  status: "sent" | "delivered" | "read" | "failed";
  sentAt: string;
}
```

(b) `normalizeRecord` (return, linhas 191-198):

```ts
  return {
    providerMessageId,
    direction,
    text,
    mediaType,
    mediaFilename: content.mediaFilename,
    status,
    sentAt: new Date(tsNum * 1000).toISOString(),
  };
```

(c) `history-core.ts` — `normalizeWhatsmeowRecord` (return, linhas 107-114):

```ts
  return {
    providerMessageId,
    direction,
    text,
    mediaType,
    mediaFilename: content.mediaFilename,
    status,
    sentAt: new Date(tsNum * 1000).toISOString(),
  };
```

(d) `import/core.ts` — contrato `IImportDb.insertImportedMessages` (linhas 105-117), após `mediaType: string | null;`:

```ts
      mediaType: string | null;
      mediaFilename?: string | null;
```

(e) rows de `landNormalizedChat` (linhas 403-412), após `mediaType: row.mediaType,`:

```ts
    mediaType: row.mediaType,
    mediaFilename: row.mediaFilename ?? null,
```

(f) `supabase/functions/_shared/import-db.ts` — chunk do INSERT (linhas 103-117), após `media_type: row.mediaType,`:

```ts
          media_type: row.mediaType,
          media_filename: row.mediaFilename ?? null,
```

- [ ] **Step 4: Rodar e ver passar (as duas suites)**

Run: `bunx vitest run src/providers/whatsapp/import/history-core.test.ts src/providers/whatsapp/import/core.test.ts`
Expected: PASS (se `core.test.ts` asserir shapes de rows inseridas, os casos existentes seguem passando pois o campo é aditivo).

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/import/core.ts src/providers/whatsapp/import/history-core.ts src/providers/whatsapp/import/history-core.test.ts supabase/functions/_shared/import-db.ts
git commit -m "feat(whatsapp-import): persist document mediaFilename on imported history rows"
```

---

### Task 12: Edge adapters + sync do espelho

**Files:**
- Modify: `supabase/functions/_shared/whatsappSendAdapter.ts:119-133`
- Modify: `supabase/functions/whatsapp-webhook/index.ts:299-340`
- Regenerate: `supabase/functions/_shared/whatsapp/**` (via script — NUNCA à mão)

**Interfaces:**
- Consumes: `ISendDb.insertQueuedMessage.fileName` (Task 5); `IWebhookDb.*.mediaFilename` (Task 10).

- [ ] **Step 1: Gravar a coluna no adapter de envio**

Em `whatsappSendAdapter.ts`, no `.insert({...})` de `insertQueuedMessage` (linhas 121-133), após `media_url: input.mediaUrl,`:

```ts
          media_url: input.mediaUrl,
          media_filename: input.fileName ?? null,
```

- [ ] **Step 2: Gravar a coluna nos INSERTs do webhook**

Em `whatsapp-webhook/index.ts`, `insertInboundMessage` (linhas 302-314), após `media_type: input.mediaType,`:

```ts
          media_type: input.mediaType,
          media_filename: input.mediaFilename ?? null,
```

E em `insertOutboundEchoMessage` (linhas 322-335), após `media_type: input.mediaType,`:

```ts
          media_type: input.mediaType,
          media_filename: input.mediaFilename ?? null,
```

- [ ] **Step 3: Regenerar o espelho**

Run: `bun run scripts/sync-whatsapp-shared.ts`
Expected: espelho `supabase/functions/_shared/whatsapp/**` regravado; `git status` mostra os arquivos espelhados alterados (send/core.ts, webhook/core.ts, types.ts, parsers, import/*).

- [ ] **Step 4: Commit (adapters + espelho juntos)**

```bash
git add supabase/functions/_shared/whatsappSendAdapter.ts supabase/functions/whatsapp-webhook/index.ts supabase/functions/_shared/whatsapp
git commit -m "feat(edge): persist media_filename on send/webhook/import inserts + sync mirror"
```

⚠️ NÃO deployar os edges agora — Fase de Rollout (a migration precisa aplicar primeiro).

---

### Task 13: Chip "Enviando anexo…" no composer

**Files:**
- Modify: `src/features/conversations/i18n/pt-BR.ts:353-362`
- Modify: `src/features/conversations/components/MessageInput.tsx:215-219,290-299,414-442,702-735,839,887-914`

**Interfaces:**
- Consumes: `AttachmentKind` (já importado no MessageInput), `mediaIcon`/`formatFileSize` de `../utils/messageDisplay`.

- [ ] **Step 1: Strings novas (pt-BR com acentos)**

Em `pt-BR.ts`, no bloco Message input: após `sendDisabledPendingFields` (linha 356):

```ts
  sendDisabledPendingFields: "Preencha os campos pendentes",
  sendDisabledUploading: "Aguarde o anexo terminar de enviar",
```

E após `attachUploadFailed` (linha 362):

```ts
  attachUploadFailed: "Não foi possível enviar o anexo. Tente novamente.",
  attachUploading: "Enviando anexo…",
```

- [ ] **Step 2: Estado + instrumentação do handler**

(a) Import (topo do MessageInput.tsx — mesclar com import existente de `../utils/messageDisplay` se houver; senão, nova linha):

```ts
import { formatFileSize, mediaIcon } from "../utils/messageDisplay";
```

(b) Estado, ao lado de `sendingVoice` (linha 215):

```ts
  const [sendingVoice, setSendingVoice] = useState(false);
  // Ad-hoc attachment upload in flight — drives the composer chip + locks.
  const [uploadingAttachment, setUploadingAttachment] = useState<{
    name: string;
    size: number;
    kind: AttachmentKind;
  } | null>(null);
```

(c) `handleAttachSelected` (linhas 414-442) — envolver o fluxo com set/clear (espelha o try/finally de `handleSendVoice`):

```ts
  const handleAttachSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file twice re-triggers the change event.
    e.target.value = "";
    if (!file) return;
    const caption = value.trim();
    setUploadingAttachment({ name: file.name, size: file.size, kind: attachKindRef.current });
    try {
      let payload: ISendOptions | null = null;
      try {
        payload = await prepareAttachment(file, attachKindRef.current, caption);
      } catch {
        toast.error(CONVERSATION_STRINGS.attachUploadFailed);
        return;
      }
      if (!payload) return;
      try {
        await sendHook.send(payload);
        setValue("");
        onSent?.();
      } catch (err) {
        if (err instanceof Error && err.message === "TEMPLATE_REQUIRED") {
          setTemplateOpen(true);
          return;
        }
        if (handleInvalidNumberBounce(err, payload)) return;
        if (getActiveDataSource() !== "supabase") {
          toast.error(CONVERSATION_STRINGS.actionFailed);
        }
      }
    } finally {
      setUploadingAttachment(null);
    }
  };
```

- [ ] **Step 3: Travas (send, clipe, textarea, microfone)**

(a) `sendDisabled`/razão (linhas 292-299) — upload em voo tem prioridade máxima na razão:

```ts
  const sendDisabled =
    !value.trim() || !canSendFreeText || hasUnresolvedPlaceholders || uploadingAttachment !== null;
  const sendDisabledReason = uploadingAttachment
    ? CONVERSATION_STRINGS.sendDisabledUploading
    : hasUnresolvedPlaceholders
      ? CONVERSATION_STRINGS.sendDisabledPendingFields
      : !canSendFreeText
        ? CONVERSATION_STRINGS.sendDisabledWindowClosed
        : !value.trim()
          ? CONVERSATION_STRINGS.sendDisabledEmpty
          : undefined;
```

(b) Botão do clipe (linhas 726-732) — adicionar `disabled`:

```tsx
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 shrink-0 p-0"
                      aria-label={CONVERSATION_STRINGS.attach}
                      disabled={uploadingAttachment !== null}
                    >
```

(c) Textarea (linhas 900 e 911):

```tsx
                disabled={!canSendFreeText || uploadingAttachment !== null}
```

```tsx
                  (!canSendFreeText || uploadingAttachment !== null) &&
                    "cursor-not-allowed bg-muted/40",
```

(d) Botão do microfone (linha 839):

```tsx
                    disabled={!canSendFreeText || uploadingAttachment !== null}
```

- [ ] **Step 4: O chip (bloco condicional acima da linha do input)**

Entre o chip Origem (fecha na linha 707) e `<div className="flex items-end gap-2 px-3 py-2">` (linha 708):

```tsx
      {uploadingAttachment && (
        <div
          className="flex items-center gap-2.5 border-b border-border px-3 py-2"
          role="status"
          aria-live="polite"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon icon={mediaIcon(uploadingAttachment.kind, uploadingAttachment.name)} size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {uploadingAttachment.name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {CONVERSATION_STRINGS.attachUploading} · {formatFileSize(uploadingAttachment.size)}
            </p>
          </div>
          <Icon icon="mdi:loading" size={16} className="shrink-0 animate-spin text-primary" />
        </div>
      )}
```

- [ ] **Step 5: Gate e commit**

Run: `bun run build` — Expected: sucesso.
Run: `bunx tsc --noEmit 2>&1 | grep -E "MessageInput|pt-BR"` — Expected: silêncio.

```bash
git add src/features/conversations/i18n/pt-BR.ts src/features/conversations/components/MessageInput.tsx
git commit -m "feat(conversations): uploading-attachment chip in composer with send/attach locks"
```

---

### Task 14: Gate final da branch

**Files:** nenhum novo — verificação.

- [ ] **Step 1: Suíte completa**

Run: `bun run test`
Expected: PASS — zero falhas (baseline atual: ~1381 testes + os novos).

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: sucesso.

- [ ] **Step 3: tsc por delta**

Run: `bunx tsc --noEmit 2>&1 | grep -E "media_filename|mediaFilename|uploadingAttachment"`
Expected: silêncio (nenhum erro novo nos símbolos introduzidos).

- [ ] **Step 4: Espelho em dia**

Run: `bun run scripts/sync-whatsapp-shared.ts && git status --porcelain supabase/functions/_shared/whatsapp`
Expected: nenhuma mudança pendente (espelho já sincronizado na Task 12).

---

## Fase de Rollout (manual — CADA passo gated no OK do dono)

Ordem obrigatória (edge gravando coluna inexistente = INSERT falha; front novo seleciona a coluna via `COLUMNS` = merge só APÓS a migration):

1. **Aplicar a migration em prod** via MCP `apply_migration` (name: `messages_media_filename`, mesmo SQL do arquivo) — SÓ com OK explícito do dono.
2. **Deploy dos 3 edges:**
   - `npx supabase functions deploy whatsapp-webhook --project-ref njizaasajkdqptlxddqn --no-verify-jwt`
   - `npx supabase functions deploy whatsapp-send --project-ref njizaasajkdqptlxddqn`
   - `npx supabase functions deploy scheduled-send-worker --project-ref njizaasajkdqptlxddqn`
3. **Push + PR** (`gh pr create` com `--body-file`; nunca mergear sem OK). O merge (deploy automático do front na Vercel) só após a migration aplicada.
4. **Smoke do dono:** enviar um PDF pelo composer (chip aparece → bolha com nome original); receber um documento (nome original na bolha); galeria "Mídias" e download com nome certo.
5. **Bump MINOR + codinome** ao final, com OK do dono (checar versão real na main antes — corrida de versão).
