import type { ID, IMediaAsset, IMediaClassification } from "@/shared/types";
import { contentHash, mediaHashSeed } from "@/features/media/engine/contentHash";
import { classifyMedia } from "@/features/media/engine/classifyMedia";
import { isSensitiveClassification } from "@/features/media/engine/sensitiveAccess";
import { pickWeighted, type ISeededContext } from "./utils";

export interface IGenerateMediaAssetsInput {
  count: number;
  conversationIds: ID[];
  /** conversationId → customerId (when the conversation is bound to a customer). */
  customerIdByConversation: Record<ID, ID | undefined>;
  storeId: ID;
  now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Realistic file names per classification, picked deterministically. */
const FILENAMES: Record<IMediaClassification, string[]> = {
  nota_fiscal: ["nf-55321.pdf", "nota-fiscal-8842.pdf", "danfe-12090.pdf"],
  comprovante: ["comprovante-pix.jpg", "recibo-boleto.png", "transferencia.jpg"],
  peca: ["pastilha-freio.jpg", "turbo-volvo.jpg", "kit-embreagem.jpg"],
  chassi_placa: ["chassi-9bw.jpg", "placa-ior1234.jpg", "plaqueta-motor.jpg"],
  catalogo: ["catalogo-bosch.pdf", "tabela-aplicacao.pdf"],
  outro: ["foto.jpg", "documento.pdf", "audio.ogg"],
};

const MIME_BY_NAME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  png: "image/png",
  ogg: "audio/ogg",
};

function ext(fileName: string): string {
  return fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
}

function kindForMime(mime: string): IMediaAsset["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

const TRANSCRIPTIONS = [
  "Bom dia, preciso de orçamento para pastilha de freio do Volvo FH.",
  "Pode me confirmar o prazo de entrega para Frederico Westphalen?",
  "Esse turbo é original? Qual a garantia?",
  "Já fiz o pagamento, segue o comprovante em anexo.",
];

const OCR_TEXTS: Partial<Record<IMediaClassification, string[]>> = {
  nota_fiscal: ["NOTA FISCAL ELETRÔNICA Nº 55.321 CNPJ 12.345.678/0001-90 VALOR R$ 4.280,00"],
  comprovante: ["COMPROVANTE DE TRANSFERÊNCIA PIX R$ 1.150,00 CPF ***.456.789-**"],
  chassi_placa: ["CHASSI 9BWZZZ377VT004251 PLACA IOR1234"],
  peca: ["BOSCH 0986AB1234 PASTILHA DE FREIO"],
};

/**
 * Deterministically generate a realistic set of media assets distributed
 * across conversations/customers, including sensitive notas/comprovantes,
 * audios with transcription, in-flight (persisted=false) assets and assets
 * with a near-future sourceExpiresAt (to exercise expiry + retry). Pure with
 * respect to its inputs — same ctx seed ⇒ identical output (PRD-004 RF-013).
 */
export function generateMediaAssets(
  ctx: ISeededContext,
  input: IGenerateMediaAssetsInput,
): IMediaAsset[] {
  const out: IMediaAsset[] = [];
  if (input.conversationIds.length === 0) return out;
  const nowMs = input.now.getTime();

  for (let i = 0; i < input.count; i += 1) {
    // `intent` is the target classification we want this asset to land on. We
    // pick realistic fileNames/ocr markers for that intent and then run the
    // real classifyMedia engine over them — so the dataset both LOOKS varied
    // and exercises the same heuristic the runtime uses (classifyMedia applied
    // on creation). `intent` is also passed as the `mockMarker` escape hatch:
    // it is the deterministic, explicit-hint path (mockMarker wins over the
    // fileName/ocr heuristics) that guarantees the generated `classification`
    // matches the intent even for ambiguous names — see classifyMedia §8.
    const intent = pickWeighted<IMediaClassification>(ctx, [
      { value: "peca", weight: 6 },
      { value: "nota_fiscal", weight: 4 },
      { value: "comprovante", weight: 3 },
      { value: "chassi_placa", weight: 3 },
      { value: "catalogo", weight: 2 },
      { value: "outro", weight: 2 },
    ]);
    const fileName = ctx.pick(FILENAMES[intent]);
    const mimeType = MIME_BY_NAME[ext(fileName)] ?? "application/octet-stream";
    const kind = kindForMime(mimeType);
    const ocrText =
      kind !== "audio" ? (ctx.pick(OCR_TEXTS[intent] ?? [""]) || undefined) : undefined;
    // Run the engine over the realistic fileName/ocr; mockMarker=intent keeps
    // the result deterministic and varied across the six classifications.
    const classification = classifyMedia({ kind, mimeType, fileName, ocrText, mockMarker: intent });

    const conversationId = ctx.pick(input.conversationIds);
    const customerId = input.customerIdByConversation[conversationId];

    // Inbound dominates (customer-sent media); some outbound from sellers.
    const direction: IMediaAsset["direction"] = ctx.bool(0.75) ? "in" : "out";
    const authorType: IMediaAsset["authorType"] =
      direction === "in" ? "customer" : ctx.bool(0.7) ? "seller" : "sdr";

    const ageDays = ctx.int(0, 120);
    const createdAt = new Date(nowMs - ageDays * DAY_MS).toISOString();
    const sizeBytes = ctx.int(20_000, 4_000_000);

    // Sensitivity is auto-derived from classification (D-5/§5.5) — single
    // source of truth shared with the runtime paths (RF-021).
    const sensitivity: IMediaAsset["sensitivity"] = isSensitiveClassification(classification)
      ? "sensitive"
      : "normal";

    // ~15% are still in flight (not archived) → exercise the retry/persist UI.
    const persisted = !ctx.bool(0.15);

    // ~40% carry a Meta-style source expiry; bias a slice to the near future
    // so the expiry chip + urgency tiers (>14d / <=7d / <=2d) all show up.
    let sourceExpiresAt: string | undefined;
    if (ctx.bool(0.4)) {
      const inDays = pickWeighted(ctx, [
        { value: 1, weight: 2 },
        { value: 5, weight: 3 },
        { value: 12, weight: 3 },
        { value: 29, weight: 2 },
      ]);
      sourceExpiresAt = new Date(nowMs + inDays * DAY_MS).toISOString();
    }

    const hash = contentHash(mediaHashSeed({ messageId: `seed-${i}`, mimeType, sizeBytes, fileName }));

    const asset: IMediaAsset = {
      id: `media-${String(i + 1).padStart(4, "0")}`,
      storeId: input.storeId,
      conversationId,
      customerId,
      kind,
      mimeType,
      sizeBytes,
      fileName,
      authorType,
      direction,
      createdAt,
      storageRef: `ref-${hash}`,
      persisted,
      sourceExpiresAt,
      contentHash: hash,
      classification,
      ocrText,
      transcription: kind === "audio" ? ctx.pick(TRANSCRIPTIONS) : undefined,
      sensitivity,
      version: 1,
    };
    out.push(asset);
  }
  return out;
}
