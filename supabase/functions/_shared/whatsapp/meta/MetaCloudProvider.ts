// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/meta/MetaCloudProvider.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * MetaCloudProvider — IWhatsAppProvider against the Meta WhatsApp Cloud API
 * (PRD-112). Construction is config + injected deps: secrets are resolved on
 * demand via `deps.resolveSecret` (Edge Function secrets named by
 * `credentials_ref` prefix) and cached in-memory for 60s (RF-002). The class
 * never receives a raw token in the constructor and never logs one (RNF-001).
 */

import { WhatsAppProviderError } from "../errors.ts";
import { assertE164, toWireNumber } from "../phone.ts";
import type { IWhatsAppProvider } from "../IWhatsAppProvider.ts";
import type {
  IEngineDeps,
  IHealthCheckResult,
  IInboundMessage,
  IInboundStatus,
  IMediaDownloadResult,
  IMetaAccountConfig,
  ISendInteractiveInput,
  ISendMediaInput,
  ISendResult,
  ISendTemplateInput,
  ISendTextInput,
} from "../types.ts";
import {
  META_CAPABILITIES,
  META_INTERACTIVE_MAX_BUTTONS,
  META_INTERACTIVE_MAX_LIST_ROWS,
  META_MAX_MEDIA_BYTES,
  META_MAX_TEXT_LENGTH,
  META_SECRET_SUFFIXES,
  META_SUPPORTED_UPLOAD_MIME_TYPES,
} from "./constants.ts";
import { metaRequest } from "./client.ts";
import { parseMetaInbound } from "./parser.ts";
import { verifyMetaWebhookSignature } from "./signature.ts";

const SECRET_CACHE_TTL_MS = 60_000;

interface IMetaSendResponse {
  messages?: Array<{ id?: string }>;
}

interface IMetaMediaLookup {
  url?: string;
  mime_type?: string;
  file_size?: number;
}

export class MetaCloudProvider implements IWhatsAppProvider {
  readonly providerName = "meta" as const;
  readonly capabilities = META_CAPABILITIES;

  private readonly secretCache = new Map<string, { value: string; expiresAt: number }>();

  constructor(
    private readonly config: IMetaAccountConfig,
    private readonly deps: IEngineDeps,
  ) {}

  // ===== Secrets ============================================================

  private async secret(suffix: string, required: true): Promise<string>;
  private async secret(suffix: string, required: false): Promise<string | undefined>;
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

  private messagesPath(): string {
    return `/${this.config.phoneNumberId}/messages`;
  }

  private async postMessage(body: Record<string, unknown>, traceId?: string): Promise<ISendResult> {
    const accessToken = await this.secret(META_SECRET_SUFFIXES.accessToken, true);
    const response = await metaRequest(accessToken, this.deps, {
      path: this.messagesPath(),
      json: { messaging_product: "whatsapp", recipient_type: "individual", ...body },
      traceId,
    });
    const id = (response.body as IMetaSendResponse | null)?.messages?.[0]?.id;
    if (!id) {
      throw new WhatsAppProviderError(
        "INTEGRATION_ERROR",
        502,
        "Resposta da Meta sem messages[0].id",
      );
    }
    return { providerMessageId: id, status: "sent" };
  }

  // ===== Sending ============================================================

  async sendText(input: ISendTextInput): Promise<ISendResult> {
    assertE164(input.to);
    if (input.text.length === 0 || input.text.length > META_MAX_TEXT_LENGTH) {
      throw new WhatsAppProviderError(
        "VALIDATION_ERROR",
        422,
        `Texto deve ter entre 1 e ${META_MAX_TEXT_LENGTH} caracteres`,
      );
    }
    return this.postMessage(
      {
        to: toWireNumber(input.to),
        type: "text",
        text: { body: input.text },
        ...(input.replyToMessageId ? { context: { message_id: input.replyToMessageId } } : {}),
      },
      input.traceId,
    );
  }

  async sendMedia(input: ISendMediaInput): Promise<ISendResult> {
    assertE164(input.to);
    const isUrl = input.mediaIdOrUrl.startsWith("http");
    const mediaObject: Record<string, unknown> = isUrl
      ? { link: input.mediaIdOrUrl }
      : { id: input.mediaIdOrUrl };
    if (input.caption) mediaObject.caption = input.caption;
    if (input.mediaType === "document" && input.filename) {
      mediaObject.filename = input.filename;
    }
    return this.postMessage(
      {
        to: toWireNumber(input.to),
        type: input.mediaType,
        [input.mediaType]: mediaObject,
        ...(input.replyToMessageId ? { context: { message_id: input.replyToMessageId } } : {}),
      },
      input.traceId,
    );
  }

  async sendTemplate(input: ISendTemplateInput): Promise<ISendResult> {
    assertE164(input.to);
    const components = input.bodyParameters?.length
      ? [
          {
            type: "body",
            parameters: input.bodyParameters.map((text) => ({ type: "text", text })),
          },
        ]
      : undefined;
    return this.postMessage(
      {
        to: toWireNumber(input.to),
        type: "template",
        template: {
          name: input.templateName,
          language: { code: input.languageCode },
          ...(components ? { components } : {}),
        },
      },
      input.traceId,
    );
  }

  async sendInteractive(input: ISendInteractiveInput): Promise<ISendResult> {
    assertE164(input.to);
    const max =
      input.kind === "buttons" ? META_INTERACTIVE_MAX_BUTTONS : META_INTERACTIVE_MAX_LIST_ROWS;
    if (input.options.length === 0 || input.options.length > max) {
      throw new WhatsAppProviderError(
        "VALIDATION_ERROR",
        422,
        `Mensagem interativa '${input.kind}' aceita de 1 a ${max} opções`,
      );
    }
    const interactive =
      input.kind === "buttons"
        ? {
            type: "button",
            body: { text: input.bodyText },
            action: {
              buttons: input.options.map((option) => ({
                type: "reply",
                reply: { id: option.id, title: option.title },
              })),
            },
          }
        : {
            type: "list",
            body: { text: input.bodyText },
            action: {
              button: input.listButtonLabel ?? "Escolher",
              sections: [
                {
                  rows: input.options.map((option) => ({
                    id: option.id,
                    title: option.title,
                    ...(option.description ? { description: option.description } : {}),
                  })),
                },
              ],
            },
          };
    return this.postMessage(
      { to: toWireNumber(input.to), type: "interactive", interactive },
      input.traceId,
    );
  }

  // ===== Receiving ==========================================================

  async verifyWebhookSignature(rawBody: string, signature: string): Promise<boolean> {
    try {
      const appSecret = await this.secret(META_SECRET_SUFFIXES.appSecret, true);
      return await verifyMetaWebhookSignature(rawBody, signature, appSecret);
    } catch {
      // Misconfigured secret must reject the webhook, never throw (RF-080).
      return false;
    }
  }

  parseInboundMessage(rawPayload: unknown): IInboundMessage | IInboundStatus {
    return parseMetaInbound(rawPayload, this.config.accountId);
  }

  // ===== Media ==============================================================

  async uploadOutboundMedia(data: Uint8Array, mimeType: string): Promise<{ mediaId: string }> {
    if (data.byteLength === 0 || data.byteLength > META_MAX_MEDIA_BYTES) {
      throw new WhatsAppProviderError(
        "VALIDATION_ERROR",
        422,
        `Mídia deve ter entre 1 byte e ${META_MAX_MEDIA_BYTES} bytes`,
      );
    }
    if (!(META_SUPPORTED_UPLOAD_MIME_TYPES as readonly string[]).includes(mimeType)) {
      throw new WhatsAppProviderError(
        "VALIDATION_ERROR",
        422,
        `Tipo de mídia não suportado pela Meta: ${mimeType}`,
      );
    }
    const accessToken = await this.secret(META_SECRET_SUFFIXES.accessToken, true);
    const formData = new FormData();
    formData.append("messaging_product", "whatsapp");
    formData.append("type", mimeType);
    formData.append("file", new Blob([data as BlobPart], { type: mimeType }));
    const response = await metaRequest(accessToken, this.deps, {
      path: `/${this.config.phoneNumberId}/media`,
      formData,
    });
    const mediaId = (response.body as { id?: string } | null)?.id;
    if (!mediaId) {
      throw new WhatsAppProviderError("INTEGRATION_ERROR", 502, "Upload Meta sem id na resposta");
    }
    return { mediaId };
  }

  async downloadInboundMedia(mediaId: string): Promise<IMediaDownloadResult> {
    const accessToken = await this.secret(META_SECRET_SUFFIXES.accessToken, true);
    // Step 1: media id → short-lived URL (~5min — caller persists immediately).
    const lookup = await metaRequest(accessToken, this.deps, {
      path: `/${mediaId}`,
      method: "GET",
    });
    const meta = lookup.body as IMetaMediaLookup | null;
    if (!meta?.url) {
      throw new WhatsAppProviderError(
        "NOT_FOUND",
        404,
        `Mídia Meta não encontrada (id: ${mediaId})`,
      );
    }
    // Step 2: fetch the binary from the temporary URL (still Bearer-authed).
    const download = await metaRequest(accessToken, this.deps, {
      path: meta.url,
      method: "GET",
      expect: "bytes",
    });
    const data = download.bytes ?? new Uint8Array(0);
    return {
      data,
      mimeType: meta.mime_type ?? "application/octet-stream",
      sizeBytes: data.byteLength,
    };
  }

  // ===== Health =============================================================

  async healthCheck(): Promise<IHealthCheckResult> {
    const startedAt = Date.now();
    try {
      const accessToken = await this.secret(META_SECRET_SUFFIXES.accessToken, true);
      const response = await metaRequest(accessToken, this.deps, {
        path: `/${this.config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
        method: "GET",
        timeoutMs: 5_000,
      });
      const quality = (response.body as { quality_rating?: string } | null)?.quality_rating;
      return {
        healthy: true,
        latencyMs: Date.now() - startedAt,
        detail: quality ? `quality_rating: ${quality}` : undefined,
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
