/**
 * OpenWaProvider — IWhatsAppProvider against a self-hosted OpenWA REST server
 * (rmyndharis/OpenWA fork, whatsapp-web.js-based). Redundant/primary engine
 * option for new stores/numbers (same VPS as evolution/evolution-go), NOT a
 * failover backup. Honest reduced capabilities: no HSM templates, no
 * interactive messages, no separate media-upload step (media goes by URL) —
 * closest architectural neighbor for auth/config shape is Evolution Go (ONE
 * global key per server, not per-instance), NOT classic Evolution.
 *
 * Endpoints CONFIRMED live (2026-07-07, server v0.8.9 @ openwa.ailainteligente.com.br):
 *   POST /sessions/{id}/messages/send-text     { chatId, text }
 *   POST /sessions/{id}/messages/send-image    { chatId, url, caption? }
 *   POST /sessions/{id}/messages/send-video    { chatId, url, caption? }
 *   POST /sessions/{id}/messages/send-audio    { chatId, url }
 *   POST /sessions/{id}/messages/send-document { chatId, url, filename? }
 *   GET  /sessions/{id}/messages                → { messages: [...] } (parser.ts shape)
 * Field names confirmed via live validation-error bisection (unknown fields
 * 400 — strict whitelist); the SUCCESS response body of these send calls was
 * NOT observed live (the test session was disconnected) — `toSendResult`
 * accepts either the confirmed message-record shape (`waMessageId`) or the
 * raw whatsapp-web.js native shape (`id._serialized`) as a fallback.
 *
 * The api key is resolved on demand via `deps.resolveSecret(config.apiKeySecretName)`
 * and cached for 60s; it never appears in logs (RNF-001). Unlike Evolution Go,
 * there is no separate per-instance token — the SAME server-wide key
 * authenticates every session (confirmed live: admin ops and messaging used
 * the identical key in testing).
 */

import { WhatsAppProviderError } from "../errors";
import { assertE164, toWireNumber } from "../phone";
import type { IWhatsAppProvider } from "../IWhatsAppProvider";
import type {
  IEngineDeps,
  IHealthCheckResult,
  IInboundMessage,
  IInboundStatus,
  IMediaDownloadResult,
  IOpenWaAccountConfig,
  IOutboundEcho,
  ISendInteractiveInput,
  ISendMediaInput,
  ISendResult,
  ISendTemplateInput,
  ISendTextInput,
} from "../types";
import { OPENWA_CAPABILITIES } from "./constants";
import { openwaRequest } from "./client";
import { parseOpenWaInbound } from "./parser";

const SECRET_CACHE_TTL_MS = 60_000;

interface IOpenWaSendResponse {
  // Confirmed message-record shape (see parser.ts).
  waMessageId?: string;
  id?: string | { _serialized?: string; id?: string };
}

interface IOpenWaSessionStatus {
  status?: string;
}

function decodePackedMedia(mediaId: string): { data: string; mimeType: string; filename?: string } {
  try {
    const parsed = JSON.parse(mediaId) as { data?: string; mimeType?: string; filename?: string };
    if (typeof parsed.data === "string") {
      return {
        data: parsed.data,
        mimeType: parsed.mimeType ?? "application/octet-stream",
        filename: parsed.filename,
      };
    }
  } catch {
    // fall through to error below
  }
  throw new WhatsAppProviderError(
    "NOT_FOUND",
    404,
    "Mídia OpenWA não encontrada (mediaId inválido — a OpenWA não tem endpoint de download por id, a mídia só chega embutida no próprio webhook)",
  );
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** E.164 phone → whatsapp-web.js chatId (`<digits>@c.us`). */
function toChatId(phone: string): string {
  return `${toWireNumber(phone)}@c.us`;
}

export class OpenWaProvider implements IWhatsAppProvider {
  readonly providerName = "openwa" as const;
  readonly capabilities = OPENWA_CAPABILITIES;

  private readonly secretCache = new Map<string, { value: string; expiresAt: number }>();

  constructor(
    private readonly config: IOpenWaAccountConfig,
    private readonly deps: IEngineDeps,
  ) {}

  private async apiKey(): Promise<string> {
    const name = this.config.apiKeySecretName;
    const cached = this.secretCache.get(name);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await this.deps.resolveSecret(name);
    if (!value) {
      throw new WhatsAppProviderError(
        "UNAUTHORIZED",
        401,
        `Secret '${name}' não configurado (chave global do servidor OpenWA)`,
      );
    }
    this.secretCache.set(name, { value, expiresAt: Date.now() + SECRET_CACHE_TTL_MS });
    return value;
  }

  // ===== Sending ============================================================

  async sendText(input: ISendTextInput): Promise<ISendResult> {
    assertE164(input.to);
    if (input.text.length === 0) {
      throw new WhatsAppProviderError("VALIDATION_ERROR", 422, "Texto não pode ser vazio");
    }
    // input.replyToMessageId is intentionally NOT sent: live bisection (2026-07-07)
    // confirmed the send-text DTO whitelist-rejects unknown fields (400), and
    // neither `quotedMessageId` nor `quotedMsgId` nor `replyTo` was accepted —
    // the real field name (if the endpoint supports quoting at all) is unconfirmed.
    // Sending a guessed name would always 400 the whole message, so quoting is
    // dropped rather than risk that.
    const response = await openwaRequest(await this.apiKey(), this.deps, {
      baseUrl: this.config.baseUrl,
      path: `/sessions/${this.config.sessionId}/messages/send-text`,
      json: { chatId: toChatId(input.to), text: input.text },
      traceId: input.traceId,
    });
    return this.toSendResult(response.body);
  }

  async sendMedia(input: ISendMediaInput): Promise<ISendResult> {
    assertE164(input.to);
    // OpenWA has no separate upload step — media MUST come as a fetchable URL
    // (signed Supabase Storage URL — PRD-106), never giant base64 bodies.
    if (!input.mediaIdOrUrl.startsWith("http")) {
      throw new WhatsAppProviderError(
        "VALIDATION_ERROR",
        422,
        "Provider OpenWA envia mídia por URL — passe uma URL pública/assinada em mediaIdOrUrl",
      );
    }
    const endpointByType: Record<string, string> = {
      image: "send-image",
      video: "send-video",
      audio: "send-audio",
      document: "send-document",
    };
    const endpoint = endpointByType[input.mediaType] ?? "send-document";
    const response = await openwaRequest(await this.apiKey(), this.deps, {
      baseUrl: this.config.baseUrl,
      path: `/sessions/${this.config.sessionId}/messages/${endpoint}`,
      json: {
        chatId: toChatId(input.to),
        url: input.mediaIdOrUrl,
        ...(input.caption ? { caption: input.caption } : {}),
        ...(input.filename ? { filename: input.filename } : {}),
      },
      traceId: input.traceId,
    });
    return this.toSendResult(response.body);
  }

  async sendTemplate(_input: ISendTemplateInput): Promise<ISendResult> {
    throw new WhatsAppProviderError(
      "NOT_SUPPORTED",
      422,
      "Provider OpenWA não suporta templates HSM",
    );
  }

  async sendInteractive(_input: ISendInteractiveInput): Promise<ISendResult> {
    throw new WhatsAppProviderError(
      "NOT_SUPPORTED",
      422,
      "Provider OpenWA não suporta mensagens interativas",
    );
  }

  private toSendResult(body: unknown): ISendResult {
    const parsed = body as IOpenWaSendResponse | null;
    const id =
      parsed?.waMessageId ??
      (typeof parsed?.id === "string" ? parsed.id : (parsed?.id?._serialized ?? parsed?.id?.id));
    if (!id) {
      throw new WhatsAppProviderError("INTEGRATION_ERROR", 502, "Resposta da OpenWA sem id da mensagem");
    }
    return { providerMessageId: id, status: "sent" };
  }

  // ===== Receiving ==========================================================

  async verifyWebhookSignature(_rawBody: string, _signature: string): Promise<boolean> {
    // OpenWA has no documented HMAC webhook secret — auth relies on the same
    // PRD-114 IP allowlist as Evolution (RF-061).
    return true;
  }

  parseInboundMessage(rawPayload: unknown): IInboundMessage | IInboundStatus | IOutboundEcho {
    return parseOpenWaInbound(rawPayload, this.config.accountId);
  }

  // ===== Media ==============================================================

  async uploadOutboundMedia(_data: Uint8Array, _mimeType: string): Promise<{ mediaId: string }> {
    throw new WhatsAppProviderError(
      "NOT_SUPPORTED",
      422,
      "Provider OpenWA não tem upload separado de mídia — envie por URL em sendMedia (capabilities.supportsMediaUpload=false)",
    );
  }

  async downloadInboundMedia(mediaId: string): Promise<IMediaDownloadResult> {
    // No download-by-id endpoint exists on this server (confirmed live) — the
    // parser packs the bytes already delivered inline in the webhook payload
    // into `mediaId` itself (see parser.ts packMediaId). Decode locally, no HTTP call.
    const packed = decodePackedMedia(mediaId);
    const data = base64ToBytes(packed.data);
    return {
      data,
      mimeType: packed.mimeType,
      sizeBytes: data.byteLength,
      filename: packed.filename,
    };
  }

  // ===== Health =============================================================

  async healthCheck(): Promise<IHealthCheckResult> {
    const startedAt = Date.now();
    try {
      const response = await openwaRequest(await this.apiKey(), this.deps, {
        baseUrl: this.config.baseUrl,
        path: `/sessions/${this.config.sessionId}`,
        method: "GET",
        timeoutMs: 5_000,
      });
      const body = response.body as IOpenWaSessionStatus | null;
      // CONFIRMED live 2026-07-08: a fully authenticated session reports
      // status "ready" (whatsapp-web.js's own event name), not "connected".
      const healthy = body?.status === "ready" || body?.status === "connected";
      return {
        healthy,
        latencyMs: Date.now() - startedAt,
        detail: `status: ${body?.status ?? "unknown"}`,
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
