# Responder (citar) mensagem na conversa — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o atendente responda citando uma mensagem específica da conversa, e exibir na thread a citação que o cliente (ou o vendedor pelo celular) faz.

**Architecture:** Uma coluna `messages.reply_to jsonb` guarda um **snapshot** da mensagem citada, então a bolha renderiza sem consulta extra — nada do cache/realtime/paginação do Atendimento é tocado. No envio, o snapshot é montado no servidor e o id serializado vai para a WAHA em `reply_to`. No recebimento, o webhook resolve o id **cru** que a WAHA manda contra o nosso `provider_message_id` por **casamento de sufixo**.

**Tech Stack:** React 19 + TypeScript strict, TanStack Query, Tailwind v4 + shadcn/ui, Vitest, Supabase (Postgres + Edge Functions em Deno), WAHA.

**Spec:** `docs/superpowers/specs/2026-08-10-conversation-reply-quote-design.md`

## Global Constraints

- **Gerenciador de pacotes é `bun`.** Testes: `bun run test`. Build: `bun run build`. Type-check separado: `bunx tsc --noEmit` (há baseline de erros pré-existentes — avaliar só o delta dos arquivos novos).
- **`bun run build` NÃO faz type-check.** O gate prático é `bun run build` + `bun run test`.
- **Idioma:** identificadores, comentários e mensagens de commit em **inglês**; todo texto de UI em **português do Brasil com acentuação correta** (`ç`, `ã`, `é`…). Nunca escrever "citacao" por "citação".
- **Interfaces de domínio levam prefixo `I`** (`IMessageReplyRef`).
- **Temas:** componentes usam **apenas tokens semânticos** (`bg-muted`, `text-muted-foreground`, `border-border`, `border-primary`). Proibido `--gallo-*` e hex direto.
- **Ícones:** sempre `@/components/Icon` com nome Iconify (`mdi:reply`), nunca emoji literal no código.
- **Árvore espelhada:** qualquer alteração em `src/providers/whatsapp/**` exige rodar `bun run scripts/sync-whatsapp-shared.ts` e commitar os arquivos gerados em `supabase/functions/_shared/whatsapp/**` no mesmo commit.
- **Migration:** exportada para `supabase/migrations/` no mesmo PR. **Mergear o PR NÃO aplica a migration** — a aplicação em produção é manual e exige OK explícito do dono.
- **Ordem de produção obrigatória:** a migration `reply_to` precisa estar aplicada **antes** do deploy do front, porque a Task 2 adiciona `reply_to` à lista `COLUMNS` do provider Supabase — um `select` de coluna inexistente devolve erro. Registrar isso no corpo do PR.
- **Deploy de Edge Function** (`waha-send`, `waha-webhook`): `npx supabase functions deploy <nome>` — **só com OK explícito do dono**.
- **Área congelada:** não alterar query keys, `useMessages`, `useRealtimeMessages` (além do mapeador `rowToMessage`), assinatura em lote de mídia, nem a RPC `conversation_messages`.
- **Nunca commitar em `main`** — todo o trabalho na branch `feat/conversation-reply-quote`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/providers/whatsapp/waha/replyRef.ts` **(novo, espelhado)** | Lógica pura de reconciliação do id citado: casamento por sufixo, escolha do candidato, truncagem do trecho. Compartilhado entre front e Edge via sync. |
| `src/providers/whatsapp/types.ts` | `IInboundReplyRef` + campo `replyTo` em `IInboundMessage`/`IOutboundEcho`. |
| `src/providers/whatsapp/waha/parser.ts` | `extractWahaReplyRef` — normaliza `payload.replyTo`, ignorando comentário em Status. |
| `src/providers/whatsapp/waha/send.ts` | Emite `reply_to` no JSON de texto e de mídia. |
| `src/shared/types/conversation.ts` | `IMessageReplyRef` + `IMessage.replyTo`. |
| `supabase/migrations/20260810120000_messages_reply_to.sql` **(novo)** | Coluna `messages.reply_to jsonb`. |
| `src/providers/data/impl/supabase/messages.ts` | Mapeia `reply_to` ↔ `replyTo` na leitura. |
| `src/features/conversations/hooks/useRealtimeMessages.ts` | Mesmo mapeamento no payload do Realtime. |
| `supabase/functions/_shared/replyRef.ts` **(novo, Edge-only)** | Consulta a mensagem citada no banco e monta o snapshot persistido. |
| `supabase/functions/waha-webhook/index.ts` | Grava `reply_to` nos dois inserts (inbound e eco). |
| `supabase/functions/_shared/wahaSendAdapter.ts` | Resolve o alvo do envio, grava `reply_to` e repassa o id serializado. |
| `supabase/functions/waha-send/index.ts` | Aceita `replyToMessageId` no corpo. |
| `src/features/conversations/hooks/useMessageSend.ts` | `replyTo` em `ISendOptions`; bolha otimista já nasce citando. |
| `src/features/conversations/engine/replyRef.ts` **(novo)** | Regras de apresentação: quem pode ser citado, rótulo do autor, rótulo de mídia. |
| `src/features/conversations/components/bubbles/QuotedPreview.tsx` **(novo)** | O bloco de citação — usado na bolha e no composer. |
| `src/features/conversations/components/bubbles/BubbleActionsMenu.tsx` **(novo)** | Chevron de hover com "Responder" / "Copiar texto". |
| `src/features/conversations/components/bubbles/bubbleChrome.tsx` | Monta o menu, a citação e o `data-message-id`. |
| `src/features/conversations/hooks/useReplyDraft.tsx` **(novo)** | Contexto dedicado do rascunho de resposta. |
| `src/features/conversations/components/ReplyComposerBar.tsx` **(novo)** | Barra de citação acima do campo de texto. |
| `src/features/conversations/components/MessageInput.tsx` | Renderiza a barra, envia com `replyTo`, `Escape` cancela. |
| `src/features/conversations/components/MessageList.tsx` | Pulo + flash na mensagem original. |
| `src/features/conversations/pages/ConversationPage.tsx` | Monta o `ReplyDraftProvider`. |
| `src/features/conversations/i18n/pt-BR.ts` | Textos em pt-BR. |

---

### Task 1: Reconciliação do id citado (lógica pura) + tipo de domínio

O coração da feature. A WAHA manda o id da mensagem citada **cru** (`A55995F4894E267BE03B5F864110C5CB`) e nós guardamos o **serializado** (`false_176312836698119@lid_A5458535…`). Casamento é por sufixo — validado com o separador `_`, senão um hash mais longo terminado nos mesmos caracteres casaria por engano.

O arquivo mora na árvore espelhada porque **o webhook (Deno) e o front precisam da mesma função** — o Edge não pode importar de `src/features/`.

**Files:**
- Create: `src/providers/whatsapp/waha/replyRef.ts`
- Test: `src/providers/whatsapp/waha/replyRef.test.ts`
- Modify: `src/shared/types/conversation.ts:225-262` (bloco `IMessage`)

**Interfaces:**
- Produces: `matchesProviderMessageId(serializedId: string, rawId: string): boolean`, `pickReplyMatch<T extends { provider_message_id?: string | null }>(rows: T[], rawId: string): T | undefined`, `truncateQuotedText(text: string | null | undefined): string | undefined`, `QUOTED_TEXT_MAX: number`, e o tipo `IMessageReplyRef` exportado do barrel `@/shared/types`.

- [ ] **Step 1: Write the failing test**

Criar `src/providers/whatsapp/waha/replyRef.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  QUOTED_TEXT_MAX,
  matchesProviderMessageId,
  pickReplyMatch,
  truncateQuotedText,
} from "./replyRef";

describe("matchesProviderMessageId", () => {
  it("matches the raw hash against the serialized id suffix (@c.us)", () => {
    expect(
      matchesProviderMessageId("false_5555912345678@c.us_3A5AC1F1D8E39EF06FF4", "3A5AC1F1D8E39EF06FF4"),
    ).toBe(true);
  });

  it("matches on a lid-addressed chat", () => {
    expect(
      matchesProviderMessageId("true_255224270876679@lid_3EB0CA488EE47B77A23CC4", "3EB0CA488EE47B77A23CC4"),
    ).toBe(true);
  });

  // Guards the whole feature: without the "_" the longer hash below would be
  // accepted as a match and the quote would point at the WRONG message.
  it("rejects a suffix that is not preceded by the separator", () => {
    expect(
      matchesProviderMessageId("false_5555912345678@c.us_AAA3A5AC1F1D8E39EF06FF4", "3A5AC1F1D8E39EF06FF4"),
    ).toBe(false);
  });

  it("rejects a different hash", () => {
    expect(matchesProviderMessageId("false_5555912345678@c.us_ABC", "XYZ")).toBe(false);
  });

  it("rejects empty inputs instead of matching everything", () => {
    expect(matchesProviderMessageId("", "ABC")).toBe(false);
    expect(matchesProviderMessageId("false_5555912345678@c.us_ABC", "")).toBe(false);
  });
});

describe("pickReplyMatch", () => {
  const rows = [
    { id: "m1", provider_message_id: "false_5555912345678@c.us_AAABBB" },
    { id: "m2", provider_message_id: "false_5555912345678@c.us_BBB" },
    { id: "m3", provider_message_id: null },
  ];

  it("picks the row whose serialized id ends with _<rawId>", () => {
    expect(pickReplyMatch(rows, "BBB")?.id).toBe("m2");
  });

  it("returns undefined when no row matches exactly", () => {
    expect(pickReplyMatch(rows, "CCC")).toBeUndefined();
  });

  it("skips rows without a provider id", () => {
    expect(pickReplyMatch([{ id: "m3", provider_message_id: null }], "BBB")).toBeUndefined();
  });
});

describe("truncateQuotedText", () => {
  it("keeps a short text untouched", () => {
    expect(truncateQuotedText("Tem o filtro de óleo do Volvo FH?")).toBe(
      "Tem o filtro de óleo do Volvo FH?",
    );
  });

  it("truncates a long text at a word boundary and appends an ellipsis", () => {
    const long = `${"palavra ".repeat(60)}fim`;
    const result = truncateQuotedText(long) ?? "";
    expect(result.length).toBeLessThanOrEqual(QUOTED_TEXT_MAX + 1);
    expect(result.endsWith("…")).toBe(true);
    expect(result).not.toContain("palavr…");
  });

  it("returns undefined for empty, blank or missing text", () => {
    expect(truncateQuotedText(undefined)).toBeUndefined();
    expect(truncateQuotedText(null)).toBeUndefined();
    expect(truncateQuotedText("   ")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/providers/whatsapp/waha/replyRef.test.ts`
Expected: FAIL — `Failed to resolve import "./replyRef"`.

- [ ] **Step 3: Write minimal implementation**

Criar `src/providers/whatsapp/waha/replyRef.ts`:

```ts
/**
 * Reply/quote id reconciliation.
 *
 * WAHA delivers the quoted message id RAW in the inbound payload — the bare
 * hash, e.g. `A55995F4894E267BE03B5F864110C5CB` — while
 * `messages.provider_message_id` stores the SERIALIZED id
 * (`{fromMe}_{chatJid}_{hash}`, e.g.
 * `false_176312836698119@lid_A5458535B99785B0084742B6E0DC759C`). Confirmed
 * against real `webhook_deliveries` payloads on 2026-08-10.
 *
 * Matching the two by equality finds NOTHING: every inbound quote would be
 * silently orphaned and the feature would look broken only to whoever compared
 * it against WhatsApp. The link is the suffix — and it must include the `_`
 * separator, otherwise a longer hash ending in the same characters matches the
 * wrong message.
 *
 * Runtime-agnostic (mirrored into `supabase/functions/_shared/whatsapp/`):
 * no imports, Web APIs only.
 */

/** Max characters of the quoted snippet persisted in `messages.reply_to`. */
export const QUOTED_TEXT_MAX = 240;

/** Whether a serialized provider id refers to the message WAHA quoted by raw id. */
export function matchesProviderMessageId(serializedId: string, rawId: string): boolean {
  if (!serializedId || !rawId) return false;
  return serializedId.endsWith(`_${rawId}`);
}

/**
 * Picks, among candidate rows fetched with a broad `like '%<rawId>'`, the one
 * that really is the quoted message. The SQL filter alone is not proof: `_` is
 * a single-character wildcard in LIKE, so the exact check happens here.
 */
export function pickReplyMatch<T extends { provider_message_id?: string | null }>(
  rows: T[],
  rawId: string,
): T | undefined {
  return rows.find((row) => matchesProviderMessageId(String(row.provider_message_id ?? ""), rawId));
}

/**
 * Snippet stored in the quote. Cut at a word boundary so the preview never
 * ends mid-word; returns undefined for anything with no readable content, so
 * callers can omit the field instead of storing an empty string.
 */
export function truncateQuotedText(text: string | null | undefined): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= QUOTED_TEXT_MAX) return trimmed;
  const hard = trimmed.slice(0, QUOTED_TEXT_MAX);
  const lastSpace = hard.lastIndexOf(" ");
  // Only honor the word boundary when it isn't so early that it would gut the
  // snippet (a single very long token has no usable boundary).
  const cut = lastSpace > QUOTED_TEXT_MAX * 0.6 ? hard.slice(0, lastSpace) : hard;
  return `${cut.trimEnd()}…`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/providers/whatsapp/waha/replyRef.test.ts`
Expected: PASS (13 testes).

- [ ] **Step 5: Add the domain type**

Em `src/shared/types/conversation.ts`, **antes** de `export interface IMessage {` (linha 225):

```ts
/**
 * Mensagem citada por outra (reply/quote).
 *
 * É um SNAPSHOT: o conteúdo é a cópia feita no momento da citação, não uma
 * leitura viva da mensagem original. Isso mantém a bolha renderizável sem
 * consulta extra, preserva o texto mesmo quando a original é apagada, e cobre
 * a citação de mensagem que nunca entrou no nosso histórico.
 */
export interface IMessageReplyRef {
  /** Nossa mensagem citada. Ausente quando ela não existe no histórico local —
   *  a citação ainda renderiza (pelo snapshot), mas não é clicável. */
  messageId?: ID;
  /** Id do provider da mensagem citada: serializado quando resolvemos a
   *  original; cru (só o hash, como o WAHA manda) quando não. */
  providerMessageId?: string;
  /** Trecho já truncado na gravação (ver QUOTED_TEXT_MAX). */
  text?: string;
  mediaType?: MessageMediaType;
  direction?: MessageDirection;
}
```

E dentro de `IMessage`, logo após `mediaFilename?: string;` (linha 238):

```ts
  /** Mensagem que esta cita (reply/quote). Ausente na grande maioria. */
  replyTo?: IMessageReplyRef;
```

- [ ] **Step 6: Export it from the barrel**

⚠️ `src/shared/types/index.ts` **não** faz `export *` — lista cada nome explicitamente. Sem este passo, `import type { IMessageReplyRef } from "@/shared/types"` não resolve nas tasks seguintes.

No bloco `} from "./conversation";` (por volta da linha 170-200), acrescentar `IMessageReplyRef` logo após `IMessage,`:

```ts
  IMessage,
  IMessageReplyRef,
```

Verificar:

```bash
grep -n "IMessageReplyRef" src/shared/types/index.ts
bunx tsc --noEmit 2>&1 | grep -E "conversation.ts|replyRef" || echo "sem erros novos"
```
Expected: a linha aparece no barrel, e `sem erros novos`.

- [ ] **Step 7: Mirror into the Edge tree**

Run: `bun run scripts/sync-whatsapp-shared.ts`
Expected: cria `supabase/functions/_shared/whatsapp/waha/replyRef.ts` (mesmo conteúdo, com `.ts` nos imports relativos — aqui não há imports, então byte-idêntico).

- [ ] **Step 8: Commit**

```bash
git add src/providers/whatsapp/waha/replyRef.ts src/providers/whatsapp/waha/replyRef.test.ts \
        src/shared/types/conversation.ts supabase/functions/_shared/whatsapp/waha/replyRef.ts
git commit -m "feat(conversations): add reply/quote id reconciliation helpers"
```

---

### Task 2: Migration + leitura da coluna `reply_to`

A coluna nova percorre dois mapeadores `row → IMessage`: o provider Supabase e o payload do Realtime. A RPC `conversation_messages` faz `select m.*`, então a leitura paginada pega a coluna sozinha — **nada de RPC, cache ou query key muda**.

**Files:**
- Create: `supabase/migrations/20260810120000_messages_reply_to.sql`
- Modify: `src/providers/data/impl/supabase/messages.ts:37-98`
- Modify: `src/features/conversations/hooks/useRealtimeMessages.ts:14-79`
- Test: `src/features/conversations/hooks/useRealtimeMessages.test.ts`

**Interfaces:**
- Consumes: `IMessageReplyRef` (Task 1).
- Produces: `IMessage.replyTo` populado em toda leitura — é dele que as Tasks 6–8 dependem.

- [ ] **Step 1: Write the failing test**

Em `src/features/conversations/hooks/useRealtimeMessages.test.ts` — o arquivo hoje testa só os dois predicados, então o import da linha 2 precisa crescer:

```ts
import { conversationTouchMatches, messageRowMatches, rowToMessage } from "./useRealtimeMessages";
```

E acrescentar ao final do arquivo:

```ts
describe("rowToMessage — reply_to", () => {
  it("maps the quoted snapshot into replyTo", () => {
    const row = {
      id: "m1",
      conversation_id: "c1",
      direction: "in",
      author_type: "customer",
      author_id: null,
      provider: "waha",
      text: "esse mesmo",
      media_type: null,
      media_url: null,
      media_filename: null,
      status: "delivered",
      sent_at: "2026-08-10T12:00:00.000Z",
      delivered_at: null,
      read_at: null,
      failure_reason: null,
      failure_code: null,
      transcription: null,
      transcription_status: null,
      reply_to: {
        messageId: "m0",
        providerMessageId: "false_5555912345678@c.us_ABC",
        text: "Tem o filtro de óleo do Volvo FH?",
        mediaType: null,
        direction: "out",
      },
    } as never;

    expect(rowToMessage(row).replyTo).toEqual({
      messageId: "m0",
      providerMessageId: "false_5555912345678@c.us_ABC",
      text: "Tem o filtro de óleo do Volvo FH?",
      mediaType: null,
      direction: "out",
    });
  });

  it("leaves replyTo undefined when the column is null", () => {
    const row = { id: "m1", conversation_id: "c1", reply_to: null } as never;
    expect(rowToMessage(row).replyTo).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/features/conversations/hooks/useRealtimeMessages.test.ts`
Expected: FAIL — `expected undefined to deeply equal { messageId: 'm0', … }`.

- [ ] **Step 3: Write the migration**

Criar `supabase/migrations/20260810120000_messages_reply_to.sql`:

```sql
-- Reply/quote (citação) de mensagem — spec docs/superpowers/specs/2026-08-10-conversation-reply-quote-design.md
--
-- Snapshot desnormalizado da mensagem citada. Guardado como jsonb (mesmo
-- padrão de messages.reactions e conversations.ad_referral) para que a bolha
-- renderize sem consulta extra: a leitura de mensagens passa pela RPC
-- conversation_messages (SETOF messages, select m.*), que já devolve a coluna
-- nova sem precisar ser recriada.
--
-- Coluna nullable sem default: ALTER é metadata-only, sem reescrita da tabela
-- nem lock longo — a tabela é quente (~1M linhas, ~100k mensagens/mês).
--
-- Forma:
--   {
--     "messageId": "<uuid da nossa mensagem>",      -- ausente quando órfã
--     "providerMessageId": "false_555…@lid_A55…",
--     "text": "trecho já truncado",
--     "mediaType": "image",
--     "direction": "in"
--   }

alter table public.messages add column if not exists reply_to jsonb;

comment on column public.messages.reply_to is
  'Snapshot da mensagem citada por esta (reply/quote). messageId ausente = a original não está no nosso histórico: a citação renderiza pelo snapshot, mas não é clicável.';
```

- [ ] **Step 4: Wire the Supabase provider mapper**

Em `src/providers/data/impl/supabase/messages.ts`:

1. Em `interface MessageRow` (após `transcription_status`, linha 55):

```ts
  reply_to: IMessageReplyRef | null;
```

2. Ajustar o import da linha 1: `import type { ID, IMessage, IMessageReplyRef, MessageMediaType } from "@/shared/types";`

3. Em `COLUMNS` (linha 60-63), acrescentar a coluna ao final da última string:

```ts
const COLUMNS =
  "id, conversation_id, direction, author_type, author_id, provider, text, media_type, " +
  "media_url, media_filename, status, sent_at, delivered_at, read_at, failure_reason, failure_code, " +
  "transcription, transcription_status, reply_to, created_at";
```

4. Em `rowToMessage` (após `mediaFilename`, linha 84):

```ts
    replyTo: row.reply_to ?? undefined,
```

- [ ] **Step 5: Wire the Realtime mapper**

Em `src/features/conversations/hooks/useRealtimeMessages.ts`:

1. Import: `import type { ID, IMessage, IMessageReplyRef } from "@/shared/types";`
2. Em `IMessageRealtimeRow` (após `transcription_status`, linha 32): `reply_to: IMessageReplyRef | null;`
3. Em `rowToMessage` (após `mediaFilename`, linha 69): `replyTo: row.reply_to ?? undefined,`

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun run test src/features/conversations/hooks/useRealtimeMessages.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260810120000_messages_reply_to.sql \
        src/providers/data/impl/supabase/messages.ts \
        src/features/conversations/hooks/useRealtimeMessages.ts \
        src/features/conversations/hooks/useRealtimeMessages.test.ts
git commit -m "feat(conversations): persist and read the messages.reply_to column"
```

⚠️ **Não aplicar a migration.** A aplicação em produção é manual e depende de OK explícito do dono (ver Global Constraints).

---

### Task 3: Parser WAHA propaga a citação recebida

O `payload.replyTo` já chega ao parser (`parser.ts:129`) e hoje só é lido para comentário em Status. Aqui ele passa a viajar nos dois retornos — inbound (cliente citou) e eco (vendedor citou pelo celular).

**Files:**
- Modify: `src/providers/whatsapp/types.ts:146-217`
- Modify: `src/providers/whatsapp/waha/parser.ts`
- Test: `src/providers/whatsapp/waha/parser.test.ts`

**Interfaces:**
- Consumes: `contentTypeFromMimetype` (já existe em `parser.ts:156`), `MEDIA_DISCRIMINATOR_TYPES` (`types.ts:47`).
- Produces: `IInboundReplyRef { providerMessageId: string; text?: string; mediaType?: MessageMediaTypeLike }`, `extractWahaReplyRef(payload: IWahaMessagePayload): IInboundReplyRef | undefined`, e `replyTo?: IInboundReplyRef` em `IInboundMessage` e `IOutboundEcho` — consumidos pela Task 4.

- [ ] **Step 1: Write the failing test**

Acrescentar ao final de `src/providers/whatsapp/waha/parser.test.ts`:

```ts
describe("parseWahaMessageEvent — quoted reply (in-chat)", () => {
  const quotedPayload = {
    id: "false_5555912345678@c.us_A5458535B99785B0084742B6E0DC759C",
    timestamp: 1786000000,
    from: "5555912345678@c.us",
    fromMe: false,
    body: "esse mesmo",
    replyTo: {
      id: "A55995F4894E267BE03B5F864110C5CB",
      body: "Tem o filtro de óleo do Volvo FH?",
      hasMedia: false,
    },
  };

  it("carries the quoted reference on an inbound message", () => {
    const parsed = parseWahaMessageEvent(quotedPayload, "acc-1");
    expect(parsed.replyTo).toEqual({
      providerMessageId: "A55995F4894E267BE03B5F864110C5CB",
      text: "Tem o filtro de óleo do Volvo FH?",
    });
  });

  it("carries the quoted reference on an outbound echo (seller quoted from the phone)", () => {
    const parsed = parseWahaMessageEvent({ ...quotedPayload, fromMe: true }, "acc-1");
    expect(parsed.type).toBe("outbound-echo");
    expect(parsed.replyTo?.providerMessageId).toBe("A55995F4894E267BE03B5F864110C5CB");
  });

  it("derives the quoted media type from the quoted media mimetype", () => {
    const parsed = parseWahaMessageEvent(
      {
        ...quotedPayload,
        replyTo: {
          id: "A55995F4894E267BE03B5F864110C5CB",
          body: "",
          hasMedia: true,
          media: { url: "https://waha.example/x.jpg", mimetype: "image/jpeg" },
        },
      },
      "acc-1",
    );
    expect(parsed.replyTo?.mediaType).toBe("image");
    expect(parsed.replyTo?.text).toBeUndefined();
  });

  it("leaves replyTo undefined on a plain message", () => {
    const parsed = parseWahaMessageEvent({ ...quotedPayload, replyTo: null }, "acc-1");
    expect(parsed.replyTo).toBeUndefined();
  });

  // A Status comment quotes something OUTSIDE the conversation — the quoted
  // media is already consumed as this message's OWN media (see extractContent),
  // so emitting a quote here would point at a message that isn't in the thread.
  it("does NOT emit a quote for a comment on a WhatsApp Status", () => {
    const parsed = parseWahaMessageEvent(statusReplyPayload, "acc-1");
    expect(parsed.replyTo).toBeUndefined();
  });
});
```

`statusReplyPayload` já existe no arquivo (bloco "reply to a WhatsApp Status", linha ~375). Se estiver no escopo de outro `describe`, promova a constante para o escopo do módulo antes de usá-la aqui.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/providers/whatsapp/waha/parser.test.ts`
Expected: FAIL — `expected undefined to deeply equal { providerMessageId: 'A55995F4…' }`.

- [ ] **Step 3: Add the normalized type**

Em `src/providers/whatsapp/types.ts`, logo antes de `export interface IInboundMessage` (linha 146):

```ts
/**
 * Mensagem citada, como veio no payload do provider — ainda NÃO resolvida
 * contra o nosso histórico. No WAHA `providerMessageId` é o id CRU (só o
 * hash); quem resolve para a nossa mensagem é o webhook, por casamento de
 * sufixo (ver waha/replyRef.ts).
 */
export interface IInboundReplyRef {
  providerMessageId: string;
  /** Corpo da mensagem citada, quando o provider o envia. */
  text?: string;
  /** Tipo de mídia da mensagem citada, derivado do mimetype quando presente. */
  mediaType?: InboundContentType;
}
```

E o campo, em **`IInboundMessage`** (após `adReferral`, linha 176) e em **`IOutboundEcho`** (após `mediaFilename`, linha 214), com o mesmo comentário:

```ts
  /** Set when this message quotes another one in the same chat. */
  replyTo?: IInboundReplyRef;
```

- [ ] **Step 4: Write the parser extraction**

Em `src/providers/whatsapp/waha/parser.ts`, adicionar após `extractWahaAdReferral` (por volta da linha 305):

```ts
/**
 * Normalizes the quoted message WAHA attaches as `replyTo`.
 *
 * Deliberately silent for a Status comment: there the quote points at a status
 * update that lives OUTSIDE any conversation — it is never a message in the
 * thread, and its media is already pulled in as this message's own media (see
 * extractContent). Emitting a quote for it would render a citation that can
 * never resolve to anything.
 */
export function extractWahaReplyRef(
  payload: IWahaMessagePayload,
): IInboundReplyRef | undefined {
  if (isWahaStatusReply(payload)) return undefined;
  const quoted = payload.replyTo;
  if (!quoted?.id) return undefined;
  const mimetype = quoted.media?.mimetype;
  const mediaType = quoted.hasMedia && mimetype ? contentTypeFromMimetype(mimetype) : undefined;
  return {
    providerMessageId: quoted.id,
    text: quoted.body?.trim() || undefined,
    ...(mediaType ? { mediaType } : {}),
  };
}
```

Importar o tipo no topo do arquivo (junto dos outros `import type` de `../types`): `IInboundReplyRef`.

Em `parseWahaMessageEvent`, adicionar a linha nos **dois** returns — no de `outbound-echo` (após `mediaFilename`, linha 390) e no de `message` (após `adReferral`, linha 411):

```ts
    replyTo: extractWahaReplyRef(payload),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test src/providers/whatsapp/waha/parser.test.ts`
Expected: PASS — inclusive os testes antigos de Status, que continuam verdes (o quote não é emitido lá).

- [ ] **Step 6: Mirror into the Edge tree**

Run: `bun run scripts/sync-whatsapp-shared.ts`
Expected: `supabase/functions/_shared/whatsapp/types.ts` e `.../waha/parser.ts` atualizados.

- [ ] **Step 7: Commit**

```bash
git add src/providers/whatsapp/types.ts src/providers/whatsapp/waha/parser.ts \
        src/providers/whatsapp/waha/parser.test.ts supabase/functions/_shared/whatsapp/
git commit -m "feat(whatsapp): carry the quoted message reference through the WAHA parser"
```

---

### Task 4: Webhook resolve e grava a citação recebida

Dois pontos de insert no `waha-webhook`: o eco (`index.ts:1034`) e o inbound (`index.ts:1315`). Em ambos, quando há citação, procuramos a mensagem original **na mesma conversa** e gravamos o snapshot.

**Files:**
- Create: `supabase/functions/_shared/replyRef.ts`
- Modify: `supabase/functions/waha-webhook/index.ts:1034-1053` e `:1315-1341`

**Interfaces:**
- Consumes: `pickReplyMatch`, `truncateQuotedText` (Task 1, via `_shared/whatsapp/waha/replyRef.ts`); `IInboundReplyRef` (Task 3).
- Produces: `resolveReplyRef(admin: SupabaseClient, conversationId: string, ref: IInboundReplyRef | undefined): Promise<IStoredReplyRef | null>` — reutilizada pela Task 5.

- [ ] **Step 1: Create the Edge-side resolver**

Criar `supabase/functions/_shared/replyRef.ts`:

```ts
/**
 * Resolves the quoted message of an inbound/echo event into the snapshot
 * persisted in `messages.reply_to`.
 *
 * Edge-runtime module (Deno, service_role): NOT part of the
 * src/providers/whatsapp mirror — that tree is wiped and regenerated by the
 * sync script. The PURE part of the reconciliation lives in the mirrored
 * `whatsapp/waha/replyRef.ts`, so front and Edge share one implementation.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { pickReplyMatch, truncateQuotedText } from "./whatsapp/waha/replyRef.ts";
import { MEDIA_DISCRIMINATOR_TYPES } from "./whatsapp/types.ts";
import type { IInboundReplyRef } from "./whatsapp/types.ts";

/** Shape written to `messages.reply_to` (mirrors IMessageReplyRef on the front). */
export interface IStoredReplyRef {
  messageId?: string;
  providerMessageId?: string;
  text?: string;
  mediaType?: string;
  direction?: "in" | "out";
}

/** Candidate rows scanned per lookup. The `like` below is a broad filter; the
 *  exact match happens in pickReplyMatch, and a handful of candidates is more
 *  than a unique hash can realistically produce. */
const CANDIDATE_LIMIT = 5;

/** `text`/`unknown` are not media discriminators — they map to a null column. */
function toMediaType(contentType: string | undefined): string | undefined {
  if (!contentType) return undefined;
  return (MEDIA_DISCRIMINATOR_TYPES as readonly string[]).includes(contentType)
    ? contentType
    : undefined;
}

export async function resolveReplyRef(
  admin: SupabaseClient,
  conversationId: string,
  ref: IInboundReplyRef | undefined,
): Promise<IStoredReplyRef | null> {
  const rawId = ref?.providerMessageId;
  if (!rawId) return null;

  const { data } = await admin
    .from("messages")
    .select("id, provider_message_id, text, media_type, direction")
    .eq("conversation_id", conversationId)
    .like("provider_message_id", `%${rawId}`)
    .limit(CANDIDATE_LIMIT);

  const hit = pickReplyMatch(
    (data ?? []) as { provider_message_id?: string | null }[],
    rawId,
  ) as
    | {
        id: string;
        provider_message_id: string;
        text: string | null;
        media_type: string | null;
        direction: "in" | "out";
      }
    | undefined;

  if (hit) {
    // Our own row is the better source than the provider's `body`: it carries
    // the media type and the text exactly as the thread renders it.
    return {
      messageId: hit.id,
      providerMessageId: hit.provider_message_id,
      text: truncateQuotedText(hit.text),
      mediaType: hit.media_type ?? undefined,
      direction: hit.direction,
    };
  }

  // Orphan quote — the original never reached our history (older than the
  // import, or a chat we never synced). The snapshot still renders; the UI
  // just won't make it clickable.
  return {
    providerMessageId: rawId,
    text: truncateQuotedText(ref?.text),
    mediaType: toMediaType(ref?.mediaType),
  };
}
```

- [ ] **Step 2: Wire the inbound insert**

Em `supabase/functions/waha-webhook/index.ts`, importar no topo (junto dos outros `_shared`):

```ts
import { resolveReplyRef } from "../_shared/replyRef.ts";
```

Antes do insert do inbound (linha 1314, imediatamente acima de `const messageId = crypto.randomUUID();`):

```ts
    // Quote resolution runs BEFORE the insert so the row lands complete — a
    // second UPDATE would race the Realtime event and make the bubble flicker
    // from un-quoted to quoted.
    const inboundReplyTo = await resolveReplyRef(admin, conversationId, parsed.replyTo);
```

E dentro do objeto do insert, após `webhook_event_ids: [eventKey],`:

```ts
      reply_to: inboundReplyTo,
```

- [ ] **Step 3: Wire the echo insert**

No mesmo arquivo, antes de `const echoMessageId = crypto.randomUUID();` (linha 1033):

```ts
      const echoReplyTo = await resolveReplyRef(admin, echoConversationId, parsed.replyTo);
```

E dentro do objeto do insert do eco, após `webhook_event_ids: [eventKey],`:

```ts
        reply_to: echoReplyTo,
```

⚠️ `parsed` no ramo do eco é do tipo `IOutboundEcho` — o campo `replyTo` foi adicionado nele na Task 3, então não há cast a fazer. Se o TypeScript reclamar, o sync da Task 3 não foi rodado.

- [ ] **Step 4: Type-check the Edge function**

Run: `bunx tsc --noEmit 2>&1 | grep -E "waha-webhook|_shared/replyRef" || echo "sem erros novos"`
Expected: `sem erros novos`. (Os arquivos Deno ficam fora do `tsconfig` do app; se não aparecerem, confirme visualmente que `resolveReplyRef` é chamado com `admin`, o id da conversa correta — `conversationId` no inbound, `echoConversationId` no eco — e `parsed.replyTo`.)

- [ ] **Step 5: Run the whole suite to catch regressions**

Run: `bun run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/replyRef.ts supabase/functions/waha-webhook/index.ts
git commit -m "feat(waha-webhook): resolve and persist the quoted message on inbound and echo"
```

---

### Task 5: Envio com citação (WAHA + composer hook)

O cliente manda apenas o **uuid** da mensagem citada; o servidor busca a linha, monta o snapshot autoritativo e emite `reply_to` (id serializado) para a WAHA. Vale para texto e mídia.

**Files:**
- Modify: `src/providers/whatsapp/waha/send.ts:43-64` e `:111-145`
- Test: `src/providers/whatsapp/waha/send.test.ts`
- Modify: `supabase/functions/_shared/wahaSendAdapter.ts:191-313`
- Modify: `supabase/functions/waha-send/index.ts:26-135`
- Modify: `src/features/conversations/hooks/useMessageSend.ts:71-227`

**Interfaces:**
- Consumes: `IMessageReplyRef` (Task 1), `resolveReplyRef` não é usado aqui (o alvo vem por uuid, não por id de provider).
- Produces: `ISendOptions.replyTo?: IMessageReplyRef` — consumido pelas Tasks 6–7; `sendWahaText(..., { replyTo?: string })` e `IWahaSendMediaInput.replyTo?: string`.

- [ ] **Step 1: Write the failing test**

Acrescentar em `src/providers/whatsapp/waha/send.test.ts`:

```ts
describe("sendWahaText — reply_to", () => {
  it("emits reply_to with the serialized provider id when quoting", async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ id: "true_5555@c.us_NEW" }), { status: 200 });
    }) as unknown as typeof fetch;

    await sendWahaText("key", fetchFn, { baseUrl: "https://waha.test", sessionName: "s1" }, {
      toPhone: "5555912345678",
      text: "temos sim",
      replyTo: "false_5555912345678@c.us_ABC",
    });

    expect(body.reply_to).toBe("false_5555912345678@c.us_ABC");
  });

  it("omits reply_to entirely when not quoting", async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ id: "true_5555@c.us_NEW" }), { status: 200 });
    }) as unknown as typeof fetch;

    await sendWahaText("key", fetchFn, { baseUrl: "https://waha.test", sessionName: "s1" }, {
      toPhone: "5555912345678",
      text: "oi",
    });

    expect("reply_to" in body).toBe(false);
  });
});
```

Ajuste o formato do stub de `fetch` ao que os testes já existentes no arquivo usam — reaproveite o helper local se houver um.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/providers/whatsapp/waha/send.test.ts`
Expected: FAIL — `expected undefined to be 'false_5555912345678@c.us_ABC'`.

- [ ] **Step 3: Emit reply_to in the WAHA client**

Em `src/providers/whatsapp/waha/send.ts`:

1. No input de `sendWahaText` (linha 47-52), adicionar:

```ts
    /** Serialized provider id of the quoted message (WAHA `reply_to`). */
    replyTo?: string;
```

E no corpo do `json` (linha 57-61), após `text: input.text,`:

```ts
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
```

2. Em `IWahaSendMediaInput` (linha 66-78), adicionar o mesmo campo com o mesmo comentário; e em `postWahaMedia` (linha 130-142), após a chave `file`:

```ts
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/providers/whatsapp/waha/send.test.ts`
Expected: PASS.

- [ ] **Step 5: Resolve the quote server-side in the adapter**

Em `supabase/functions/_shared/wahaSendAdapter.ts`:

1. Importar o tipo do snapshot: `import type { IStoredReplyRef } from "./replyRef.ts";`

2. Adicionar o helper acima de `persistAndDispatch`:

```ts
/**
 * Loads the quoted message by OUR id and builds both halves of the quote: the
 * snapshot persisted on the new row, and the serialized provider id WAHA needs
 * in `reply_to`.
 *
 * The client sends only the uuid — never the snapshot — so a tampered payload
 * can't fabricate a quote of a message the conversation doesn't own (the
 * lookup is scoped to the conversation).
 *
 * Returns nulls when the target can't be quoted (wrong conversation, or it
 * never reached WhatsApp so there is no provider id). The send then proceeds
 * WITHOUT the quote instead of failing: the UI already blocks that case
 * (canReplyTo), so this is defense-in-depth, and losing a citation is far
 * better than losing the message.
 */
async function loadReplyTarget(
  admin: SupabaseClient,
  conversationId: string,
  replyToMessageId: string | undefined,
): Promise<{ snapshot: IStoredReplyRef | null; providerMessageId: string | null }> {
  if (!replyToMessageId) return { snapshot: null, providerMessageId: null };

  const { data } = await admin
    .from("messages")
    .select("id, provider_message_id, text, media_type, direction")
    .eq("id", replyToMessageId)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  const providerMessageId = (data?.provider_message_id as string | null) ?? null;
  if (!data || !providerMessageId) return { snapshot: null, providerMessageId: null };

  const text = (data.text as string | null)?.trim();
  return {
    snapshot: {
      messageId: data.id as string,
      providerMessageId,
      text: text ? text.slice(0, 240) : undefined,
      mediaType: (data.media_type as string | null) ?? undefined,
      direction: data.direction as "in" | "out",
    },
    providerMessageId,
  };
}
```

3. Em `IPersistAndDispatchArgs` (linha 191-201), adicionar:

```ts
  /** Our id of the message being quoted (optional). */
  replyToMessageId?: string;
```

E trocar a assinatura de `send` para receber o id serializado resolvido:

```ts
  send: (target: IWahaTarget, replyToProviderMessageId: string | null) => Promise<{ providerMessageId: string }>;
```

4. Em `persistAndDispatch` (linha 203-255), após `const target = await resolveWahaTarget(...)`:

```ts
  const reply = await loadReplyTarget(admin, args.conversationId, args.replyToMessageId);
```

No objeto do insert, após `media_filename`:

```ts
    reply_to: reply.snapshot,
```

E na chamada: `const result = await args.send(target, reply.providerMessageId);`

5. Em `dispatchWahaText` e `dispatchWahaMedia`, adicionar `replyToMessageId?: string;` ao input, repassá-lo em `persistAndDispatch`, e propagar nas closures:

```ts
    send: (target, replyToProviderMessageId) =>
      sendWahaText(target.apiKey, globalThis.fetch, target, {
        toPhone: target.toPhone,
        chatId: target.chatId,
        text: input.text,
        ...(replyToProviderMessageId ? { replyTo: replyToProviderMessageId } : {}),
      }),
```

```ts
    send: (target, replyToProviderMessageId) =>
      sendWahaMedia(target.apiKey, globalThis.fetch, target, {
        toPhone: target.toPhone,
        chatId: target.chatId,
        mediaType: input.mediaType,
        mediaUrl: input.mediaUrl,
        filename: input.fileName,
        caption: input.caption,
        sizeBytes: input.sizeBytes,
        ...(replyToProviderMessageId ? { replyTo: replyToProviderMessageId } : {}),
      }),
```

⚠️ `scheduled-send-worker` também chama `dispatchWahaText`/`dispatchWahaMedia`. Como `replyToMessageId` é opcional, ele segue funcionando sem alteração — confirme com `grep -rn "dispatchWaha" supabase/functions/` que nenhum call site quebra.

- [ ] **Step 6: Accept the field in the Edge entrypoint**

Em `supabase/functions/waha-send/index.ts`:

1. Em `ISendBody` (linha 26-37):

```ts
  /** Our id of the message being quoted (reply/quote). */
  replyToMessageId?: string;
```

2. Repassar nas duas chamadas (linhas 118-135), em cada objeto:

```ts
            replyToMessageId: body.replyToMessageId,
```

- [ ] **Step 7: Wire the client hook**

Em `src/features/conversations/hooks/useMessageSend.ts`:

1. Import: acrescentar `IMessageReplyRef` ao `import type { … } from "@/shared/types";`

2. Em `ISendOptions` (linha 71-91):

```ts
  /**
   * Mensagem citada por este envio. O snapshot é usado na bolha otimista; o
   * servidor monta o seu próprio a partir de `replyTo.messageId` (fonte da
   * verdade) e emite o `reply_to` para a WAHA.
   */
  replyTo?: IMessageReplyRef;
```

3. Desestruturar `replyTo` nos parâmetros de `send` (linha 119-129).

4. Na mensagem otimista (linha 141-162), após `mediaFilename: fileName,`:

```ts
        replyTo,
```

5. No corpo do `waha-send` (linha 179-192), após `messageId,`:

```ts
                  ...(replyTo?.messageId ? { replyToMessageId: replyTo.messageId } : {}),
```

6. Adicionar `replyTo` ao array de dependências do `useCallback` (linha 273) — junto de `messages`, `provider`, etc. não é necessário (é argumento, não closure), então **não** altere o array; confirme que `replyTo` vem só do parâmetro.

- [ ] **Step 8: Run the suite**

Run: `bun run test && bun run build`
Expected: PASS nos dois.

- [ ] **Step 9: Mirror and commit**

```bash
bun run scripts/sync-whatsapp-shared.ts
git add src/providers/whatsapp/waha/send.ts src/providers/whatsapp/waha/send.test.ts \
        supabase/functions/_shared/whatsapp/ supabase/functions/_shared/wahaSendAdapter.ts \
        supabase/functions/waha-send/index.ts src/features/conversations/hooks/useMessageSend.ts
git commit -m "feat(conversations): send a quoted reply through WAHA reply_to"
```

---

### Task 6: A citação na bolha + menu de ações

Primeira parte visível. A bolha passa a mostrar a citação e a oferecer "Responder" / "Copiar texto" no hover.

**Files:**
- Create: `src/features/conversations/engine/replyRef.ts`
- Test: `src/features/conversations/engine/replyRef.test.ts`
- Create: `src/features/conversations/components/bubbles/QuotedPreview.tsx`
- Create: `src/features/conversations/components/bubbles/BubbleActionsMenu.tsx`
- Modify: `src/features/conversations/components/bubbles/bubbleChrome.tsx`
- Modify: `src/features/conversations/i18n/pt-BR.ts`

**Interfaces:**
- Consumes: `IMessage.replyTo` (Tasks 1–2).
- Produces: `canReplyTo(message: IMessage): boolean`, `quotedAuthorLabel(ref: IMessageReplyRef, contactName?: string): string`, `quotedMediaLabel(ref: IMessageReplyRef): { icon: string; label: string } | null`, `<QuotedPreview reply contactName variant onJump />`, `<BubbleActionsMenu message onReply />` — consumidos pelas Tasks 7–8.

- [ ] **Step 1: Write the failing test**

Criar `src/features/conversations/engine/replyRef.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { IMessage, IMessageReplyRef } from "@/shared/types";
import { canReplyTo, quotedAuthorLabel, quotedMediaLabel } from "./replyRef";

function message(patch: Partial<IMessage> = {}): IMessage {
  return {
    id: "m1",
    conversationId: "c1",
    direction: "in",
    authorType: "customer",
    provider: "waha",
    text: "oi",
    status: "delivered",
    sentAt: "2026-08-10T12:00:00.000Z",
    ...patch,
  };
}

describe("canReplyTo", () => {
  it("allows quoting a delivered inbound message", () => {
    expect(canReplyTo(message())).toBe(true);
  });

  it("allows quoting a sent outbound message", () => {
    expect(canReplyTo(message({ direction: "out", status: "sent" }))).toBe(true);
  });

  // A queued/failed message never reached WhatsApp, so it has no provider id
  // for WAHA's reply_to — offering the action would produce a send with a
  // silently dropped quote.
  it("refuses a message that never left (queued or failed)", () => {
    expect(canReplyTo(message({ status: "queued" }))).toBe(false);
    expect(canReplyTo(message({ status: "failed" }))).toBe(false);
  });

  it("refuses a system message", () => {
    expect(canReplyTo(message({ authorType: "system" }))).toBe(false);
  });
});

describe("quotedAuthorLabel", () => {
  it("labels our own message as Você", () => {
    expect(quotedAuthorLabel({ direction: "out" }, "João Transportes")).toBe("Você");
  });

  it("uses the contact name for the customer's message", () => {
    expect(quotedAuthorLabel({ direction: "in" }, "João Transportes")).toBe("João Transportes");
  });

  it("falls back to Cliente when the contact has no name", () => {
    expect(quotedAuthorLabel({ direction: "in" }, undefined)).toBe("Cliente");
  });
});

describe("quotedMediaLabel", () => {
  it("returns null when the quote has readable text", () => {
    expect(quotedMediaLabel({ text: "Filtro racor", mediaType: "image" })).toBeNull();
  });

  it("labels an image without caption", () => {
    expect(quotedMediaLabel({ mediaType: "image" })).toEqual({
      icon: "mdi:image",
      label: "Foto",
    });
  });

  it("labels an audio without caption", () => {
    expect(quotedMediaLabel({ mediaType: "audio" })).toEqual({
      icon: "mdi:microphone",
      label: "Áudio",
    });
  });

  it("falls back to a generic label when there is neither text nor media type", () => {
    expect(quotedMediaLabel({})).toEqual({
      icon: "mdi:message-outline",
      label: "Mensagem",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/features/conversations/engine/replyRef.test.ts`
Expected: FAIL — `Failed to resolve import "./replyRef"`.

- [ ] **Step 3: Add the i18n strings**

Em `src/features/conversations/i18n/pt-BR.ts`, dentro de `CONVERSATION_STRINGS`, acrescentar o bloco:

```ts
  reply: {
    action: "Responder",
    copyText: "Copiar texto",
    copied: "Texto copiado",
    bubbleActions: "Ações da mensagem",
    composerTitle: "Respondendo a",
    cancel: "Cancelar resposta",
    you: "Você",
    contactFallback: "Cliente",
    media: {
      image: "Foto",
      audio: "Áudio",
      video: "Vídeo",
      document: "Documento",
      location: "Localização",
      contact: "Contato",
      generic: "Mensagem",
    },
  },
```

- [ ] **Step 4: Write the engine**

Criar `src/features/conversations/engine/replyRef.ts`:

```ts
import type { IMessage, IMessageReplyRef } from "@/shared/types";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";

/**
 * Regras de apresentação da citação (reply/quote).
 *
 * A reconciliação de ids vive na camada de provider
 * (`src/providers/whatsapp/waha/replyRef.ts`), porque o webhook precisa dela
 * também. Aqui fica só o que é da tela.
 */

/**
 * Se uma mensagem pode ser citada.
 *
 * `queued`/`failed` nunca chegaram ao WhatsApp, então não têm
 * `provider_message_id` para o `reply_to` da WAHA — o envio sairia sem a
 * citação, silenciosamente. Mensagem de sistema não existe do lado do
 * WhatsApp.
 */
export function canReplyTo(message: IMessage): boolean {
  if (message.authorType === "system") return false;
  return message.status !== "queued" && message.status !== "failed";
}

/** Autor da mensagem citada, como aparece no cabeçalho da citação. */
export function quotedAuthorLabel(ref: IMessageReplyRef, contactName?: string): string {
  if (ref.direction === "out") return CONVERSATION_STRINGS.reply.you;
  return contactName?.trim() || CONVERSATION_STRINGS.reply.contactFallback;
}

const MEDIA_LABELS: Record<string, { icon: string; label: string }> = {
  image: { icon: "mdi:image", label: CONVERSATION_STRINGS.reply.media.image },
  sticker: { icon: "mdi:sticker-emoji", label: CONVERSATION_STRINGS.reply.media.image },
  audio: { icon: "mdi:microphone", label: CONVERSATION_STRINGS.reply.media.audio },
  video: { icon: "mdi:video", label: CONVERSATION_STRINGS.reply.media.video },
  document: { icon: "mdi:file-document", label: CONVERSATION_STRINGS.reply.media.document },
  location: { icon: "mdi:map-marker", label: CONVERSATION_STRINGS.reply.media.location },
  contact: { icon: "mdi:account", label: CONVERSATION_STRINGS.reply.media.contact },
};

/**
 * Rótulo com ícone para citação SEM texto legível. Retorna null quando há
 * texto — nesse caso o trecho é o próprio conteúdo e vence o rótulo.
 */
export function quotedMediaLabel(ref: IMessageReplyRef): { icon: string; label: string } | null {
  if (ref.text?.trim()) return null;
  const byType = ref.mediaType ? MEDIA_LABELS[ref.mediaType] : undefined;
  return (
    byType ?? { icon: "mdi:message-outline", label: CONVERSATION_STRINGS.reply.media.generic }
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test src/features/conversations/engine/replyRef.test.ts`
Expected: PASS (12 testes).

- [ ] **Step 6: Build QuotedPreview**

Criar `src/features/conversations/components/bubbles/QuotedPreview.tsx`:

```tsx
import type { IMessageReplyRef } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { quotedAuthorLabel, quotedMediaLabel } from "../../engine/replyRef";

export interface IQuotedPreviewProps {
  reply: IMessageReplyRef;
  /** Nome do contato da conversa — autor da citação quando ela é do cliente. */
  contactName?: string;
  /** `bubble` dentro da mensagem; `composer` acima do campo de texto. */
  variant?: "bubble" | "composer";
  /** Leva até a mensagem original. Ausente = citação não clicável (órfã). */
  onJump?: () => void;
}

/**
 * O bloco de citação — mesmo componente dentro da bolha e no composer.
 *
 * Renderiza a partir do SNAPSHOT gravado em `messages.reply_to`, sem
 * consultar a mensagem original: é isso que mantém a thread sem query extra
 * e faz a citação sobreviver quando a original não está no nosso histórico.
 */
export function QuotedPreview({
  reply,
  contactName,
  variant = "bubble",
  onJump,
}: IQuotedPreviewProps) {
  const author = quotedAuthorLabel(reply, contactName);
  const mediaLabel = quotedMediaLabel(reply);
  const clickable = Boolean(onJump);

  const content = (
    <>
      <span className="block truncate text-[11px] font-semibold text-foreground">{author}</span>
      {mediaLabel ? (
        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Icon icon={mediaLabel.icon} size={12} />
          {mediaLabel.label}
        </span>
      ) : (
        <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {reply.text}
        </span>
      )}
    </>
  );

  const className = cn(
    "block w-full rounded-md border-l-2 border-primary bg-muted/60 px-2 py-1 text-left",
    variant === "bubble" ? "mb-1.5" : "mb-0",
    clickable && "transition-colors hover:bg-muted",
  );

  if (!clickable) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button type="button" onClick={onJump} className={className}>
      {content}
    </button>
  );
}
```

- [ ] **Step 7: Build the hover actions menu**

Criar `src/features/conversations/components/bubbles/BubbleActionsMenu.tsx`:

```tsx
import { toast } from "sonner";
import type { IMessage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import { canReplyTo } from "../../engine/replyRef";

export interface IBubbleActionsMenuProps {
  message: IMessage;
  /** Ausente quando a tela não oferece resposta (nenhum ReplyDraftProvider). */
  onReply?: () => void;
}

/**
 * Chevron discreto no canto da bolha, revelado no hover/foco.
 *
 * Fica no canto superior, fora da área de conteúdo, para não competir com o
 * clique da mídia (lightbox, play de áudio). Some por completo quando não há
 * nenhuma ação disponível — um menu vazio é pior que menu nenhum.
 */
export function BubbleActionsMenu({ message, onReply }: IBubbleActionsMenuProps) {
  const showReply = Boolean(onReply) && canReplyTo(message);
  const text = message.text.trim();
  const showCopy = text.length > 0;
  if (!showReply && !showCopy) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(CONVERSATION_STRINGS.reply.copied);
    } catch {
      toast.error(CONVERSATION_STRINGS.actionFailed);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={CONVERSATION_STRINGS.reply.bubbleActions}
        className="absolute right-1 top-1 hidden rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted focus-visible:opacity-100 group-hover/bubble:opacity-100 sm:block"
      >
        <Icon icon="mdi:chevron-down" size={14} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {showReply && (
          <DropdownMenuItem onSelect={onReply}>
            <Icon icon="mdi:reply" size={14} className="mr-2" />
            {CONVERSATION_STRINGS.reply.action}
          </DropdownMenuItem>
        )}
        {showCopy && (
          <DropdownMenuItem onSelect={() => void copy()}>
            <Icon icon="mdi:content-copy" size={14} className="mr-2" />
            {CONVERSATION_STRINGS.reply.copyText}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 8: Wire both into BubbleChrome**

Em `src/features/conversations/components/bubbles/bubbleChrome.tsx`:

1. Estender as props (após `unpadded`, linha 18):

```ts
  /** Nome do contato — autor da citação quando ela é do cliente. */
  contactName?: string;
  /** Inicia uma resposta citando esta mensagem. Ausente = ação indisponível. */
  onReply?: () => void;
  /** Leva até a mensagem citada. Ausente = citação não clicável. */
  onJumpToQuoted?: () => void;
```

2. Adicionar os imports de `QuotedPreview` e `BubbleActionsMenu`.

3. No `<div>` da bolha (linha 57-64), acrescentar `group/bubble` às classes e o `data-message-id`:

```tsx
      <div
        data-message-id={message.id}
        className={cn(
          "group/bubble relative max-w-[78%] rounded-2xl text-sm shadow-sm",
          bubbleColor,
          failedColor,
          unpadded ? "overflow-hidden" : "px-3 py-2",
        )}
      >
        <BubbleActionsMenu message={message} onReply={onReply} />
        {message.replyTo && (
          <QuotedPreview
            reply={message.replyTo}
            contactName={contactName}
            onJump={message.replyTo.messageId ? onJumpToQuoted : undefined}
          />
        )}
        {children}
```

⚠️ Em bolhas `unpadded` (mídia) a citação precisa de respiro: envolva o `QuotedPreview` em `<div className={unpadded ? "px-2 pt-2" : undefined}>` quando `unpadded` for verdadeiro.

- [ ] **Step 9: Verify build and tests**

Run: `bun run test && bun run build`
Expected: PASS. A citação ainda não aparece na tela (nenhuma mensagem tem `replyTo` até a migration ser aplicada) — o objetivo aqui é que os componentes existam e compilem.

- [ ] **Step 10: Commit**

```bash
git add src/features/conversations/engine/replyRef.ts src/features/conversations/engine/replyRef.test.ts \
        src/features/conversations/components/bubbles/QuotedPreview.tsx \
        src/features/conversations/components/bubbles/BubbleActionsMenu.tsx \
        src/features/conversations/components/bubbles/bubbleChrome.tsx \
        src/features/conversations/i18n/pt-BR.ts
git commit -m "feat(conversations): render the quoted message and the bubble actions menu"
```

---

### Task 7: Rascunho de resposta e barra do composer

Liga o "Responder" da bolha ao campo de texto. O contexto é **dedicado** (não entra no `ConversationContext`) para que trocar o alvo não re-renderize a thread inteira.

**Files:**
- Create: `src/features/conversations/hooks/useReplyDraft.tsx`
- Create: `src/features/conversations/components/ReplyComposerBar.tsx`
- Modify: `src/features/conversations/pages/ConversationPage.tsx:237-239`
- Modify: `src/features/conversations/components/MessageList.tsx:276-282`
- Modify: `src/features/conversations/components/MessageInput.tsx`

**Interfaces:**
- Consumes: `QuotedPreview` (Task 6), `ISendOptions.replyTo` (Task 5), `canReplyTo` (Task 6).
- Produces: `useReplyDraft(): IReplyDraftValue | null` com `{ target: IReplyTarget | null; startReply(message: IMessage): void; clear(): void }`; `IReplyTarget = { messageId: ID; ref: IMessageReplyRef }`.

- [ ] **Step 1: Create the context**

Criar `src/features/conversations/hooks/useReplyDraft.tsx`:

```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ID, IMessage, IMessageReplyRef } from "@/shared/types";

export interface IReplyTarget {
  /** Nossa mensagem citada — o que vai para o servidor. */
  messageId: ID;
  /** Snapshot local, usado na barra do composer e na bolha otimista. */
  ref: IMessageReplyRef;
}

export interface IReplyDraftValue {
  target: IReplyTarget | null;
  startReply: (message: IMessage) => void;
  clear: () => void;
}

const Ctx = createContext<IReplyDraftValue | null>(null);

/**
 * Rascunho de "respondendo a" da conversa aberta.
 *
 * Contexto próprio, e não o ConversationContext, de propósito: trocar o alvo
 * re-renderizaria toda a thread se morasse lá. Aqui quem consome o alvo é só o
 * composer; as bolhas consomem apenas `startReply`, que é estável.
 */
export function ReplyDraftProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<IReplyTarget | null>(null);

  const startReply = useCallback((message: IMessage) => {
    setTarget({
      messageId: message.id,
      ref: {
        messageId: message.id,
        text: message.text.trim() || undefined,
        mediaType: message.mediaType,
        direction: message.direction,
      },
    });
  }, []);

  const clear = useCallback(() => setTarget(null), []);
  const value = useMemo(() => ({ target, startReply, clear }), [target, startReply, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Retorna null (em vez de lançar) fora do provider: bolhas são renderizadas em
 * telas que não oferecem resposta, e ali o menu simplesmente não mostra a ação.
 */
export function useReplyDraft(): IReplyDraftValue | null {
  return useContext(Ctx);
}
```

- [ ] **Step 2: Mount the provider**

Em `src/features/conversations/pages/ConversationPage.tsx`, importar `ReplyDraftProvider` e envolver o conteúdo do `ConversationProvider` (linha 237-239):

```tsx
        <ConversationProvider value={{ messages, openContactConversation: setContactDialogTarget }}>
          <ReplyDraftProvider>
            {/* … todo o conteúdo atual, do <div className="flex h-full …"> até o fechamento … */}
          </ReplyDraftProvider>
        </ConversationProvider>
```

- [ ] **Step 3: Wire the bubble action**

Em `src/features/conversations/components/MessageList.tsx`:

1. Importar `useReplyDraft`.
2. Dentro do componente, após `const sendHook = …` (linha 38): `const replyDraft = useReplyDraft();`
3. `MessageList` precisa do nome do contato para o rótulo da citação. Adicionar a prop em `IMessageListProps` e repassá-la no `ConversationPage` (que já tem `contact?.name` na linha 330):

```ts
export interface IMessageListProps {
  conversation: IConversation;
  whatsappAccount?: IWhatsAppAccount | null;
  /** Nome do contato — autor da citação quando ela é do cliente. */
  contactName?: string;
}
```

4. No `MessageBubble` do map (linha 276-282):

```tsx
          return (
            <MessageBubble
              key={row.id}
              message={row.message}
              contactName={contactName}
              onRetry={() => handleRetry(row.message)}
              onReply={replyDraft ? () => replyDraft.startReply(row.message) : undefined}
            />
          );
```

5. `MessageBubble` (`bubbles/MessageBubble.tsx`) apenas repassa: adicionar `contactName?: string` e `onReply?: () => void` a `IMessageBubbleProps` e encaminhá-los a **todos** os sub-bubbles, que por sua vez os repassam ao `BubbleChrome`. Faça isso mecanicamente em cada um dos 10 componentes de bolha (`TextBubble`, `ImageBubble`, `AudioBubble`, `VideoBubble`, `DocumentBubble`, `LocationBubble`, `ContactBubble`, `TemplateBubble`, `UnsupportedBubble`, `ProductCardBubble`/`LinkBubble`) — todos já recebem `message`/`onRetry` e delegam ao `BubbleChrome`.

6. Em `ConversationPage.tsx` linha 292: `<MessageList conversation={conversation} whatsappAccount={whatsappAccount} contactName={contact?.name} />`

- [ ] **Step 4: Build the composer bar**

Criar `src/features/conversations/components/ReplyComposerBar.tsx`:

```tsx
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { QuotedPreview } from "./bubbles/QuotedPreview";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
import type { IReplyTarget } from "../hooks/useReplyDraft";

export interface IReplyComposerBarProps {
  target: IReplyTarget;
  contactName?: string;
  onCancel: () => void;
}

/** Faixa "Respondendo a …" acima do campo de texto, com cancelamento. */
export function ReplyComposerBar({ target, contactName, onCancel }: IReplyComposerBarProps) {
  return (
    <div className="flex items-start gap-2 border-b border-border px-3 py-2">
      <Icon icon="mdi:reply" size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {CONVERSATION_STRINGS.reply.composerTitle}
        </p>
        <QuotedPreview reply={target.ref} contactName={contactName} variant="composer" />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 shrink-0 p-0"
        aria-label={CONVERSATION_STRINGS.reply.cancel}
        onClick={onCancel}
      >
        <Icon icon="mdi:close" size={14} />
      </Button>
    </div>
  );
}
```

`min-w-0` no meio é obrigatório: sem ele a coluna trava no `min-content` e o texto longo empurra o botão para fora.

- [ ] **Step 5: Wire the composer**

Em `src/features/conversations/components/MessageInput.tsx`:

1. Importar `useReplyDraft` e `ReplyComposerBar`.
2. Após `const sendHook = useMessageSend(...)` (linha 233): `const replyDraft = useReplyDraft();`
3. Renderizar a barra imediatamente **antes** de `<div className="flex items-end gap-2 px-3 py-2">` (linha 962):

```tsx
      {replyDraft?.target && (
        <ReplyComposerBar
          target={replyDraft.target}
          contactName={contactName}
          onCancel={replyDraft.clear}
        />
      )}
```

(`contactName` já é uma prop do `MessageInput` — ver `ConversationPage.tsx:330`.)

4. Em `handleSend` (linha 717), passar a citação e limpá-la **depois** do envio bem-sucedido:

```ts
    setValue("");
    const replyTo = replyDraft?.target?.ref;
    try {
      await sendHook.send({ text, ...(replyTo ? { replyTo } : {}) });
      replyDraft?.clear();
      onSent?.();
```

A limpeza fica depois do `await` de propósito: se o envio falhar (janela de 24h, número inválido), o alvo continua ali e o atendente reenvia sem ter que citar de novo.

5. Em `handleKey` (linha 790), antes de tudo, `Escape` cancela a citação:

```ts
    if (e.key === "Escape" && replyDraft?.target && !slashOpen) {
      e.preventDefault();
      replyDraft.clear();
      return;
    }
```

Colocar **antes** do bloco `if (slashOpen)` para não roubar o `Escape` do menu de barra.

- [ ] **Step 6: Verify**

Run: `bun run test && bun run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/conversations/hooks/useReplyDraft.tsx \
        src/features/conversations/components/ReplyComposerBar.tsx \
        src/features/conversations/components/MessageInput.tsx \
        src/features/conversations/components/MessageList.tsx \
        src/features/conversations/components/bubbles/ \
        src/features/conversations/pages/ConversationPage.tsx
git commit -m "feat(conversations): compose a reply quoting a message"
```

---

### Task 8: Pulo para a mensagem citada

Clicar na citação rola até a original e a destaca. Reusa o padrão que a lista já tem para notas (`jumpToNote`, `MessageList.tsx:129`), agora por `[data-message-id]` (adicionado na Task 6).

**Files:**
- Modify: `src/features/conversations/components/MessageList.tsx:128-140, 276-282`
- Modify: `src/features/conversations/components/bubbles/bubbleChrome.tsx`

**Interfaces:**
- Consumes: `data-message-id` (Task 6), `onJumpToQuoted` (Task 6).
- Produces: nada além do comportamento.

- [ ] **Step 1: Add the jump + flash state**

Em `src/features/conversations/components/MessageList.tsx`, junto de `flashNoteId` (linha 56):

```ts
  const [flashMessageId, setFlashMessageId] = useState<string | null>(null);
```

E ao lado de `jumpToNote` (linha 129):

```ts
  /**
   * Rola até a mensagem citada e a destaca por um instante.
   *
   * Silencioso quando ela não está carregada: a thread pagina, e a original
   * pode estar muitas páginas acima. Buscar páginas até achá-la mexeria na
   * paginação do Atendimento (área congelada) e poderia disparar várias
   * buscas numa conversa de milhares de mensagens.
   */
  const jumpToMessage = useCallback((messageId: string) => {
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-message-id="${messageId}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashMessageId(messageId);
  }, []);

  useEffect(() => {
    if (!flashMessageId) return;
    const t = setTimeout(() => setFlashMessageId(null), 1600);
    return () => clearTimeout(t);
  }, [flashMessageId]);
```

- [ ] **Step 2: Pass it down**

No `MessageBubble` do map:

```tsx
              onJumpToQuoted={
                row.message.replyTo?.messageId
                  ? () => jumpToMessage(row.message.replyTo!.messageId!)
                  : undefined
              }
              flash={flashMessageId === row.message.id}
```

`flash` desce por `MessageBubble` → sub-bubbles → `BubbleChrome` da mesma forma mecânica da Task 7.

- [ ] **Step 3: Render the flash**

Em `bubbleChrome.tsx`, adicionar `flash?: boolean` às props e à classe do `<div>` da bolha:

```tsx
          flash && "ring-2 ring-primary/60 transition-shadow",
```

- [ ] **Step 4: Verify**

Run: `bun run test && bun run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/MessageList.tsx \
        src/features/conversations/components/bubbles/
git commit -m "feat(conversations): jump to the quoted message from the citation"
```

---

### Task 9: Verificação final, changelog e PR

**Files:**
- Modify: `CHANGELOG.md`
- Nenhum código novo.

- [ ] **Step 1: Full suite**

Run: `bun run test`
Expected: PASS, sem testes pulados. Anote o total.

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: sucesso.

- [ ] **Step 3: Type-check delta**

```bash
git diff --name-status main...HEAD --diff-filter=A
bunx tsc --noEmit 2>&1 | grep -E "replyRef|QuotedPreview|BubbleActionsMenu|ReplyComposerBar|useReplyDraft" || echo "sem erros nos arquivos novos"
```
Expected: `sem erros nos arquivos novos` (o repositório tem baseline de ~315 erros pré-existentes — só o delta importa).

- [ ] **Step 4: Lint**

Run: `bun run lint`
Expected: sem erros novos.

- [ ] **Step 5: Update the changelog**

Em `CHANGELOG.md`, na seção não publicada (ou criando `## [Não publicado]` no topo), em **Added**:

```markdown
- Responder mensagem citando na conversa: o atendente cita uma mensagem ao responder, e a citação feita pelo cliente (ou pelo vendedor no celular) passa a aparecer na thread. Clicar na citação leva até a mensagem original.
```

Sem bump de versão — o bump é decisão do dono (ver `docs/` e a política de versionamento).

- [ ] **Step 6: Open the PR**

```bash
git push
gh pr create --title "feat: responder (citar) mensagem na conversa" --body "$(cat <<'EOF'
## O que muda

Responder citando uma mensagem, nos dois sentidos: o atendente cita ao responder, e a citação feita pelo cliente (ou pelo vendedor no celular) aparece na thread.

Spec: `docs/superpowers/specs/2026-08-10-conversation-reply-quote-design.md`
Plano: `docs/superpowers/plans/2026-08-10-conversation-reply-quote.md`

## ⚠️ Ordem de aplicação em produção

1. **Aplicar a migration** `20260810120000_messages_reply_to.sql` — mergear este PR NÃO a aplica. O front passa a pedir a coluna `reply_to` no `select`, então a migration precisa vir **antes** do deploy.
2. **Deploy das Edge Functions** `waha-webhook` e `waha-send` (`npx supabase functions deploy <nome>`).
3. Deploy do front.

## Detalhe que vale conhecer

A WAHA entrega o id da mensagem citada **cru** (só o hash) no inbound, enquanto persistimos o id **serializado**. O casamento é por sufixo, validado com o separador `_` — um match por igualdade orfanaria todas as citações silenciosamente. Coberto por teste em `src/providers/whatsapp/waha/replyRef.test.ts`.

## Smoke sugerido

- Responder uma mensagem de texto do cliente → a bolha enviada mostra a citação, e no WhatsApp do cliente aparece citada.
- Responder uma mensagem de mídia.
- Pedir para o cliente responder citando uma mensagem nossa → a citação aparece na thread.
- Responder citando pelo celular → o eco chega com a citação.
- Clicar numa citação → rola até a original com destaque.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: Report**

Informar ao dono: número do PR, que a migration e os dois deploys aguardam OK explícito, e que o smoke em produção é dele.

---

## Self-review do plano

**Cobertura da spec:**

| Seção da spec | Task |
|---|---|
| §4.1 coluna `reply_to jsonb` | Task 2 |
| §4.2 forma do payload | Tasks 2, 4, 5 |
| §4.3 `IMessageReplyRef` | Task 1 |
| §5 envio (texto e mídia, guarda de `provider_message_id`) | Task 5 (+ `canReplyTo` na Task 6) |
| §6.1 parser normaliza, Status não emite | Task 3 |
| §6.2 resolução por sufixo, órfã | Tasks 1 e 4 |
| §7.1 menu de hover, `data-message-id` | Task 6 |
| §7.2 `QuotedPreview`, rótulos de mídia | Task 6 |
| §7.3 barra do composer, `Escape` | Task 7 |
| §7.4 `ReplyDraftContext` dedicado | Task 7 |
| §7.5 pulo + flash | Task 8 |
| §8 testes do engine e do parser | Tasks 1, 3, 5, 6 |
| §10 migration, sync, deploys, gates | Global Constraints + Tasks 1, 3, 5, 9 |

**Consistência de nomes** (verificada entre tasks): `matchesProviderMessageId`, `pickReplyMatch`, `truncateQuotedText`, `QUOTED_TEXT_MAX` (Task 1) são consumidos com esses mesmos nomes nas Tasks 4 e 5. `IMessageReplyRef` (Task 1) é usado nas Tasks 2, 5, 6, 7. `IInboundReplyRef` / `extractWahaReplyRef` (Task 3) são consumidos na Task 4. `canReplyTo` / `quotedAuthorLabel` / `quotedMediaLabel` (Task 6) são consumidos nas Tasks 6 e 7. `IReplyTarget` / `useReplyDraft` (Task 7) são consumidos na Task 7. `resolveReplyRef` (Task 4) é usado só no webhook — o envio usa `loadReplyTarget` (Task 5), que é outra função de propósito diferente (busca por uuid, não por id de provider), e por isso tem outro nome.

**Ponto de atenção para quem executar:** a Task 7 Step 3.5 e a Task 8 Step 2 exigem repassar props por ~10 componentes de bolha. É trabalho mecânico, mas se algum sub-bubble for esquecido a citação simplesmente não aparece naquele tipo de mensagem — vale conferir a lista inteira antes de commitar.
