import type {
  ID,
  IListMediaParams,
  IMediaAnnotation,
  IMediaAsset,
  IMediaClassification,
  IMediaUploadInput,
  IMessage,
} from "@/shared/types";
import type { IMediaStorageProvider } from "../../contracts/mediaStorage";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { contentHash, mediaHashSeed } from "@/features/media/engine/contentHash";
import { classifyMedia } from "@/features/media/engine/classifyMedia";
import { isSensitiveClassification } from "@/features/media/engine/sensitiveAccess";

/**
 * Supabase implementation of {@link IMediaStorageProvider} (PRD-026, "Vault").
 *
 * snake_case `media_assets` table ↔ camelCase {@link IMediaAsset} via
 * `rowToMediaAsset`. `annotations` is an array of objects so it lives in a
 * jsonb column; the polymorphic `linked*` ids are plain text (no FK — they may
 * point at vehicles/orders/parts that are not always present). The obfuscated
 * `storageRef` (RNF-008) is a plain text column — never a real URL/credential.
 *
 * The dedup + classification logic of `ensureFromMessage`/`upload` is shared
 * with the mock layer through the pure `@/features/media/engine/*` helpers so a
 * generated asset and an inbound message resolve to the same content hash.
 *
 * Two ops carry Fase-2 caveats vs. the mock:
 *  - `getSignedUrl`: the RBAC gate (sensitive-without-permission → redacted
 *    placeholder, D-4) moves server-side under PRD-026 RNF-007 (Supabase
 *    Storage signed URLs + RLS). Here we only mint an opaque, signed-looking ref
 *    from the persisted `storage_ref`; the sensitivity gate is enforced by the
 *    storage policy, not the client.
 *  - `delete`: returns the deleted row (read-then-delete) to honor the contract
 *    `Promise<IMediaAsset>` shape.
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (upload/update/delete/ensureFromMessage) require the write policies that land
 * with PRD-103.
 */

interface MediaAssetRow {
  id: string;
  store_id: string;
  conversation_id: string | null;
  customer_id: string | null;
  message_id: string | null;
  kind: IMediaAsset["kind"];
  mime_type: string;
  size_bytes: number;
  file_name: string | null;
  author_type: IMediaAsset["authorType"];
  direction: IMediaAsset["direction"];
  created_at: string;
  storage_ref: string;
  persisted: boolean;
  source_expires_at: string | null;
  content_hash: string | null;
  classification: IMediaClassification | null;
  linked_vehicle_id: string | null;
  linked_order_id: string | null;
  linked_part_id: string | null;
  ocr_text: string | null;
  transcription: string | null;
  sensitivity: IMediaAsset["sensitivity"];
  annotations: IMediaAnnotation[] | null;
  version: number | null;
}

const TABLE = "media_assets";
const COLUMNS =
  "id, store_id, conversation_id, customer_id, message_id, kind, mime_type, size_bytes, " +
  "file_name, author_type, direction, created_at, storage_ref, persisted, source_expires_at, " +
  "content_hash, classification, linked_vehicle_id, linked_order_id, linked_part_id, ocr_text, " +
  "transcription, sensitivity, annotations, version";

function rowToMediaAsset(row: MediaAssetRow): IMediaAsset {
  return {
    id: row.id,
    storeId: row.store_id,
    conversationId: row.conversation_id ?? undefined,
    customerId: row.customer_id ?? undefined,
    messageId: row.message_id ?? undefined,
    kind: row.kind,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    fileName: row.file_name ?? undefined,
    authorType: row.author_type,
    direction: row.direction,
    createdAt: row.created_at,
    storageRef: row.storage_ref,
    persisted: row.persisted,
    sourceExpiresAt: row.source_expires_at ?? undefined,
    contentHash: row.content_hash ?? undefined,
    classification: row.classification ?? undefined,
    linkedVehicleId: row.linked_vehicle_id ?? undefined,
    linkedOrderId: row.linked_order_id ?? undefined,
    linkedPartId: row.linked_part_id ?? undefined,
    ocrText: row.ocr_text ?? undefined,
    transcription: row.transcription ?? undefined,
    sensitivity: row.sensitivity,
    annotations: row.annotations ?? undefined,
    version: row.version ?? undefined,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`storeId`/`createdAt` are
 *  immutable and never written. */
function mediaPatchToRow(patch: Partial<IMediaAsset>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.conversationId !== undefined) row.conversation_id = patch.conversationId;
  if (patch.customerId !== undefined) row.customer_id = patch.customerId;
  if (patch.messageId !== undefined) row.message_id = patch.messageId;
  if (patch.kind !== undefined) row.kind = patch.kind;
  if (patch.mimeType !== undefined) row.mime_type = patch.mimeType;
  if (patch.sizeBytes !== undefined) row.size_bytes = patch.sizeBytes;
  if (patch.fileName !== undefined) row.file_name = patch.fileName;
  if (patch.authorType !== undefined) row.author_type = patch.authorType;
  if (patch.direction !== undefined) row.direction = patch.direction;
  if (patch.storageRef !== undefined) row.storage_ref = patch.storageRef;
  if (patch.persisted !== undefined) row.persisted = patch.persisted;
  if (patch.sourceExpiresAt !== undefined) row.source_expires_at = patch.sourceExpiresAt;
  if (patch.contentHash !== undefined) row.content_hash = patch.contentHash;
  if (patch.classification !== undefined) row.classification = patch.classification;
  if (patch.linkedVehicleId !== undefined) row.linked_vehicle_id = patch.linkedVehicleId;
  if (patch.linkedOrderId !== undefined) row.linked_order_id = patch.linkedOrderId;
  if (patch.linkedPartId !== undefined) row.linked_part_id = patch.linkedPartId;
  if (patch.ocrText !== undefined) row.ocr_text = patch.ocrText;
  if (patch.transcription !== undefined) row.transcription = patch.transcription;
  if (patch.sensitivity !== undefined) row.sensitivity = patch.sensitivity;
  if (patch.annotations !== undefined) row.annotations = patch.annotations;
  if (patch.version !== undefined) row.version = patch.version;
  return row;
}

/** Builds the full insert row for a freshly minted {@link IMediaAsset}. */
function assetToRow(asset: IMediaAsset): Record<string, unknown> {
  return {
    id: asset.id,
    store_id: asset.storeId,
    conversation_id: asset.conversationId ?? null,
    customer_id: asset.customerId ?? null,
    message_id: asset.messageId ?? null,
    kind: asset.kind,
    mime_type: asset.mimeType,
    size_bytes: asset.sizeBytes,
    file_name: asset.fileName ?? null,
    author_type: asset.authorType,
    direction: asset.direction,
    created_at: asset.createdAt,
    storage_ref: asset.storageRef,
    persisted: asset.persisted,
    source_expires_at: asset.sourceExpiresAt ?? null,
    content_hash: asset.contentHash ?? null,
    classification: asset.classification ?? null,
    linked_vehicle_id: asset.linkedVehicleId ?? null,
    linked_order_id: asset.linkedOrderId ?? null,
    linked_part_id: asset.linkedPartId ?? null,
    ocr_text: asset.ocrText ?? null,
    transcription: asset.transcription ?? null,
    sensitivity: asset.sensitivity,
    annotations: asset.annotations ?? null,
    version: asset.version ?? null,
  };
}

/** Map a media kind to a representative mime when the caller omits one
 *  (mirrors `mediaApi.defaultMime` so the dedup hash matches the mock). */
function defaultMime(kind: IMediaAsset["kind"]): string {
  switch (kind) {
    case "image":
      return "image/jpeg";
    case "audio":
      return "audio/ogg";
    case "video":
      return "video/mp4";
    case "document":
      return "application/pdf";
  }
}

/** Reads a single asset by id, or undefined when absent (404, not an error). */
async function fetchAssetById(id: ID): Promise<IMediaAsset | undefined> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`[supabase] media.get(${id}) failed: ${error.message}`);
  if (!data) return undefined;
  return rowToMediaAsset(data as unknown as MediaAssetRow);
}

/** Finds an existing asset by exact message id (dedup, D-3). */
async function fetchAssetByMessageId(messageId: ID): Promise<IMediaAsset | undefined> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .select(COLUMNS)
    .eq("message_id", messageId)
    .limit(1)
    .maybeSingle();
  if (error)
    throw new Error(
      `[supabase] media.ensureFromMessage (by messageId ${messageId}) failed: ${error.message}`,
    );
  if (!data) return undefined;
  return rowToMediaAsset(data as unknown as MediaAssetRow);
}

/** Finds an existing asset by content hash (dedup, D-3). */
async function fetchAssetByContentHash(hash: string): Promise<IMediaAsset | undefined> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .select(COLUMNS)
    .eq("content_hash", hash)
    .limit(1)
    .maybeSingle();
  if (error)
    throw new Error(
      `[supabase] media.ensureFromMessage (by contentHash ${hash}) failed: ${error.message}`,
    );
  if (!data) return undefined;
  return rowToMediaAsset(data as unknown as MediaAssetRow);
}

export const supabaseMediaProvider: IMediaStorageProvider = {
  async list(filter: IListMediaParams): Promise<IPaginatedResult<IMediaAsset>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (filter.storeId !== undefined) query = query.eq("store_id", filter.storeId);
    if (filter.conversationId !== undefined)
      query = query.eq("conversation_id", filter.conversationId);
    if (filter.customerId !== undefined) query = query.eq("customer_id", filter.customerId);
    if (filter.kind !== undefined) query = query.eq("kind", filter.kind);
    if (filter.classification !== undefined)
      query = query.eq("classification", filter.classification);
    if (filter.authorType !== undefined) query = query.eq("author_type", filter.authorType);
    if (filter.from !== undefined) query = query.gte("created_at", filter.from);
    if (filter.to !== undefined) query = query.lte("created_at", filter.to);
    if (filter.search) {
      const term = `%${filter.search}%`;
      query = query.or(
        `file_name.ilike.${term},ocr_text.ilike.${term},transcription.ilike.${term}`,
      );
    }

    const { data, error, count } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(`[supabase] media.list failed: ${error.message}`);

    const rows = data as unknown as MediaAssetRow[];
    return {
      data: rows.map(rowToMediaAsset),
      total: count ?? rows.length,
      page: 1,
      pageSize: rows.length,
    };
  },

  async get(assetId: ID): Promise<IMediaAsset | null> {
    const asset = await fetchAssetById(assetId);
    return asset ?? null;
  },

  /**
   * Mints an opaque, signed-looking ref from the persisted `storage_ref` —
   * NEVER a real URL/credential. Under PRD-026 RNF-007 the real signed URL and
   * the D-4 sensitivity gate are produced server-side by Supabase Storage + RLS;
   * the client never sees the bytes of a sensitive asset it cannot view.
   */
  async getSignedUrl(assetId: ID): Promise<string> {
    const asset = await fetchAssetById(assetId);
    if (!asset) throw new Error(`[supabase] media.getSignedUrl(${assetId}) failed: not found`);
    return `supabase-signed://${asset.storageRef}?exp=${Date.now() + 5 * 60_000}`;
  },

  async delete(assetId: ID): Promise<IMediaAsset> {
    const before = await fetchAssetById(assetId);
    if (!before) throw new Error(`[supabase] media.delete(${assetId}) failed: not found`);
    const { error } = await getSupabaseClient().from(TABLE).delete().eq("id", assetId);
    if (error) throw new Error(`[supabase] media.delete(${assetId}) failed: ${error.message}`);
    return before;
  },

  async update(assetId: ID, patch: Partial<IMediaAsset>): Promise<IMediaAsset> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update(mediaPatchToRow(patch))
      .eq("id", assetId)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] media.update(${assetId}) failed: ${error.message}`);
    return rowToMediaAsset(data as unknown as MediaAssetRow);
  },

  async upload(input: IMediaUploadInput): Promise<IMediaAsset> {
    // `storeId` is injected by the mock provider via withCreateStoreId; in the
    // Supabase path the caller-facing contract carries no storeId, so it is
    // resolved server-side from the session/RLS context. The persisted row must
    // still carry one — read it from the (provider-augmented) input when present.
    const storeId = (input as IMediaUploadInput & { storeId?: ID }).storeId;
    if (!storeId) {
      throw new Error(
        "[supabase] media.upload failed: missing storeId — the active store must be " +
          "resolved before archival (injected by the multistore context, mirrors withCreateStoreId).",
      );
    }
    const hash =
      input.contentHash ??
      contentHash(
        mediaHashSeed({
          messageId: input.messageId,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          fileName: input.fileName,
        }),
      );
    const asset: IMediaAsset = {
      id: `media-${crypto.randomUUID()}`,
      storeId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      messageId: input.messageId,
      kind: input.kind,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      fileName: input.fileName,
      authorType: input.authorType,
      direction: input.direction,
      createdAt: new Date().toISOString(),
      storageRef: `ref-${hash}`,
      persisted: true,
      sourceExpiresAt: input.sourceExpiresAt,
      contentHash: hash,
      classification: input.classification,
      // RF-021: nota_fiscal/comprovante are auto-tagged sensitive at creation.
      sensitivity: isSensitiveClassification(input.classification) ? "sensitive" : "normal",
      version: 1,
    };
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(assetToRow(asset))
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] media.upload failed: ${error.message}`);
    return rowToMediaAsset(data as unknown as MediaAssetRow);
  },

  /**
   * Idempotent inbound archival. Dedups by messageId first, then contentHash
   * (D-3) — returning the existing asset when found. The kind/mime/size/hash
   * derivation mirrors the mock so generated assets and inbound messages
   * collapse to the same content hash. `storeId` is resolved server-side
   * (session/RLS) rather than from the multistore context.
   */
  async ensureFromMessage(message: IMessage): Promise<IMediaAsset> {
    const existingByMsg = await fetchAssetByMessageId(message.id);
    if (existingByMsg) return existingByMsg;

    // Normalize sticker -> image so the 4-kind invariant holds.
    const rawType = message.mediaType ?? "image";
    const kind = (rawType === "sticker" ? "image" : rawType) as IMediaAsset["kind"];
    const mimeType = defaultMime(kind);
    const sizeBytes = 64_000;
    const hash = contentHash(mediaHashSeed({ messageId: message.id, mimeType, sizeBytes }));

    const existingByHash = await fetchAssetByContentHash(hash);
    if (existingByHash) return existingByHash;

    const storeId = (message as IMessage & { storeId?: ID }).storeId;
    if (!storeId) {
      throw new Error(
        "[supabase] media.ensureFromMessage failed: missing storeId — the active store must " +
          "be resolved before archival (provided by the multistore context server-side).",
      );
    }

    const classification = classifyMedia({
      kind,
      mimeType,
      fileName: message.mediaUrl,
      ocrText: message.text,
    });
    const asset: IMediaAsset = {
      id: `media-${crypto.randomUUID()}`,
      storeId,
      conversationId: message.conversationId,
      messageId: message.id,
      kind,
      mimeType,
      sizeBytes,
      authorType: message.authorType,
      direction: message.direction,
      createdAt: message.sentAt,
      storageRef: `ref-${hash}`,
      persisted: true,
      contentHash: hash,
      classification,
      // RF-021/§5.5/D-4: nota_fiscal & comprovante are auto-tagged sensitive.
      sensitivity: isSensitiveClassification(classification) ? "sensitive" : "normal",
      version: 1,
    };
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(assetToRow(asset))
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] media.ensureFromMessage(${message.id}) failed: ${error.message}`);
    return rowToMediaAsset(data as unknown as MediaAssetRow);
  },
};
