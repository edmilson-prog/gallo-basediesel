import type { FiscalNoteStatus, ID, IFiscalNote, IFiscalNoteItem, IPart } from "@/shared/types";
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
 * Catálogo necessário para calcular o efeito do lançamento, resolvido pelo
 * chamador. O mock aplica o efeito sobre estas peças; o Supabase ignora,
 * porque o Postgres já tem o catálogo.
 */
export interface IPostContext {
  parts: IPart[];
}

/**
 * Contract de acesso a notas fiscais de entrada (PRD-216).
 *
 * `remove` apaga de verdade — linha, filhos (por cascade) e o XML no bucket —
 * e com isso libera a chave de acesso para o mesmo arquivo entrar de novo. A
 * trilha sobrevive na auditoria, não na tabela. Nota lançada não pode ser
 * apagada: estorne primeiro.
 *
 * `post` e `reverse` são transacionais: no Supabase, uma RPC `security
 * definer`; no mock, a mesma validação do engine antes de mudar qualquer coisa.
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
  /** Estaciona a nota fora da fila de conferência, preservando tudo. */
  markDraft(id: ID): Promise<IFiscalNote>;
  /** Devolve o rascunho para a fila de conferência. */
  resumeFromDraft(id: ID): Promise<IFiscalNote>;
  /**
   * Apaga a nota e libera a chave de acesso. Recusa nota lançada — essa
   * estorna. O chamador é responsável por registrar a auditoria ANTES, porque
   * depois não há mais o que ler.
   */
  remove(id: ID): Promise<void>;
  /**
   * Lança a nota (RF-100): valida, aplica saldo e custo médio, grava o que a
   * conferência aprendeu e marca a nota imutável. Recusa com erro explícito
   * quando há item pendente.
   */
  post(id: ID, ctx: IPostContext): Promise<IFiscalNote>;
  /** Estorna (RF-101): desfaz o efeito e devolve a nota para conferência. */
  reverse(id: ID, ctx: IPostContext): Promise<IFiscalNote>;
}
