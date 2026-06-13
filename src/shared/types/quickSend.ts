import type { ID, ISO8601, IPaginatedResult } from "./common";

// Categoria e tipo do ativo
export type AssetCategory =
  | "catalogo"
  | "ficha_tecnica"
  | "tabela_preco"
  | "garantia"
  | "video"
  | "link";
export type AssetKind = "document" | "image" | "video" | "link";
export type AssetStatus = "published" | "draft" | "archived";
export type AssetSensitivity = "normal" | "sensitive";

export interface IAssetVersionSnapshot {
  version: number;
  storageRef?: string; // arquivo via PRD-026
  url?: string; // links
  updatedAt: ISO8601;
}

export interface IAssetLibraryItem {
  id: ID;
  storeId: ID;
  division: "parts" | "service" | "industrial"; // default "parts"
  title: string;
  category: AssetCategory;
  brand?: string; // Volvo | Scania | Mercedes-Benz | Ford Cargo | Iveco
  productLine?: string;
  kind: AssetKind;
  storageRef?: string; // arquivos (PRD-026); obfuscado, nunca URL real
  mediaAssetId?: ID; // referência ao IMediaAsset arquivado (quando upload)
  url?: string; // links
  version: number; // corrente
  previousVersion?: IAssetVersionSnapshot; // histórico mínimo (atual + anterior)
  status: AssetStatus;
  sensitivity: AssetSensitivity; // tabela_preco default "sensitive"
  allowedRoleIds?: ID[]; // RBAC por ativo (vazio = regra padrão por papel)
  createdBy: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export interface IQuickReply {
  id: ID;
  storeId: ID;
  shortcut: string; // ex.: "/garantia"
  title: string;
  body: string; // texto com placeholders {{...}}
  scope: "private" | "shared";
  ownerId: ID;
  allowedRoleIds?: ID[];
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export interface ITrackableLink {
  id: ID;
  storeId: ID;
  assetId?: ID; // IAssetLibraryItem (quando origem é ativo "link")
  conversationId?: ID;
  leadId?: ID; // alvo da elevação de temperatura
  targetUrl: string;
  shortRef: string; // simulado
  utm?: { source: string; medium: string; campaign: string };
  createdBy: ID;
  opens: number; // simulado na Fase 1
  lastOpenedAt?: ISO8601;
  createdAt: ISO8601;
}

export interface IAssetCombo {
  id: ID;
  storeId: ID;
  title: string;
  assetIds: ID[]; // ordem preservada
  ownerId: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export type ScheduledSendStatus = "draft" | "pending" | "sent" | "cancelled" | "failed";

/** Media kinds a scheduled message can carry (1 attachment per message in Fase 1). */
export type ScheduledMediaType = "image" | "video" | "audio" | "document";

export interface IScheduledSend {
  id: ID;
  storeId: ID;
  conversationId: ID;
  /** Null only for drafts; pending/sent/failed always carry a time. */
  scheduledFor: ISO8601 | null;
  payload: {
    type: "snippet" | "media" | "asset" | "combo" | "product";
    /** Plain text (snippet) OR caption (media). */
    contextMessage?: string;
    // media fields (type === "media"):
    /** Object path in the whatsapp-media bucket (IMediaAsset.storageRef). */
    mediaPath?: string;
    mediaType?: ScheduledMediaType;
    /** Original filename — labels documents on the recipient side. */
    fileName?: string;
    // legacy kinds (unchanged):
    assetIds?: ID[];
    quickReplyId?: ID;
    productId?: ID;
  };
  status: ScheduledSendStatus;
  failureReason?: string;
  createdBy: ID;
  createdAt: ISO8601;
}

/** Scheduled row enriched with its recipient — used by the global queue. */
export interface IScheduledSendWithContext extends IScheduledSend {
  customerName: string | null;
  customerPhone: string | null;
}

// ---- Provider contracts (co-located here so contracts/* re-export them) ----

export interface IAssetLibraryListParams {
  storeId?: ID;
  category?: AssetCategory;
  brand?: string;
  productLine?: string;
  status?: AssetStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}
export interface IAssetLibraryProvider {
  list(filter: IAssetLibraryListParams): Promise<IPaginatedResult<IAssetLibraryItem>>;
  get(id: ID): Promise<IAssetLibraryItem | null>;
  search(query: string): Promise<IAssetLibraryItem[]>;
  getRecent(sellerId: ID): Promise<IAssetLibraryItem[]>;
  getFavorites(sellerId: ID): Promise<IAssetLibraryItem[]>;
  toggleFavorite(sellerId: ID, id: ID): Promise<boolean>; // novo estado
  create(
    input: Omit<IAssetLibraryItem, "id" | "storeId" | "createdAt" | "updatedAt">,
  ): Promise<IAssetLibraryItem>;
  update(id: ID, patch: Partial<IAssetLibraryItem>): Promise<IAssetLibraryItem>;
  publish(id: ID): Promise<IAssetLibraryItem>;
  unpublish(id: ID): Promise<IAssetLibraryItem>;
  bumpVersion(
    id: ID,
    patch: Pick<IAssetLibraryItem, "storageRef" | "url">,
  ): Promise<IAssetLibraryItem>;
  delete(id: ID): Promise<IAssetLibraryItem>;
  // combos
  listCombos(storeId?: ID): Promise<IAssetCombo[]>;
  saveCombo(
    input: Omit<IAssetCombo, "id" | "storeId" | "createdAt" | "updatedAt">,
  ): Promise<IAssetCombo>;
  deleteCombo(id: ID): Promise<IAssetCombo>;
  recordSend(sellerId: ID, assetId: ID): Promise<void>; // alimenta recentes + estatística
  // Management usage stats (D-13, RF-025). The feature hook consumes this via
  // the provider (the only layer allowed to bridge `@/mocks` — ESLint boundary).
  // Fase 1 aggregates ALL recorded sends; from/to are forward-compat (unused).
  getUsageStats(params?: { from?: ISO8601; to?: ISO8601 }): Promise<{
    topAssets: { assetId: ID; title: string; count: number }[];
    bySeller: { sellerId: ID; count: number }[];
  }>;
}

export interface IQuickReplyProvider {
  list(params: {
    storeId?: ID;
    sellerId?: ID;
    scope?: "private" | "shared";
  }): Promise<IQuickReply[]>;
  get(id: ID): Promise<IQuickReply | null>;
  findByShortcut(shortcut: string, sellerId: ID): Promise<IQuickReply | null>;
  create(input: Omit<IQuickReply, "id" | "storeId" | "createdAt" | "updatedAt">): Promise<IQuickReply>;
  update(id: ID, patch: Partial<IQuickReply>): Promise<IQuickReply>;
  delete(id: ID): Promise<IQuickReply>;
}

export interface ITrackableLinkProvider {
  create(input: Omit<ITrackableLink, "id" | "storeId" | "createdAt" | "opens">): Promise<ITrackableLink>;
  get(id: ID): Promise<ITrackableLink | null>;
  listByConversation(conversationId: ID): Promise<ITrackableLink[]>;
  registerOpen(id: ID): Promise<ITrackableLink>; // incrementa opens/lastOpenedAt
}

export interface IScheduledSendProvider {
  list(conversationId: ID): Promise<IScheduledSend[]>;
  listDue(now: ISO8601): Promise<IScheduledSend[]>;
  create(
    input: Omit<IScheduledSend, "id" | "storeId" | "status" | "createdAt"> & {
      /** Default "pending"; pass "draft" to save without a time. */
      status?: Extract<ScheduledSendStatus, "draft" | "pending">;
    },
  ): Promise<IScheduledSend>;
  update(id: ID, patch: Partial<IScheduledSend>): Promise<IScheduledSend>;
  cancel(id: ID): Promise<IScheduledSend>;
  markSent(id: ID): Promise<IScheduledSend>;
  markFailed(id: ID, reason: string): Promise<IScheduledSend>;
  /**
   * Store-wide scheduled queue with recipient context (Owner/Gestor only — the
   * role gate is in the UI). Store-scoped by RLS, so no extra security boundary.
   * Defaults to pending rows.
   */
  listStore(params?: { status?: ScheduledSendStatus[] }): Promise<IScheduledSendWithContext[]>;
}
