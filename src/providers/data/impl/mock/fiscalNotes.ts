import type { ID, IFiscalNote, IFiscalNoteItem } from "@/shared/types";
import type {
  ICreateFiscalNoteInput,
  IFiscalNotesProvider,
  IListFiscalNotesParams,
  IUpdateFiscalNoteItemPatch,
} from "../../contracts/fiscalNotes";
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
      const index = note.items.findIndex((item) => item.id === itemId);
      if (index === -1) continue;
      if (note.status !== "conferencia") {
        throw new Error(`[mock] fiscalNotes.updateItem(${itemId}): nota ${note.status} é imutável`);
      }
      note.items[index] = { ...note.items[index], ...patch };
      note.updatedAt = new Date().toISOString();
      return note.items[index];
    }
    throw new Error(`[mock] fiscalNotes.updateItem(${itemId}): item não encontrado`);
  },

  async cancel(id: ID): Promise<IFiscalNote> {
    const index = notes.findIndex((n) => n.id === id);
    if (index === -1) throw new Error(`[mock] fiscalNotes.cancel(${id}): nota não encontrada`);
    if (notes[index].status === "lancada") {
      throw new Error(`[mock] fiscalNotes.cancel(${id}): nota lançada se estorna, não se cancela`);
    }
    notes[index] = { ...notes[index], status: "cancelada", updatedAt: new Date().toISOString() };
    return notes[index];
  },
};
