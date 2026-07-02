import type { ID, IConversationTag } from "@/shared/types";
import { getMockState } from "@/mocks/store/mockStore";
import type {
  IConversationTagsProvider,
  ICreateConversationTagInput,
  IListConversationTagsParams,
  IUpdateConversationTagInput,
} from "../../contracts/conversationTags";

/**
 * Mock implementation of {@link IConversationTagsProvider}. Self-contained
 * module-level catalog (same rationale as messageTemplates): the catalog is a
 * Fase-2 admin entity; conversations reference the ids below from the
 * scripted-conversation seeds. usageCount counts against the live mockStore.
 */

const SEED_STORE_ID = "00000000-0000-0000-0000-000000000001";
const MOCK_LATENCY_MS = 120;
const SEED_TS = "2026-06-01T12:00:00.000Z";

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
}

function seedTag(id: string, label: string, color: string): IConversationTag {
  return {
    id,
    storeId: SEED_STORE_ID,
    label,
    color,
    archived: false,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  };
}

function buildSeeds(): IConversationTag[] {
  return [
    seedTag("ctag-garantia", "Garantia", "teal"),
    seedTag("ctag-orcamento", "Orçamento enviado", "violet"),
    seedTag("ctag-aguardando-peca", "Aguardando peça", "orange"),
    seedTag("ctag-revenda", "Revenda", "blue"),
    seedTag("ctag-pos-venda", "Pós-venda", "pink"),
    seedTag("ctag-negociacao", "Em negociação", "indigo"),
  ];
}

let catalog: IConversationTag[] = buildSeeds();

/** Test-only: restore the deterministic seed catalog. */
export function __resetConversationTagsForTests(): void {
  catalog = buildSeeds();
}

function sorted(tags: IConversationTag[]): IConversationTag[] {
  return [...tags].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export const mockConversationTagsProvider: IConversationTagsProvider = {
  async list(params?: IListConversationTagsParams): Promise<IConversationTag[]> {
    await delay();
    return sorted(
      catalog.filter((tag) => {
        if (params?.storeId && tag.storeId !== params.storeId) return false;
        if (params?.activeOnly && tag.archived) return false;
        return true;
      }),
    );
  },

  async create(input: ICreateConversationTagInput): Promise<IConversationTag> {
    await delay();
    const now = new Date().toISOString();
    const tag: IConversationTag = {
      id: `ctag-${crypto.randomUUID()}`,
      storeId: input.storeId ?? SEED_STORE_ID,
      label: input.label,
      color: input.color,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    catalog.push(tag);
    return tag;
  },

  async update(id: ID, input: IUpdateConversationTagInput): Promise<IConversationTag> {
    await delay();
    const found = catalog.find((tag) => tag.id === id);
    if (!found) throw new Error(`Tag não encontrada: ${id}`);
    if (input.label !== undefined) found.label = input.label;
    if (input.color !== undefined) found.color = input.color;
    if (input.archived !== undefined) found.archived = input.archived;
    found.updatedAt = new Date().toISOString();
    return { ...found };
  },

  async delete(id: ID): Promise<void> {
    await delay();
    catalog = catalog.filter((tag) => tag.id !== id);
  },

  async usageCount(storeId?: ID): Promise<Record<ID, number>> {
    await delay();
    const conversations = getMockState().conversations.filter(
      (c) => !storeId || c.storeId === storeId,
    );
    const usage: Record<ID, number> = {};
    for (const tag of catalog) usage[tag.id] = 0;
    for (const conversation of conversations) {
      for (const tagId of conversation.tags) {
        if (tagId in usage) usage[tagId] = (usage[tagId] ?? 0) + 1;
      }
    }
    return usage;
  },
};
