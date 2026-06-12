# WhatsApp Real Inbox (Evolution) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the production Inbox mirror the connected Evolution WhatsApp account — archive the demo-seed conversations, persist `fromMe` echoes from the webhook, and add an owner-only batched/idempotent history import — per spec `docs/superpowers/specs/2026-06-11-whatsapp-real-inbox-design.md`.

**Architecture:** The DB stays the source of truth. The runtime-agnostic layer `src/providers/whatsapp/` gains an `outbound-echo` parse type + webhook-core branch and a new `import/core.ts` (injected `IImportDb`/`IImportSource`, fully unit-testable), mirrored into `supabase/functions/_shared/whatsapp/` by `scripts/sync-whatsapp-shared.ts`. A new owner-only Edge Function `whatsapp-import-history` drives batched imports; the UI is one button + dialog on `WhatsAppAccountsPage`. Seed archival is a one-shot assisted SQL data fix run by the controller.

**Tech Stack:** React 19 + TanStack (app), Vitest, Supabase Edge Functions (Deno), Evolution API v2 (`/chat/findChats`, `/chat/findMessages`), MCP Supabase for deploy/SQL.

---

## Regras de execução (TODOS os subagentes)

- Branch de trabalho: `feat/whatsapp-real-inbox` — **nunca trocar de branch**.
- `src/routeTree.gen.ts` é gerado: antes de commitar, rode `git checkout -- src/routeTree.gen.ts`.
- `vite.config.ts` tem alteração local do usuário: **nunca commitar, nunca reverter**.
- Avisos CRLF / `Delete ␍` são falsos positivos — ignorar.
- Commits: Conventional Commits em inglês + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- ⚠️ Regra do projeto: qualquer mudança em `src/providers/whatsapp/` exige `bun run scripts/sync-whatsapp-shared.ts` (Tasks 3 e 6 cobrem isso) — o diretório `supabase/functions/_shared/whatsapp/` é espelho gerado, **nunca editar à mão**.
- Deploys de Edge Function e SQL em produção são feitos **pelo controlador** (sessão principal), não pelos subagentes.

## File Structure

| Arquivo | Papel |
| --- | --- |
| `src/providers/whatsapp/types.ts` | + `IOutboundEcho` (novo tipo normalizado) |
| `src/providers/whatsapp/evolution/parser.ts` | guarda de grupos; `fromMe` → `outbound-echo`; helpers exportados (`extractEvolutionContent`, `jidToE164`, `timestampToIso`, `EVOLUTION_ACK_STATUS_MAP`, `IEvolutionRawMessage`) |
| `src/providers/whatsapp/evolution/parser.test.ts` | **novo** — testes do parser (echo, grupos, regressão inbound/status) |
| `src/providers/whatsapp/webhook/core.ts` | ramo `outbound-echo`; `IWebhookDb` ganha `insertOutboundEchoMessage`/`touchConversation`; `createConversation` ganha `status` |
| `src/providers/whatsapp/webhook/core.test.ts` | fakes atualizados + describe novo do echo |
| `src/providers/whatsapp/evolution/instance.ts` | + `findChats`, `findMessages`, tipos `IEvolutionStoredMessage`/`IFindMessagesPage` |
| `src/providers/whatsapp/evolution/instance.test.ts` | + testes dos 2 helpers |
| `src/providers/whatsapp/import/core.ts` | **novo** — núcleo da importação (`processImportBatch`, `IImportDb`, `IImportSource`) |
| `src/providers/whatsapp/import/core.test.ts` | **novo** — TDD do núcleo |
| `supabase/functions/whatsapp-webhook/index.ts` | adapter `makeDb` ganha os 2 métodos novos + `status` no `createConversation` |
| `supabase/functions/whatsapp-import-history/index.ts` | **nova** Edge Function (12ª), owner-only |
| `src/features/admin-settings/api/whatsappImport.ts` | **novo** — client da função (loop de lotes + erros pt-BR) |
| `src/features/admin-settings/components/ImportConversationsDialog.tsx` | **novo** — diálogo confirmar → progresso → resumo |
| `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx` | botão "Importar conversas" + estado do diálogo |
| `docs/dev/whatsapp-history-import.md` | **novo** — doc da importação + echo + registro do arquivamento do seed |

---

### Task 1: Parser Evolution — guarda de grupos + `outbound-echo`

**Files:**
- Modify: `src/providers/whatsapp/types.ts`
- Modify: `src/providers/whatsapp/evolution/parser.ts`
- Create: `src/providers/whatsapp/evolution/parser.test.ts`

- [ ] **Step 1: Adicionar `IOutboundEcho` em `types.ts`**

Em `src/providers/whatsapp/types.ts`, logo APÓS a interface `IInboundStatus` (linha ~140), inserir:

```ts
/**
 * Own-account message echo (Evolution `messages.upsert` with `fromMe=true`):
 * something the team sent FROM THE PHONE (or another client). The webhook
 * mirrors it into the conversation as an outbound message (PRD spec
 * 2026-06-11-whatsapp-real-inbox). App-sent messages also echo — consumers
 * dedup by `providerMessageId` before persisting.
 */
export interface IOutboundEcho {
  type: "outbound-echo";
  providerMessageId: string;
  /** Destination phone in E.164 (the chat the message was sent to). */
  toPhone: string;
  contentType: InboundContentType;
  text?: string;
  mediaCaption?: string;
  timestamp: ISO8601;
  rawPayload: unknown;
}
```

- [ ] **Step 2: Escrever os testes que falham** — criar `src/providers/whatsapp/evolution/parser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEvolutionInbound } from "./parser";

function upsertEvent(overrides: {
  fromMe?: boolean;
  remoteJid?: string;
  message?: Record<string, unknown>;
  keyId?: string;
}) {
  return {
    event: "messages.upsert",
    instance: "gallo-matriz",
    sender: "5555911111111@s.whatsapp.net",
    data: {
      key: {
        id: overrides.keyId ?? "KEY1",
        remoteJid: overrides.remoteJid ?? "5555988887777@s.whatsapp.net",
        fromMe: overrides.fromMe ?? false,
      },
      message: overrides.message ?? { conversation: "olá" },
      messageTimestamp: 1765400000,
    },
  };
}

describe("parseEvolutionInbound — outbound echo (fromMe)", () => {
  it("parses fromMe=true as outbound-echo with destination phone and content", () => {
    const parsed = parseEvolutionInbound(
      upsertEvent({ fromMe: true, message: { conversation: "te envio o boleto" }, keyId: "3EB0X" }),
      "",
    );
    expect(parsed).toMatchObject({
      type: "outbound-echo",
      providerMessageId: "3EB0X",
      toPhone: "+5555988887777",
      contentType: "text",
      text: "te envio o boleto",
      timestamp: new Date(1765400000 * 1000).toISOString(),
    });
  });

  it("parses fromMe media echo with caption and contentType", () => {
    const parsed = parseEvolutionInbound(
      upsertEvent({ fromMe: true, message: { imageMessage: { caption: "orçamento" } } }),
      "",
    );
    expect(parsed).toMatchObject({
      type: "outbound-echo",
      contentType: "image",
      mediaCaption: "orçamento",
    });
  });
});

describe("parseEvolutionInbound — group/broadcast guard", () => {
  it.each([
    ["group", "120363041234567890@g.us"],
    ["status broadcast", "status@broadcast"],
    ["newsletter", "120363041234567890@newsletter"],
  ])("throws (= ignored upstream) for %s jids, inbound", (_label, remoteJid) => {
    expect(() => parseEvolutionInbound(upsertEvent({ remoteJid }), "")).toThrow(/grupo|broadcast/i);
  });

  it("throws for group jids even when fromMe=true", () => {
    expect(() =>
      parseEvolutionInbound(upsertEvent({ fromMe: true, remoteJid: "1203630@g.us" }), ""),
    ).toThrow(/grupo|broadcast/i);
  });
});

describe("parseEvolutionInbound — regression", () => {
  it("still parses a customer text message as inbound", () => {
    const parsed = parseEvolutionInbound(upsertEvent({}), "");
    expect(parsed).toMatchObject({
      type: "message",
      fromPhone: "+5555988887777",
      contentType: "text",
      text: "olá",
    });
  });

  it("still parses messages.update as status", () => {
    const parsed = parseEvolutionInbound(
      {
        event: "messages.update",
        instance: "gallo-matriz",
        data: { keyId: "K9", status: "READ", messageTimestamp: 1765400000 },
      },
      "",
    );
    expect(parsed).toMatchObject({ type: "status", providerMessageId: "K9", status: "read" });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bunx vitest run src/providers/whatsapp/evolution/parser.test.ts`
Expected: FAIL — echo tests recebem throw ("fromMe=true … ignorar") e guard tests não lançam.

- [ ] **Step 4: Implementar no parser**

Em `src/providers/whatsapp/evolution/parser.ts`:

(a) atualizar o import de tipos e o doc do cabeçalho:

```ts
import { toE164 } from "../phone";
import type {
  IInboundMessage,
  IInboundStatus,
  InboundContentType,
  IOutboundEcho,
} from "../types";
```

No comentário do topo do arquivo, trocar a frase sobre `fromMe` por:

```
 * - `messages.upsert` with `data.key.fromMe=true` → outbound echo (a message
 *   sent from the phone itself) — mirrored into the conversation by PRD-114's
 *   webhook (spec 2026-06-11-whatsapp-real-inbox).
 * Group/broadcast/newsletter jids and other events throw — the webhook
 * ignores them (parse errors on known-own events ≠ failures).
```

(b) exportar o shape da mensagem crua (substituir o campo `message?` inline da interface privada por um tipo nomeado):

```ts
/** Raw Evolution/Baileys message body — shared with the history import core. */
export interface IEvolutionRawMessage {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: { caption?: string; mimetype?: string };
  audioMessage?: { mimetype?: string };
  videoMessage?: { caption?: string; mimetype?: string };
  documentMessage?: { caption?: string; fileName?: string; mimetype?: string };
  locationMessage?: { degreesLatitude?: number; degreesLongitude?: number; name?: string };
  contactMessage?: { displayName?: string };
}

interface IEvolutionMessageData {
  key?: { id?: string; remoteJid?: string; fromMe?: boolean };
  keyId?: string;
  pushName?: string;
  status?: string;
  message?: IEvolutionRawMessage;
  messageTimestamp?: number | string;
}
```

(c) exportar os helpers hoje privados (mesmos corpos, só ganham `export`):

```ts
export function jidToE164(jid: string | undefined): string {
  if (!jid) return "";
  return toE164(jid.split("@")[0] ?? "");
}

export function timestampToIso(value: number | string | undefined): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? new Date(parsed * 1000).toISOString()
    : new Date().toISOString();
}

/** Baileys ack states → normalized status (shared with the import core). */
export const EVOLUTION_ACK_STATUS_MAP: Record<string, IInboundStatus["status"]> = {
  SERVER_ACK: "sent",
  DELIVERY_ACK: "delivered",
  READ: "read",
  PLAYED: "read",
  ERROR: "failed",
};
```

(o uso interno `STATUS_MAP[...]` no ramo `messages.update` passa a referenciar `EVOLUTION_ACK_STATUS_MAP[...]`).

(d) extrair a cadeia de extração de conteúdo (o if/else de `conversation`/`imageMessage`/… hoje inline) para função exportada, usada pelos dois caminhos:

```ts
export interface IEvolutionContent {
  contentType: InboundContentType;
  text?: string;
  mediaCaption?: string;
}

/** Normalizes the raw message body into contentType/text/caption. */
export function extractEvolutionContent(message: IEvolutionRawMessage): IEvolutionContent {
  if (message.conversation !== undefined || message.extendedTextMessage) {
    return { contentType: "text", text: message.conversation ?? message.extendedTextMessage?.text };
  }
  if (message.imageMessage) return { contentType: "image", mediaCaption: message.imageMessage.caption };
  if (message.audioMessage) return { contentType: "audio" };
  if (message.videoMessage) return { contentType: "video", mediaCaption: message.videoMessage.caption };
  if (message.documentMessage)
    return { contentType: "document", mediaCaption: message.documentMessage.caption };
  if (message.locationMessage) {
    const { name, degreesLatitude, degreesLongitude } = message.locationMessage;
    return {
      contentType: "location",
      text: [name, `${degreesLatitude ?? "?"},${degreesLongitude ?? "?"}`].filter(Boolean).join(" — "),
    };
  }
  if (message.contactMessage)
    return { contentType: "contact", text: message.contactMessage.displayName };
  return { contentType: "unknown" };
}
```

(e) no corpo de `parseEvolutionInbound`, o ramo `messages.upsert` vira (substitui o throw de `fromMe` e o if/else inline; o tipo de retorno da função passa a `IInboundMessage | IInboundStatus | IOutboundEcho`):

```ts
const NON_INDIVIDUAL_JID = /@(g\.us|broadcast|newsletter)$/;
```

(constante module-level, junto das demais) e:

```ts
  if (event.event !== "messages.upsert") {
    throw new Error(`EvolutionProvider: evento não suportado pelo parser: ${event.event}`);
  }
  const remoteJid = data.key?.remoteJid ?? "";
  if (NON_INDIVIDUAL_JID.test(remoteJid)) {
    throw new Error(
      "EvolutionProvider: messages.upsert de grupo/broadcast/newsletter — ignorar (sem cliente 1:1)",
    );
  }

  const content = extractEvolutionContent(data.message ?? {});

  if (data.key?.fromMe) {
    return {
      type: "outbound-echo",
      providerMessageId: data.key?.id ?? "",
      toPhone: jidToE164(remoteJid),
      contentType: content.contentType,
      text: content.text,
      mediaCaption: content.mediaCaption,
      timestamp: timestampToIso(data.messageTimestamp),
      rawPayload,
    };
  }

  const hasMedia = ["image", "audio", "video", "document"].includes(content.contentType);
  return {
    type: "message",
    providerMessageId: data.key?.id ?? "",
    fromPhone: jidToE164(remoteJid),
    toAccountPhone: jidToE164(event.sender),
    accountId,
    contentType: content.contentType,
    text: content.text,
    mediaId: hasMedia ? data.key?.id : undefined,
    mediaCaption: content.mediaCaption,
    timestamp: timestampToIso(data.messageTimestamp),
    rawPayload,
  };
```

- [ ] **Step 5: Rodar os testes do parser**

Run: `bunx vitest run src/providers/whatsapp/evolution/parser.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 6: Suíte de regressão da camada**

Run: `bunx vitest run src/providers/whatsapp`
Expected: PASS — atenção a `EvolutionProvider.test.ts` e `webhook/core.test.ts` (o core ainda compila: `parseEvolutionInbound` ganhou um membro novo na união; o core trata no Task 2 — se o type-check do teste do core acusar união não tratada, é esperado SÓ se quebrar; nesse caso reportar e seguir, o Task 2 resolve).

- [ ] **Step 7: Commit**

```bash
git checkout -- src/routeTree.gen.ts
git add src/providers/whatsapp/types.ts src/providers/whatsapp/evolution/parser.ts src/providers/whatsapp/evolution/parser.test.ts
git commit -m "feat(whatsapp): parse fromMe echoes as outbound-echo + group jid guard"
```

---

### Task 2: Webhook core — ramo `outbound-echo`

**Files:**
- Modify: `src/providers/whatsapp/webhook/core.ts`
- Modify: `src/providers/whatsapp/webhook/core.test.ts`

- [ ] **Step 1: Atualizar fakes e escrever testes que falham** em `core.test.ts`:

(a) No `makeFakeDb`, trocar `createConversation` e adicionar os 2 métodos novos (o estado ganha campos):

```ts
// IFakeState: adicionar
  touches: Array<{ conversationId: string; lastMessageAt: string }>;
// e em conversations, registrar o status:
  conversations: Array<{ id: string; customerId: string; accountId: string; open: boolean; status?: string }>;
```

```ts
// em makeFakeDb:
    createConversation: async ({ customerId, accountId, status }) => {
      const conversation = { id: nextId("conv"), customerId, accountId, open: true, status };
      state.conversations.push(conversation);
      return { id: conversation.id };
    },
    insertOutboundEchoMessage: async (input) => {
      const message = { id: nextId("msg"), direction: "out", ...input };
      state.messages.push(message);
      return { id: message.id as string };
    },
    touchConversation: async (conversationId, lastMessageAt) => {
      state.touches.push({ conversationId, lastMessageAt });
    },
```

(em `emptyState()`, adicionar `touches: []`).

(b) Helper de evento echo + describe novo no fim do arquivo:

```ts
function evolutionEchoEvent(text = "te envio o boleto", keyId = "3EB0ECHO1") {
  return {
    event: "messages.upsert",
    instance: "gallo-matriz",
    sender: "5555911111111@s.whatsapp.net",
    data: {
      key: { id: keyId, remoteJid: "5555988887777@s.whatsapp.net", fromMe: true },
      message: { conversation: text },
      messageTimestamp: 1765400000,
    },
  };
}

describe("processWebhookEvent — outbound echoes (real inbox spec)", () => {
  it("ignores the echo of an app-sent message (dedup by provider_message_id)", async () => {
    const state = emptyState();
    const result = await processWebhookEvent({
      provider: "evolution",
      rawPayload: evolutionEchoEvent("oi", "APP-SENT-1"),
      db: makeFakeDb(state, { knownOutboundId: "APP-SENT-1" }),
      buildProvider: buildMock,
      traceId: "trace-test",
    });
    expect(result.outcome).toBe("duplicate");
    expect(state.messages).toHaveLength(0);
    expect(state.processed.has("whatsapp:evolution:APP-SENT-1")).toBe(true);
  });

  it("mirrors a phone-sent message: em_andamento conversation, out message, no unread bump", async () => {
    const state = emptyState();
    const result = await run(state, evolutionEchoEvent());

    expect(result.outcome).toBe("echo-created");
    expect(state.customers).toHaveLength(1); // pending customer for the new number
    expect(state.conversations[0]).toMatchObject({ status: "em_andamento" });
    expect(state.messages[0]).toMatchObject({
      provider: "evolution",
      text: "te envio o boleto",
      providerMessageId: "3EB0ECHO1",
    });
    expect(state.bumps).toHaveLength(0); // NEVER the unread-bumping path
    expect(state.touches).toEqual([
      { conversationId: state.conversations[0]?.id, lastMessageAt: expect.any(String) },
    ]);
    expect(state.audits[0]).toMatchObject({
      action: "webhook_received",
      after: expect.objectContaining({ direction: "out", toPhoneMasked: "***7777" }),
    });
  });

  it("reuses the existing open conversation for the destination customer", async () => {
    const state = emptyState();
    state.customers.push({
      id: "cust-old",
      storeId: "store-1",
      phoneDigits: "5555988887777",
      sellerId: "seller-lucas",
    });
    state.conversations.push({
      id: "conv-old",
      customerId: "cust-old",
      accountId: "acc-1",
      open: true,
    });
    const result = await run(state, evolutionEchoEvent("segunda", "3EB0ECHO2"));
    expect(result).toMatchObject({ outcome: "echo-created", conversationId: "conv-old" });
    expect(state.conversations).toHaveLength(1);
  });

  it("is idempotent across redeliveries (processed_events)", async () => {
    const state = emptyState();
    await run(state, evolutionEchoEvent());
    const second = await run(state, evolutionEchoEvent());
    expect(second.outcome).toBe("duplicate");
    expect(state.messages).toHaveLength(1);
  });
});
```

(c) O teste de regressão inbound existente "creates customer …" continua passando sem mudanças (o `createConversation` inbound passa `status: "aguardando"` — o fake só registra).

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/providers/whatsapp/webhook/core.test.ts`
Expected: FAIL — type errors nos métodos novos do fake + outcome inexistente.

- [ ] **Step 3: Implementar no `core.ts`**

(a) `WebhookOutcome` ganha `"echo-created"`:

```ts
export type WebhookOutcome =
  | "duplicate"
  | "message-created"
  | "echo-created"
  | "status-applied"
  | "status-unmatched"
  | "account-not-found"
  | "connection-synced"
  | "ignored";
```

(b) `IWebhookDb`: `createConversation` ganha `status` e entram 2 métodos (depois de `insertInboundMessage`):

```ts
  createConversation(input: {
    storeId: string;
    customerId: string;
    accountId: string;
    assignedSellerId: string | null;
    lastMessageAt: string;
    /** aguardando = inbound awaiting staff; em_andamento = we initiated (echo). */
    status: "aguardando" | "em_andamento";
  }): Promise<{ id: string }>;
  /** Mirrored phone-sent message (outbound echo) — direction out, status sent. */
  insertOutboundEchoMessage(input: {
    conversationId: string;
    provider: "meta" | "evolution";
    text: string;
    mediaType: string | null;
    providerMessageId: string;
    eventKey: string;
    sentAt: string;
  }): Promise<{ id: string }>;
  /** last_message_at bump WITHOUT unread increment (echo path). */
  touchConversation(conversationId: string, lastMessageAt: string): Promise<void>;
```

(c) Em `processWebhookEvent`, o passo 3 (status) fica como está; logo APÓS o bloco de status (antes do comentário "// 4. Account resolution") entra o ramo do echo:

```ts
  // 3.5. Outbound echoes (Evolution fromMe — real-inbox spec 2026-06-11):
  //      mirror what the team sends FROM THE PHONE. App-sent messages echo
  //      too — the provider_message_id lookup below dedups them.
  if (parsed.type === "outbound-echo") {
    const existing = await db.findOutboundMessageByProviderMessageId(parsed.providerMessageId);
    if (existing) {
      await db.markProcessed(eventKey, traceId);
      return { outcome: "duplicate", detail: "app-send echo" };
    }
    const account = await db.findEvolutionAccount(extractEvolutionInstance(rawPayload));
    if (!account) {
      warn("echo for unknown account", { provider });
      return { outcome: "account-not-found" };
    }
    const toDigits = digits(parsed.toPhone);
    let customer = await db.findCustomerByPhone(account.storeId, toDigits);
    let customerCreated = false;
    if (!customer) {
      const sellerId = await db.resolveDefaultSellerId(account.storeId);
      customer = await db.createPendingCustomer({
        storeId: account.storeId,
        phone: parsed.toPhone,
        sellerId,
      });
      customerCreated = true;
    }
    let conversation = await db.findOpenConversation(customer.id, account.id);
    if (!conversation) {
      conversation = await db.createConversation({
        storeId: account.storeId,
        customerId: customer.id,
        accountId: account.id,
        assignedSellerId: customer.sellerId,
        lastMessageAt: parsed.timestamp,
        status: "em_andamento",
      });
    }
    const message = await db.insertOutboundEchoMessage({
      conversationId: conversation.id,
      provider,
      text: parsed.text ?? parsed.mediaCaption ?? "",
      mediaType: toMediaType(parsed.contentType),
      providerMessageId: parsed.providerMessageId,
      eventKey,
      sentAt: parsed.timestamp,
    });
    await db.touchConversation(conversation.id, parsed.timestamp);
    await db.markProcessed(eventKey, traceId);
    await db.audit({
      storeId: account.storeId,
      action: "webhook_received",
      resource: "message",
      resourceId: message.id,
      after: {
        provider,
        eventKey,
        direction: "out",
        contentType: parsed.contentType,
        toPhoneMasked: `***${toDigits.slice(-4)}`,
        customerCreated,
        traceId,
      },
    });
    return { outcome: "echo-created", messageId: message.id, conversationId: conversation.id };
  }
```

(d) O tipo do `parsed` no passo 1 vira `IInboundMessage | IInboundStatus | IOutboundEcho` (importar `IOutboundEcho` de `../types`).

(e) A chamada inbound de `createConversation` (passo 6) ganha `status: "aguardando"`.

- [ ] **Step 4: Rodar os testes**

Run: `bunx vitest run src/providers/whatsapp/webhook/core.test.ts`
Expected: PASS (todos — novos e regressão).

- [ ] **Step 5: Commit**

```bash
git checkout -- src/routeTree.gen.ts
git add src/providers/whatsapp/webhook/core.ts src/providers/whatsapp/webhook/core.test.ts
git commit -m "feat(whatsapp): webhook core mirrors phone-sent echoes into conversations"
```

---

### Task 3: Sync do espelho + adapter do `whatsapp-webhook`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts`
- Regenerate: `supabase/functions/_shared/whatsapp/**` (via script — não editar à mão)

- [ ] **Step 1: Rodar o sync**

Run: `bun run scripts/sync-whatsapp-shared.ts`
Expected: `synced N files → supabase/functions/_shared/whatsapp/` (N ≥ 25; agora inclui `evolution/parser.ts` atualizado).

- [ ] **Step 2: Atualizar o adapter `makeDb`** em `supabase/functions/whatsapp-webhook/index.ts`:

(a) `createConversation` passa o status do core (trocar o literal `status: "aguardando"`):

```ts
    async createConversation(input) {
      const { data, error } = await admin
        .from("conversations")
        .insert({
          store_id: input.storeId,
          customer_id: input.customerId,
          whatsapp_account_id: input.accountId,
          assigned_seller_id: input.assignedSellerId,
          channel: "whatsapp",
          status: input.status,
          last_message_at: input.lastMessageAt,
          unread_count: 0,
        })
        .select("id")
        .single();
      if (error) throw new Error(`createConversation: ${error.message}`);
      return { id: data.id as string };
    },
```

(b) Logo após `insertInboundMessage`, adicionar:

```ts
    async insertOutboundEchoMessage(input) {
      const { data, error } = await admin
        .from("messages")
        .insert({
          conversation_id: input.conversationId,
          direction: "out",
          author_type: "seller",
          author_id: null,
          provider: input.provider,
          text: input.text,
          media_type: input.mediaType,
          status: "sent",
          sent_at: input.sentAt,
          provider_message_id: input.providerMessageId,
          webhook_event_ids: [input.eventKey],
        })
        .select("id")
        .single();
      if (error) throw new Error(`insertOutboundEchoMessage: ${error.message}`);
      return { id: data.id as string };
    },
    async touchConversation(conversationId, lastMessageAt) {
      await admin
        .from("conversations")
        .update({ last_message_at: lastMessageAt, updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    },
```

- [ ] **Step 3: Gate de build/teste**

Run: `bun run build` e `bun run test`
Expected: ambos verdes (o adapter é Deno — não entra no build Vite; o que valida é a ausência de regressão no app + suíte completa).

- [ ] **Step 4: Commit**

```bash
git checkout -- src/routeTree.gen.ts
git add supabase/functions/_shared/whatsapp supabase/functions/whatsapp-webhook/index.ts
git commit -m "feat(whatsapp): webhook edge adapter for outbound echoes (mirror sync)"
```

- [ ] **Step 5 (CONTROLADOR): Redeploy do `whatsapp-webhook`**

O controlador redeploya via MCP `deploy_edge_function` (name `whatsapp-webhook`, `verify_jwt: false`, files = `index.ts` + closure completa de `_shared/` usada pelo arquivo: `audit.ts`, `env.ts`, `http.ts`, `cors.ts`, `secrets.ts`, `logger.ts`, `sentry.ts`, `_shared/whatsapp/**` espelhado) e valida com `get_logs` após um evento real.

---

### Task 4: Helpers Evolution `findChats` / `findMessages`

**Files:**
- Modify: `src/providers/whatsapp/evolution/instance.ts`
- Modify: `src/providers/whatsapp/evolution/instance.test.ts`

- [ ] **Step 1: Testes que falham** — em `instance.test.ts`, seguir o padrão dos testes existentes do arquivo (eles montam `deps` com `fetchFn` fake; reaproveitar o helper local de fake fetch existente — se o arquivo usa outro nome, adaptar mantendo a semântica). Adicionar no fim:

```ts
import { findChats, findMessages } from "./instance";

const TARGET = { baseUrl: "https://evo.test", instanceName: "inst1" };

function fakeFetchOnce(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("findChats", () => {
  it("parses the flat v2 array and keeps only jid-like entries", async () => {
    const fetchFn = fakeFetchOnce([
      { remoteJid: "5555988887777@s.whatsapp.net" },
      { remoteJid: "1203630@g.us" },
      { id: "not-a-jid-uuid" },
    ]);
    const chats = await findChats("key", { resolveSecret: async () => undefined, fetchFn }, TARGET);
    expect(chats.map((c) => c.remoteJid)).toEqual([
      "5555988887777@s.whatsapp.net",
      "1203630@g.us",
    ]);
  });

  it("parses nested {chats:[...]} shapes", async () => {
    const fetchFn = fakeFetchOnce({ chats: [{ remoteJid: "5511911112222@s.whatsapp.net" }] });
    const chats = await findChats("key", { resolveSecret: async () => undefined, fetchFn }, TARGET);
    expect(chats).toEqual([{ remoteJid: "5511911112222@s.whatsapp.net" }]);
  });
});

describe("findMessages", () => {
  it("parses the nested v2 page shape", async () => {
    const fetchFn = fakeFetchOnce({
      messages: {
        total: 2,
        pages: 1,
        currentPage: 1,
        records: [
          {
            key: { id: "M1", remoteJid: "5555988887777@s.whatsapp.net", fromMe: false },
            message: { conversation: "oi" },
            messageTimestamp: 1765400000,
            status: "READ",
          },
        ],
      },
    });
    const page = await findMessages(
      "key",
      { resolveSecret: async () => undefined, fetchFn },
      TARGET,
      "5555988887777@s.whatsapp.net",
      1,
    );
    expect(page.pages).toBe(1);
    expect(page.records[0]).toMatchObject({ key: { id: "M1" } });
  });

  it("accepts a bare array response (older builds)", async () => {
    const fetchFn = fakeFetchOnce([{ key: { id: "M2" }, message: { conversation: "x" } }]);
    const page = await findMessages(
      "key",
      { resolveSecret: async () => undefined, fetchFn },
      TARGET,
      "jid",
      1,
    );
    expect(page.records).toHaveLength(1);
    expect(page.pages).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/providers/whatsapp/evolution/instance.test.ts`
Expected: FAIL — `findChats`/`findMessages` não exportados.

- [ ] **Step 3: Implementar** — no fim de `instance.ts`:

```ts
import type { IEvolutionRawMessage } from "./parser";

// ===== Chat history (real-inbox import — spec 2026-06-11) ===================

export interface IEvolutionChatSummary {
  remoteJid: string;
}

/** One message as stored by the Evolution instance DB. */
export interface IEvolutionStoredMessage {
  key?: { id?: string; remoteJid?: string; fromMe?: boolean };
  message?: IEvolutionRawMessage;
  messageTimestamp?: number | string;
  /** Baileys ack label (SERVER_ACK/DELIVERY_ACK/READ/...) when stored. */
  status?: string;
}

export interface IFindMessagesPage {
  records: IEvolutionStoredMessage[];
  /** Total pages when the build reports it; undefined → stop on empty page. */
  pages?: number;
}

/**
 * POST /chat/findChats — every chat the instance has stored. Response shapes
 * vary across builds (flat array | {chats} | {records}); jid-less entries are
 * dropped. Payload logging is omitted (PII: full chat list).
 */
export async function findChats(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  traceId?: string,
): Promise<IEvolutionChatSummary[]> {
  const response = await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/chat/findChats/${target.instanceName}`,
    json: { where: {} },
    timeoutMs: 30_000,
    omitResponsePayload: true,
    traceId,
  });
  const body = response.body as
    | unknown[]
    | { chats?: unknown[]; records?: unknown[] }
    | null;
  const list = Array.isArray(body)
    ? body
    : Array.isArray(body?.chats)
      ? body.chats
      : Array.isArray(body?.records)
        ? body.records
        : [];
  const out: IEvolutionChatSummary[] = [];
  for (const raw of list) {
    const candidate = raw as { remoteJid?: string; id?: string } | null;
    const jid = candidate?.remoteJid ?? candidate?.id;
    if (typeof jid === "string" && jid.includes("@")) out.push({ remoteJid: jid });
  }
  return out;
}

/**
 * POST /chat/findMessages — one page of a chat's stored messages. `offset`
 * doubles as page size on v2 builds; older builds return a bare array.
 * Payload logging is omitted (PII: message bodies).
 */
export async function findMessages(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  remoteJid: string,
  page: number,
  traceId?: string,
): Promise<IFindMessagesPage> {
  const response = await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/chat/findMessages/${target.instanceName}`,
    json: { where: { key: { remoteJid } }, page, offset: 100 },
    timeoutMs: 30_000,
    omitResponsePayload: true,
    traceId,
  });
  const body = response.body as
    | unknown[]
    | { messages?: { records?: unknown[]; pages?: number } }
    | null;
  if (Array.isArray(body)) return { records: body as IEvolutionStoredMessage[] };
  const nested = body?.messages;
  return {
    records: (nested?.records as IEvolutionStoredMessage[] | undefined) ?? [],
    pages: typeof nested?.pages === "number" ? nested.pages : undefined,
  };
}
```

(o import de `IEvolutionRawMessage` vai para o topo do arquivo, junto dos demais).

- [ ] **Step 4: Rodar os testes**

Run: `bunx vitest run src/providers/whatsapp/evolution/instance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git checkout -- src/routeTree.gen.ts
git add src/providers/whatsapp/evolution/instance.ts src/providers/whatsapp/evolution/instance.test.ts
git commit -m "feat(whatsapp): evolution findChats/findMessages history helpers"
```

---

### Task 5: Núcleo da importação (`import/core.ts`)

**Files:**
- Create: `src/providers/whatsapp/import/core.ts`
- Create: `src/providers/whatsapp/import/core.test.ts`

- [ ] **Step 1: Escrever os testes que falham** — `src/providers/whatsapp/import/core.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  emptyImportStats,
  processImportBatch,
  type IImportDb,
  type IImportSource,
} from "./core";
import type { IEvolutionStoredMessage } from "../evolution/instance";

const ACCOUNT = { id: "acc-1", storeId: "store-1" };

interface IFakeState {
  customers: Array<{ id: string; phoneDigits: string; sellerId: string }>;
  conversations: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
  known: Set<string>;
  advances: Array<{ conversationId: string; lastMessageAt: string }>;
}

function emptyState(): IFakeState {
  return { customers: [], conversations: [], messages: [], known: new Set(), advances: [] };
}

function makeDb(state: IFakeState): IImportDb {
  let seq = 0;
  const nextId = (p: string) => `${p}-${++seq}`;
  return {
    findCustomerByPhone: async (_storeId, digits) => {
      const found = state.customers.find((c) => c.phoneDigits === digits);
      return found ? { id: found.id, sellerId: found.sellerId } : null;
    },
    resolveDefaultSellerId: async () => "seller-manager",
    createPendingCustomer: async ({ phone, sellerId }) => {
      const customer = { id: nextId("cust"), phoneDigits: phone.replace(/\D/g, ""), sellerId };
      state.customers.push(customer);
      return { id: customer.id, sellerId };
    },
    findOpenConversation: async (customerId) => {
      const found = state.conversations.find((c) => c.customerId === customerId);
      return found ? { id: found.id as string } : null;
    },
    createConversation: async (input) => {
      const conversation = { id: nextId("conv"), ...input };
      state.conversations.push(conversation);
      return { id: conversation.id as string };
    },
    filterKnownProviderMessageIds: async (ids) =>
      new Set(ids.filter((id) => state.known.has(id))),
    insertImportedMessage: async (input) => {
      state.messages.push(input);
      state.known.add(input.providerMessageId);
    },
    advanceConversationActivity: async (conversationId, lastMessageAt) => {
      state.advances.push({ conversationId, lastMessageAt });
    },
  };
}

function storedText(
  id: string,
  fromMe: boolean,
  ts: number,
  text = "msg",
  status?: string,
): IEvolutionStoredMessage {
  return {
    key: { id, remoteJid: "5555988887777@s.whatsapp.net", fromMe },
    message: { conversation: text },
    messageTimestamp: ts,
    status,
  };
}

function makeSource(chats: string[], byJid: Record<string, IEvolutionStoredMessage[]>): IImportSource {
  return {
    listChats: async () => chats,
    listMessages: async (remoteJid, page) =>
      page === 1 ? { records: byJid[remoteJid] ?? [], pages: 1 } : { records: [], pages: 1 },
  };
}

describe("processImportBatch", () => {
  it("imports an individual chat end-to-end: pending customer, em_andamento conversation, in/out messages", async () => {
    const state = emptyState();
    const source = makeSource(["5555988887777@s.whatsapp.net"], {
      "5555988887777@s.whatsapp.net": [
        storedText("M2", true, 1765400100, "resposta", "READ"),
        storedText("M1", false, 1765400000, "pergunta"),
      ],
    });
    const result = await processImportBatch({ account: ACCOUNT, source, db: makeDb(state) });

    expect(result.done).toBe(true);
    expect(result.stats).toMatchObject({
      chatsProcessed: 1,
      customersCreated: 1,
      conversationsCreated: 1,
      messagesImported: 2,
      messagesSkipped: 0,
    });
    expect(state.conversations[0]).toMatchObject({
      status: "em_andamento",
      accountId: "acc-1",
      createdAt: new Date(1765400000 * 1000).toISOString(),
      lastMessageAt: new Date(1765400100 * 1000).toISOString(),
    });
    const directions = state.messages.map((m) => [m.providerMessageId, m.direction, m.status]);
    expect(directions).toContainEqual(["M1", "in", "delivered"]);
    expect(directions).toContainEqual(["M2", "out", "read"]);
    const inbound = state.messages.find((m) => m.providerMessageId === "M1");
    expect(inbound?.authorId).toBe(state.customers[0]?.id);
  });

  it("skips group/broadcast/newsletter chats (counted, never imported)", async () => {
    const state = emptyState();
    const source = makeSource(
      ["1203630@g.us", "status@broadcast", "99@newsletter", "5555988887777@s.whatsapp.net"],
      { "5555988887777@s.whatsapp.net": [storedText("M1", false, 1765400000)] },
    );
    const result = await processImportBatch({ account: ACCOUNT, source, db: makeDb(state) });
    expect(result.stats.chatsSkippedGroup).toBe(3);
    expect(result.stats.chatsProcessed).toBe(1);
  });

  it("is idempotent: already-known provider_message_ids are skipped and empty chats create nothing", async () => {
    const state = emptyState();
    state.known.add("M1");
    const source = makeSource(["5555988887777@s.whatsapp.net"], {
      "5555988887777@s.whatsapp.net": [storedText("M1", false, 1765400000)],
    });
    const result = await processImportBatch({ account: ACCOUNT, source, db: makeDb(state) });
    expect(result.stats.messagesSkipped).toBe(1);
    expect(result.stats.conversationsCreated).toBe(0);
    expect(state.conversations).toHaveLength(0);
  });

  it("paginates chats with a stable cursor (sorted jids) and reports done only at the end", async () => {
    const state = emptyState();
    const jids = ["551199@s.whatsapp.net", "552299@s.whatsapp.net", "553399@s.whatsapp.net"];
    const source = makeSource(jids, Object.fromEntries(jids.map((j, i) => [j, [storedText(`M${i}`, false, 1765400000 + i)]])));
    const first = await processImportBatch({ account: ACCOUNT, source, db: makeDb(state), batchSize: 2 });
    expect(first).toMatchObject({ done: false, nextCursor: 2 });
    const second = await processImportBatch({ account: ACCOUNT, source, db: makeDb(state), cursor: first.nextCursor, batchSize: 2 });
    expect(second.done).toBe(true);
    expect(first.stats.chatsProcessed + second.stats.chatsProcessed).toBe(3);
  });

  it("skips records without a key id or without renderable content", async () => {
    const state = emptyState();
    const source = makeSource(["5555988887777@s.whatsapp.net"], {
      "5555988887777@s.whatsapp.net": [
        { key: { remoteJid: "5555988887777@s.whatsapp.net", fromMe: false }, message: { conversation: "sem id" } },
        { key: { id: "PROTO", remoteJid: "5555988887777@s.whatsapp.net", fromMe: false }, message: {} },
        storedText("OK1", false, 1765400000),
      ],
    });
    const result = await processImportBatch({ account: ACCOUNT, source, db: makeDb(state) });
    expect(result.stats.messagesImported).toBe(1);
    expect(result.stats.messagesSkipped).toBe(2);
  });

  it("accumulates stats helpers (emptyImportStats baseline)", () => {
    expect(emptyImportStats()).toEqual({
      chatsProcessed: 0,
      chatsSkippedGroup: 0,
      customersCreated: 0,
      conversationsCreated: 0,
      messagesImported: 0,
      messagesSkipped: 0,
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/providers/whatsapp/import/core.test.ts`
Expected: FAIL — módulo `./core` inexistente.

- [ ] **Step 3: Implementar** — `src/providers/whatsapp/import/core.ts`:

```ts
/**
 * Evolution history import core (real-inbox spec 2026-06-11).
 *
 * Pure batch processor: pages through the chats an Evolution instance has
 * stored and lands them as customers/conversations/messages. Both the data
 * source ({@link IImportSource}) and the persistence ({@link IImportDb}) are
 * injected, so this module is fully unit-testable; the `whatsapp-import-history`
 * Edge Function wires the Evolution REST helpers + a service_role adapter.
 *
 * Idempotency: provider_message_id is the dedup key — re-running an import
 * never duplicates and resumes after a mid-batch failure.
 *
 * Runtime-agnostic file: relative imports only, Web APIs only.
 */

import {
  EVOLUTION_ACK_STATUS_MAP,
  extractEvolutionContent,
  jidToE164,
  timestampToIso,
} from "../evolution/parser";
import type { IEvolutionStoredMessage } from "../evolution/instance";

export interface IImportStats {
  chatsProcessed: number;
  chatsSkippedGroup: number;
  customersCreated: number;
  conversationsCreated: number;
  messagesImported: number;
  messagesSkipped: number;
}

export function emptyImportStats(): IImportStats {
  return {
    chatsProcessed: 0,
    chatsSkippedGroup: 0,
    customersCreated: 0,
    conversationsCreated: 0,
    messagesImported: 0,
    messagesSkipped: 0,
  };
}

export interface IImportBatchResult {
  done: boolean;
  nextCursor: number;
  stats: IImportStats;
}

export interface IImportAccount {
  id: string;
  storeId: string;
}

/** Evolution-side reads, wired by the Edge Function with the apikey resolved. */
export interface IImportSource {
  /** remoteJids of every chat the instance has stored. */
  listChats(): Promise<string[]>;
  listMessages(
    remoteJid: string,
    page: number,
  ): Promise<{ records: IEvolutionStoredMessage[]; pages?: number }>;
}

/** Injected persistence surface — service_role adapter in the Edge Function. */
export interface IImportDb {
  findCustomerByPhone(
    storeId: string,
    phoneDigits: string,
  ): Promise<{ id: string; sellerId: string } | null>;
  resolveDefaultSellerId(storeId: string): Promise<string>;
  createPendingCustomer(input: {
    storeId: string;
    phone: string;
    sellerId: string;
  }): Promise<{ id: string; sellerId: string }>;
  findOpenConversation(customerId: string, accountId: string): Promise<{ id: string } | null>;
  createConversation(input: {
    storeId: string;
    customerId: string;
    accountId: string;
    assignedSellerId: string | null;
    status: "em_andamento";
    createdAt: string;
    lastMessageAt: string;
  }): Promise<{ id: string }>;
  /** Returns the subset of `ids` that ALREADY exist in messages (dedup). */
  filterKnownProviderMessageIds(ids: string[]): Promise<Set<string>>;
  insertImportedMessage(input: {
    conversationId: string;
    direction: "in" | "out";
    /** customerId for inbound; null for outbound (author unknown on phone). */
    authorId: string | null;
    text: string;
    mediaType: string | null;
    status: "sent" | "delivered" | "read" | "failed";
    providerMessageId: string;
    sentAt: string;
  }): Promise<void>;
  /** Moves conversations.last_message_at forward only (never backwards). */
  advanceConversationActivity(conversationId: string, lastMessageAt: string): Promise<void>;
}

const INDIVIDUAL_JID = /@s\.whatsapp\.net$/;
const BATCH_CHATS_DEFAULT = 10;
/** Runaway guard: 50 pages × ~100 records ≈ 5k messages per chat. */
const MAX_MESSAGE_PAGES_PER_CHAT = 50;

const MEDIA_TYPES = ["image", "audio", "video", "document"] as const;

interface INormalizedRecord {
  providerMessageId: string;
  direction: "in" | "out";
  text: string;
  mediaType: string | null;
  status: "sent" | "delivered" | "read" | "failed";
  sentAt: string;
}

/** Stored record → flat message row; null = not importable (no id / no content). */
function normalizeRecord(record: IEvolutionStoredMessage): INormalizedRecord | null {
  const providerMessageId = record.key?.id;
  if (!providerMessageId) return null;
  const content = extractEvolutionContent(record.message ?? {});
  const mediaType = (MEDIA_TYPES as readonly string[]).includes(content.contentType)
    ? content.contentType
    : null;
  const text = content.text ?? content.mediaCaption ?? "";
  if (content.contentType === "unknown" && text.length === 0) return null;
  const direction = record.key?.fromMe ? "out" : "in";
  const status =
    direction === "out"
      ? (EVOLUTION_ACK_STATUS_MAP[(record.status ?? "").toUpperCase()] ?? "sent")
      : "delivered";
  return {
    providerMessageId,
    direction,
    text,
    mediaType,
    status,
    sentAt: timestampToIso(record.messageTimestamp),
  };
}

export async function processImportBatch(args: {
  account: IImportAccount;
  source: IImportSource;
  db: IImportDb;
  /** Chat offset into the sorted jid list (stable across calls). */
  cursor?: number;
  batchSize?: number;
  warn?: (msg: string, fields?: Record<string, unknown>) => void;
}): Promise<IImportBatchResult> {
  const { account, source, db } = args;
  const warn = args.warn ?? (() => {});
  const stats = emptyImportStats();

  // Sorted for a stable cursor across calls (Evolution ordering is not stable).
  const allChats = (await source.listChats()).slice().sort();
  const cursor = Math.max(0, Math.floor(args.cursor ?? 0));
  const batch = allChats.slice(cursor, cursor + (args.batchSize ?? BATCH_CHATS_DEFAULT));

  for (const remoteJid of batch) {
    if (!INDIVIDUAL_JID.test(remoteJid)) {
      stats.chatsSkippedGroup++;
      continue;
    }
    await importChat(remoteJid, account, source, db, stats, warn);
    stats.chatsProcessed++;
  }

  const nextCursor = cursor + batch.length;
  return { done: nextCursor >= allChats.length, nextCursor, stats };
}

async function importChat(
  remoteJid: string,
  account: IImportAccount,
  source: IImportSource,
  db: IImportDb,
  stats: IImportStats,
  warn: (msg: string, fields?: Record<string, unknown>) => void,
): Promise<void> {
  // 1. Collect every stored page (bounded by the runaway guard).
  const records: IEvolutionStoredMessage[] = [];
  for (let page = 1; page <= MAX_MESSAGE_PAGES_PER_CHAT; page++) {
    const result = await source.listMessages(remoteJid, page);
    records.push(...result.records);
    const lastPage = result.pages !== undefined ? page >= result.pages : result.records.length === 0;
    if (lastPage) break;
    if (page === MAX_MESSAGE_PAGES_PER_CHAT) {
      warn("import chat page cap reached — older messages skipped", { remoteJid });
    }
  }

  // 2. Normalize + dedup (idempotency: provider_message_id is the key).
  const normalized: INormalizedRecord[] = [];
  for (const record of records) {
    const row = normalizeRecord(record);
    if (row) normalized.push(row);
    else stats.messagesSkipped++;
  }
  const known = await db.filterKnownProviderMessageIds(normalized.map((r) => r.providerMessageId));
  const fresh = normalized.filter((r) => !known.has(r.providerMessageId));
  stats.messagesSkipped += normalized.length - fresh.length;
  if (fresh.length === 0) return; // nothing new — never create empty conversations

  // 3. Resolve customer (same matching rules as the webhook).
  const phone = jidToE164(remoteJid);
  const phoneDigits = phone.replace(/\D/g, "");
  let customer = await db.findCustomerByPhone(account.storeId, phoneDigits);
  if (!customer) {
    const sellerId = await db.resolveDefaultSellerId(account.storeId);
    customer = await db.createPendingCustomer({ storeId: account.storeId, phone, sellerId });
    stats.customersCreated++;
  }

  // 4. Resolve conversation; created ones span the imported window.
  const timestamps = fresh.map((r) => r.sentAt).sort();
  const oldest = timestamps[0] as string;
  const newest = timestamps[timestamps.length - 1] as string;
  let conversation = await db.findOpenConversation(customer.id, account.id);
  if (!conversation) {
    conversation = await db.createConversation({
      storeId: account.storeId,
      customerId: customer.id,
      accountId: account.id,
      assignedSellerId: customer.sellerId,
      status: "em_andamento",
      createdAt: oldest,
      lastMessageAt: newest,
    });
    stats.conversationsCreated++;
  }

  // 5. Land the messages (media is NOT downloaded — spec §3).
  for (const row of fresh) {
    await db.insertImportedMessage({
      conversationId: conversation.id,
      direction: row.direction,
      authorId: row.direction === "in" ? customer.id : null,
      text: row.text,
      mediaType: row.mediaType,
      status: row.status,
      providerMessageId: row.providerMessageId,
      sentAt: row.sentAt,
    });
    stats.messagesImported++;
  }
  await db.advanceConversationActivity(conversation.id, newest);
}
```

- [ ] **Step 4: Rodar os testes**

Run: `bunx vitest run src/providers/whatsapp/import/core.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git checkout -- src/routeTree.gen.ts
git add src/providers/whatsapp/import
git commit -m "feat(whatsapp): history import core (batched, idempotent, group-safe)"
```

---

### Task 6: Edge Function `whatsapp-import-history`

**Files:**
- Regenerate: `supabase/functions/_shared/whatsapp/**` (sync — inclui `import/core.ts`)
- Create: `supabase/functions/whatsapp-import-history/index.ts`

- [ ] **Step 1: Sync do espelho**

Run: `bun run scripts/sync-whatsapp-shared.ts`
Expected: inclui `import/core.ts` no espelho.

- [ ] **Step 2: Criar a função** — `supabase/functions/whatsapp-import-history/index.ts`:

```ts
/**
 * whatsapp-import-history — owner-only batched import of the Evolution
 * instance's stored chat history (real-inbox spec 2026-06-11).
 *
 * POST { accountId, cursor? } → { done, nextCursor, stats }
 * The client loops until done; the import core dedups by provider_message_id,
 * so re-running never duplicates and resumes after failures.
 *
 * Secrets: {credentials_ref}_API_KEY (Vault-first, env fallback).
 * Errors: house `{ error, code }` contract (codes mirror whatsapp-connect).
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";
import { findChats, findMessages } from "../_shared/whatsapp/evolution/instance.ts";
import {
  processImportBatch,
  type IImportDb,
  type IImportSource,
} from "../_shared/whatsapp/import/core.ts";
import type { IEngineDeps, IIntegrationLogEntry } from "../_shared/whatsapp/types.ts";

interface IAccountRow {
  id: string;
  store_id: string;
  provider: string;
  credentials_ref: string;
  provider_config: { baseUrl?: string; instanceName?: string } | null;
}

function jsonError(message: string, code: string, status: number): Response {
  return json({ error: message, code }, status);
}

function makeEngineDeps(admin: SupabaseClient, traceId: string): IEngineDeps {
  return {
    resolveSecret: createSecretResolver(admin),
    logIntegration: async (entry: IIntegrationLogEntry) => {
      await admin.from("integration_logs").insert({
        integration_name: entry.integrationName,
        direction: entry.direction,
        endpoint: entry.endpoint,
        http_status: entry.httpStatus,
        latency_ms: entry.latencyMs,
        trace_id: entry.traceId ?? traceId,
        request_payload: entry.requestPayload,
        response_payload: entry.responsePayload,
        error_message: entry.errorMessage,
      });
    },
  };
}

function makeImportDb(admin: SupabaseClient): IImportDb {
  return {
    async findCustomerByPhone(storeId, phoneDigits) {
      // Suffix narrow in SQL, exact digit match in code (mirrors the webhook).
      const { data } = await admin
        .from("customers")
        .select("id, seller_id, phone")
        .eq("store_id", storeId)
        .like("phone", `%${phoneDigits.slice(-8)}`);
      const row = (data ?? []).find(
        (candidate) => String(candidate.phone).replace(/\D/g, "") === phoneDigits,
      );
      return row ? { id: row.id as string, sellerId: row.seller_id as string } : null;
    },
    async resolveDefaultSellerId(storeId) {
      const { data: store } = await admin
        .from("stores")
        .select("manager_id")
        .eq("id", storeId)
        .maybeSingle();
      if (store?.manager_id) return store.manager_id as string;
      const { data: seller } = await admin
        .from("sellers")
        .select("id")
        .eq("store_id", storeId)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!seller) throw new Error(`store ${storeId} has no active seller for auto-assignment`);
      return seller.id as string;
    },
    async createPendingCustomer({ storeId, phone, sellerId }) {
      const { data, error } = await admin
        .from("customers")
        .insert({
          store_id: storeId,
          type: "b2c",
          phone,
          full_name: phone,
          seller_id: sellerId,
          status: "ativo",
          tags: ["pending_review"],
        })
        .select("id, seller_id")
        .single();
      if (error) throw new Error(`createPendingCustomer: ${error.message}`);
      return { id: data.id as string, sellerId: data.seller_id as string };
    },
    async findOpenConversation(customerId, accountId) {
      const { data } = await admin
        .from("conversations")
        .select("id")
        .eq("customer_id", customerId)
        .eq("whatsapp_account_id", accountId)
        .not("status", "in", "(resolvida,arquivada)")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ? { id: data.id as string } : null;
    },
    async createConversation(input) {
      const { data, error } = await admin
        .from("conversations")
        .insert({
          store_id: input.storeId,
          customer_id: input.customerId,
          whatsapp_account_id: input.accountId,
          assigned_seller_id: input.assignedSellerId,
          channel: "whatsapp",
          status: input.status,
          last_message_at: input.lastMessageAt,
          unread_count: 0,
          created_at: input.createdAt,
        })
        .select("id")
        .single();
      if (error) throw new Error(`createConversation: ${error.message}`);
      return { id: data.id as string };
    },
    async filterKnownProviderMessageIds(ids) {
      if (ids.length === 0) return new Set<string>();
      const known = new Set<string>();
      // PostgREST `in` lists are URL-bound — chunk defensively.
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await admin
          .from("messages")
          .select("provider_message_id")
          .in("provider_message_id", ids.slice(i, i + 200));
        for (const row of data ?? []) {
          if (row.provider_message_id) known.add(row.provider_message_id as string);
        }
      }
      return known;
    },
    async insertImportedMessage(input) {
      const { error } = await admin.from("messages").insert({
        conversation_id: input.conversationId,
        direction: input.direction,
        author_type: input.direction === "in" ? "customer" : "seller",
        author_id: input.authorId,
        provider: "evolution",
        text: input.text,
        media_type: input.mediaType,
        // Spec §3: historical media is NOT downloaded — eligible for manual retry.
        media_download_status: input.mediaType ? "failed" : null,
        status: input.status,
        sent_at: input.sentAt,
        provider_message_id: input.providerMessageId,
      });
      if (error) throw new Error(`insertImportedMessage: ${error.message}`);
    },
    async advanceConversationActivity(conversationId, lastMessageAt) {
      await admin
        .from("conversations")
        .update({ last_message_at: lastMessageAt, updated_at: new Date().toISOString() })
        .eq("id", conversationId)
        .lt("last_message_at", lastMessageAt);
    },
  };
}

/** Audit actor must reference sellers.id (audit FK) — resolve from the caller. */
async function resolveActorSellerId(
  admin: SupabaseClient,
  callerId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("profiles")
    .select("seller_id")
    .eq("auth_user_id", callerId)
    .maybeSingle();
  return (data?.seller_id as string | null) ?? null;
}

servePost(async (req, { log, traceId }) => {
  const { callerId, admin, profile } = await requireCaller(req, ["owner"]);
  const body = await parseJsonBody<{ accountId?: string; cursor?: number }>(req);
  if (!body.accountId) throw new HttpError(400, "accountId is required");

  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("id, store_id, provider, credentials_ref, provider_config")
    .eq("id", body.accountId)
    .eq("store_id", profile.store_id)
    .maybeSingle<IAccountRow>();
  if (!account) return jsonError("conta não encontrada nesta loja", "NOT_FOUND", 404);
  if (account.provider !== "evolution") {
    return jsonError("importação disponível apenas para contas Evolution", "VALIDATION_ERROR", 422);
  }
  const baseUrl = account.provider_config?.baseUrl;
  const instanceName = account.provider_config?.instanceName;
  if (!baseUrl || !instanceName) {
    return jsonError("configure URL base e instância antes de importar", "CONFIG_MISSING", 422);
  }

  const deps = makeEngineDeps(admin, traceId);
  const apiKey = await deps.resolveSecret(`${account.credentials_ref}_API_KEY`);
  if (!apiKey) {
    return jsonError("chave de API da instância não cadastrada", "MISSING_API_KEY", 422);
  }

  const target = { baseUrl, instanceName };
  const source: IImportSource = {
    listChats: async () => (await findChats(apiKey, deps, target, traceId)).map((c) => c.remoteJid),
    listMessages: (remoteJid, page) => findMessages(apiKey, deps, target, remoteJid, page, traceId),
  };

  const result = await processImportBatch({
    account: { id: account.id, storeId: account.store_id },
    source,
    db: makeImportDb(admin),
    cursor: body.cursor,
    warn: (msg, fields) => log.warn(msg, fields),
  });

  const actorId = await resolveActorSellerId(admin, callerId);
  if (actorId) {
    await bestEffortAudit(admin, {
      store_id: account.store_id,
      actor_id: actorId,
      action: "whatsapp_history_imported",
      resource: "whatsapp_account",
      resource_id: account.id,
      after: { ...result.stats, cursor: body.cursor ?? 0, done: result.done, traceId },
    });
  }
  log.info("import batch processed", { accountId: account.id, ...result.stats });

  return json(result, 200);
});
```

- [ ] **Step 3: Conferir assinatura de `parseJsonBody`** em `supabase/functions/_shared/http.ts` (se for `parseJsonBody(req)` sem genérico, ajustar a chamada para o padrão real do arquivo — NUNCA mudar o `_shared`).

- [ ] **Step 4: Gate**

Run: `bun run build` e `bun run test`
Expected: verdes (função é Deno; gate confirma que o espelho não quebrou o app).

- [ ] **Step 5: Commit**

```bash
git checkout -- src/routeTree.gen.ts
git add supabase/functions/_shared/whatsapp supabase/functions/whatsapp-import-history
git commit -m "feat(whatsapp): owner-only whatsapp-import-history edge function"
```

- [ ] **Step 6 (CONTROLADOR): Deploy**

Controlador deploya via MCP `deploy_edge_function` (name `whatsapp-import-history`, `verify_jwt: true`, files = `index.ts` + closure `_shared`: `serve.ts`, `cors.ts`, `http.ts`, `logger.ts`, `sentry.ts`, `auth.ts`, `env.ts`, `audit.ts`, `secrets.ts` + espelho `_shared/whatsapp/**` necessário: `types.ts`, `errors.ts`, `phone.ts`, `http.ts`, `sanitize.ts`, `evolution/client.ts`, `evolution/errors.ts`, `evolution/instance.ts`, `evolution/parser.ts`, `import/core.ts`).

---

### Task 7: Client da importação (`whatsappImport.ts`)

**Files:**
- Create: `src/features/admin-settings/api/whatsappImport.ts`

- [ ] **Step 1: Criar o client** (padrão de `whatsappConnect.ts` — mesmo tratamento de erro do `functions.invoke`):

```ts
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Client surface for the `whatsapp-import-history` Edge Function (real-inbox
 * spec 2026-06-11). Real mode only — the page hides the entry point in demo
 * mode (there is no Evolution instance to import from).
 */

export interface IImportStats {
  chatsProcessed: number;
  chatsSkippedGroup: number;
  customersCreated: number;
  conversationsCreated: number;
  messagesImported: number;
  messagesSkipped: number;
}

export interface IImportBatchResponse {
  done: boolean;
  nextCursor: number;
  stats: IImportStats;
}

export interface IImportProgress {
  batches: number;
  total: IImportStats;
  done: boolean;
}

export type ImportErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFIG_MISSING"
  | "MISSING_API_KEY"
  | "INTEGRATION_ERROR";

export class WhatsAppImportError extends Error {
  readonly code?: ImportErrorCode;
  constructor(message: string, code?: ImportErrorCode) {
    super(message);
    this.name = "WhatsAppImportError";
    this.code = code;
  }
}

const IMPORT_ERROR_MESSAGES: Partial<Record<ImportErrorCode, string>> & { DEFAULT: string } = {
  NOT_FOUND: "Conta não encontrada nesta loja.",
  VALIDATION_ERROR: "A importação está disponível apenas para contas Evolution.",
  CONFIG_MISSING: "Configure a URL do servidor e a instância antes de importar.",
  MISSING_API_KEY: "Salve a chave de API no cofre antes de importar.",
  DEFAULT:
    "Não conseguimos importar agora. Verifique a conexão com o servidor Evolution e tente de novo — a importação retoma de onde parou.",
};

export function importErrorMessage(error: unknown): string {
  if (error instanceof WhatsAppImportError && error.code) {
    return IMPORT_ERROR_MESSAGES[error.code] ?? IMPORT_ERROR_MESSAGES.DEFAULT;
  }
  return IMPORT_ERROR_MESSAGES.DEFAULT;
}

export function emptyImportStats(): IImportStats {
  return {
    chatsProcessed: 0,
    chatsSkippedGroup: 0,
    customersCreated: 0,
    conversationsCreated: 0,
    messagesImported: 0,
    messagesSkipped: 0,
  };
}

function accumulate(total: IImportStats, batch: IImportStats): void {
  for (const key of Object.keys(total) as Array<keyof IImportStats>) {
    total[key] += batch[key] ?? 0;
  }
}

async function toImportError(error: unknown): Promise<WhatsAppImportError> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string; code?: string };
      if (body?.error) return new WhatsAppImportError(body.error, body.code as ImportErrorCode);
    } catch {
      /* fall through */
    }
  }
  return new WhatsAppImportError(error instanceof Error ? error.message : "import failed");
}

async function invokeImportBatch(accountId: string, cursor: number): Promise<IImportBatchResponse> {
  const { data, error } = await getSupabaseClient().functions.invoke<IImportBatchResponse>(
    "whatsapp-import-history",
    { body: { accountId, cursor } },
  );
  if (error) throw await toImportError(error);
  return data as IImportBatchResponse;
}

/**
 * Drives the batched import until done, reporting progress per batch.
 * Throwing mid-run is safe: re-running resumes (server-side idempotency).
 */
export async function runHistoryImport(
  accountId: string,
  onProgress: (progress: IImportProgress) => void,
): Promise<IImportStats> {
  const total = emptyImportStats();
  let cursor = 0;
  let batches = 0;
  for (;;) {
    const response = await invokeImportBatch(accountId, cursor);
    batches++;
    accumulate(total, response.stats);
    onProgress({ batches, total: { ...total }, done: response.done });
    if (response.done) return total;
    cursor = response.nextCursor;
  }
}
```

- [ ] **Step 2: Gate rápido**

Run: `bun run build`
Expected: verde.

- [ ] **Step 3: Commit**

```bash
git checkout -- src/routeTree.gen.ts
git add src/features/admin-settings/api/whatsappImport.ts
git commit -m "feat(admin-settings): whatsapp history import client (batch loop, pt-BR errors)"
```

---

### Task 8: UI — diálogo + botão na tela de contas

**Files:**
- Create: `src/features/admin-settings/components/ImportConversationsDialog.tsx`
- Modify: `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx`

- [ ] **Step 1: Criar o diálogo** — `src/features/admin-settings/components/ImportConversationsDialog.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { IWhatsAppAccount } from "@/shared/types";
import {
  emptyImportStats,
  importErrorMessage,
  runHistoryImport,
  type IImportStats,
} from "../api/whatsappImport";

type Phase = "confirm" | "running" | "done" | "error";

/**
 * Owner-only history import driver (real-inbox spec §4): confirm → batched
 * progress → summary. Server-side idempotency makes "Tentar de novo" safe —
 * the import resumes where it stopped.
 */
export function ImportConversationsDialog({
  account,
  onClose,
}: {
  account: IWhatsAppAccount | null;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [stats, setStats] = useState<IImportStats>(emptyImportStats());
  const [batches, setBatches] = useState(0);
  const [errorText, setErrorText] = useState("");
  const runningRef = useRef(false);

  useEffect(() => {
    if (account) {
      setPhase("confirm");
      setStats(emptyImportStats());
      setBatches(0);
      setErrorText("");
    }
  }, [account?.id]);

  const start = async () => {
    if (!account || runningRef.current) return;
    runningRef.current = true;
    setPhase("running");
    try {
      const total = await runHistoryImport(account.id, (progress) => {
        setStats(progress.total);
        setBatches(progress.batches);
      });
      setStats(total);
      setPhase("done");
    } catch (error) {
      setErrorText(importErrorMessage(error));
      setPhase("error");
    } finally {
      runningRef.current = false;
    }
  };

  const close = () => {
    if (phase === "running") return; // never abandon a run silently
    onClose();
  };

  return (
    <Dialog open={account !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importar conversas do WhatsApp</DialogTitle>
          <DialogDescription>
            {account ? `Conta ${account.label} — traz para o Inbox o histórico que o servidor Evolution tem armazenado.` : ""}
          </DialogDescription>
        </DialogHeader>

        {phase === "confirm" && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Números que ainda não são clientes entram como <strong>clientes pendentes</strong>{" "}
              (tag <code className="font-mono text-xs">pending_review</code>) para revisão depois.
            </p>
            <p>Grupos e listas de transmissão são ignorados. Mídias antigas não são baixadas.</p>
            <p>Pode rodar mais de uma vez: nada é duplicado.</p>
          </div>
        )}

        {(phase === "running" || phase === "done") && (
          <div className="space-y-3">
            {phase === "running" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon icon="mdi:loading" size={16} className="animate-spin" />
                Importando… lote {batches}
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Conversas processadas</dt>
              <dd className="text-right font-medium text-foreground">{stats.chatsProcessed}</dd>
              <dt className="text-muted-foreground">Mensagens importadas</dt>
              <dd className="text-right font-medium text-foreground">{stats.messagesImported}</dd>
              <dt className="text-muted-foreground">Clientes novos (revisar)</dt>
              <dd className="text-right font-medium text-foreground">{stats.customersCreated}</dd>
              <dt className="text-muted-foreground">Grupos ignorados</dt>
              <dd className="text-right font-medium text-foreground">{stats.chatsSkippedGroup}</dd>
              <dt className="text-muted-foreground">Já existiam (puladas)</dt>
              <dd className="text-right font-medium text-foreground">{stats.messagesSkipped}</dd>
            </dl>
            {phase === "done" && (
              <p className="flex items-center gap-1.5 text-sm text-severity-success">
                <Icon icon="mdi:check-circle-outline" size={16} />
                Importação concluída — as conversas já estão no Inbox.
              </p>
            )}
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-2">
            <p className="flex items-start gap-1.5 text-sm text-severity-critical">
              <Icon icon="mdi:alert-circle-outline" size={16} className="mt-0.5 shrink-0" />
              {errorText}
            </p>
            <p className="text-xs text-muted-foreground">
              O que já foi importado está salvo — tentar de novo continua de onde parou.
            </p>
          </div>
        )}

        <DialogFooter>
          {phase === "confirm" && (
            <>
              <Button variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button onClick={() => void start()}>
                <Icon icon="mdi:download-multiple" size={14} className="mr-1.5" />
                Importar agora
              </Button>
            </>
          )}
          {phase === "running" && (
            <Button disabled>
              <Icon icon="mdi:loading" size={14} className="mr-1.5 animate-spin" />
              Importando…
            </Button>
          )}
          {phase === "done" && <Button onClick={close}>Fechar</Button>}
          {phase === "error" && (
            <>
              <Button variant="outline" onClick={close}>
                Fechar
              </Button>
              <Button onClick={() => void start()}>Tentar de novo</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

(Conferir os componentes exportados em `src/components/ui/dialog.tsx` — usar exatamente os nomes existentes.)

- [ ] **Step 2: Ligar na página** — `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx`:

(a) imports:

```tsx
import { ImportConversationsDialog } from "../components/ImportConversationsDialog";
```

(b) estado, junto de `testTarget`:

```tsx
const [importTarget, setImportTarget] = useState<IWhatsAppAccount | null>(null);
```

(c) botão — dentro do bloco `{account.provider === "evolution" && ( <> … </> )}` das ações, logo APÓS o botão "Mensagem de teste" (a rota já é Owner-only; em demo a fonte é mock e não há instância para importar — esconder):

```tsx
{!isMock && (
  <Button
    variant="outline"
    size="sm"
    disabled={account.status !== "connected"}
    onClick={() => setImportTarget(account)}
    title={
      account.status === "connected"
        ? "Importa o histórico de conversas que o servidor Evolution tem desta conta"
        : "Disponível com a conta conectada"
    }
  >
    <Icon icon="mdi:download-multiple" size={14} className="mr-1.5" />
    Importar conversas
  </Button>
)}
```

(d) render do diálogo, ao lado de `<TestMessageDialog …/>`:

```tsx
<ImportConversationsDialog account={importTarget} onClose={() => setImportTarget(null)} />
```

- [ ] **Step 3: Gate**

Run: `bun run build` e `bun run test`
Expected: verdes. Validação visual é do dono (não abrir browser).

- [ ] **Step 4: Commit**

```bash
git checkout -- src/routeTree.gen.ts
git add src/features/admin-settings/components/ImportConversationsDialog.tsx src/features/admin-settings/pages/WhatsAppAccountsPage.tsx
git commit -m "feat(admin-settings): import conversations dialog on whatsapp accounts page"
```

---

### Task 9 (CONTROLADOR + aprovação do dono): arquivar o seed em produção

Operação de DADOS em produção — executada pelo controlador via MCP `execute_sql`, com OK explícito do dono na hora. **Não é migration** (registrada aqui e no PR).

- [ ] **Step 1: Pré-checagem (mostrar ao dono)**

```sql
select count(*) as to_archive
from public.conversations
where id not in (
  select conversation_id from public.messages where provider_message_id is not null
)
and not (tags @> array['demo-seed'])
and status <> 'arquivada';
```

- [ ] **Step 2: Arquivar (após OK)**

```sql
update public.conversations
set tags = array_append(tags, 'demo-seed'),
    status = 'arquivada',
    unread_count = 0,
    updated_at = now()
where id not in (
  select conversation_id from public.messages where provider_message_id is not null
)
and not (tags @> array['demo-seed']);
```

- [ ] **Step 3: Audit log** (actor = seller do Owner; resolver com `select seller_id from profiles where role='owner' limit 1`):

```sql
insert into public.audit_logs (store_id, actor_id, action, resource, resource_id, after)
select '00000000-0000-0000-0000-000000000001', p.seller_id,
       'seed_conversations_archived', 'conversation', 'bulk',
       jsonb_build_object('archived', <N>, 'tag', 'demo-seed', 'spec', '2026-06-11-whatsapp-real-inbox')
from public.profiles p where p.role = 'owner' and p.seller_id is not null limit 1;
```

- [ ] **Step 4: Pós-checagem** — `to_archive` deve voltar 0; `select count(*) from conversations where tags @> array['demo-seed']` ≈ contagem do passo 1.

---

### Task 10: Documentação

**Files:**
- Create: `docs/dev/whatsapp-history-import.md`

- [ ] **Step 1: Escrever o doc** (conteúdo mínimo, seguindo o tom dos `docs/dev/whatsapp-*.md`): o que a importação faz e não faz (grupos, mídia, profundidade Evolution), contrato `{accountId, cursor}` → `{done, nextCursor, stats}`, idempotência por `provider_message_id`, o ramo `outbound-echo` do webhook (anti-eco, conversa `em_andamento`, sem não-lida), e o registro do arquivamento do seed (data, critério, tag `demo-seed`, como reverter).

- [ ] **Step 2: Commit**

```bash
git checkout -- src/routeTree.gen.ts
git add docs/dev/whatsapp-history-import.md
git commit -m "docs(whatsapp): history import + outbound echo + seed archival record"
```

---

### Task 11 (CONTROLADOR): gates finais, smoke e PR

- [ ] Sync limpo: `bun run scripts/sync-whatsapp-shared.ts` seguido de `git status` sem diff (espelho já commitado).
- [ ] `bun run build` + `bun run test` verdes na branch completa.
- [ ] Deploys feitos: `whatsapp-webhook` (atualizado) e `whatsapp-import-history` (nova) — conferir com `list_edge_functions`.
- [ ] Task 9 executada (seed arquivado) — Inbox de produção zerado de fictício.
- [ ] Smoke real (dono): mensagem recebida cria conversa; mensagem enviada do celular aparece espelhada; importação roda e popula o Inbox.
- [ ] PR `feat/whatsapp-real-inbox` → `main` (merge e bump MINOR só com aprovação do dono).

## Self-Review (do plano)

- **Cobertura da spec:** §1 seed → Task 9; §2 webhook (parser/core/adapter/deploy) → Tasks 1–3; §3 importação (helpers/núcleo/função/deploy) → Tasks 4–6; §4 UI → Tasks 7–8; §5 testes/gates/docs → distribuídos + Tasks 10–11. Sem lacunas.
- **Placeholders:** nenhum TBD; todos os passos de código têm código.
- **Consistência de tipos:** `IOutboundEcho` (T1) usado no core (T2); `createConversation.status` igual em core (T2), adapter (T3) e import (T5/T6); `IEvolutionStoredMessage` definido em T4 e consumido em T5; stats com os mesmos 6 campos em T5/T6/T7/T8.
