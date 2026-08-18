import type { Division, ID, ISO8601, Money } from "./common";

/** Ciclo da nota. `lancada` é terminal — corrigir é estornar. */
export type FiscalNoteStatus = "conferencia" | "lancada" | "cancelada";

/** Por onde o XML entrou. `manual` é reservado, sem produtor na Fase 1. */
export type FiscalNoteOrigin = "upload" | "upload_edge" | "email" | "sefaz" | "manual";

/** Origem de ingestão na fila. Espelha `FiscalNoteOrigin` menos `manual`. */
export type IngestionSource = "upload" | "upload_edge" | "email" | "sefaz";

/** Estado do vínculo entre o item da nota e o catálogo. */
export type ItemLinkMode = "auto" | "ia" | "novo" | "pend";

/** Como a unidade da nota vira unidade de estoque. */
export type ItemConversionMode = "direto" | "conv" | "frac";

/** Duplicata lida do XML. Vira título no contas a pagar em PRD futuro. */
export interface IFiscalNoteDuplicate {
  id: ID;
  number: string;
  dueDate: ISO8601;
  amount: Money;
}

/** Rascunho de peça nova, preenchido na conferência e materializado no lançamento. */
export interface INewPartDraft {
  name: string;
  unitOfMeasure: string;
}

/**
 * Item da nota. Os campos até `totalValue` são o que veio no XML e nunca mudam;
 * o resto são as decisões da conferência.
 */
export interface IFiscalNoteItem {
  id: ID;
  noteId: ID;
  seq: number;
  /** `cProd` — código do produto no fornecedor. */
  supplierCode: string;
  description: string;
  ncm?: string;
  cfop?: string;
  ean?: string;
  /** `uCom` — unidade comercial da nota (CX, PCT, BD, TB, UN…). */
  unit: string;
  quantity: number;
  unitValue: Money;
  totalValue: Money;

  linkMode: ItemLinkMode;
  partId?: ID;
  newPartDraft?: INewPartDraft;

  conversionMode: ItemConversionMode;
  /** Unidades por embalagem (`conv`) ou rendimento (`frac`). `null` bloqueia o lançamento. */
  conversionFactor: number | null;
  conversionUnit?: string;
  /** SKU de destino quando `conversionMode === 'frac'`. */
  conversionTargetPartId?: ID;

  /** 0–100. Presente apenas quando `linkMode === 'ia'`. */
  aiConfidence?: number;
  /** Evidência escrita da sugestão, mostrada ao conferente. */
  aiEvidence?: string;
  /** Aviso não bloqueante (ex.: NCM divergente do cadastro). */
  alert?: string;

  confirmed: boolean;
}

/** Nota fiscal de entrada. */
export interface IFiscalNote {
  id: ID;
  storeId: ID;
  /** 44 dígitos. Unique — é o que impede o mesmo XML entrar duas vezes. */
  accessKey: string;
  number: string;
  series: string;
  supplierId: ID;
  issuedAt: ISO8601;
  enteredAt: ISO8601;
  status: FiscalNoteStatus;
  origin: FiscalNoteOrigin;

  freight: Money;
  ipi: Money;
  discount: Money;
  productsTotal: Money;
  total: Money;

  items: IFiscalNoteItem[];
  duplicates: IFiscalNoteDuplicate[];

  /** Caminho do XML original no bucket privado `fiscal-xml`. */
  xmlPath?: string;

  postedAt?: ISO8601;
  /**
   * Id do **vendedor** que lançou (`sellers.id`), não o `auth_user_id`.
   * Passar o id de auth aqui viola a FK — foi o que já causou 409 na
   * transferência de carteira.
   */
  postedBy?: ID;

  division: Division;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}
