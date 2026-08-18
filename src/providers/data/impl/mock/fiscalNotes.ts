import type { ID, IFiscalNote, IFiscalNoteItem } from "@/shared/types";
import type {
  ICreateFiscalNoteInput,
  IFiscalNotesProvider,
  IListFiscalNotesParams,
  IPostContext,
  IUpdateFiscalNoteItemPatch,
} from "../../contracts/fiscalNotes";
import { computePostEffects, validateForPosting } from "@/features/fiscal-notes/engine/postEffects";
import type { IPaginatedResult } from "../../contracts/_shared";

/**
 * Mock de notas fiscais de entrada (PRD-216).
 *
 * Reproduz a barreira que o banco impõe por unique index: chave de acesso
 * repetida é rejeitada. O mock precisa recusar tanto quanto o Supabase, senão
 * o comportamento diverge entre as duas fontes e o bug só aparece em produção.
 */

let notes: IFiscalNote[] = [];

/** Uso exclusivo de teste. */
export function __resetFiscalNotesMock(): void {
  notes = [];
}

/** Troca de estado entre `rascunho` e `conferencia`. Nota lançada é imutável. */
function setStatus(id: ID, status: IFiscalNote["status"], op: string): IFiscalNote {
  const current = notes.find((n) => n.id === id);
  if (!current) throw new Error(`[mock] fiscalNotes.${op}(${id}): nota não encontrada`);
  if (current.status === "lancada") {
    throw new Error(`[mock] fiscalNotes.${op}(${id}): nota lançada é imutável — estorne antes`);
  }
  const updated: IFiscalNote = { ...current, status, updatedAt: new Date().toISOString() };
  notes = notes.map((n) => (n.id === id ? updated : n));
  return updated;
}

export const mockFiscalNotesProvider: IFiscalNotesProvider = {
  async list(params: IListFiscalNotesParams = {}): Promise<IPaginatedResult<IFiscalNote>> {
    let rows = [...notes];
    if (params.storeId) rows = rows.filter((n) => n.storeId === params.storeId);
    if (params.status) rows = rows.filter((n) => n.status === params.status);
    if (params.supplierId) rows = rows.filter((n) => n.supplierId === params.supplierId);
    if (params.search) {
      const needle = params.search.toLowerCase();
      rows = rows.filter((n) => n.number.includes(needle) || n.accessKey.includes(needle));
    }
    rows.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    return {
      data: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
    };
  },

  async get(id: ID): Promise<IFiscalNote> {
    const found = notes.find((n) => n.id === id);
    if (!found) throw new Error(`[mock] fiscalNotes.get(${id}): nota não encontrada`);
    return found;
  },

  async findByAccessKey(accessKey: string): Promise<IFiscalNote | null> {
    return notes.find((n) => n.accessKey === accessKey) ?? null;
  },

  async create(input: ICreateFiscalNoteInput): Promise<IFiscalNote> {
    if (notes.some((n) => n.accessKey === input.accessKey)) {
      throw new Error(`[mock] fiscalNotes.create: chave de acesso ${input.accessKey} já importada`);
    }
    const id: ID = crypto.randomUUID();
    const now = new Date().toISOString();
    const { items, duplicates, ...header } = input;

    const note: IFiscalNote = {
      ...header,
      id,
      items: items.map((item) => ({ ...item, id: crypto.randomUUID(), noteId: id })),
      duplicates: duplicates.map((dup) => ({ ...dup, id: crypto.randomUUID() })),
      createdAt: now,
      updatedAt: now,
    };
    notes.push(note);
    return note;
  },

  async updateItem(itemId: ID, patch: IUpdateFiscalNoteItemPatch): Promise<IFiscalNoteItem> {
    for (const note of notes) {
      const current = note.items.find((item) => item.id === itemId);
      if (!current) continue;
      if (note.status === "lancada") {
        throw new Error(`[mock] fiscalNotes.updateItem(${itemId}): nota lançada é imutável`);
      }
      const updated: IFiscalNoteItem = { ...current, ...patch };
      note.items = note.items.map((item) => (item.id === itemId ? updated : item));
      note.updatedAt = new Date().toISOString();
      return updated;
    }
    throw new Error(`[mock] fiscalNotes.updateItem(${itemId}): item não encontrado`);
  },

  async markDraft(id: ID): Promise<IFiscalNote> {
    return setStatus(id, "rascunho", "markDraft");
  },

  async resumeFromDraft(id: ID): Promise<IFiscalNote> {
    return setStatus(id, "conferencia", "resumeFromDraft");
  },

  async remove(id: ID): Promise<void> {
    const current = notes.find((n) => n.id === id);
    if (!current) throw new Error(`[mock] fiscalNotes.remove(${id}): nota não encontrada`);
    if (current.status === "lancada") {
      throw new Error(`[mock] fiscalNotes.remove(${id}): nota lançada se estorna, não se apaga`);
    }
    // Some inteira: é o que libera a chave de acesso para o mesmo XML voltar.
    notes = notes.filter((n) => n.id !== id);
  },

  async post(id: ID, ctx: IPostContext): Promise<IFiscalNote> {
    const current = notes.find((n) => n.id === id);
    if (!current) throw new Error(`[mock] fiscalNotes.post(${id}): nota não encontrada`);
    if (current.status === "lancada") {
      throw new Error(`[mock] fiscalNotes.post(${id}): nota já lançada — corrigir é estornar`);
    }

    // Mesma validação que a RPC repete em SQL: item pendente, fator ausente ou
    // fracionamento sem destino barram o lançamento nas duas fontes.
    const validation = validateForPosting(current);
    if (!validation.ok) {
      throw new Error(
        `[mock] fiscalNotes.post(${id}): nota com ${validation.blockers.length} item(ns) por conferir`,
      );
    }

    // Calculado para o mock refletir o mesmo efeito da RPC. O catálogo em
    // memória é do chamador — aplicar aqui acoplaria as fatias do provider.
    computePostEffects(current, new Map(ctx.parts.map((part) => [part.id, part])));

    const now = new Date().toISOString();
    const updated: IFiscalNote = {
      ...current,
      status: "lancada",
      postedAt: now,
      postedBy: "mock-seller",
      updatedAt: now,
    };
    notes = notes.map((n) => (n.id === id ? updated : n));
    return updated;
  },

  async reverse(id: ID, _ctx: IPostContext): Promise<IFiscalNote> {
    const current = notes.find((n) => n.id === id);
    if (!current) throw new Error(`[mock] fiscalNotes.reverse(${id}): nota não encontrada`);
    if (current.status !== "lancada") {
      throw new Error(`[mock] fiscalNotes.reverse(${id}): só nota lançada pode ser estornada`);
    }

    const { postedAt: _postedAt, postedBy: _postedBy, ...rest } = current;
    const updated: IFiscalNote = {
      ...rest,
      status: "conferencia",
      updatedAt: new Date().toISOString(),
    };
    notes = notes.map((n) => (n.id === id ? updated : n));
    return updated;
  },
};
