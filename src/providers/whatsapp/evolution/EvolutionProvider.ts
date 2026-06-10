/**
 * EvolutionProvider — IWhatsAppProvider against a self-hosted Evolution API
 * v2 instance (PRD-113). Honest reduced capabilities: no HSM templates, no
 * interactive messages, no separate media-upload step (media goes by URL).
 * The api key is resolved on demand via `deps.resolveSecret` and cached for
 * 60s; it never appears in logs (RNF-001).
 */

import { hmacSha256Hex, timingSafeEqualStrings } from "../crypto";
import { WhatsAppProviderError } from "../errors";
import { assertE164, toWireNumber } from "../phone";
import type { IWhatsAppProvider } from "../IWhatsAppProvider";
import type {
  IEngineDeps,
  IEvolutionAccountConfig,
  IHealthCheckResult,
  IInboundMessage,
  IInboundStatus,
  IMediaDownloadResult,
  ISendInteractiveInput,
  ISendMediaInput,
  ISendResult,
  ISendTemplateInput,
  ISendTextInput,
} from "../types";
import { EVOLUTION_CAPABILITIES, EVOLUTION_SECRET_SUFFIXES } from "./constants";
import { evolutionRequest } from "./client";
import { parseEvolutionInbound } from "./parser";

const SECRET_CACHE_TTL_MS = 60_000;

interface IEvolutionSendResponse {
  key?: { id?: string };
}

interface IEvolutionConnectionState {
  instance?: { state?: string };
  state?: string;
}

interface IEvolutionMediaResponse {
  base64?: string;
  mimetype?: string;
  fileName?: string;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export class EvolutionProvider implements IWhatsAppProvider {
  readonly providerName = "evolution" as const;
  readonly capabilities = EVOLUTION_CAPABILITIES;

  private readonly secretCache = new Map<string, { value: string; expiresAt: number }>();

  constructor(
    private readonly config: IEvolutionAccountConfig,
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
        `Secret '${name}' não configurado nas Edge Functions (credentials_ref do PRD-111)`,
      );
    }
    this.secretCache.set(name, { value, expiresAt: Date.now() + SECRET_CACHE_TTL_MS });
    return value;
  }

  private async apiKey(): Promise<string> {
    return (await this.secret(EVOLUTION_SECRET_SUFFIXES.apiKey, true)) as string;
  }

  // ===== Sending ============================================================

  async sendText(input: ISendTextInput): Promise<ISendResult> {
    assertE164(input.to);
    if (input.text.length === 0) {
      throw new WhatsAppProviderError("VALIDATION_ERROR", 422, "Texto não pode ser vazio");
    }
    const response = await evolutionRequest(await this.apiKey(), this.deps, {
      baseUrl: this.config.baseUrl,
      path: `/message/sendText/${this.config.instanceName}`,
      json: {
        number: toWireNumber(input.to),
        text: input.text,
        ...(input.replyToMessageId ? { quoted: { key: { id: input.replyToMessageId } } } : {}),
      },
      traceId: input.traceId,
    });
    return this.toSendResult(response.body);
  }

  async sendMedia(input: ISendMediaInput): Promise<ISendResult> {
    assertE164(input.to);
    // Evolution has no separate upload step — media MUST come as a fetchable
    // URL (signed Supabase Storage URL — PRD-106), never giant base64 bodies.
    if (!input.mediaIdOrUrl.startsWith("http")) {
      throw new WhatsAppProviderError(
        "VALIDATION_ERROR",
        422,
        "Provider Evolution envia mídia por URL — passe uma URL pública/assinada em mediaIdOrUrl",
      );
    }
    const response = await evolutionRequest(await this.apiKey(), this.deps, {
      baseUrl: this.config.baseUrl,
      path: `/message/sendMedia/${this.config.instanceName}`,
      json: {
        number: toWireNumber(input.to),
        mediatype: input.mediaType,
        media: input.mediaIdOrUrl,
        ...(input.caption ? { caption: input.caption } : {}),
        ...(input.filename ? { fileName: input.filename } : {}),
      },
      traceId: input.traceId,
    });
    return this.toSendResult(response.body);
  }

  async sendTemplate(_input: ISendTemplateInput): Promise<ISendResult> {
    throw new WhatsAppProviderError(
      "NOT_SUPPORTED",
      422,
      "Provider Evolution não suporta templates HSM",
    );
  }

  async sendInteractive(_input: ISendInteractiveInput): Promise<ISendResult> {
    throw new WhatsAppProviderError(
      "NOT_SUPPORTED",
      422,
      "Provider Evolution não suporta mensagens interativas",
    );
  }

  private toSendResult(body: unknown): ISendResult {
    const id = (body as IEvolutionSendResponse | null)?.key?.id;
    if (!id) {
      throw new WhatsAppProviderError("INTEGRATION_ERROR", 502, "Resposta da Evolution sem key.id");
    }
    return { providerMessageId: id, status: "sent" };
  }

  // ===== Receiving ==========================================================

  async verifyWebhookSignature(rawBody: string, signature: string): Promise<boolean> {
    try {
      const webhookSecret = await this.secret(EVOLUTION_SECRET_SUFFIXES.webhookSecret, false);
      if (webhookSecret === undefined) {
        // No secret configured: webhook auth is the PRD-114 IP allowlist (RF-061).
        return true;
      }
      const expected = await hmacSha256Hex(webhookSecret, rawBody);
      const provided = signature.replace(/^sha256=/, "");
      return timingSafeEqualStrings(provided, expected);
    } catch {
      return false;
    }
  }

  parseInboundMessage(rawPayload: unknown): IInboundMessage | IInboundStatus {
    return parseEvolutionInbound(rawPayload, this.config.accountId);
  }

  // ===== Media ==============================================================

  async uploadOutboundMedia(_data: Uint8Array, _mimeType: string): Promise<{ mediaId: string }> {
    throw new WhatsAppProviderError(
      "NOT_SUPPORTED",
      422,
      "Provider Evolution não tem upload separado de mídia — envie por URL em sendMedia (capabilities.supportsMediaUpload=false)",
    );
  }

  async downloadInboundMedia(mediaId: string): Promise<IMediaDownloadResult> {
    // `mediaId` is the Evolution MESSAGE key id (see parser) — media bytes
    // come back base64-encoded from the instance.
    const response = await evolutionRequest(await this.apiKey(), this.deps, {
      baseUrl: this.config.baseUrl,
      path: `/chat/getBase64FromMediaMessage/${this.config.instanceName}`,
      json: { message: { key: { id: mediaId } }, convertToMp4: false },
    });
    const media = response.body as IEvolutionMediaResponse | null;
    if (!media?.base64) {
      throw new WhatsAppProviderError(
        "NOT_FOUND",
        404,
        `Mídia Evolution não encontrada (key id: ${mediaId})`,
      );
    }
    const data = base64ToBytes(media.base64);
    return {
      data,
      mimeType: media.mimetype ?? "application/octet-stream",
      sizeBytes: data.byteLength,
      filename: media.fileName,
    };
  }

  // ===== Health =============================================================

  async healthCheck(): Promise<IHealthCheckResult> {
    const startedAt = Date.now();
    try {
      const response = await evolutionRequest(await this.apiKey(), this.deps, {
        baseUrl: this.config.baseUrl,
        path: `/instance/connectionState/${this.config.instanceName}`,
        method: "GET",
        timeoutMs: 5_000,
      });
      const body = response.body as IEvolutionConnectionState | null;
      const state = body?.instance?.state ?? body?.state ?? "unknown";
      // PRD-113 RF-051 tri-state collapses into the PRD-111 boolean contract:
      // open=healthy; connecting/close surface through `detail` for PRD-120.
      return {
        healthy: state === "open",
        latencyMs: Date.now() - startedAt,
        detail: `state: ${state}`,
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
