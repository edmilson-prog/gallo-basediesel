/**
 * MockWhatsAppProvider (PRD-111, RF-020..024).
 *
 * Full implementation of the IWhatsAppProvider contract returning synthetic
 * data — no external calls ever. It is the default engine while
 * `VITE_DATA_SOURCE=mock` (or `VITE_WHATSAPP_PROVIDER=mock`) and the living
 * template for new concrete providers: every method shows the exact shape a
 * real implementation must honour.
 */

import type { IWhatsAppProvider } from "../IWhatsAppProvider";
import type {
  IHealthCheckResult,
  IInboundMessage,
  IInboundStatus,
  IMediaDownloadResult,
  IProviderCapabilities,
  ISendInteractiveInput,
  ISendMediaInput,
  ISendResult,
  ISendTemplateInput,
  ISendTextInput,
  InboundContentType,
} from "../types";

/** Shape of the synthetic webhook payload the mock knows how to parse. */
export interface IMockInboundPayload {
  kind: "message" | "status";
  providerMessageId?: string;
  fromPhone?: string;
  toAccountPhone?: string;
  accountId?: string;
  contentType?: InboundContentType;
  text?: string;
  mediaId?: string;
  mediaCaption?: string;
  status?: "sent" | "delivered" | "read" | "failed";
  failureReason?: string;
  timestamp?: string;
}

const MOCK_CAPABILITIES: IProviderCapabilities = {
  // All true on purpose (RF-024) — the mock must never block a consumer path.
  supportsTemplates: true,
  supportsInteractive: true,
  supportsMediaUpload: true,
  supportsStatusReadReceipts: true,
  supportsCustomWebhook: true,
  maxMessageLength: 4096,
  maxMediaSizeBytes: 16 * 1024 * 1024,
};

function mockSendResult(): ISendResult {
  return { providerMessageId: `mock-${crypto.randomUUID()}`, status: "sent" };
}

function isMockPayload(payload: unknown): payload is IMockInboundPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "kind" in payload &&
    ((payload as IMockInboundPayload).kind === "message" ||
      (payload as IMockInboundPayload).kind === "status")
  );
}

export class MockWhatsAppProvider implements IWhatsAppProvider {
  readonly providerName = "mock" as const;
  readonly capabilities = MOCK_CAPABILITIES;

  async sendText(_input: ISendTextInput): Promise<ISendResult> {
    return mockSendResult();
  }

  async sendMedia(_input: ISendMediaInput): Promise<ISendResult> {
    return mockSendResult();
  }

  async sendTemplate(_input: ISendTemplateInput): Promise<ISendResult> {
    return mockSendResult();
  }

  async sendInteractive(_input: ISendInteractiveInput): Promise<ISendResult> {
    return mockSendResult();
  }

  verifyWebhookSignature(_rawBody: string, signature: string): boolean {
    // The mock accepts any non-empty signature so error paths stay testable.
    return signature.length > 0;
  }

  parseInboundMessage(rawPayload: unknown): IInboundMessage | IInboundStatus {
    if (!isMockPayload(rawPayload)) {
      throw new Error("MockWhatsAppProvider: unparseable payload (expected { kind: ... })");
    }
    const now = new Date().toISOString();
    if (rawPayload.kind === "status") {
      return {
        type: "status",
        providerMessageId: rawPayload.providerMessageId ?? `mock-${crypto.randomUUID()}`,
        status: rawPayload.status ?? "delivered",
        failureReason: rawPayload.failureReason,
        timestamp: rawPayload.timestamp ?? now,
        rawPayload,
      };
    }
    return {
      type: "message",
      providerMessageId: rawPayload.providerMessageId ?? `mock-${crypto.randomUUID()}`,
      fromPhone: rawPayload.fromPhone ?? "+5555900000000",
      toAccountPhone: rawPayload.toAccountPhone ?? "+5555911111111",
      accountId: rawPayload.accountId ?? "mock-account",
      contentType: rawPayload.contentType ?? "text",
      text: rawPayload.text ?? "Mensagem de teste (mock)",
      mediaId: rawPayload.mediaId,
      mediaCaption: rawPayload.mediaCaption,
      timestamp: rawPayload.timestamp ?? now,
      rawPayload,
    };
  }

  async downloadInboundMedia(mediaId: string): Promise<IMediaDownloadResult> {
    const data = new TextEncoder().encode(`mock media ${mediaId}`);
    return { data, mimeType: "application/octet-stream", sizeBytes: data.byteLength };
  }

  async uploadOutboundMedia(_data: Uint8Array, _mimeType: string): Promise<{ mediaId: string }> {
    return { mediaId: `mock-media-${crypto.randomUUID()}` };
  }

  async healthCheck(): Promise<IHealthCheckResult> {
    // Always healthy (RF-023).
    return { healthy: true, latencyMs: 1, checkedAt: new Date().toISOString() };
  }
}
