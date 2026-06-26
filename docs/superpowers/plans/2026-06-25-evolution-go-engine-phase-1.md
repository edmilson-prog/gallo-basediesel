# Evolution Go Engine — Fase 0+1 (Spike + Engine Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o engine WhatsApp `evolution-go` (whatsmeow) como camada pura, runtime-agnostic, testável por unidade — sem ainda tocar nas Edge Functions (Fase 2) nem na UI (Fase 5).

**Architecture:** Nova pasta `src/providers/whatsapp/evolution-go/` implementando a interface única `IWhatsAppProvider` + funções de gestão de instância (fora da interface). Tudo isolado dos consumidores; o `build.ts`/`factory.ts` passam a reconhecer o engine. Espelhado em `_shared/` pelo sync script. Spec: `docs/superpowers/specs/2026-06-25-evolution-go-engine-design.md`.

**Tech Stack:** TypeScript (strict), Vitest, Web Crypto/`fetch` (sem libs externas), Supabase (migration via MCP). Padrões reusados: `engineFetch` (`http.ts`), `WhatsAppProviderError` (`errors.ts`), `timingSafeEqualStrings` (`crypto.ts`), `toE164`/`toWireNumber`/`assertE164` (`phone.ts`).

## Global Constraints

- **Runtime-agnostic:** todo arquivo em `src/providers/whatsapp/**` usa SOMENTE Web APIs (`fetch`, `crypto`, `atob`/`btoa`, `TextEncoder`) e **imports relativos** — nunca `@/...`. É espelhado byte-a-byte em `supabase/functions/_shared/whatsapp/` por `bun run scripts/sync-whatsapp-shared.ts`; **nunca editar `_shared/` à mão**.
- **Comentários em inglês**; qualquer string voltada ao usuário em **português do Brasil com acentos corretos**.
- **TypeScript strict**, sem `any`; interfaces de domínio com prefixo `I`.
- **TDD obrigatório** nos módulos puros; testes Vitest co-localizados `*.test.ts`.
- **Conventional Commits em inglês**, atômicos, um por tarefa.
- **`provider` = `evolution-go`** como valor de 1ª classe (`WhatsAppProviderEngine`, `whatsapp_accounts.provider`, `messages.provider`).
- **Segredos no Vault** (`{credentials_ref}_API_KEY`, `{credentials_ref}_INSTANCE_TOKEN`); não-segredos em `provider_config` (`baseUrl`, `instanceId`, `name`, `subscribe`).
- **Webhook da Go autentica por `instanceToken`** (sem HMAC) — comparação constant-time.
- **Capabilities honestas:** sem templates HSM, sem interativas, mídia por URL (sem upload separado).
- **Migration** versionada em `supabase/migrations/` **e** aplicada manualmente via MCP **com confirmação explícita do dono** (o workflow de DB deploy está em no-op).
- **Gate prático:** `bun run build` + `bun run test` verdes; checagem de tipos por delta com `bunx tsc --noEmit` no código novo.

## File Structure

```
src/providers/whatsapp/
├── types.ts                      # MODIFY: union engine + integrationName + IEvolutionGoAccountConfig
├── factory.ts                    # MODIFY: getEngineCapabilities + getWhatsAppProvider reconhecem evolution-go
├── build.ts                      # MODIFY: case "evolution-go" → new EvolutionGoProvider
└── evolution-go/                 # NEW
    ├── constants.ts              # capabilities, secret suffixes, target version, default subscribe events
    ├── errors.ts                 # mapEvolutionGoError + errors.test.ts
    ├── media.ts                  # IGoMediaRef + encode/decode + media.test.ts
    ├── parser.ts                 # parseEvolutionGoInbound + parser.test.ts
    ├── client.ts                 # goRequest (apikey global + instanceId header)
    ├── instance.ts               # create/connect/qr/status/logout/delete/restart + instance.test.ts
    └── EvolutionGoProvider.ts    # IWhatsAppProvider impl + EvolutionGoProvider.test.ts

supabase/migrations/
└── 20260625120000_whatsapp_evolution_go_provider.sql   # NEW: check constraints aditivas

docs/dev/
└── evolution-go-api-contracts.md # NEW (Task 1): contratos extraídos da OpenAPI
```

---

### Task 1: Spike — contratos da API Evolution Go

**Files:**
- Create: `docs/dev/evolution-go-api-contracts.md`

**Interfaces:**
- Consumes: nada (descoberta).
- Produces: documento de referência que as Tasks 4–9 citam para fixar request/response e o formato dos eventos de webhook.

- [ ] **Step 1: Coletar os schemas da OpenAPI / páginas `.md`**

Buscar (WebFetch) e registrar, para cada endpoint, método + path + headers + corpo de request/response:
- `POST /instance/create` — `{name, token?, proxy?}` → `{data:{id,token,connected},message}`
- `POST /instance/connect` — `{immediate, webhookUrl, subscribe[]}` → `{data:{eventString,jid,webhookUrl},message}`
- `GET /instance/qr` → `{data:{Qrcode,Code},message}`
- `GET /instance/status` → `{data:{Connected,LoggedIn,Name},message}`
- `POST /send/text` — `{number,text,delay?,id?,quoted?}` → `{success,messageId,data:{Info:{ID}}}`
- `POST /send/media` — `{number,url,type,filename?,caption?,delay?,id?,quoted?}` → `{success,messageId}`
- `POST /message/downloadimage` — `{url,directPath,mimetype,fileLength,fileSHA256[],fileEncSHA256[],mediaKey[]}` → `{success,image:base64}`
- Endpoints de paridade (histórico, avatar, contatos, check de número) — registrar quais existem na Go.
- Eventos de webhook whatsmeow: `Message` (Info.{Chat,Sender,IsFromMe,Type,PushName,ID,Timestamp} + Message.{conversation,imageMessage,audioMessage,videoMessage,documentMessage}), `Receipt` (state/Type + data.MessageIDs), `Connection`.

- [ ] **Step 2: Registrar as INCERTEZAS a validar com o servidor real**

No doc, criar seção "A validar contra https://evogo.ailainteligente.com.br (smoke do dono)":
- Esquema de auth exato (apenas `apikey` global + header `instanceId`?).
- Formato dos campos de mídia no webhook (`MediaKey`/`FileEncSHA256` como base64 string vs array de ints) e como mapeá-los ao corpo de `/message/downloadimage`.
- Endpoint(s) de download para áudio/vídeo/documento (o doc só mostra `downloadimage`).
- Envio de áudio (`/send/media` com `type:"audio"` vs endpoint próprio).
- Formato exato de `data.Info.Timestamp` (ISO string vs unix).

- [ ] **Step 3: Commit**

```bash
git add docs/dev/evolution-go-api-contracts.md
git commit -m "docs(whatsapp): evolution-go API contracts spike"
```

---

### Task 2: Tipos e union do engine

**Files:**
- Modify: `src/providers/whatsapp/types.ts`

**Interfaces:**
- Consumes: tipos existentes em `types.ts`.
- Produces:
  - `WhatsAppProviderEngine` agora inclui `"evolution-go"`.
  - `IIntegrationLogEntry.integrationName` agora inclui `"whatsapp_evolution_go"`.
  - `IEvolutionGoAccountConfig { accountId: string; baseUrl: string; instanceId: string; credentialsRef: string }`.

- [ ] **Step 1: Estender o union do engine**

Em `types.ts`, trocar:
```ts
export type WhatsAppProviderEngine = "meta" | "evolution" | "mock";
```
por:
```ts
export type WhatsAppProviderEngine = "meta" | "evolution" | "evolution-go" | "mock";
```

- [ ] **Step 2: Estender o nome de integração para logs**

Em `IIntegrationLogEntry`, trocar:
```ts
  integrationName: "whatsapp_meta" | "whatsapp_evolution";
```
por:
```ts
  integrationName: "whatsapp_meta" | "whatsapp_evolution" | "whatsapp_evolution_go";
```

- [ ] **Step 3: Adicionar o config da conta Go**

Ao final da seção "Engine construction", após `IEvolutionAccountConfig`, adicionar:
```ts
/**
 * Non-secret Evolution Go account config (`whatsapp_accounts.provider_config`).
 * Unlike v2 (which keys by instance NAME in the path), Go identifies the
 * instance by `instanceId` (the uuid returned by `POST /instance/create`),
 * passed as the `instanceId` header. The global server key and the per-instance
 * token are secrets resolved from the Vault via `credentialsRef`.
 */
export interface IEvolutionGoAccountConfig {
  accountId: string;
  /** Base URL of the Evolution Go server (e.g. https://evogo.ailainteligente.com.br). */
  baseUrl: string;
  /** Instance uuid returned by /instance/create (provider_config.instanceId). */
  instanceId: string;
  /** Prefix for `<ref>_API_KEY` (global) and `<ref>_INSTANCE_TOKEN`. */
  credentialsRef: string;
}
```

- [ ] **Step 4: Verificar compilação por tipos**

Run: `bunx tsc --noEmit 2>&1 | grep -i "evolution-go\|integrationName\|WhatsAppProviderEngine" || echo "no new type errors"`
Expected: nenhum erro novo introduzido por estas edições (o baseline pré-existente é ignorado).

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/types.ts
git commit -m "feat(whatsapp): add evolution-go to engine union and config types"
```

---

### Task 3: Constantes e capabilities

**Files:**
- Create: `src/providers/whatsapp/evolution-go/constants.ts`

**Interfaces:**
- Consumes: `IProviderCapabilities` de `../types`.
- Produces:
  - `EVOLUTION_GO_CAPABILITIES: IProviderCapabilities`
  - `EVOLUTION_GO_SECRET_SUFFIXES = { apiKey: "_API_KEY", instanceToken: "_INSTANCE_TOKEN" } as const`
  - `EVOLUTION_GO_INTEGRATION_NAME = "whatsapp_evolution_go" as const`
  - `EVOLUTION_GO_DEFAULT_SUBSCRIBE: string[]`
  - `EVOLUTION_GO_TARGET = "evolution-go (whatsmeow)"`

- [ ] **Step 1: Escrever o arquivo**

```ts
/**
 * Evolution Go constants. Self-hosted whatsmeow server (https://evogo...).
 * Honest capabilities mirror Evolution v2: no HSM templates, no interactive
 * messages, media sent by URL (no separate upload step).
 */

import type { IProviderCapabilities } from "../types";

export const EVOLUTION_GO_TARGET = "evolution-go (whatsmeow)";

export const EVOLUTION_GO_INTEGRATION_NAME = "whatsapp_evolution_go" as const;

/**
 * Secret-name suffixes appended to `whatsapp_accounts.credentials_ref`.
 * `_API_KEY` = the server-wide global apikey (shared by instances on the same
 * server); `_INSTANCE_TOKEN` = the per-instance token (also the webhook auth).
 */
export const EVOLUTION_GO_SECRET_SUFFIXES = {
  apiKey: "_API_KEY",
  instanceToken: "_INSTANCE_TOKEN",
} as const;

/** Webhook event categories we subscribe by default (Go uses category names). */
export const EVOLUTION_GO_DEFAULT_SUBSCRIBE: string[] = [
  "MESSAGE",
  "SEND_MESSAGE",
  "READ_RECEIPT",
  "CONNECTION",
];

export const EVOLUTION_GO_CAPABILITIES: IProviderCapabilities = {
  supportsTemplates: false,
  supportsInteractive: false,
  supportsMediaUpload: false,
  supportsStatusReadReceipts: true,
  supportsCustomWebhook: true,
  maxMessageLength: 65_536,
  maxMediaSizeBytes: 64 * 1024 * 1024,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/providers/whatsapp/evolution-go/constants.ts
git commit -m "feat(whatsapp): evolution-go constants and capabilities"
```

---

### Task 4: Mapeamento de erros

**Files:**
- Create: `src/providers/whatsapp/evolution-go/errors.ts`
- Test: `src/providers/whatsapp/evolution-go/errors.test.ts`

**Interfaces:**
- Consumes: `WhatsAppProviderError` de `../errors`.
- Produces: `mapEvolutionGoError(httpStatus: number, body: unknown, endpoint: string): WhatsAppProviderError`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { mapEvolutionGoError } from "./errors";

describe("mapEvolutionGoError", () => {
  it.each([
    [401, { message: "Invalid or missing API key" }, "UNAUTHORIZED"],
    [403, { message: "forbidden" }, "UNAUTHORIZED"],
    [404, { message: "Instance not found" }, "NOT_FOUND"],
    [429, { message: "rate limit" }, "RATE_LIMITED"],
    [500, { message: "boom" }, "INTEGRATION_ERROR"],
  ])("HTTP %i → %s", (status, body, expected) => {
    expect(mapEvolutionGoError(status, body, "/send/text").code).toBe(expected);
  });

  it("maps a not-logged-in/closed session to PROVIDER_DISCONNECTED", () => {
    const err = mapEvolutionGoError(400, { message: "instance not connected" }, "/send/text");
    expect(err.code).toBe("PROVIDER_DISCONNECTED");
    expect(err.httpStatus).toBe(503);
  });

  it("never leaks the body verbatim into details without the endpoint", () => {
    const err = mapEvolutionGoError(500, { message: "x" }, "/send/text");
    expect(err.details).toMatchObject({ endpoint: "/send/text" });
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bun run test src/providers/whatsapp/evolution-go/errors.test.ts`
Expected: FAIL — `mapEvolutionGoError` não existe.

- [ ] **Step 3: Implementar**

```ts
/**
 * Evolution Go error mapping. Go answers `{ message }` / `{ error }` with
 * HTTP-status semantics. The disconnected-session case feeds PRD-120 failover.
 */

import { WhatsAppProviderError } from "../errors";

function extractMessage(body: unknown): string {
  const c = body as { message?: string | string[]; error?: string } | null;
  const raw = c?.message ?? c?.error ?? "";
  return Array.isArray(raw) ? raw.join("; ") : String(raw);
}

const DISCONNECTED_PATTERN = /not connected|not logged in|connection closed|session|disconnected/i;

export function mapEvolutionGoError(
  httpStatus: number,
  body: unknown,
  endpoint: string,
): WhatsAppProviderError {
  const message = extractMessage(body);
  const details: Record<string, unknown> = { endpoint, goMessage: message };

  if (httpStatus === 401 || httpStatus === 403) {
    return new WhatsAppProviderError(
      "UNAUTHORIZED",
      401,
      "Chave de API da Evolution Go inválida ou ausente",
      details,
    );
  }
  if (httpStatus === 429) {
    return new WhatsAppProviderError(
      "RATE_LIMITED",
      429,
      "Limite de requisições da Evolution Go atingido — tente novamente em instantes",
      details,
    );
  }
  if (httpStatus === 404) {
    return new WhatsAppProviderError(
      "NOT_FOUND",
      404,
      "Instância Evolution Go não encontrada — verifique o instanceId",
      details,
    );
  }
  if (DISCONNECTED_PATTERN.test(message)) {
    return new WhatsAppProviderError(
      "PROVIDER_DISCONNECTED",
      503,
      "WhatsApp desconectado, reconectar via QR Code",
      details,
    );
  }
  return new WhatsAppProviderError(
    "INTEGRATION_ERROR",
    502,
    `Erro Evolution Go não mapeado (HTTP ${httpStatus}): ${message || "sem corpo de erro"}`,
    details,
  );
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `bun run test src/providers/whatsapp/evolution-go/errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/evolution-go/errors.ts src/providers/whatsapp/evolution-go/errors.test.ts
git commit -m "feat(whatsapp): evolution-go error mapping"
```

---

### Task 5: Referência de mídia (encode/decode)

**Files:**
- Create: `src/providers/whatsapp/evolution-go/media.ts`
- Test: `src/providers/whatsapp/evolution-go/media.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `IGoMediaRef { url?: string; directPath?: string; mediaKey?: string; fileEncSHA256?: string; fileSHA256?: string; fileLength?: number; mimetype?: string }`
  - `encodeGoMediaRef(ref: IGoMediaRef): string` (JSON)
  - `decodeGoMediaRef(raw: string): IGoMediaRef` (lança `WhatsAppProviderError` "VALIDATION_ERROR" se inválido)

> Rationale: a Go baixa mídia por metadados (`/message/downloadimage`), não por message-id. Como `IWhatsAppProvider.downloadInboundMedia(mediaId: string)` recebe uma string, o parser serializa os metadados whatsmeow nesse campo e o provider os decodifica — mantendo a interface intacta.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { encodeGoMediaRef, decodeGoMediaRef } from "./media";

describe("go media ref", () => {
  it("round-trips a media ref through encode/decode", () => {
    const ref = { url: "https://m/x.enc", directPath: "/v/t", mediaKey: "AAAA", mimetype: "image/jpeg", fileLength: 123 };
    expect(decodeGoMediaRef(encodeGoMediaRef(ref))).toEqual(ref);
  });

  it("decode throws VALIDATION_ERROR on non-JSON", () => {
    expect(() => decodeGoMediaRef("not-json")).toThrowError(/mídia/i);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bun run test src/providers/whatsapp/evolution-go/media.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
/**
 * Inbound media reference for Evolution Go. whatsmeow media nodes carry the
 * download metadata (url/directPath/mediaKey/...) instead of a downloadable id.
 * We serialize them into the IWhatsAppProvider `mediaId` string so the contract
 * stays unchanged; the provider decodes it to build `/message/downloadimage`.
 */

import { WhatsAppProviderError } from "../errors";

export interface IGoMediaRef {
  url?: string;
  directPath?: string;
  /** base64 string as delivered by the webhook (converted to ints at download). */
  mediaKey?: string;
  fileEncSHA256?: string;
  fileSHA256?: string;
  fileLength?: number;
  mimetype?: string;
}

export function encodeGoMediaRef(ref: IGoMediaRef): string {
  return JSON.stringify(ref);
}

export function decodeGoMediaRef(raw: string): IGoMediaRef {
  try {
    const parsed = JSON.parse(raw) as IGoMediaRef;
    if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
    return parsed;
  } catch {
    throw new WhatsAppProviderError(
      "VALIDATION_ERROR",
      422,
      "Referência de mídia da Evolution Go inválida",
    );
  }
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `bun run test src/providers/whatsapp/evolution-go/media.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/evolution-go/media.ts src/providers/whatsapp/evolution-go/media.test.ts
git commit -m "feat(whatsapp): evolution-go inbound media reference codec"
```

---

### Task 6: Parser de webhook (whatsmeow)

**Files:**
- Create: `src/providers/whatsapp/evolution-go/parser.ts`
- Test: `src/providers/whatsapp/evolution-go/parser.test.ts`

**Interfaces:**
- Consumes: `toE164` (`../phone`), `encodeGoMediaRef`/`IGoMediaRef` (`./media`), tipos `IInboundMessage`/`IInboundStatus`/`IOutboundEcho`/`InboundContentType` (`../types`).
- Produces: `parseEvolutionGoInbound(rawPayload: unknown, accountId: string): IInboundMessage | IInboundStatus | IOutboundEcho`. Lança em payloads não-mensagem (Connection, grupos/@lid, irreconhecível) — o webhook core trata Connection separadamente na Fase 2.

- [ ] **Step 1: Escrever os testes que falham**

```ts
import { describe, expect, it } from "vitest";
import { parseEvolutionGoInbound } from "./parser";
import { decodeGoMediaRef } from "./media";

function messageEvent(message: unknown, info: Record<string, unknown> = {}) {
  return {
    event: "Message",
    instanceId: "inst-uuid-1",
    instanceToken: "tok-1",
    data: {
      Info: {
        Chat: "5555988887777@s.whatsapp.net",
        Sender: "5555988887777@s.whatsapp.net",
        IsFromMe: false,
        Type: "text",
        PushName: "Cliente Teste",
        ID: "GOMSG1",
        Timestamp: "2026-06-25T10:00:00Z",
        ...info,
      },
      Message: message,
    },
  };
}

describe("parseEvolutionGoInbound", () => {
  it("normalizes conversation text", () => {
    const parsed = parseEvolutionGoInbound(messageEvent({ conversation: "preciso de um filtro" }), "acc-go-1");
    expect(parsed).toMatchObject({
      type: "message",
      providerMessageId: "GOMSG1",
      fromPhone: "+5555988887777",
      accountId: "acc-go-1",
      contentType: "text",
      text: "preciso de um filtro",
      senderName: "Cliente Teste",
    });
  });

  it("normalizes extendedTextMessage text", () => {
    const parsed = parseEvolutionGoInbound(
      messageEvent({ extendedTextMessage: { text: "olá com link" } }),
      "acc",
    );
    expect(parsed).toMatchObject({ contentType: "text", text: "olá com link" });
  });

  it("normalizes image with caption — mediaId carries the download metadata", () => {
    const parsed = parseEvolutionGoInbound(
      messageEvent(
        { imageMessage: { caption: "foto da peça", mimetype: "image/jpeg", url: "https://m/x.enc", directPath: "/v/t", mediaKey: "AAAA", fileLength: 99 } },
        { Type: "image" },
      ),
      "acc",
    ) as { type: string; contentType: string; mediaId: string; mediaCaption?: string };
    expect(parsed.type).toBe("message");
    expect(parsed.contentType).toBe("image");
    expect(parsed.mediaCaption).toBe("foto da peça");
    expect(decodeGoMediaRef(parsed.mediaId)).toMatchObject({ mimetype: "image/jpeg", url: "https://m/x.enc" });
  });

  it("returns outbound-echo when IsFromMe=true", () => {
    const parsed = parseEvolutionGoInbound(
      messageEvent({ conversation: "eco" }, { IsFromMe: true }),
      "acc",
    );
    expect(parsed).toMatchObject({ type: "outbound-echo", toPhone: "+5555988887777", contentType: "text", text: "eco" });
  });

  it("maps Receipt delivered/read to status (state at top OR data.Type)", () => {
    const delivered = parseEvolutionGoInbound(
      { event: "Receipt", instanceId: "i", data: { MessageIDs: ["GOMSG1"], Type: "delivered", Timestamp: "2026-06-25T10:01:00Z" } },
      "acc",
    );
    expect(delivered).toMatchObject({ type: "status", providerMessageId: "GOMSG1", status: "delivered" });

    const read = parseEvolutionGoInbound(
      { event: "Receipt", state: "Read", instanceId: "i", data: { MessageIDs: ["GOMSG2"] } },
      "acc",
    );
    expect(read).toMatchObject({ type: "status", providerMessageId: "GOMSG2", status: "read" });
  });

  it("throws on group/@lid chats and on non-message events", () => {
    expect(() =>
      parseEvolutionGoInbound(messageEvent({ conversation: "x" }, { Chat: "123@g.us" }), "acc"),
    ).toThrow();
    expect(() =>
      parseEvolutionGoInbound(messageEvent({ conversation: "x" }, { Chat: "123@lid" }), "acc"),
    ).toThrow();
    expect(() => parseEvolutionGoInbound({ event: "Connection", data: {} }, "acc")).toThrow();
    expect(() => parseEvolutionGoInbound({ foo: "bar" }, "acc")).toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/providers/whatsapp/evolution-go/parser.test.ts`
Expected: FAIL — `parseEvolutionGoInbound` não existe.

- [ ] **Step 3: Implementar**

```ts
/**
 * Evolution Go (whatsmeow) webhook parser. Events are PascalCase:
 * - `Message` + Info.IsFromMe=false → inbound message;
 * - `Message` + Info.IsFromMe=true  → outbound echo (mirrored by the webhook);
 * - `Receipt` (state Delivered/Read, or data.Type) → delivery status.
 * Group/broadcast/newsletter/@lid chats throw (no 1:1 customer). `Connection`
 * and any other event throw — the webhook core handles connection lifecycle.
 */

import { toE164 } from "../phone";
import { encodeGoMediaRef, type IGoMediaRef } from "./media";
import type { IInboundMessage, IInboundStatus, InboundContentType, IOutboundEcho } from "../types";

interface IGoInfo {
  Chat?: string;
  Sender?: string;
  IsFromMe?: boolean;
  Type?: string;
  PushName?: string;
  ID?: string;
  Timestamp?: string | number;
}

interface IGoMediaNode {
  caption?: string;
  mimetype?: string;
  url?: string;
  directPath?: string;
  mediaKey?: string;
  fileEncSHA256?: string;
  fileSHA256?: string;
  fileLength?: number;
}

interface IGoMessageBody {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: IGoMediaNode;
  audioMessage?: IGoMediaNode;
  videoMessage?: IGoMediaNode;
  documentMessage?: IGoMediaNode & { fileName?: string };
}

interface IGoEvent {
  event?: string;
  state?: string;
  instanceId?: string;
  data?: {
    Info?: IGoInfo;
    Message?: IGoMessageBody;
    MessageIDs?: string[];
    Type?: string;
    Timestamp?: string | number;
  };
}

const NON_INDIVIDUAL_JID = /@(g\.us|broadcast|newsletter|lid)$/;

function jidToE164(jid: string | undefined): string {
  if (!jid) return "";
  return toE164(jid.split("@")[0]?.split(":")[0] ?? "");
}

function tsToIso(value: string | number | undefined): string {
  if (typeof value === "string" && value.length > 0) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
}

function mediaRefFrom(node: IGoMediaNode): string {
  const ref: IGoMediaRef = {
    url: node.url,
    directPath: node.directPath,
    mediaKey: node.mediaKey,
    fileEncSHA256: node.fileEncSHA256,
    fileSHA256: node.fileSHA256,
    fileLength: node.fileLength,
    mimetype: node.mimetype,
  };
  return encodeGoMediaRef(ref);
}

interface IGoContent {
  contentType: InboundContentType;
  text?: string;
  mediaCaption?: string;
  mediaId?: string;
}

function extractContent(msg: IGoMessageBody): IGoContent {
  if (msg.conversation !== undefined || msg.extendedTextMessage) {
    return { contentType: "text", text: msg.conversation ?? msg.extendedTextMessage?.text };
  }
  if (msg.imageMessage)
    return { contentType: "image", mediaCaption: msg.imageMessage.caption, mediaId: mediaRefFrom(msg.imageMessage) };
  if (msg.audioMessage) return { contentType: "audio", mediaId: mediaRefFrom(msg.audioMessage) };
  if (msg.videoMessage)
    return { contentType: "video", mediaCaption: msg.videoMessage.caption, mediaId: mediaRefFrom(msg.videoMessage) };
  if (msg.documentMessage)
    return { contentType: "document", mediaCaption: msg.documentMessage.caption, mediaId: mediaRefFrom(msg.documentMessage) };
  return { contentType: "unknown" };
}

const RECEIPT_STATUS_MAP: Record<string, IInboundStatus["status"]> = {
  delivered: "delivered",
  read: "read",
  readself: "read",
};

export function parseEvolutionGoInbound(
  rawPayload: unknown,
  accountId: string,
): IInboundMessage | IInboundStatus | IOutboundEcho {
  const ev = rawPayload as IGoEvent | null;
  if (!ev?.event) {
    throw new Error("EvolutionGoProvider: payload de webhook irreconhecível (sem 'event')");
  }

  if (ev.event === "Receipt") {
    const raw = String(ev.state ?? ev.data?.Type ?? "").toLowerCase();
    const status = RECEIPT_STATUS_MAP[raw];
    const id = ev.data?.MessageIDs?.[0] ?? "";
    if (!status) {
      throw new Error(`EvolutionGoProvider: Receipt com estado desconhecido: ${ev.state ?? ev.data?.Type}`);
    }
    return {
      type: "status",
      providerMessageId: id,
      status,
      timestamp: tsToIso(ev.data?.Timestamp),
      rawPayload,
    };
  }

  if (ev.event !== "Message") {
    throw new Error(`EvolutionGoProvider: evento não suportado pelo parser: ${ev.event}`);
  }

  const info = ev.data?.Info ?? {};
  const chat = info.Chat ?? "";
  if (NON_INDIVIDUAL_JID.test(chat)) {
    throw new Error("EvolutionGoProvider: Message de grupo/broadcast/newsletter/@lid — ignorar");
  }

  const content = extractContent(ev.data?.Message ?? {});
  const timestamp = tsToIso(info.Timestamp);

  if (info.IsFromMe) {
    return {
      type: "outbound-echo",
      providerMessageId: info.ID ?? "",
      toPhone: jidToE164(chat),
      contentType: content.contentType,
      text: content.text,
      mediaCaption: content.mediaCaption,
      timestamp,
      rawPayload,
    };
  }

  return {
    type: "message",
    providerMessageId: info.ID ?? "",
    fromPhone: jidToE164(info.Sender ?? chat),
    // Go resolves the account by instanceId (webhook core), not by phone.
    toAccountPhone: "",
    accountId,
    contentType: content.contentType,
    text: content.text,
    mediaId: content.mediaId,
    mediaCaption: content.mediaCaption,
    senderName: info.PushName,
    timestamp,
    rawPayload,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/providers/whatsapp/evolution-go/parser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/evolution-go/parser.ts src/providers/whatsapp/evolution-go/parser.test.ts
git commit -m "feat(whatsapp): evolution-go whatsmeow webhook parser"
```

---

### Task 7: HTTP client

**Files:**
- Create: `src/providers/whatsapp/evolution-go/client.ts`

**Interfaces:**
- Consumes: `engineFetch`/`IEngineFetchResult` (`../http`), `IEngineDeps` (`../types`), `mapEvolutionGoError` (`./errors`), `EVOLUTION_GO_INTEGRATION_NAME` (`./constants`).
- Produces:
  - `IGoRequestOptions { baseUrl; path; instanceId?; method?; json?; traceId?; timeoutMs?; omitResponsePayload?; expect? }`
  - `goRequest(apiKey: string, deps: IEngineDeps, options: IGoRequestOptions): Promise<IEngineFetchResult>`

> Tested indirectly by Task 8 (instance) and Task 9 (provider), which mock `fetchFn` and assert on URL/headers. No standalone test file.

- [ ] **Step 1: Implementar**

```ts
/**
 * HTTP client for the Evolution Go API. Auth = global `apikey` header + the
 * per-instance `instanceId` header (omitted for /instance/create, which is
 * global-only). Paths are FIXED (the instance is not in the path, unlike v2).
 * Shares the engine HTTP lifecycle (timeout, sanitized log, error normalize).
 */

import { engineFetch, type IEngineFetchResult } from "../http";
import type { IEngineDeps } from "../types";
import { EVOLUTION_GO_INTEGRATION_NAME } from "./constants";
import { mapEvolutionGoError } from "./errors";

export interface IGoRequestOptions {
  baseUrl: string;
  /** Fixed path, e.g. `/send/text`. */
  path: string;
  /** Instance uuid header. Omitted only for global calls (/instance/create). */
  instanceId?: string;
  method?: "GET" | "POST" | "DELETE";
  json?: unknown;
  traceId?: string;
  timeoutMs?: number;
  omitResponsePayload?: boolean;
  expect?: "json" | "bytes";
}

export async function goRequest(
  apiKey: string,
  deps: IEngineDeps,
  options: IGoRequestOptions,
): Promise<IEngineFetchResult> {
  const headers: Record<string, string> = { apikey: apiKey };
  if (options.instanceId) headers.instanceId = options.instanceId;
  if (options.traceId) headers["X-Trace-Id"] = options.traceId;
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  const result = await engineFetch(
    `${options.baseUrl}${options.path}`,
    { method: options.method ?? "POST", headers, body },
    {
      integrationName: EVOLUTION_GO_INTEGRATION_NAME,
      endpoint: options.path,
      traceId: options.traceId,
      requestPayload: options.json,
      logIntegration: deps.logIntegration,
      fetchFn: deps.fetchFn,
      timeoutMs: options.timeoutMs,
      omitResponsePayload: options.omitResponsePayload,
      expect: options.expect,
    },
  );

  if (result.status < 200 || result.status >= 300) {
    throw mapEvolutionGoError(result.status, result.body, options.path);
  }
  return result;
}
```

- [ ] **Step 2: Verificar compilação**

Run: `bunx tsc --noEmit 2>&1 | grep "evolution-go/client" || echo "client ok"`
Expected: `client ok`.

- [ ] **Step 3: Commit**

```bash
git add src/providers/whatsapp/evolution-go/client.ts
git commit -m "feat(whatsapp): evolution-go HTTP client (apikey + instanceId)"
```

---

### Task 8: Gestão de instância

**Files:**
- Create: `src/providers/whatsapp/evolution-go/instance.ts`
- Test: `src/providers/whatsapp/evolution-go/instance.test.ts`

**Interfaces:**
- Consumes: `goRequest`/`IGoRequestOptions` (`./client`), `IEngineDeps` (`../types`), `WhatsAppProviderError` (`../errors`), `EVOLUTION_GO_DEFAULT_SUBSCRIBE` (`./constants`).
- Produces:
  - `IGoServerTarget { baseUrl: string }` / `IGoInstanceTarget { baseUrl: string; instanceId: string }`
  - `IGoQrResult { state: "qr" | "open"; qrBase64?: string; pairingCode?: string }`
  - `IGoStatusResult { connected: boolean; loggedIn: boolean }`
  - `createGoInstance(apiKey, deps, input: { baseUrl; name; token? }, traceId?): Promise<{ instanceId: string; token: string }>`
  - `connectGoInstance(apiKey, deps, target: IGoInstanceTarget, webhookUrl: string, subscribe: string[], traceId?): Promise<void>`
  - `getGoInstanceQr(apiKey, deps, target: IGoInstanceTarget, traceId?): Promise<IGoQrResult>`
  - `getGoInstanceStatus(apiKey, deps, target: IGoInstanceTarget, traceId?): Promise<IGoStatusResult>`
  - `logoutGoInstance` / `deleteGoInstance` / `restartGoInstance (target, traceId?): Promise<void>`

- [ ] **Step 1: Escrever os testes que falham**

```ts
import { describe, expect, it, vi } from "vitest";
import {
  createGoInstance,
  connectGoInstance,
  getGoInstanceQr,
  getGoInstanceStatus,
} from "./instance";
import type { IEngineDeps } from "../types";

function deps(fetchImpl: typeof fetch): IEngineDeps {
  return { resolveSecret: async () => undefined, fetchFn: fetchImpl };
}
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("evolution-go instance management", () => {
  it("createGoInstance posts name+token (global apikey, no instanceId header) and returns id+token", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/instance/create");
      expect(init?.headers).toMatchObject({ apikey: "global-key" });
      expect((init?.headers as Record<string, string>).instanceId).toBeUndefined();
      expect(JSON.parse(String(init?.body))).toMatchObject({ name: "comercial-volvo", token: "tok-xyz" });
      return jsonResponse({ data: { id: "inst-uuid-9", name: "comercial-volvo", token: "tok-xyz", connected: false }, message: "success" });
    }) as unknown as typeof fetch;

    const out = await createGoInstance("global-key", deps(fetchFn), {
      baseUrl: "https://go.test",
      name: "comercial-volvo",
      token: "tok-xyz",
    });
    expect(out).toEqual({ instanceId: "inst-uuid-9", token: "tok-xyz" });
  });

  it("connectGoInstance posts webhookUrl + subscribe with the instanceId header", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/instance/connect");
      expect(init?.headers).toMatchObject({ apikey: "global-key", instanceId: "inst-uuid-9" });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        immediate: true,
        webhookUrl: "https://app/functions/v1/whatsapp-webhook/evolution-go",
        subscribe: ["MESSAGE", "READ_RECEIPT"],
      });
      return jsonResponse({ data: { eventString: "MESSAGE,READ_RECEIPT", webhookUrl: "x" }, message: "success" });
    }) as unknown as typeof fetch;

    await connectGoInstance(
      "global-key",
      deps(fetchFn),
      { baseUrl: "https://go.test", instanceId: "inst-uuid-9" },
      "https://app/functions/v1/whatsapp-webhook/evolution-go",
      ["MESSAGE", "READ_RECEIPT"],
    );
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("getGoInstanceQr returns qr base64 + code", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/instance/qr");
      expect(init?.method).toBe("GET");
      return jsonResponse({ data: { Qrcode: "data:image/png;base64,iVBOR", Code: "2@abc" }, message: "success" });
    }) as unknown as typeof fetch;

    const qr = await getGoInstanceQr("global-key", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "inst-uuid-9" });
    expect(qr).toEqual({ state: "qr", qrBase64: "data:image/png;base64,iVBOR", pairingCode: "2@abc" });
  });

  it("getGoInstanceStatus maps Connected/LoggedIn booleans", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ data: { Connected: true, LoggedIn: true, Name: "" }, message: "success" }),
    ) as unknown as typeof fetch;

    const status = await getGoInstanceStatus("global-key", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "inst-uuid-9" });
    expect(status).toEqual({ connected: true, loggedIn: true });
  });

  it("getGoInstanceQr returns state=open when the instance reports no QR but logged in", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ data: { Code: "" }, message: "already connected" }, 200)) as unknown as typeof fetch;
    const qr = await getGoInstanceQr("global-key", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "i" });
    expect(qr.state).toBe("open");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/providers/whatsapp/evolution-go/instance.test.ts`
Expected: FAIL — funções não existem.

- [ ] **Step 3: Implementar**

```ts
/**
 * Evolution Go instance management (QR pairing flow). NOT part of
 * IWhatsAppProvider (messaging-only). Consumed server-side by the
 * `whatsapp-connect` Edge Function (Fase 2) through the `_shared` mirror.
 * Runtime-agnostic: relative imports, Web APIs only.
 */

import { WhatsAppProviderError } from "../errors";
import type { IEngineDeps } from "../types";
import { goRequest } from "./client";

export interface IGoInstanceTarget {
  baseUrl: string;
  instanceId: string;
}

export interface IGoQrResult {
  state: "qr" | "open";
  qrBase64?: string;
  pairingCode?: string;
}

export interface IGoStatusResult {
  connected: boolean;
  loggedIn: boolean;
}

/** POST /instance/create — global apikey only (no instance yet). */
export async function createGoInstance(
  apiKey: string,
  deps: IEngineDeps,
  input: { baseUrl: string; name: string; token?: string },
  traceId?: string,
): Promise<{ instanceId: string; token: string }> {
  const response = await goRequest(apiKey, deps, {
    baseUrl: input.baseUrl,
    path: "/instance/create",
    json: { name: input.name, ...(input.token ? { token: input.token } : {}) },
    omitResponsePayload: true,
    traceId,
  });
  const body = response.body as { data?: { id?: string; token?: string } } | null;
  const instanceId = body?.data?.id;
  const token = body?.data?.token ?? input.token;
  if (!instanceId || !token) {
    throw new WhatsAppProviderError(
      "INTEGRATION_ERROR",
      502,
      "Resposta de /instance/create sem id/token",
    );
  }
  return { instanceId, token };
}

/** POST /instance/connect — registers the webhook + event subscription. */
export async function connectGoInstance(
  apiKey: string,
  deps: IEngineDeps,
  target: IGoInstanceTarget,
  webhookUrl: string,
  subscribe: string[],
  traceId?: string,
): Promise<void> {
  await goRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: "/instance/connect",
    instanceId: target.instanceId,
    json: { immediate: true, webhookUrl, subscribe },
    traceId,
  });
}

/** GET /instance/qr — QR data URI + pairing code, or state=open when paired. */
export async function getGoInstanceQr(
  apiKey: string,
  deps: IEngineDeps,
  target: IGoInstanceTarget,
  traceId?: string,
): Promise<IGoQrResult> {
  const response = await goRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: "/instance/qr",
    instanceId: target.instanceId,
    method: "GET",
    omitResponsePayload: true,
    traceId,
  });
  const body = response.body as { data?: { Qrcode?: string; Code?: string } } | null;
  const qrBase64 = body?.data?.Qrcode;
  if (qrBase64) {
    return { state: "qr", qrBase64, pairingCode: body?.data?.Code };
  }
  return { state: "open" };
}

/** GET /instance/status — Connected/LoggedIn booleans. */
export async function getGoInstanceStatus(
  apiKey: string,
  deps: IEngineDeps,
  target: IGoInstanceTarget,
  traceId?: string,
): Promise<IGoStatusResult> {
  const response = await goRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: "/instance/status",
    instanceId: target.instanceId,
    method: "GET",
    timeoutMs: 10_000,
    traceId,
  });
  const body = response.body as { data?: { Connected?: boolean; LoggedIn?: boolean } } | null;
  return { connected: body?.data?.Connected === true, loggedIn: body?.data?.LoggedIn === true };
}

/** DELETE /instance/logout — unpairs the session (QR needed again). */
export async function logoutGoInstance(
  apiKey: string,
  deps: IEngineDeps,
  target: IGoInstanceTarget,
  traceId?: string,
): Promise<void> {
  await goRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: "/instance/logout",
    instanceId: target.instanceId,
    method: "DELETE",
    traceId,
  });
}

/** DELETE /instance/delete — removes the instance from the server. */
export async function deleteGoInstance(
  apiKey: string,
  deps: IEngineDeps,
  target: IGoInstanceTarget,
  traceId?: string,
): Promise<void> {
  await goRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: "/instance/delete",
    instanceId: target.instanceId,
    method: "DELETE",
    traceId,
  });
}

/** POST /instance/restart — restarts the instance process. */
export async function restartGoInstance(
  apiKey: string,
  deps: IEngineDeps,
  target: IGoInstanceTarget,
  traceId?: string,
): Promise<void> {
  await goRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: "/instance/restart",
    instanceId: target.instanceId,
    traceId,
  });
}
```

> NOTE for the implementer: paths for `logout`/`delete`/`restart` are assumptions
> mirroring the v2 verbs — confirm against `docs/dev/evolution-go-api-contracts.md`
> (Task 1) and adjust the literal path strings if the OpenAPI differs. The tests
> above only pin `create`/`connect`/`qr`/`status`, which the doc confirmed.

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/providers/whatsapp/evolution-go/instance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/evolution-go/instance.ts src/providers/whatsapp/evolution-go/instance.test.ts
git commit -m "feat(whatsapp): evolution-go instance management (create/connect/qr/status)"
```

---

### Task 9: EvolutionGoProvider (IWhatsAppProvider)

**Files:**
- Create: `src/providers/whatsapp/evolution-go/EvolutionGoProvider.ts`
- Test: `src/providers/whatsapp/evolution-go/EvolutionGoProvider.test.ts`

**Interfaces:**
- Consumes: `IWhatsAppProvider` (`../IWhatsAppProvider`), `goRequest` (`./client`), `parseEvolutionGoInbound` (`./parser`), `decodeGoMediaRef` (`./media`), `EVOLUTION_GO_CAPABILITIES`/`EVOLUTION_GO_SECRET_SUFFIXES` (`./constants`), `timingSafeEqualStrings` (`../crypto`), `assertE164`/`toWireNumber` (`../phone`), `WhatsAppProviderError` (`../errors`), `IEvolutionGoAccountConfig` + send/inbound types (`../types`).
- Produces: `class EvolutionGoProvider implements IWhatsAppProvider` with `providerName = "evolution-go"`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
import { describe, expect, it, vi } from "vitest";
import { EvolutionGoProvider } from "./EvolutionGoProvider";
import { encodeGoMediaRef } from "./media";
import type { IIntegrationLogEntry } from "../types";

const CONFIG = {
  accountId: "acc-go-1",
  baseUrl: "https://go.test",
  instanceId: "inst-uuid-9",
  credentialsRef: "WA_GO_TEST",
};
const SECRETS: Record<string, string> = {
  WA_GO_TEST_API_KEY: "global-key",
  WA_GO_TEST_INSTANCE_TOKEN: "inst-token",
};
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function makeProvider(fetchImpl: typeof fetch, secrets = SECRETS) {
  const logs: IIntegrationLogEntry[] = [];
  const provider = new EvolutionGoProvider(CONFIG, {
    resolveSecret: async (name) => secrets[name],
    logIntegration: (e) => { logs.push(e); },
    fetchFn: fetchImpl,
  });
  return { provider, logs };
}

describe("EvolutionGoProvider", () => {
  it("sendText posts to /send/text with apikey+instanceId and returns messageId", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/send/text");
      expect(init?.headers).toMatchObject({ apikey: "global-key", instanceId: "inst-uuid-9" });
      expect(JSON.parse(String(init?.body))).toMatchObject({ number: "5555912345678", text: "Olá" });
      return jsonResponse({ success: true, messageId: "GOOUT1", data: { Info: { ID: "GOOUT1" } } });
    }) as unknown as typeof fetch;
    const { provider, logs } = makeProvider(fetchFn);

    const result = await provider.sendText({ accountId: "acc-go-1", to: "+5555912345678", text: "Olá", traceId: "t1" });
    expect(result).toEqual({ providerMessageId: "GOOUT1", status: "sent" });
    expect(JSON.stringify(logs)).not.toContain("global-key");
  });

  it("sendMedia posts URL + type (no separate upload)", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/send/media");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        number: "5555912345678", url: "https://storage/x.jpg", type: "image", caption: "foto",
      });
      return jsonResponse({ success: true, messageId: "GOMEDIA1" });
    }) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    await expect(
      provider.sendMedia({ accountId: "a", to: "+5555912345678", mediaType: "image", mediaIdOrUrl: "not-a-url" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const result = await provider.sendMedia({
      accountId: "a", to: "+5555912345678", mediaType: "image", mediaIdOrUrl: "https://storage/x.jpg", caption: "foto",
    });
    expect(result.providerMessageId).toBe("GOMEDIA1");
  });

  it("sendTemplate / sendInteractive / uploadOutboundMedia throw NOT_SUPPORTED", async () => {
    const { provider } = makeProvider(vi.fn() as unknown as typeof fetch);
    await expect(provider.sendTemplate({ accountId: "a", to: "+55", templateName: "x", languageCode: "pt_BR" })).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
    await expect(provider.sendInteractive({ accountId: "a", to: "+55", bodyText: "x", kind: "buttons", options: [{ id: "1", title: "Sim" }] })).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
    await expect(provider.uploadOutboundMedia(new Uint8Array([1]), "image/png")).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
  });

  it("downloadInboundMedia decodes the media ref, posts /message/downloadimage and decodes base64", async () => {
    const ref = encodeGoMediaRef({ url: "https://m/x.enc", directPath: "/v/t", mediaKey: "AAAA", mimetype: "image/jpeg", fileLength: 3 });
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/message/downloadimage");
      expect(JSON.parse(String(init?.body))).toMatchObject({ url: "https://m/x.enc", directPath: "/v/t", mimetype: "image/jpeg" });
      return jsonResponse({ success: true, image: btoa("abc") });
    }) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    const out = await provider.downloadInboundMedia(ref);
    expect(out.mimeType).toBe("image/jpeg");
    expect(out.sizeBytes).toBe(3);
    expect(new TextDecoder().decode(out.data)).toBe("abc");
  });

  it("verifyWebhookSignature compares the payload instanceToken to the Vault token", async () => {
    const { provider } = makeProvider(vi.fn() as unknown as typeof fetch);
    expect(await provider.verifyWebhookSignature("{}", "inst-token")).toBe(true);
    expect(await provider.verifyWebhookSignature("{}", "wrong")).toBe(false);
  });

  it("healthCheck maps Connected:true to healthy", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ data: { Connected: true, LoggedIn: true } })) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);
    const h = await provider.healthCheck();
    expect(h.healthy).toBe(true);
  });

  it("capabilities are honest (no templates/interactive/upload)", () => {
    const { provider } = makeProvider(vi.fn() as unknown as typeof fetch);
    expect(provider.providerName).toBe("evolution-go");
    expect(provider.capabilities).toMatchObject({ supportsTemplates: false, supportsInteractive: false, supportsMediaUpload: false });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/providers/whatsapp/evolution-go/EvolutionGoProvider.test.ts`
Expected: FAIL — classe não existe.

- [ ] **Step 3: Implementar**

```ts
/**
 * EvolutionGoProvider — IWhatsAppProvider against a self-hosted Evolution Go
 * (whatsmeow) server. Honest reduced capabilities (no templates/interactive,
 * media by URL). Secrets resolved on demand and cached 60s; never logged.
 * The instance is addressed by `instanceId` header (config), paths are fixed.
 */

import { timingSafeEqualStrings } from "../crypto";
import { WhatsAppProviderError } from "../errors";
import { assertE164, toWireNumber } from "../phone";
import type { IWhatsAppProvider } from "../IWhatsAppProvider";
import type {
  IEngineDeps,
  IEvolutionGoAccountConfig,
  IHealthCheckResult,
  IInboundMessage,
  IInboundStatus,
  IMediaDownloadResult,
  IOutboundEcho,
  ISendInteractiveInput,
  ISendMediaInput,
  ISendResult,
  ISendTemplateInput,
  ISendTextInput,
} from "../types";
import { EVOLUTION_GO_CAPABILITIES, EVOLUTION_GO_SECRET_SUFFIXES } from "./constants";
import { goRequest } from "./client";
import { decodeGoMediaRef } from "./media";
import { parseEvolutionGoInbound } from "./parser";

const SECRET_CACHE_TTL_MS = 60_000;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export class EvolutionGoProvider implements IWhatsAppProvider {
  readonly providerName = "evolution-go" as const;
  readonly capabilities = EVOLUTION_GO_CAPABILITIES;

  private readonly secretCache = new Map<string, { value: string; expiresAt: number }>();

  constructor(
    private readonly config: IEvolutionGoAccountConfig,
    private readonly deps: IEngineDeps,
  ) {}

  private async secret(suffix: string, required: boolean): Promise<string | undefined> {
    const name = `${this.config.credentialsRef}${suffix}`;
    const cached = this.secretCache.get(name);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await this.deps.resolveSecret(name);
    if (value === undefined || value.length === 0) {
      if (!required) return undefined;
      throw new WhatsAppProviderError(
        "UNAUTHORIZED",
        401,
        `Secret '${name}' não configurado (credentials_ref da Evolution Go)`,
      );
    }
    this.secretCache.set(name, { value, expiresAt: Date.now() + SECRET_CACHE_TTL_MS });
    return value;
  }

  private async apiKey(): Promise<string> {
    return (await this.secret(EVOLUTION_GO_SECRET_SUFFIXES.apiKey, true)) as string;
  }

  // ===== Sending ============================================================

  async sendText(input: ISendTextInput): Promise<ISendResult> {
    assertE164(input.to);
    if (input.text.length === 0) {
      throw new WhatsAppProviderError("VALIDATION_ERROR", 422, "Texto não pode ser vazio");
    }
    const response = await goRequest(await this.apiKey(), this.deps, {
      baseUrl: this.config.baseUrl,
      path: "/send/text",
      instanceId: this.config.instanceId,
      json: {
        number: toWireNumber(input.to),
        text: input.text,
        ...(input.replyToMessageId ? { quoted: { messageId: input.replyToMessageId } } : {}),
      },
      traceId: input.traceId,
    });
    return this.toSendResult(response.body);
  }

  async sendMedia(input: ISendMediaInput): Promise<ISendResult> {
    assertE164(input.to);
    if (!input.mediaIdOrUrl.startsWith("http")) {
      throw new WhatsAppProviderError(
        "VALIDATION_ERROR",
        422,
        "Provider Evolution Go envia mídia por URL — passe uma URL pública/assinada",
      );
    }
    const response = await goRequest(await this.apiKey(), this.deps, {
      baseUrl: this.config.baseUrl,
      path: "/send/media",
      instanceId: this.config.instanceId,
      json: {
        number: toWireNumber(input.to),
        type: input.mediaType,
        url: input.mediaIdOrUrl,
        ...(input.caption ? { caption: input.caption } : {}),
        ...(input.filename ? { filename: input.filename } : {}),
      },
      traceId: input.traceId,
    });
    return this.toSendResult(response.body);
  }

  async sendTemplate(_input: ISendTemplateInput): Promise<ISendResult> {
    throw new WhatsAppProviderError("NOT_SUPPORTED", 422, "Provider Evolution Go não suporta templates HSM");
  }

  async sendInteractive(_input: ISendInteractiveInput): Promise<ISendResult> {
    throw new WhatsAppProviderError("NOT_SUPPORTED", 422, "Provider Evolution Go não suporta mensagens interativas");
  }

  private toSendResult(body: unknown): ISendResult {
    const b = body as { messageId?: string; data?: { Info?: { ID?: string } } } | null;
    const id = b?.messageId ?? b?.data?.Info?.ID;
    if (!id) {
      throw new WhatsAppProviderError("INTEGRATION_ERROR", 502, "Resposta da Evolution Go sem messageId");
    }
    return { providerMessageId: id, status: "sent" };
  }

  // ===== Receiving ==========================================================

  async verifyWebhookSignature(_rawBody: string, signature: string): Promise<boolean> {
    // Evolution Go has no HMAC: the webhook carries the instanceToken in the
    // payload. The edge passes it here as `signature`; we compare it (constant
    // time) to the per-instance token stored in the Vault.
    try {
      const token = await this.secret(EVOLUTION_GO_SECRET_SUFFIXES.instanceToken, true);
      return token !== undefined && timingSafeEqualStrings(signature, token);
    } catch {
      return false;
    }
  }

  parseInboundMessage(rawPayload: unknown): IInboundMessage | IInboundStatus | IOutboundEcho {
    return parseEvolutionGoInbound(rawPayload, this.config.accountId);
  }

  // ===== Media ==============================================================

  async uploadOutboundMedia(_data: Uint8Array, _mimeType: string): Promise<{ mediaId: string }> {
    throw new WhatsAppProviderError(
      "NOT_SUPPORTED",
      422,
      "Provider Evolution Go envia mídia por URL — sem upload separado (capabilities.supportsMediaUpload=false)",
    );
  }

  async downloadInboundMedia(mediaId: string): Promise<IMediaDownloadResult> {
    const ref = decodeGoMediaRef(mediaId);
    const response = await goRequest(await this.apiKey(), this.deps, {
      baseUrl: this.config.baseUrl,
      path: "/message/downloadimage",
      instanceId: this.config.instanceId,
      json: {
        url: ref.url,
        directPath: ref.directPath,
        mediaKey: ref.mediaKey,
        fileEncSHA256: ref.fileEncSHA256,
        fileSHA256: ref.fileSHA256,
        fileLength: ref.fileLength,
        mimetype: ref.mimetype,
      },
    });
    const body = response.body as { image?: string } | null;
    if (!body?.image) {
      throw new WhatsAppProviderError("NOT_FOUND", 404, "Mídia Evolution Go não encontrada");
    }
    const data = base64ToBytes(body.image);
    return {
      data,
      mimeType: ref.mimetype ?? "application/octet-stream",
      sizeBytes: data.byteLength,
    };
  }

  // ===== Health =============================================================

  async healthCheck(): Promise<IHealthCheckResult> {
    const startedAt = Date.now();
    try {
      const response = await goRequest(await this.apiKey(), this.deps, {
        baseUrl: this.config.baseUrl,
        path: "/instance/status",
        instanceId: this.config.instanceId,
        method: "GET",
        timeoutMs: 5_000,
      });
      const body = response.body as { data?: { Connected?: boolean; LoggedIn?: boolean } } | null;
      const connected = body?.data?.Connected === true;
      return {
        healthy: connected,
        latencyMs: Date.now() - startedAt,
        detail: `connected: ${connected}; loggedIn: ${body?.data?.LoggedIn === true}`,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startedAt,
        detail: error instanceof Error ? error.message : String(error),
        checkedAt: new Date().toISOString(),
      };
    }
  }
}
```

> NOTE: `/message/downloadimage` is documented only for images and has a known
> 429→500 rate-limit bug; `mediaKey`/`fileEncSHA256` may need base64→int[] coercion.
> Confirm against Task 1's contract doc and adjust the request body shape there if
> the smoke against the real server requires it (the unit test pins the current shape).

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/providers/whatsapp/evolution-go/EvolutionGoProvider.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/evolution-go/EvolutionGoProvider.ts src/providers/whatsapp/evolution-go/EvolutionGoProvider.test.ts
git commit -m "feat(whatsapp): EvolutionGoProvider (send/download/health/webhook auth)"
```

---

### Task 10: Reconhecer evolution-go no build e factory

**Files:**
- Modify: `src/providers/whatsapp/build.ts`
- Modify: `src/providers/whatsapp/factory.ts`
- Test: `src/providers/whatsapp/build.test.ts` (criar se não existir)

**Interfaces:**
- Consumes: `EvolutionGoProvider` (`./evolution-go/EvolutionGoProvider`), `EVOLUTION_GO_CAPABILITIES` (`./evolution-go/constants`).
- Produces: `buildWhatsAppEngine` retorna `EvolutionGoProvider` para `engine="evolution-go"`; `getEngineCapabilities("evolution-go")` retorna a matriz.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { buildWhatsAppEngine } from "./build";
import { getEngineCapabilities } from "./factory";

const deps = { resolveSecret: async () => undefined };

describe("buildWhatsAppEngine evolution-go", () => {
  it("builds an EvolutionGoProvider from provider_config baseUrl+instanceId", () => {
    const engine = buildWhatsAppEngine({
      engine: "evolution-go",
      accountId: "acc-go-1",
      providerConfig: { baseUrl: "https://go.test", instanceId: "inst-uuid-9" },
      credentialsRef: "WA_GO_TEST",
      deps,
    });
    expect(engine.providerName).toBe("evolution-go");
  });

  it("throws VALIDATION_ERROR when instanceId is missing", () => {
    expect(() =>
      buildWhatsAppEngine({
        engine: "evolution-go",
        accountId: "a",
        providerConfig: { baseUrl: "https://go.test" },
        credentialsRef: "WA_GO_TEST",
        deps,
      }),
    ).toThrowError(/instanceId/);
  });

  it("getEngineCapabilities('evolution-go') has no templates", () => {
    expect(getEngineCapabilities("evolution-go").supportsTemplates).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/providers/whatsapp/build.test.ts`
Expected: FAIL — engine não reconhecido.

- [ ] **Step 3: Implementar em `build.ts`**

Adicionar o import no topo:
```ts
import { EvolutionGoProvider } from "./evolution-go/EvolutionGoProvider.ts";
```
> Em `src/providers/whatsapp/build.ts` (não o mirror) o import usa `./evolution-go/EvolutionGoProvider` sem `.ts`. O mirror em `_shared` usa `.ts` — o sync script reescreve. Use a forma do arquivo-fonte: **sem** `.ts`.

Forma correta no fonte:
```ts
import { EvolutionGoProvider } from "./evolution-go/EvolutionGoProvider";
```

Antes do `throw` final de "Engine WhatsApp desconhecido", adicionar:
```ts
  if (input.engine === "evolution-go") {
    return new EvolutionGoProvider(
      {
        accountId: input.accountId,
        baseUrl: requireString(input.providerConfig, "baseUrl", "evolution-go"),
        instanceId: requireString(input.providerConfig, "instanceId", "evolution-go"),
        credentialsRef,
      },
      input.deps,
    );
  }
```

- [ ] **Step 4: Implementar em `factory.ts`**

Adicionar o import:
```ts
import { EVOLUTION_GO_CAPABILITIES } from "./evolution-go/constants";
```
No `switch (data.provider)` de `getWhatsAppProvider`, incluir `case "evolution-go"` junto de `meta`/`evolution` (mesmo throw server-side):
```ts
    case "meta":
    case "evolution":
    case "evolution-go":
```
Em `getEngineCapabilities`, adicionar:
```ts
    case "evolution-go":
      return EVOLUTION_GO_CAPABILITIES;
```

- [ ] **Step 5: Rodar e ver passar**

Run: `bun run test src/providers/whatsapp/build.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/providers/whatsapp/build.ts src/providers/whatsapp/factory.ts src/providers/whatsapp/build.test.ts
git commit -m "feat(whatsapp): wire evolution-go into engine factory and builder"
```

---

### Task 11: Migration aditiva das check constraints

**Files:**
- Create: `supabase/migrations/20260625120000_whatsapp_evolution_go_provider.sql`

**Interfaces:**
- Consumes: nada.
- Produces: `whatsapp_accounts.provider` e `messages.provider` passam a aceitar `'evolution-go'`.

- [ ] **Step 1: Inspecionar as constraints atuais (não destrutivo)**

Via MCP `execute_sql` (read-only), confirmar o nome e a definição das check constraints de `whatsapp_accounts.provider` e `messages.provider`:
```sql
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid)
from pg_constraint
where conname ilike '%provider%' and conrelid in ('whatsapp_accounts'::regclass, 'messages'::regclass);
```
Registrar os nomes reais — o script abaixo precisa deles. Se os valores forem mantidos por ENUM em vez de CHECK, ajustar para `ALTER TYPE ... ADD VALUE 'evolution-go'`.

- [ ] **Step 2: Escrever a migration (idempotente)**

```sql
-- Evolution Go provider — additive: widen provider check constraints to accept
-- 'evolution-go' alongside 'meta'/'evolution'. Non-breaking, no data change.
-- NOTE: replace the constraint names below with the ones found in Step 1.

alter table public.whatsapp_accounts drop constraint if exists whatsapp_accounts_provider_check;
alter table public.whatsapp_accounts
  add constraint whatsapp_accounts_provider_check
  check (provider in ('meta', 'evolution', 'evolution-go'));

alter table public.messages drop constraint if exists messages_provider_check;
alter table public.messages
  add constraint messages_provider_check
  check (provider is null or provider in ('meta', 'evolution', 'evolution-go'));
```
> If Step 1 shows `messages.provider` is NOT NULL, drop the `provider is null or`
> branch. Match the existing nullability exactly — do not change it here.

- [ ] **Step 3: Aplicar em produção (com confirmação do dono)**

> **GATE:** NÃO aplicar sem o "ok" explícito do dono (auto-mode bloqueia). Aplicar via MCP `apply_migration` (ou `execute_sql` begin/commit), registrar a versão igual ao nome do arquivo. É aditiva e idempotente.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260625120000_whatsapp_evolution_go_provider.sql
git commit -m "feat(db): widen whatsapp provider check constraints for evolution-go"
```

---

### Task 12: Sync do mirror, gate verde e fechamento

**Files:**
- Modify (gerados): `supabase/functions/_shared/whatsapp/evolution-go/*` (via sync)
- Verify: `scripts/sync-whatsapp-shared.ts`

**Interfaces:**
- Consumes: todos os arquivos das Tasks 3–10.
- Produces: mirror `_shared` atualizado; suíte e build verdes.

- [ ] **Step 1: Rodar o sync do mirror**

Run: `bun run scripts/sync-whatsapp-shared.ts`
Expected: cria `supabase/functions/_shared/whatsapp/evolution-go/` espelhando os novos arquivos (com cabeçalho AUTO-GENERATED e imports `.ts`).
> Se a pasta nova NÃO for copiada, abrir `scripts/sync-whatsapp-shared.ts` e incluir o diretório `evolution-go/` na lista/glob de espelhamento; então rodar de novo.

- [ ] **Step 2: Rodar a suíte completa**

Run: `bun run test`
Expected: PASS — incluindo os novos arquivos de teste; nenhum teste existente quebrado.

- [ ] **Step 3: Rodar o build**

Run: `bun run build`
Expected: build conclui sem erro.

- [ ] **Step 4: Checagem de tipos por delta**

Run: `git diff --name-status main...HEAD --diff-filter=A | grep evolution-go` e depois `bunx tsc --noEmit`
Expected: nenhum erro de tipo NOVO nos arquivos criados na branch (baseline pré-existente ignorado).

- [ ] **Step 5: Commit do mirror**

```bash
git add supabase/functions/_shared/whatsapp/evolution-go
git commit -m "chore(whatsapp): sync evolution-go engine into _shared mirror"
```

---

## Self-Review

- **Spec coverage:** §3 (camada do engine) → Tasks 3–10; §2.2/§4.2 (config Vault+provider_config) → Tasks 2–3, 9; §2.5 (provider 1ª classe) → Tasks 2, 11; §4.4 (auth por instanceToken) → Task 9 (`verifyWebhookSignature`); §5/§8 (riscos/contratos) → Task 1 + notas nas Tasks 8/9. **Fora desta fase (próximos planos):** edges connect/webhook/send (Fase 2), auxiliares de paridade (Fase 3), failover (Fase 4), UI (Fase 5) — declarado no header.
- **Placeholders:** as notas "confirmar contra o doc do spike" são pontos de validação contra API de terceiro (documentados como risco no spec), não requisitos vagos — cada step traz código real e comando concreto.
- **Type consistency:** `IEvolutionGoAccountConfig` (Task 2) é consumido por `EvolutionGoProvider` (Task 9) e `build.ts` (Task 10); `encodeGoMediaRef`/`decodeGoMediaRef` (Task 5) ligam parser (Task 6) e provider (Task 9); `goRequest` (Task 7) é usado por instance (Task 8) e provider (Task 9); `providerName="evolution-go"` consistente com o union da Task 2.
