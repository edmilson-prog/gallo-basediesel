import type { FiscalNoteStatus, ID, IFiscalNote, IFiscalNoteItem } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListFiscalNotesParams extends IPaginationParams {
  status?: FiscalNoteStatus;
  supplierId?: ID;
  storeId?: ID;
  search?: string;
}

export type ICreateFiscalNoteInput = Omit<
  IFiscalNote,
  "id" | "createdAt" | "updatedAt" | "postedAt" | "postedBy" | "items" | "duplicates"
> & {
  items: Array<Omit<IFiscalNoteItem, "id" | "noteId">>;
  duplicates: Array<{ number: string; dueDate: string; amount: number }>;
};

export type IUpdateFiscalNoteItemPatch = Partial<
  Pick<
    IFiscalNoteItem,
    | "linkMode"
    | "partId"
    | "newPartDraft"
    | "conversionMode"
    | "conversionFactor"
    | "conversionUnit"
    | "conversionTargetPartId"
    | "confirmed"
  >
>;

/**
 * Contract de acesso a notas fiscais de entrada (PRD-216).
 *
 * Não há `delete`: nota lançada é imutável e nota em conferência se cancela,
 * não se apaga — o XML já foi arquivado e a trilha tem de sobreviver.
 *
 * `post` e `reverse` não existem nesta fase: são a RPC transacional da Fase 3.
 *
 * @see ../impl/mock/fiscalNotes.ts
 * @see ../../../../docs/prds/PRD-216-notas-fiscais-entrada.md
 */
export interface IFiscalNotesProvider {
  list(params?: IListFiscalNotesParams): Promise<IPaginatedResult<IFiscalNote>>;
  get(id: ID): Promise<IFiscalNote>;
  /** `null` quando a chave ainda não existe. Barreira anti-reentrada de XML. */
  findByAccessKey(accessKey: string): Promise<IFiscalNote | null>;
  create(input: ICreateFiscalNoteInput): Promise<IFiscalNote>;
  updateItem(itemId: ID, patch: IUpdateFiscalNoteItemPatch): Promise<IFiscalNoteItem>;
  cancel(id: ID): Promise<IFiscalNote>;
}
