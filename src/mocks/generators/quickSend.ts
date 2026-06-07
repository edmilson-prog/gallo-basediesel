import type {
  AssetCategory,
  AssetKind,
  AssetStatus,
  ID,
  IAssetCombo,
  IAssetLibraryItem,
  IQuickReply,
  ITrackableLink,
} from "@/shared/types";
import { contentHash } from "@/features/media/engine/contentHash";
import { buildShortRef, buildUtm } from "@/features/quick-send/engine/trackableLink";
import { pickWeighted, type ISeededContext } from "./utils";

const DAY_MS = 24 * 60 * 60 * 1000;

const BRANDS = ["Volvo", "Scania", "Mercedes-Benz", "Ford Cargo", "Iveco"] as const;

/** Product lines per category — realistic per the heavy-diesel domain. */
const PRODUCT_LINES = ["Freios", "Motor", "Embreagem", "Suspensão", "Filtros", "Elétrica"];

/** Title fragments per category, used to build readable, varied asset titles. */
const CATEGORY_TITLES: Record<AssetCategory, string> = {
  catalogo: "Catálogo",
  ficha_tecnica: "Ficha Técnica",
  tabela_preco: "Tabela de Preços",
  garantia: "Termo de Garantia",
  video: "Vídeo Demonstrativo",
  link: "Link",
};

/** A representative kind for each category. */
const CATEGORY_KIND: Record<AssetCategory, AssetKind> = {
  catalogo: "document",
  ficha_tecnica: "document",
  tabela_preco: "document",
  garantia: "document",
  video: "video",
  link: "link",
};

const CATEGORIES: AssetCategory[] = [
  "catalogo",
  "ficha_tecnica",
  "tabela_preco",
  "garantia",
  "video",
  "link",
];

export interface IGenerateAssetLibraryInput {
  count: number;
  storeId: ID;
  createdBy: ID;
  now: Date;
}

/**
 * Deterministic asset library across the five heavy-diesel brands and all six
 * categories. The first `CATEGORIES.length` items guarantee at least one of
 * every category; the rest are weighted toward catalogs/fichas. tabela_preco is
 * always `sensitivity: "sensitive"` (D-12). Files carry an obfuscated
 * `storageRef` (`ref-<hash>`); links carry a real-ish `url`. Most assets are
 * `published`; a minority `draft` so the picker exercises both states.
 */
export function generateAssetLibrary(
  ctx: ISeededContext,
  input: IGenerateAssetLibraryInput,
): IAssetLibraryItem[] {
  const out: IAssetLibraryItem[] = [];
  const nowMs = input.now.getTime();

  for (let i = 0; i < input.count; i += 1) {
    // Guarantee one of every category for the first N items, then weight.
    const category: AssetCategory =
      i < CATEGORIES.length
        ? CATEGORIES[i]!
        : pickWeighted<AssetCategory>(ctx, [
            { value: "catalogo", weight: 5 },
            { value: "ficha_tecnica", weight: 4 },
            { value: "garantia", weight: 2 },
            { value: "tabela_preco", weight: 2 },
            { value: "video", weight: 2 },
            { value: "link", weight: 3 },
          ]);

    const brand = ctx.pick(BRANDS);
    const productLine = ctx.pick(PRODUCT_LINES);
    const kind = CATEGORY_KIND[category];
    const title = `${CATEGORY_TITLES[category]} ${productLine} ${brand}`;

    const status: AssetStatus = ctx.bool(0.8) ? "published" : "draft";
    const sensitivity = category === "tabela_preco" ? "sensitive" : "normal";

    const ageDays = ctx.int(0, 200);
    const createdAt = new Date(nowMs - ageDays * DAY_MS).toISOString();
    const updatedAt = new Date(nowMs - ctx.int(0, ageDays) * DAY_MS).toISOString();

    const isLink = category === "link";
    const hash = contentHash(`${input.storeId}|${title}|${i}`);

    out.push({
      id: `asset-${String(i + 1).padStart(4, "0")}`,
      storeId: input.storeId,
      division: "parts",
      title,
      category,
      brand,
      productLine,
      kind,
      storageRef: isLink ? undefined : `ref-${hash}`,
      url: isLink ? `https://gallobasediesel.com.br/${category}/${hash}` : undefined,
      version: 1,
      status,
      sensitivity,
      createdBy: input.createdBy,
      createdAt,
      updatedAt,
    });
  }

  return out;
}

export interface IGenerateQuickRepliesInput {
  count: number;
  storeId: ID;
  sellerIds: ID[];
  now: Date;
}

/** Canonical shared snippets every seller sees (D-12 / RF-010). */
const SHARED_SNIPPETS: { shortcut: string; title: string; body: string }[] = [
  {
    shortcut: "/garantia",
    title: "Política de garantia",
    body: "Olá {{nome}}, a peça {{peca}} possui garantia de 6 meses contra defeitos de fabricação.",
  },
  {
    shortcut: "/frete",
    title: "Prazo de frete",
    body: "O frete para sua região sai hoje e chega em {{prazo}} dias úteis.",
  },
  {
    shortcut: "/prazo",
    title: "Prazo de entrega",
    body: "Confirmando: o prazo de entrega da {{peca}} é de {{prazo}} dias úteis.",
  },
  {
    shortcut: "/faturamento",
    title: "Dados de faturamento",
    body: "Para faturar, preciso confirmar a razão social e o CNPJ de {{nome}}.",
  },
];

const PRIVATE_SNIPPET_SEEDS: { shortcut: string; title: string; body: string }[] = [
  { shortcut: "/ola", title: "Saudação", body: "Bom dia, {{nome}}! Como posso ajudar hoje?" },
  { shortcut: "/pix", title: "Chave Pix", body: "Segue a chave Pix CNPJ para o pagamento." },
  { shortcut: "/obrigado", title: "Agradecimento", body: "Obrigado pela preferência, {{nome}}!" },
];

/**
 * Deterministic snippets. The four canonical `shared` snippets come first; the
 * rest are `private` per seller, cycling through realistic seeds. Determinism
 * holds for a given seed (RF-013).
 */
export function generateQuickReplies(
  ctx: ISeededContext,
  input: IGenerateQuickRepliesInput,
): IQuickReply[] {
  const out: IQuickReply[] = [];
  const nowMs = input.now.getTime();
  const owner = input.sellerIds[0] ?? "seller-joao-gallo";

  for (const s of SHARED_SNIPPETS) {
    const createdAt = new Date(nowMs - ctx.int(10, 200) * DAY_MS).toISOString();
    out.push({
      id: `qr-${String(out.length + 1).padStart(4, "0")}`,
      storeId: input.storeId,
      shortcut: s.shortcut,
      title: s.title,
      body: s.body,
      scope: "shared",
      ownerId: owner,
      createdAt,
      updatedAt: createdAt,
    });
  }

  let p = 0;
  while (out.length < input.count) {
    const seed = PRIVATE_SNIPPET_SEEDS[p % PRIVATE_SNIPPET_SEEDS.length]!;
    const sellerId =
      input.sellerIds.length > 0 ? input.sellerIds[p % input.sellerIds.length]! : owner;
    const suffix = Math.floor(p / PRIVATE_SNIPPET_SEEDS.length);
    const createdAt = new Date(nowMs - ctx.int(1, 120) * DAY_MS).toISOString();
    out.push({
      id: `qr-${String(out.length + 1).padStart(4, "0")}`,
      storeId: input.storeId,
      shortcut: suffix > 0 ? `${seed.shortcut}${suffix}` : seed.shortcut,
      title: seed.title,
      body: seed.body,
      scope: "private",
      ownerId: sellerId,
      createdAt,
      updatedAt: createdAt,
    });
    p += 1;
  }

  return out;
}

export interface IGenerateTrackableLinksInput {
  count: number;
  storeId: ID;
  assets: IAssetLibraryItem[];
  conversationIds: ID[];
  leadIdByConversation: Record<ID, ID | undefined>;
  createdBy: ID;
  now: Date;
}

/**
 * Deterministic trackable links bound to `link`-category assets and real
 * conversations. ~60% already have simulated `opens` (and a `lastOpenedAt`) so
 * the temperature/feedback surfaces have data on first load (D-8).
 */
export function generateTrackableLinks(
  ctx: ISeededContext,
  input: IGenerateTrackableLinksInput,
): ITrackableLink[] {
  const out: ITrackableLink[] = [];
  if (input.conversationIds.length === 0) return out;
  const nowMs = input.now.getTime();

  for (let i = 0; i < input.count; i += 1) {
    const conversationId = input.conversationIds[i % input.conversationIds.length]!;
    const leadId = input.leadIdByConversation[conversationId];
    const asset = input.assets.length > 0 ? input.assets[i % input.assets.length] : undefined;
    const targetUrl =
      asset?.url ?? `https://gallobasediesel.com.br/catalogo/${contentHash(`link-${i}`)}`;

    const ageDays = ctx.int(0, 60);
    const createdAt = new Date(nowMs - ageDays * DAY_MS).toISOString();
    const opened = ctx.bool(0.6);
    const opens = opened ? ctx.int(1, 8) : 0;
    const lastOpenedAt = opened
      ? new Date(nowMs - ctx.int(0, ageDays) * DAY_MS).toISOString()
      : undefined;

    out.push({
      id: `tl-${String(i + 1).padStart(4, "0")}`,
      storeId: input.storeId,
      assetId: asset?.id,
      conversationId,
      leadId,
      targetUrl,
      shortRef: buildShortRef(`tl-${i}-${input.storeId}`),
      utm: buildUtm({ source: "whatsapp", medium: "chat", campaign: asset?.category ?? "catalogo" }),
      createdBy: input.createdBy,
      opens,
      lastOpenedAt,
      createdAt,
    });
  }

  return out;
}

export interface IGenerateAssetCombosInput {
  count: number;
  storeId: ID;
  assets: IAssetLibraryItem[];
  ownerId: ID;
  now: Date;
}

const COMBO_TITLES = [
  "Kit Apresentação Volvo",
  "Pacote Pós-Venda",
  "Combo Garantia + Ficha",
  "Onboarding Cliente Novo",
  "Campanha Freios",
];

/**
 * Deterministic saved combos, each referencing 2–4 real published assets in a
 * preserved order (D-10).
 */
export function generateAssetCombos(
  ctx: ISeededContext,
  input: IGenerateAssetCombosInput,
): IAssetCombo[] {
  const out: IAssetCombo[] = [];
  const nowMs = input.now.getTime();
  const pool = input.assets.filter((a) => a.status === "published");
  const usable = pool.length > 0 ? pool : input.assets;
  if (usable.length === 0) return out;

  for (let i = 0; i < input.count; i += 1) {
    const size = Math.min(ctx.int(2, 4), usable.length);
    const assetIds: ID[] = [];
    for (let j = 0; j < size; j += 1) {
      const candidate = usable[(i + j * 3) % usable.length]!.id;
      if (!assetIds.includes(candidate)) assetIds.push(candidate);
    }
    const createdAt = new Date(nowMs - ctx.int(1, 90) * DAY_MS).toISOString();
    out.push({
      id: `combo-${String(i + 1).padStart(4, "0")}`,
      storeId: input.storeId,
      title: COMBO_TITLES[i % COMBO_TITLES.length]!,
      assetIds,
      ownerId: input.ownerId,
      createdAt,
      updatedAt: createdAt,
    });
  }

  return out;
}
