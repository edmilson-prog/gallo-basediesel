// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/evolution-go/EvolutionGoProvider.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * EvolutionGoProvider — IWhatsAppProvider against a self-hosted Evolution Go
 * (whatsmeow) server. Honest reduced capabilities (no templates/interactive,
 * media by URL). Secrets resolved on demand and cached 60s; never logged.
 * Instance-scoped calls authenticate with the per-instance token as the
 * `apikey` header (no instanceId header) — confirmed by smoke 2026-06-25; the
 * global key only authorizes admin endpoints. Paths are fixed.
 */

import { timingSafeEqualStrings } from "../crypto.ts";
import { WhatsAppProviderError } from "../errors.ts";
import { assertE164, toWireNumber } from "../phone.ts";
import type { IWhatsAppProvider } from "../IWhatsAppProvider.ts";
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
} from "../types.ts";
import { EVOLUTION_GO_CAPABILITIES, EVOLUTION_GO_SECRET_SUFFIXES } from "./constants.ts";
import { goRequest } from "./client.ts";
import { decodeGoMediaRef } from "./media.ts";
import { parseEvolutionGoInbound } from "./parser.ts";

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

  /**
   * Per-instance token (`<credentialsRef>_INSTANCE_TOKEN`) used as the `apikey`
   * header for ALL instance-scoped calls. Smoke (2026-06-25) confirmed the Go
   * server authorizes instance endpoints by the instance token, NOT the global
   * key + an instanceId header. The global `_API_KEY` is only for admin/global
   * endpoints (e.g. /instance/create, in instance.ts called by the edge).
   */
  private async instanceToken(): Promise<string> {
    return (await this.secret(EVOLUTION_GO_SECRET_SUFFIXES.instanceToken, true)) as string;
  }

  // ===== Sending ============================================================

  async sendText(input: ISendTextInput): Promise<ISendResult> {
    assertE164(input.to);
    if (input.text.length === 0) {
      throw new WhatsAppProviderError("VALIDATION_ERROR", 422, "Texto não pode ser vazio");
    }
    const response = await goRequest(await this.instanceToken(), this.deps, {
      baseUrl: this.config.baseUrl,
      path: "/send/text",
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
    if (!input.mediaIdOrUrl.startsWith("https://")) {
      throw new WhatsAppProviderError(
        "VALIDATION_ERROR",
        422,
        "Provider Evolution Go envia mídia por URL — passe uma URL pública/assinada",
      );
    }
    const response = await goRequest(await this.instanceToken(), this.deps, {
      baseUrl: this.config.baseUrl,
      path: "/send/media",
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
      const token = await this.instanceToken();
      return timingSafeEqualStrings(signature, token);
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
    const response = await goRequest(await this.instanceToken(), this.deps, {
      baseUrl: this.config.baseUrl,
      path: "/message/downloadimage",
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
    let data: Uint8Array;
    try {
      data = base64ToBytes(body.image);
    } catch {
      throw new WhatsAppProviderError("INTEGRATION_ERROR", 502, "Mídia da Evolution Go retornou base64 inválido");
    }
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
      const response = await goRequest(await this.instanceToken(), this.deps, {
        baseUrl: this.config.baseUrl,
        path: "/instance/status",
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
