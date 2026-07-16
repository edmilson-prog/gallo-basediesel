// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/features/sdr-escalation/engine/build-summary.ts (sync: bun run scripts/sync-sdr-shared.ts)

import type {
  ICustomer,
  IConversation,
  IMessage,
  IPart,
  IPartIdentification,
  IQuote,
  ISdrContextSummary,
  ISdrEscalationPart,
  ISdrEscalationQuote,
  ISdrEscalationTraceStep,
  ISdrEscalationVehicle,
  ISdrSession,
} from "@/shared/types";

export interface IBuildSummaryInput {
  session: ISdrSession;
  conversation: IConversation;
  messages: IMessage[];
  customer?: ICustomer;
  parts?: IPart[];
  quote?: IQuote | null;
  reasonText?: string;
  now?: string;
}

/**
 * Compose the SDR → human handoff snapshot. Pure — never reads from providers
 * directly; every external bit must be passed in by the caller. Missing pieces
 * are omitted from the summary so the rendered bubble skips empty sections.
 */
export function buildContextSummary(input: IBuildSummaryInput): ISdrContextSummary {
  const { session, conversation, messages, customer, parts, quote, reasonText } = input;
  const now = input.now ? new Date(input.now) : new Date();
  const startedAt = new Date(session.startedAt);
  const timeInSdr = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));

  const customerName = pickCustomerName(customer, session.collectedData.name);
  const customerCompany = pickCustomerCompany(customer, session.collectedData.company);
  const customerPhone =
    customer?.phone ?? session.collectedData.phone ?? "(não capturado pelo SDR)";
  const isB2B = customer?.type === "B2B" || Boolean(session.collectedData.company);

  const vehicleIdentified = composeVehicle(session, parts);
  const partIdentified = composePart(session, parts);
  const quoteGenerated = composeQuote(session, quote);
  const sdrTrace = composeTrace(session);

  return {
    customerName,
    customerCompany,
    customerPhone,
    isB2B,
    vehicleIdentified,
    partIdentified,
    quoteGenerated,
    reasonText,
    conversationLength: messages.filter((m) => m.conversationId === conversation.id).length,
    timeInSdr,
    collectedData: pruneCollected(session.collectedData),
    sdrTrace,
  };
}

function pickCustomerName(customer: ICustomer | undefined, collected: string | undefined) {
  if (!customer) return collected;
  if (customer.type === "B2B") return customer.contactName || collected;
  return customer.fullName || collected;
}

function pickCustomerCompany(customer: ICustomer | undefined, collected: string | undefined) {
  if (customer?.type === "B2B") return customer.nomeFantasia || customer.razaoSocial;
  return collected;
}

function composeVehicle(
  session: ISdrSession,
  parts: IPart[] | undefined,
): ISdrEscalationVehicle | undefined {
  // Prefer attributes captured during the part identification.
  const pending = session.collectedData.pendingPartIdentification;
  const last = session.collectedData.partIdentificationHistory?.[0];
  const source = pending ?? last;
  if (source) {
    const attrs = source.extractedAttributes;
    if (attrs.brand) {
      return {
        brand: attrs.brand,
        model: attrs.model,
        year: attrs.year,
        engine: attrs.engine,
      };
    }
  }
  // Fall back to scanning the catalog snapshot — used to enrich the brand when
  // the customer confirmed a part but no extraction stored its brand.
  if (session.collectedData.identifiedPart && parts) {
    const part = parts.find((p) => p.id === session.collectedData.identifiedPart);
    if (part?.applications && part.applications.length > 0) {
      const app = part.applications[0];
      return { brand: app.vehicleBrand, model: app.vehicleModel, year: app.yearStart };
    }
  }
  return undefined;
}

function composePart(
  session: ISdrSession,
  parts: IPart[] | undefined,
): ISdrEscalationPart | undefined {
  const confirmedId = session.collectedData.identifiedPart;
  const pending = session.collectedData.pendingPartIdentification;
  const last = session.collectedData.partIdentificationHistory?.[0];
  const identification: IPartIdentification | undefined = pending ?? last;

  if (confirmedId) {
    const part = parts?.find((p) => p.id === confirmedId);
    if (part) {
      return {
        id: part.id,
        name: part.name,
        oemCode: part.oemCodes[0],
        isOriginal: !isEquivalent(identification, confirmedId),
      };
    }
    if (identification) {
      const candidate = identification.candidates.find((c) => c.partId === confirmedId);
      if (candidate) {
        return {
          id: candidate.partId,
          name: candidate.partName,
          oemCode: candidate.oemCode,
          isOriginal: !candidate.isEquivalent,
        };
      }
    }
  }

  if (identification?.candidates.length) {
    const best = identification.candidates[0];
    return {
      id: best.partId,
      name: best.partName,
      oemCode: best.oemCode,
      isOriginal: !best.isEquivalent,
    };
  }
  return undefined;
}

function isEquivalent(
  identification: IPartIdentification | undefined,
  confirmedId: string,
): boolean {
  if (!identification) return false;
  const candidate = identification.candidates.find((c) => c.partId === confirmedId);
  return candidate?.isEquivalent ?? false;
}

function composeQuote(
  session: ISdrSession,
  quote: IQuote | null | undefined,
): ISdrEscalationQuote | undefined {
  const pending = session.collectedData.pendingQuote;
  if (quote) {
    return {
      id: quote.id,
      total: quote.total,
      validUntil: quote.validUntil,
      status: quote.status,
      shippingIsToNegotiate: pending?.shippingIsToNegotiate ?? false,
    };
  }
  if (pending) {
    return {
      id: pending.quoteId,
      total: pending.total,
      validUntil: pending.validUntil,
      status: "enviado",
      shippingIsToNegotiate: pending.shippingIsToNegotiate,
    };
  }
  return undefined;
}

function composeTrace(session: ISdrSession): ISdrEscalationTraceStep[] {
  const trace: ISdrEscalationTraceStep[] = [
    { step: `started_at:${session.state}`, timestamp: session.startedAt },
    { step: `last_activity:${session.state}`, timestamp: session.lastActivityAt },
  ];
  if (session.collectedData.identifiedPart) {
    trace.push({
      step: "part_identified",
      timestamp: session.lastActivityAt,
      details: session.collectedData.identifiedPart,
    });
  }
  if (session.collectedData.pendingQuote) {
    trace.push({
      step: "quote_sent",
      timestamp: session.collectedData.pendingQuote.createdAt,
      details: session.collectedData.pendingQuote.quoteId,
    });
  }
  return trace;
}

function pruneCollected(data: ISdrSession["collectedData"]): Record<string, unknown> {
  // Drop heavy nested objects (pending identification + quote) — they are
  // surfaced via the dedicated `partIdentified` / `quoteGenerated` slots and
  // bloat the audit log unnecessarily otherwise.
  const {
    pendingPartIdentification: _pi,
    pendingQuote: _pq,
    partIdentificationHistory: _ph,
    ...rest
  } = data;
  void _pi;
  void _pq;
  void _ph;
  return { ...rest };
}
