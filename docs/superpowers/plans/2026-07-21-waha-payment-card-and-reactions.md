# Card de chave PIX e reações no Atendimento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renderizar a chave PIX que a loja envia pelo celular como um card com botão copiar, e tornar visíveis as reações (emoji) que hoje nem chegam à plataforma.

**Architecture:** A chave PIX segue o padrão de conteúdo estruturado que `location`/`contact` já usam — dados codificados em `messages.text`, `media_type` como discriminador de render. As reações são um evento WAHA novo (`message.reaction`) persistido numa coluna `jsonb` da mensagem reagida e exibido na chrome compartilhada dos balões. Nenhuma alteração no cache/realtime do Atendimento (congelado por ordem do dono): a reação toca a conversa e o `syncLatest` já existente traz a atualização ao thread aberto.

**Tech Stack:** TypeScript strict, React 19, Vitest, Supabase (Postgres + Edge Functions Deno), Tailwind v4 + shadcn/ui, Iconify.

**Spec:** `docs/superpowers/specs/2026-07-21-waha-payment-card-and-reactions-design.md`

## Global Constraints

- **Comentários e nomes de código em inglês.** Texto de UI em **português do Brasil com acentuação correta** (UTF-8): "Chave PIX", "Mensagem não suportada", "Reagiu com".
- **TDD obrigatório** nos engines puros: escrever o teste, vê-lo falhar, implementar o mínimo, vê-lo passar, commitar. Testes co-localizados (`*.test.ts`).
- **`src/providers/whatsapp/` é runtime-agnostic** — só Web APIs e imports relativos, nunca `@/`. Mudou algo lá ⇒ rodar `bun run scripts/sync-whatsapp-shared.ts`.
- **O sync espelha 62 arquivos e reescreve line endings.** Depois de rodá-lo, restaurar os arquivos não relacionados:
  `git checkout -- 'supabase/functions/_shared/' ':(exclude)<os arquivos que você realmente mudou>'`
- **NÃO TOCAR** em `useRealtimeMessages`, `useRealtimeConversations`, query keys de mensagens/mídia, `resolveMediaUrls`/`useSeedSignedMediaUrls`/`partitionMediaRefs`, nem na policy `can_read_conversation_media`. Ordem expressa do dono. Se algum passo parecer exigir isso, PARE e pergunte.
- **Gate de verificação:** `bun run test` e `bun run build`. O `build` não faz type-check; rodar `bunx tsc --noEmit` e avaliar **apenas os arquivos tocados** (o projeto tem ~378 erros pré-existentes).
- **O lint acusa milhares de `Delete ␍`** — é o CRLF do ambiente Windows, ruído pré-existente. Só corrigir erros de prettier que estejam em linhas que VOCÊ adicionou.
- **Não commitar `src/routeTree.gen.ts`** — é regenerado pelo build; `git checkout --` nele antes de commitar.
- Migration só é aplicada em produção com **OK explícito do dono**. Nenhum passo deste plano aplica nada em prod.

---

## File Structure

**Parte 1 — PIX**

| Arquivo | Responsabilidade |
| --- | --- |
| `src/providers/whatsapp/contentFormat.ts` (modificar) | `encodePayment`/`decodePayment` — fonte única do formato |
| `src/providers/whatsapp/waha/parser.ts` (modificar) | `extractWahaPayment` + branch no `extractContent` |
| `src/shared/types/conversation.ts` (modificar) | `MessageMediaType` += `"payment"` |
| `src/providers/whatsapp/types.ts` (modificar) | `MEDIA_DISCRIMINATOR_TYPES` += `"payment"` |
| `src/features/conversations/components/bubbles/PaymentBubble.tsx` (criar) | Card visual |
| `src/features/conversations/components/bubbles/MessageBubble.tsx` (modificar) | Roteamento |
| `src/features/conversations/utils/conversationDisplay.ts` (modificar) | Prévia da Inbox |
| `src/features/conversations/i18n/pt-BR.ts` (modificar) | Strings |
| `src/features/conversations/utils/mediaDownload.ts` (modificar) | Exclusão de download |
| `src/features/media/hooks/useEnsureInboundMedia.ts` (modificar) | Exclusão de arquivamento |

**Parte 2 — Reações**

| Arquivo | Responsabilidade |
| --- | --- |
| `supabase/migrations/<ts>_message_reactions.sql` (criar) | Coluna `reactions jsonb` |
| `src/shared/types/conversation.ts` (modificar) | `IMessageReaction`, `IMessageReactions`, `IMessage.reactions` |
| `src/providers/whatsapp/waha/constants.ts` (modificar) | `message.reaction` em `WAHA_DEFAULT_EVENTS` |
| `src/providers/whatsapp/waha/reaction.ts` (criar) | `parseWahaReactionEvent` + `applyReaction` (engines puros) |
| `supabase/functions/waha-webhook/index.ts` (modificar) | Branch do evento |
| `src/providers/data/impl/supabase/messages.ts` (modificar) | `COLUMNS` + `rowToMessage` |
| `src/features/conversations/components/bubbles/bubbleChrome.tsx` (modificar) | Chip do emoji |
| `scripts/waha-resubscribe-reactions.ts` (criar) | Re-inscrição das sessões existentes |

---

# PARTE 1 — Card de chave PIX

### Task 1: Codificação do conteúdo de pagamento

**Files:**
- Modify: `src/providers/whatsapp/contentFormat.ts`
- Test: `src/providers/whatsapp/contentFormat.test.ts`

**Interfaces:**
- Consumes: `oneLine` (privado, já existe no arquivo)
- Produces: `IPaymentContent { merchant?, key?, keyType? }`, `encodePayment(c): string`, `decodePayment(text): IPaymentContent`

- [ ] **Step 1: Write the failing tests**

Adicionar ao final de `src/providers/whatsapp/contentFormat.test.ts`:

```ts
describe("encodePayment / decodePayment", () => {
  it("round-trips merchant, key type and key", () => {
    const text = encodePayment({
      merchant: "Fernando De Mello Muniz",
      key: "32990725000160",
      keyType: "CNPJ",
    });
    expect(text).toBe("Fernando De Mello Muniz\nCNPJ:32990725000160");
    expect(decodePayment(text)).toEqual({
      merchant: "Fernando De Mello Muniz",
      key: "32990725000160",
      keyType: "CNPJ",
    });
  });

  it("keeps an e-mail key intact when the key itself has no colon", () => {
    const text = encodePayment({ merchant: "Loja", key: "vendas@gallo.com.br", keyType: "EMAIL" });
    expect(decodePayment(text).key).toBe("vendas@gallo.com.br");
  });

  it("splits on the FIRST colon so a key containing one is preserved", () => {
    const decoded = decodePayment("Loja\nEVP:abc:def");
    expect(decoded.keyType).toBe("EVP");
    expect(decoded.key).toBe("abc:def");
  });

  it("collapses a multi-line merchant so it cannot invade the key line", () => {
    const text = encodePayment({ merchant: "Gallo\nBase Diesel", key: "123", keyType: "CNPJ" });
    expect(text).toBe("Gallo Base Diesel\nCNPJ:123");
    expect(decodePayment(text).merchant).toBe("Gallo Base Diesel");
  });

  it("encodes the key alone when there is no merchant", () => {
    expect(encodePayment({ key: "123", keyType: "CNPJ" })).toBe("CNPJ:123");
    expect(decodePayment("CNPJ:123")).toEqual({ key: "123", keyType: "CNPJ" });
  });

  it("round-trips an untyped key that itself contains a colon", () => {
    const text = encodePayment({ key: "abc:def" });
    expect(decodePayment(text)).toEqual({ key: "abc:def" });
  });

  it("returns an empty string when there is no key", () => {
    expect(encodePayment({ merchant: "Loja" })).toBe("");
    expect(encodePayment({})).toBe("");
  });

  it("decodes a key with no type prefix as the key itself", () => {
    expect(decodePayment("Loja\n32990725000160")).toEqual({
      merchant: "Loja",
      key: "32990725000160",
    });
  });
});
```

Adicionar `encodePayment, decodePayment` ao import existente no topo do arquivo de teste.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `bunx vitest run src/providers/whatsapp/contentFormat.test.ts`
Expected: FAIL — `encodePayment is not a function` (ou erro de import).

- [ ] **Step 3: Implement**

Adicionar ao final de `src/providers/whatsapp/contentFormat.ts`:

```ts
/**
 * A PIX key shared through WhatsApp's payment button. WhatsApp sends these as
 * a static-key share: the amount field exists in the payload but is always
 * zero, so it is deliberately not modelled here (see the design doc).
 */
export interface IPaymentContent {
  /** Who receives — the payload's `merchant_name`. */
  merchant?: string;
  /** The PIX key itself, unformatted. */
  key?: string;
  /** CNPJ | CPF | EMAIL | PHONE | EVP. */
  keyType?: string;
}

/**
 * Payment → canonical text: `"<merchant>\n<keyType>:<key>"`. The key always
 * sits on the LAST line so a merchant name carrying a colon can't be mistaken
 * for it, and the type separator is ALWAYS emitted when there is a key (an
 * untyped key becomes `":<key>"`) — otherwise a key containing a colon would
 * decode back as a bogus type. Without a key there is nothing to show, so the
 * result is empty; callers treat that as "not a payment".
 */
export function encodePayment(content: IPaymentContent): string {
  const key = oneLine(content.key);
  if (!key) return "";
  const merchant = oneLine(content.merchant);
  const keyLine = `${oneLine(content.keyType)}:${key}`;
  return merchant ? `${merchant}\n${keyLine}` : keyLine;
}

/** Inverse of {@link encodePayment}. The last line is always the key line. */
export function decodePayment(text: string): IPaymentContent {
  const lines = (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return {};
  const keyLine = lines[lines.length - 1] as string;
  const merchant = lines.slice(0, -1).join(" ") || undefined;
  // First colon only — everything after it is the key, so a key carrying a
  // colon survives. A line with NO colon never came from encodePayment (third
  // party or legacy data): treat the whole line as the key.
  const separator = keyLine.indexOf(":");
  if (separator === -1) return { merchant, key: keyLine };
  return {
    merchant,
    keyType: keyLine.slice(0, separator) || undefined,
    key: keyLine.slice(separator + 1),
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `bunx vitest run src/providers/whatsapp/contentFormat.test.ts`
Expected: PASS, todos.

- [ ] **Step 5: Sync the shared mirror and restore unrelated files**

```bash
bun run scripts/sync-whatsapp-shared.ts
git checkout -- 'supabase/functions/_shared/' ':(exclude)supabase/functions/_shared/whatsapp/contentFormat.ts'
git status --short
```
Expected: só `src/providers/whatsapp/contentFormat.ts`, o teste, e `supabase/functions/_shared/whatsapp/contentFormat.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/providers/whatsapp/contentFormat.ts src/providers/whatsapp/contentFormat.test.ts supabase/functions/_shared/whatsapp/contentFormat.ts
git commit -m "feat(whatsapp): canonical text encoding for a shared PIX key"
```

---

### Task 2: Extração do pagamento no parser WAHA

**Files:**
- Modify: `src/providers/whatsapp/waha/parser.ts`
- Test: `src/providers/whatsapp/waha/parser.test.ts`

**Interfaces:**
- Consumes: `encodePayment` (Task 1); `IParsedContent`, `wahaMessageKind`, `isDiscardableEnvelope` (já existem)
- Produces: `"payment"` válido em `InboundContentType`; branch `contentType: "payment"` em `extractContent`

- [ ] **Step 0: Widen the content-type union first**

O branch desta task retorna `contentType: "payment"`, que precisa existir no
union antes — sem isso a task termina num estado que não type-checka.

Em `src/providers/whatsapp/types.ts`, adicionar `"payment"` ao union
`InboundContentType`, junto de `"location"` e `"contact"`.

(O discriminador de domínio `MessageMediaType` e a lista
`MEDIA_DISCRIMINATOR_TYPES` entram na Task 3 — aqui só o contrato do parser.)

- [ ] **Step 1: Write the failing tests**

Adicionar ao final de `src/providers/whatsapp/waha/parser.test.ts`:

```ts
describe("parseWahaMessageEvent — shared PIX key", () => {
  const base = {
    id: "id-pix",
    timestamp: 1721567423,
    from: "554799852008@c.us",
    fromMe: true,
    body: null,
    hasMedia: false,
  };

  /** Real capture shape: buttonParamsJSON is a JSON STRING, not an object. */
  function withParams(params: unknown) {
    return {
      ...base,
      _data: {
        Message: {
          interactiveMessage: {
            InteractiveMessage: {
              NativeFlowMessage: {
                buttons: [{ name: "payment_info", buttonParamsJSON: JSON.stringify(params) }],
              },
            },
          },
        },
      },
    };
  }

  const realParams = {
    reference_id: "4VQ0VH6O7LF",
    payment_settings: [
      {
        type: "pix_static_code",
        pix_static_code: {
          merchant_name: "Fernando De Mello Muniz",
          key: "32990725000160",
          key_type: "CNPJ",
        },
      },
    ],
    total_amount: { value: 0, offset: 100 },
    order: { status: "pending", items: [{ name: "", quantity: 0 }] },
  };

  it("parses a shared PIX key into canonical payment text", () => {
    const parsed = parseWahaMessageEvent(withParams(realParams), accountId);
    expect(parsed.type).toBe("outbound-echo");
    expect(parsed.contentType).toBe("payment");
    expect(parsed.text).toBe("Fernando De Mello Muniz\nCNPJ:32990725000160");
  });

  it("keeps the envelope as a plain placeholder when buttonParamsJSON is malformed", () => {
    const parsed = parseWahaMessageEvent(
      {
        ...base,
        _data: {
          Message: {
            interactiveMessage: {
              InteractiveMessage: {
                NativeFlowMessage: {
                  buttons: [{ name: "payment_info", buttonParamsJSON: "{not json" }],
                },
              },
            },
          },
        },
      },
      accountId,
    );
    expect(parsed.contentType).toBe("text");
    expect(parsed.text).toBe("");
  });

  it("ignores an interactive message with no payment_info button", () => {
    const parsed = parseWahaMessageEvent(
      {
        ...base,
        _data: {
          Message: {
            interactiveMessage: {
              InteractiveMessage: {
                NativeFlowMessage: { buttons: [{ name: "quick_reply" }] },
              },
            },
          },
        },
      },
      accountId,
    );
    expect(parsed.contentType).toBe("text");
  });

  it("ignores a payment payload carrying no usable key", () => {
    const parsed = parseWahaMessageEvent(
      withParams({ payment_settings: [{ type: "pix_static_code", pix_static_code: {} }] }),
      accountId,
    );
    expect(parsed.contentType).toBe("text");
  });

  it("does not let a text body hide the payment card", () => {
    const parsed = parseWahaMessageEvent(
      { ...withParams(realParams), body: "segue o pix" },
      accountId,
    );
    expect(parsed.contentType).toBe("payment");
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `bunx vitest run src/providers/whatsapp/waha/parser.test.ts`
Expected: FAIL — `expected 'text' to be 'payment'`.

- [ ] **Step 3: Implement**

Em `src/providers/whatsapp/waha/parser.ts`, adicionar ao import de `contentFormat`:

```ts
import {
  encodeContact,
  encodeLocation,
  encodePayment,
  nameFromVCard,
  phoneFromVCard,
} from "../contentFormat";
```

Adicionar a interface junto das outras de `_data` (perto de `IWahaTemplateMessage`):

```ts
/** WhatsApp's payment button. The readable payload is a JSON STRING nested in
 *  `buttonParamsJSON` — confirmed against real captures (2026-07-16/21). */
interface IWahaNativeFlowButton {
  name?: string;
  buttonParamsJSON?: string;
}
interface IWahaInteractiveMessage {
  InteractiveMessage?: { NativeFlowMessage?: { buttons?: IWahaNativeFlowButton[] } };
}
```

E no `IWahaGoMessageBody`, junto de `templateMessage`:

```ts
  interactiveMessage?: IWahaInteractiveMessage;
```

Adicionar a função extratora logo antes de `extractContent`:

```ts
/** Canonical payment text for a shared PIX key, or undefined when the envelope
 *  carries no usable key. `buttonParamsJSON` is third-party data parsed inside
 *  a try/catch: malformed JSON degrades to "not a payment", never throws. */
function extractWahaPaymentText(payload: IWahaMessagePayload): string | undefined {
  const buttons =
    payload._data?.Message?.interactiveMessage?.InteractiveMessage?.NativeFlowMessage?.buttons;
  const raw = buttons?.find((button) => button?.name === "payment_info")?.buttonParamsJSON;
  if (!raw) return undefined;
  let params: unknown;
  try {
    params = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const settings = (params as { payment_settings?: unknown[] } | null)?.payment_settings;
  const pix = (settings?.[0] as { pix_static_code?: Record<string, string> } | undefined)
    ?.pix_static_code;
  if (!pix) return undefined;
  return (
    encodePayment({ merchant: pix.merchant_name, key: pix.key, keyType: pix.key_type }) || undefined
  );
}
```

E o branch em `extractContent`, entre o de `location` e o de `templateMessage`:

```ts
  // A PIX key shared through WhatsApp's payment button. Deliberately ignores
  // the payload's amount/items: they are always zero/empty on these static-key
  // shares, and rendering "R$ 0,00" would be worse than omitting it.
  const paymentText = extractWahaPaymentText(payload);
  if (paymentText) {
    return { contentType: "payment", text: paymentText };
  }
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `bunx vitest run src/providers/whatsapp/waha/parser.test.ts`
Expected: PASS, todos.

- [ ] **Step 5: Confirm the types are clean**

Run: `bunx tsc --noEmit 2>&1 | grep -E "waha/parser|whatsapp/types" || echo "sem erros nos arquivos tocados"`
Expected: `sem erros nos arquivos tocados`. (O projeto tem ~378 erros pré-existentes em outros arquivos — ignore-os.)

- [ ] **Step 6: Commit**

```bash
bun run scripts/sync-whatsapp-shared.ts
git checkout -- 'supabase/functions/_shared/' ':(exclude)supabase/functions/_shared/whatsapp/waha/parser.ts' ':(exclude)supabase/functions/_shared/whatsapp/types.ts'
git add src/providers/whatsapp/waha/parser.ts src/providers/whatsapp/waha/parser.test.ts src/providers/whatsapp/types.ts supabase/functions/_shared/whatsapp/waha/parser.ts supabase/functions/_shared/whatsapp/types.ts
git commit -m "feat(waha): parse a shared PIX key out of the payment button"
```

---

### Task 3: Registrar `payment` como tipo de conteúdo

**Files:**
- Modify: `src/providers/whatsapp/types.ts`
- Modify: `src/shared/types/conversation.ts`
- Modify: `src/features/conversations/utils/mediaDownload.ts`
- Modify: `src/features/media/hooks/useEnsureInboundMedia.ts`

**Interfaces:**
- Produces: `"payment"` válido em `InboundContentType`, `MessageMediaType` e `MEDIA_DISCRIMINATOR_TYPES`

- [ ] **Step 1: Add the type to the media discriminator list**

`InboundContentType` já ganhou `"payment"` na Task 2. Falta a lista que decide
quais tipos viram um `messages.media_type` não-nulo.

Em `src/providers/whatsapp/types.ts`:

```ts
export const MEDIA_DISCRIMINATOR_TYPES = [
  "image",
  "audio",
  "video",
  "document",
  "location",
  "contact",
  "payment",
] as const;
```

- [ ] **Step 2: Add it to the domain type**

Em `src/shared/types/conversation.ts`, no union `MessageMediaType`, adicionar `| "payment"` e estender o doc-comment existente para citá-lo junto de location/contact como conteúdo estruturado sem `mediaUrl`.

- [ ] **Step 3: Exclude it from binary media paths**

Em `src/features/conversations/utils/mediaDownload.ts`, adicionar `"payment"` ao `Exclude<...>` da linha 7 e ao guard da linha 68:

```ts
  if (
    !type ||
    type === "document" ||
    type === "location" ||
    type === "contact" ||
    type === "payment"
  ) {
```

Em `src/features/media/hooks/useEnsureInboundMedia.ts`, adicionar ao set:

```ts
const NON_ARCHIVABLE_MEDIA_TYPES: ReadonlySet<MessageMediaType> = new Set([
  "location",
  "contact",
  "payment",
]);
```

- [ ] **Step 4: Verify the whole suite and the types**

```bash
bun run test
bunx tsc --noEmit 2>&1 | grep -E "payment|contentFormat|waha/parser" || echo "sem erros nos arquivos tocados"
```
Expected: suíte toda verde; nenhum erro de tipo nos arquivos tocados.

- [ ] **Step 5: Commit**

```bash
bun run scripts/sync-whatsapp-shared.ts
git checkout -- 'supabase/functions/_shared/' ':(exclude)supabase/functions/_shared/whatsapp/types.ts'
git add src/providers/whatsapp/types.ts src/shared/types/conversation.ts src/features/conversations/utils/mediaDownload.ts src/features/media/hooks/useEnsureInboundMedia.ts supabase/functions/_shared/whatsapp/types.ts
git commit -m "feat(conversations): register payment as a structured content type"
```

---

### Task 4: Card de PIX no thread e na Inbox

**Files:**
- Create: `src/features/conversations/components/bubbles/PaymentBubble.tsx`
- Modify: `src/features/conversations/components/bubbles/MessageBubble.tsx`
- Modify: `src/features/conversations/i18n/pt-BR.ts`
- Modify: `src/features/conversations/utils/conversationDisplay.ts`
- Test: `src/features/conversations/utils/conversationDisplay.test.ts`

**Interfaces:**
- Consumes: `decodePayment` (Task 1), `MessageMediaType` com `"payment"` (Task 3), `BubbleChrome`, `formatCNPJ`/`formatCPF` de `@/shared/utils/format`

- [ ] **Step 1: Write the failing preview test**

Adicionar em `src/features/conversations/utils/conversationDisplay.test.ts`, dentro do describe `getMessagePreview — structured shares`:

```ts
  it("shows the PIX recipient in the list preview", () => {
    expect(
      getMessagePreview(msg({ mediaType: "payment", text: "Gallo Base Diesel\nCNPJ:32990725000160" })),
    ).toBe("💳 Gallo Base Diesel");
  });

  it("falls back to the generic PIX label when no recipient came through", () => {
    expect(getMessagePreview(msg({ mediaType: "payment", text: "CNPJ:32990725000160" }))).toBe(
      INBOX_STRINGS.mediaPreview.payment,
    );
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bunx vitest run src/features/conversations/utils/conversationDisplay.test.ts`
Expected: FAIL — retorna o texto cru em vez de `"💳 Gallo Base Diesel"`.

- [ ] **Step 3: Add the strings**

Em `src/features/conversations/i18n/pt-BR.ts`, no objeto `mediaPreview` (junto de `unsupported`):

```ts
    payment: "💳 Chave PIX",
```

E no `STRUCTURED_PREVIEW_ICON` (mesmo arquivo, onde estão `location` e `contact`):

```ts
  payment: "💳",
```

Em `CONVERSATION_STRINGS`, adicionar o bloco de rótulos do card (junto de `location`):

```ts
  payment: {
    label: "Chave PIX",
    copy: "Copiar chave",
    copied: "Chave PIX copiada",
    noKey: "Chave não informada",
  },
```

- [ ] **Step 4: Wire the preview**

Em `src/features/conversations/utils/conversationDisplay.ts`, adicionar `decodePayment` ao import de `contentFormat` e o branch junto dos outros structured (antes do `if (message.mediaType)`):

```ts
  if (message.mediaType === "payment") {
    const { merchant } = decodePayment(message.text);
    return merchant ? `${STRUCTURED_PREVIEW_ICON.payment} ${merchant}` : INBOX_STRINGS.mediaPreview.payment;
  }
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `bunx vitest run src/features/conversations/utils/conversationDisplay.test.ts`
Expected: PASS.

- [ ] **Step 6: Create the bubble**

Criar `src/features/conversations/components/bubbles/PaymentBubble.tsx`:

```tsx
import { toast } from "sonner";
import type { IMessage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { formatCNPJ, formatCPF } from "@/shared/utils/format";
import { decodePayment } from "@/providers/whatsapp/contentFormat";
import { BubbleChrome } from "./bubbleChrome";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

/** Pretty-print only the key types that have a canonical Brazilian mask; every
 *  other type (EMAIL/PHONE/EVP) is already readable as sent. */
function displayKey(key: string, keyType: string | undefined): string {
  if (keyType === "CNPJ") return formatCNPJ(key);
  if (keyType === "CPF") return formatCPF(key);
  return key;
}

/**
 * Bubble for a PIX key shared through WhatsApp's payment button. The payload
 * carries no amount (always zero on these static-key shares), so the card
 * deliberately shows only who receives and the key itself.
 */
export function PaymentBubble({ message, onRetry }: { message: IMessage; onRetry?: () => void }) {
  const { merchant, key, keyType } = decodePayment(message.text);

  async function handleCopy() {
    if (!key) return;
    // The RAW key is what a banking app accepts — never the masked form.
    await navigator.clipboard.writeText(key);
    toast.success(CONVERSATION_STRINGS.payment.copied);
  }

  return (
    <BubbleChrome message={message} onRetry={onRetry}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon icon="mdi:qrcode" size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            {CONVERSATION_STRINGS.payment.label}
          </p>
          <p className="truncate text-sm font-medium text-foreground">
            {merchant || CONVERSATION_STRINGS.payment.label}
          </p>
          {key ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="truncate font-mono text-xs text-muted-foreground">
                {displayKey(key, keyType)}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Icon icon="mdi:content-copy" size={13} />
                {CONVERSATION_STRINGS.payment.copy}
              </button>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              {CONVERSATION_STRINGS.payment.noKey}
            </p>
          )}
        </div>
      </div>
    </BubbleChrome>
  );
}
```

- [ ] **Step 7: Route it**

Em `src/features/conversations/components/bubbles/MessageBubble.tsx`, importar `PaymentBubble` e adicionar o branch junto dos outros structured (logo após o de `contact`, ANTES das heurísticas de marcador textual):

```tsx
  if (message.mediaType === "payment") {
    return <PaymentBubble message={message} onRetry={onRetry} />;
  }
```

- [ ] **Step 8: Verify**

```bash
bun run test
bun run build
git checkout -- src/routeTree.gen.ts
```
Expected: suíte verde, build ✓.

- [ ] **Step 9: Commit**

```bash
git add src/features/conversations/components/bubbles/PaymentBubble.tsx src/features/conversations/components/bubbles/MessageBubble.tsx src/features/conversations/i18n/pt-BR.ts src/features/conversations/utils/conversationDisplay.ts src/features/conversations/utils/conversationDisplay.test.ts
git commit -m "feat(conversations): PIX key card with copy action"
```

---

# PARTE 2 — Reações

### Task 5: Migration da coluna `reactions`

**Files:**
- Create: `supabase/migrations/20260721180000_message_reactions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- WhatsApp reactions attach to an existing message rather than creating a new
-- one, so they live on the reacted row. A 1:1 conversation has at most two
-- reactors, so a two-slot object is enough — no separate table, no join on the
-- hot read path.
--
--   {"customer": {"emoji": "👍", "at": "2026-07-21T13:10:00Z"},
--    "seller":   {"emoji": "❤️", "at": "..."}}
--
-- NULL means "no reaction" (an empty object is never stored).
-- No index: nothing filters by reaction.
--
-- conversation_messages() needs NO change — it is RETURNS SETOF messages with
-- `select m.*`, so the new column flows through automatically.
alter table public.messages add column if not exists reactions jsonb;

comment on column public.messages.reactions is
  'WhatsApp reactions on this message, keyed by side (customer|seller). NULL when none.';

-- PostgREST caches the schema; without this the new column stays invisible to
-- the API until the next reload.
notify pgrst, 'reload schema';
```

- [ ] **Step 2: Verify it parses**

Run: `bunx supabase db lint --project-ref njizaasajkdqptlxddqn 2>/dev/null || echo "lint indisponível — revise o SQL manualmente"`
Expected: sem erro de sintaxe. **NÃO aplicar em produção** — a aplicação é passo de rollout, com OK do dono.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260721180000_message_reactions.sql
git commit -m "feat(db): reactions column on messages"
```

---

### Task 6: Tipos e engines puros da reação

**Files:**
- Modify: `src/shared/types/conversation.ts`
- Create: `src/providers/whatsapp/waha/reaction.ts`
- Test: `src/providers/whatsapp/waha/reaction.test.ts`

**Interfaces:**
- Produces: `IMessageReaction`, `IMessageReactions`, `IMessage.reactions?`, `parseWahaReactionEvent(raw): IWahaReaction`, `applyReaction(current, reaction): IMessageReactions | null`

- [ ] **Step 1: Add the domain types**

Em `src/shared/types/conversation.ts`, antes de `IMessage`:

```ts
/** One person's reaction to a message. */
export interface IMessageReaction {
  emoji: string;
  at: ISO8601;
}

/**
 * Reactions on a message, keyed by side. A 1:1 conversation has at most two
 * reactors, so fixed slots beat a list. `customer` is the other party — a
 * customer OR a lead.
 */
export interface IMessageReactions {
  customer?: IMessageReaction;
  seller?: IMessageReaction;
}
```

E no corpo de `IMessage`:

```ts
  /** Reactions attached to this message. Absent when nobody reacted. */
  reactions?: IMessageReactions;
```

- [ ] **Step 2: Write the failing tests**

Criar `src/providers/whatsapp/waha/reaction.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyReaction, parseWahaReactionEvent } from "./reaction";

/** Shape from WAHA's documented message.reaction event. */
const payload = {
  id: "false_5511@c.us_AAA",
  fromMe: false,
  timestamp: 1721567423,
  reaction: { text: "🙏", messageId: "true_5511@c.us_BBB" },
};

describe("parseWahaReactionEvent", () => {
  it("reads the target message, emoji and side", () => {
    const parsed = parseWahaReactionEvent(payload);
    expect(parsed.targetProviderMessageId).toBe("true_5511@c.us_BBB");
    expect(parsed.emoji).toBe("🙏");
    expect(parsed.fromMe).toBe(false);
    expect(parsed.timestamp).toBe(new Date(1721567423 * 1000).toISOString());
  });

  it("treats an empty emoji as a removal rather than rejecting it", () => {
    const parsed = parseWahaReactionEvent({ ...payload, reaction: { text: "", messageId: "x" } });
    expect(parsed.emoji).toBe("");
  });

  it("throws when there is no target message id", () => {
    expect(() => parseWahaReactionEvent({ ...payload, reaction: { text: "👍" } })).toThrow(
      /messageId/,
    );
  });

  it("throws when the envelope carries no reaction at all", () => {
    expect(() => parseWahaReactionEvent({ id: "x" })).toThrow(/reaction/);
  });
});

describe("applyReaction", () => {
  const at = "2026-07-21T13:10:00.000Z";
  const customerReaction = {
    targetProviderMessageId: "m1",
    emoji: "👍",
    fromMe: false,
    timestamp: at,
  };

  it("adds a customer reaction to an empty state", () => {
    expect(applyReaction(null, customerReaction)).toEqual({ customer: { emoji: "👍", at } });
  });

  it("files a fromMe reaction under the seller slot", () => {
    expect(applyReaction(null, { ...customerReaction, fromMe: true })).toEqual({
      seller: { emoji: "👍", at },
    });
  });

  it("replaces the same side's previous reaction (one per person)", () => {
    const current = { customer: { emoji: "👍", at: "2026-07-20T10:00:00.000Z" } };
    expect(applyReaction(current, { ...customerReaction, emoji: "❤️" })).toEqual({
      customer: { emoji: "❤️", at },
    });
  });

  it("keeps both sides independent", () => {
    const current = { seller: { emoji: "❤️", at } };
    expect(applyReaction(current, customerReaction)).toEqual({
      seller: { emoji: "❤️", at },
      customer: { emoji: "👍", at },
    });
  });

  it("removes only the reacting side when the emoji is empty", () => {
    const current = { customer: { emoji: "👍", at }, seller: { emoji: "❤️", at } };
    expect(applyReaction(current, { ...customerReaction, emoji: "" })).toEqual({
      seller: { emoji: "❤️", at },
    });
  });

  it("collapses to null when the last reaction is removed", () => {
    const current = { customer: { emoji: "👍", at } };
    expect(applyReaction(current, { ...customerReaction, emoji: "" })).toBeNull();
  });

  it("stays null when removing from an empty state", () => {
    expect(applyReaction(null, { ...customerReaction, emoji: "" })).toBeNull();
  });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `bunx vitest run src/providers/whatsapp/waha/reaction.test.ts`
Expected: FAIL — `Cannot find module './reaction'`.

- [ ] **Step 4: Implement**

Criar `src/providers/whatsapp/waha/reaction.ts`:

```ts
/**
 * WAHA `message.reaction` event. A reaction attaches to an ALREADY EXISTING
 * message instead of creating a new one, so it never flows through
 * parseWahaMessageEvent — it patches the reacted row.
 *
 * Runtime-agnostic (Web APIs + relative imports only) so the mirror into the
 * Edge Functions tree stays byte-identical.
 */

export interface IWahaReaction {
  /** `provider_message_id` of the message being reacted to. */
  targetProviderMessageId: string;
  /** The emoji, or "" when the reaction was REMOVED. */
  emoji: string;
  /** true when the shop reacted, false when the other party did. */
  fromMe: boolean;
  timestamp: string;
}

/**
 * One reactor's state. Structurally identical to IMessageReaction /
 * IMessageReactions in `@/shared/types` — duplicated on purpose: this module is
 * mirrored into the Edge Functions tree and must not import from `@/`, which
 * would break the runtime-agnostic rule. The two must stay in sync.
 */
export interface IReactionSlot {
  emoji: string;
  at: string;
}
export interface IMessageReactionsState {
  customer?: IReactionSlot;
  seller?: IReactionSlot;
}

interface IWahaReactionPayload {
  fromMe?: boolean;
  timestamp?: number;
  reaction?: { text?: string; messageId?: string };
}

function tsToIso(value: number | undefined): string {
  return typeof value === "number" && value > 0
    ? new Date(value * 1000).toISOString()
    : new Date().toISOString();
}

/**
 * Throws on an unusable envelope — same contract as parseWahaMessageEvent, so
 * the webhook records it as `outcome: "ignored"` with the reason instead of
 * writing anything.
 */
export function parseWahaReactionEvent(rawPayload: unknown): IWahaReaction {
  const payload = rawPayload as IWahaReactionPayload | null;
  if (!payload?.reaction) {
    throw new Error("WahaProvider: evento de reaction sem 'reaction' — ignorar");
  }
  const targetProviderMessageId = payload.reaction.messageId;
  if (!targetProviderMessageId) {
    throw new Error("WahaProvider: reaction sem 'messageId' alvo — ignorar");
  }
  return {
    targetProviderMessageId,
    // An empty text is meaningful: it means the reaction was taken back.
    emoji: payload.reaction.text ?? "",
    fromMe: payload.fromMe === true,
    timestamp: tsToIso(payload.timestamp),
  };
}

/**
 * Next state of a message's `reactions` column. WhatsApp allows one reaction
 * per person per message, so a new one REPLACES that side's previous entry.
 * Returns null when no side is left, so "no reaction" has a single
 * representation in the column.
 */
export function applyReaction(
  current: IMessageReactionsState | null,
  reaction: IWahaReaction,
): IMessageReactionsState | null {
  const side = reaction.fromMe ? "seller" : "customer";
  const next: IMessageReactionsState = { ...(current ?? {}) };
  if (reaction.emoji) {
    next[side] = { emoji: reaction.emoji, at: reaction.timestamp };
  } else {
    delete next[side];
  }
  return next.customer || next.seller ? next : null;
}
```

- [ ] **Step 5: Run them and watch them pass**

Run: `bunx vitest run src/providers/whatsapp/waha/reaction.test.ts`
Expected: PASS, todos.

- [ ] **Step 6: Commit**

```bash
bun run scripts/sync-whatsapp-shared.ts
git checkout -- 'supabase/functions/_shared/' ':(exclude)supabase/functions/_shared/whatsapp/waha/reaction.ts'
git add src/shared/types/conversation.ts src/providers/whatsapp/waha/reaction.ts src/providers/whatsapp/waha/reaction.test.ts supabase/functions/_shared/whatsapp/waha/reaction.ts
git commit -m "feat(waha): pure engines for WhatsApp reaction events"
```

---

### Task 7: Assinatura do evento e re-inscrição das sessões

**Files:**
- Modify: `src/providers/whatsapp/waha/constants.ts`
- Test: `src/providers/whatsapp/waha/constants.test.ts` (criar se não existir)
- Create: `scripts/waha-resubscribe-reactions.ts`

- [ ] **Step 1: Write the failing test**

Criar (ou adicionar a) `src/providers/whatsapp/waha/constants.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { WAHA_DEFAULT_EVENTS } from "./constants";

describe("WAHA_DEFAULT_EVENTS", () => {
  it("subscribes message.reaction so customer reactions are not invisible", () => {
    expect(WAHA_DEFAULT_EVENTS).toContain("message.reaction");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bunx vitest run src/providers/whatsapp/waha/constants.test.ts`
Expected: FAIL — o array não contém `message.reaction`.

- [ ] **Step 3: Subscribe the event**

Em `src/providers/whatsapp/waha/constants.ts`, adicionar ao array e estender o doc-comment:

```ts
export const WAHA_DEFAULT_EVENTS = [
  "message",
  "message.any",
  "session.status",
  "message.ack",
  // Reactions stopped travelling in `message`/`message.any` — WAHA delivers
  // them ONLY here. Without this a customer replying with a 👍 is invisible and
  // the seller concludes nobody answered. Sessions paired BEFORE this change
  // need scripts/waha-resubscribe-reactions.ts to pick it up.
  "message.reaction",
] as const;
```

- [ ] **Step 4: Run it and watch it pass**

Run: `bunx vitest run src/providers/whatsapp/waha/constants.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the re-subscription script**

Criar `scripts/waha-resubscribe-reactions.ts` copiando `scripts/waha-resubscribe-message-ack.ts` **na íntegra** e alterando apenas o doc-comment do topo (trocar `message.ack` por `message.reaction` e o nome do arquivo no bloco `Usage:`). A mecânica é idêntica: relê `provider_config.waha` de cada conta e chama `updateWahaSessionConfig`, que rebaixa a lista de eventos a partir de `WAHA_DEFAULT_EVENTS`.

Leia o arquivo original antes de copiar:
`cat scripts/waha-resubscribe-message-ack.ts`

- [ ] **Step 6: Commit**

```bash
bun run scripts/sync-whatsapp-shared.ts
git checkout -- 'supabase/functions/_shared/' ':(exclude)supabase/functions/_shared/whatsapp/waha/constants.ts'
git add src/providers/whatsapp/waha/constants.ts src/providers/whatsapp/waha/constants.test.ts scripts/waha-resubscribe-reactions.ts supabase/functions/_shared/whatsapp/waha/constants.ts
git commit -m "feat(waha): subscribe message.reaction and add re-subscription script"
```

---

### Task 8: Tratar o evento no webhook

**Files:**
- Modify: `supabase/functions/waha-webhook/index.ts`

**Interfaces:**
- Consumes: `parseWahaReactionEvent`, `applyReaction` (Task 6)

- [ ] **Step 1: Import the engines**

No bloco de imports de `supabase/functions/waha-webhook/index.ts`, junto do import do parser:

```ts
import { applyReaction, parseWahaReactionEvent } from "../_shared/whatsapp/waha/reaction.ts";
```

- [ ] **Step 2: Add the event branch**

Inserir logo APÓS o branch de `message.ack` (que termina por volta da linha 668) e ANTES do guard `if (envelope.event !== "message" && envelope.event !== "message.any")`:

```ts
    if (envelope.event === "message.reaction") {
      let reaction;
      try {
        reaction = parseWahaReactionEvent(envelope.payload);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        await markProcessed();
        return respond(json({ ok: true, ignored: "unparseable-reaction" }, 200), {
          outcome: "ignored",
          errorMessage: detail,
          requestPayload: envelope,
        });
      }

      // The reacted message must already exist here. A reaction to a message
      // older than the import is expected and benign — record and move on.
      const { data: target } = await admin
        .from("messages")
        .select("id, conversation_id, reactions")
        .eq("provider_message_id", reaction.targetProviderMessageId)
        .maybeSingle();

      if (!target) {
        await markProcessed();
        return respond(json({ ok: true, ignored: "reaction-target-missing" }, 200), {
          outcome: "ignored",
          errorMessage: `alvo ${reaction.targetProviderMessageId} não encontrado`,
          requestPayload: envelope,
        });
      }

      const next = applyReaction(
        (target.reactions as Parameters<typeof applyReaction>[0]) ?? null,
        reaction,
      );
      await admin.from("messages").update({ reactions: next }).eq("id", target.id);

      // A customer reaction IS an interaction: it bumps the conversation and
      // marks it unread, so a 👍 stops reading as "no answer". The shop's own
      // reaction is recorded but must not touch the queue.
      if (!reaction.fromMe && reaction.emoji) {
        const { data: conversation } = await admin
          .from("conversations")
          .select("unread_count")
          .eq("id", target.conversation_id as string)
          .maybeSingle();
        await admin
          .from("conversations")
          .update({
            last_message_at: reaction.timestamp,
            unread_count: ((conversation?.unread_count as number | null) ?? 0) + 1,
            awaiting_reply_since: null,
          })
          .eq("id", target.conversation_id as string);
      }

      await markProcessed();
      return respond(json({ ok: true, reaction: "applied" }, 200), {
        outcome: "processed",
        requestPayload: envelope,
      });
    }
```

- [ ] **Step 3: Verify the whole suite still passes**

```bash
bun run test
```
Expected: verde. (A Edge Function não tem teste unitário — a lógica testável vive nos engines da Task 6.)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/waha-webhook/index.ts
git commit -m "feat(waha): persist WhatsApp reactions and count them as customer interaction"
```

---

### Task 9: Ler e exibir a reação

**Files:**
- Modify: `src/providers/data/impl/supabase/messages.ts`
- Modify: `src/features/conversations/components/bubbles/bubbleChrome.tsx`
- Modify: `src/features/conversations/i18n/pt-BR.ts`

**Interfaces:**
- Consumes: `IMessageReactions` (Task 6), coluna `reactions` (Task 5)

⚠️ Este task toca o provider de mensagens. Altere **somente** `COLUMNS`, a interface `MessageRow` e `rowToMessage`. Não encoste em `resolveMediaUrl`/`resolveMediaUrls`, nem em query keys.

- [ ] **Step 1: Read the column**

Em `src/providers/data/impl/supabase/messages.ts`:

1. Na interface `MessageRow`, adicionar:
```ts
  reactions: IMessageReactions | null;
```
(importar `IMessageReactions` de `@/shared/types`)

2. Na constante `COLUMNS`, acrescentar `reactions` à lista.

3. Em `rowToMessage`, adicionar o campo:
```ts
    reactions: row.reactions ?? undefined,
```

- [ ] **Step 2: Add the string**

Em `src/features/conversations/i18n/pt-BR.ts`, em `CONVERSATION_STRINGS`:

```ts
  reactions: {
    fromCustomer: "Reação do cliente",
    fromSeller: "Reação da loja",
  },
```

- [ ] **Step 3: Render the chip**

Em `src/features/conversations/components/bubbles/bubbleChrome.tsx`, inserir entre o fechamento da `<div>` do balão e `{footer}`:

```tsx
      {(message.reactions?.customer || message.reactions?.seller) && (
        <div className="-mt-1 flex items-center gap-1">
          {message.reactions.customer && (
            <span
              title={CONVERSATION_STRINGS.reactions.fromCustomer}
              className="select-none rounded-full border border-border bg-card px-1.5 py-0.5 text-xs shadow-sm"
            >
              {message.reactions.customer.emoji}
            </span>
          )}
          {message.reactions.seller && (
            <span
              title={CONVERSATION_STRINGS.reactions.fromSeller}
              className="select-none rounded-full border border-border bg-card px-1.5 py-0.5 text-xs shadow-sm"
            >
              {message.reactions.seller.emoji}
            </span>
          )}
        </div>
      )}
```

O container pai já aplica `items-end`/`items-start`, então o chip herda o lado do balão automaticamente.

- [ ] **Step 4: Verify**

```bash
bun run test
bun run build
git checkout -- src/routeTree.gen.ts
bunx tsc --noEmit 2>&1 | grep -E "bubbleChrome|impl/supabase/messages" || echo "sem erros nos arquivos tocados"
```
Expected: suíte verde, build ✓, sem erros de tipo nos arquivos tocados.

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/impl/supabase/messages.ts src/features/conversations/components/bubbles/bubbleChrome.tsx src/features/conversations/i18n/pt-BR.ts
git commit -m "feat(conversations): show reactions attached to the reacted bubble"
```

---

### Task 10: Documentação e fechamento

**Files:**
- Create: `docs/dev/waha-payment-and-reactions.md`

- [ ] **Step 1: Write the doc**

Documentar, com o mesmo tom dos docs de `docs/dev/`:
- O que o payload do PIX realmente carrega (e por que não há valor).
- O formato canônico de `encodePayment` e por que a chave fica na última linha.
- O contrato do evento `message.reaction`, incluindo `text: ""` = remoção.
- O modelo de dois slots do jsonb e por que não é tabela.
- **Por que não foi preciso tocar no realtime congelado** (o `syncLatest` no touch da conversa).
- A ordem de rollout completa (migration → deploy → re-inscrição → smoke), com o aviso de que o workflow "Edge Functions deploy" do GitHub é **no-op** e o deploy é manual.

- [ ] **Step 2: Full verification**

```bash
bun run test
bun run build
git checkout -- src/routeTree.gen.ts
git status --short
```
Expected: suíte verde, build ✓, working tree só com o doc novo.

- [ ] **Step 3: Commit**

```bash
git add docs/dev/waha-payment-and-reactions.md
git commit -m "docs: PIX key card and WhatsApp reactions"
```

---

## Rollout (fora do plano de código — exige OK do dono)

1. Aplicar a migration `20260721180000_message_reactions.sql` em produção.
2. Deploy manual: `npx supabase functions deploy waha-webhook --project-ref njizaasajkdqptlxddqn`
   (o workflow do GitHub é no-op — secrets ausentes).
3. Rodar `scripts/waha-resubscribe-reactions.ts` — sem isso as instâncias já pareadas continuam sem enviar reações.
4. Smoke: reagir a uma mensagem pelo celular e conferir o emoji no thread; enviar uma chave PIX e conferir o card.
