import type {
  FiscalNoteOrigin,
  ID,
  IFiscalNoteItem,
  ISupplier,
  ItemLinkMode,
} from "@/shared/types";
import type { ICreateFiscalNoteInput } from "@/providers/data";
import type { IParsedNfe, IParsedNfeEmitter } from "./nfeParser";
import { matchItem, type IMatchCandidate } from "./itemMatcher";

/**
 * Orquestração pura da importação (PRD-216, Fase 2).
 *
 * Transforma um XML já parseado no input de criação da nota. Tudo aqui é
 * determinístico e sem I/O — quem fala com o provider é o hook. A regra que
 * este módulo protege é a central do PRD: **importar nunca lança**. Nenhum item
 * nasce confirmado e nenhum fator de conversão é adivinhado.
 */

/**
 * Cadastro de fornecedor a partir do bloco `<emit>`.
 *
 * Contato e categoria ficam `undefined` DE PROPÓSITO: não vêm no XML, e um
 * cadastro incompleto e honesto vale mais que um preenchido com invenção.
 */
export function supplierDraftFromEmitter(
  emitter: IParsedNfeEmitter,
  storeId: ID,
): Omit<ISupplier, "id" | "createdAt" | "updatedAt"> {
  return {
    storeId,
    cnpj: emitter.cnpj,
    corporateName: emitter.corporateName,
    tradeName: emitter.tradeName,
    stateRegistration: emitter.stateRegistration,
    address: emitter.address,
    active: true,
    createdFromXml: true,
  };
}

export interface IBuildNoteInput {
  nfe: IParsedNfe;
  storeId: ID;
  supplierId: ID;
  origin: FiscalNoteOrigin;
  /** Catálogo da loja, para a cascata de sugestão. */
  candidates: IMatchCandidate[];
  /** `cProd` → `partId` já aprendidos para ESTE fornecedor. */
  mappedCodes: Record<string, ID>;
  /** Caminho no bucket `fiscal-xml`, quando o arquivo foi arquivado. */
  xmlPath?: string;
  /** Momento da entrada. Injetável para o teste ser determinístico. */
  enteredAt?: string;
}

export function buildNoteFromNfe(input: IBuildNoteInput): ICreateFiscalNoteInput {
  const items = input.nfe.items.map((item) => {
    const match = matchItem(
      {
        supplierCode: item.supplierCode,
        description: item.description,
        ncm: item.ncm,
        ean: item.ean,
        mappedPartId: input.mappedCodes[item.supplierCode],
      },
      input.candidates,
    );

    return {
      seq: item.seq,
      supplierCode: item.supplierCode,
      description: item.description,
      ncm: item.ncm,
      cfop: item.cfop,
      ean: item.ean,
      unit: item.unit,
      quantity: item.quantity,
      unitValue: item.unitValue,
      totalValue: item.totalValue,
      linkMode: match.mode,
      partId: match.partId ?? undefined,
      // A conversão é decisão da conferência: nascer em `direto` com fator nulo
      // é o que mantém o item pendente e trava o lançamento.
      conversionMode: "direto" as const,
      conversionFactor: null,
      aiConfidence: match.confidence ?? undefined,
      aiEvidence: match.evidence ?? undefined,
      // Importar nunca lança.
      confirmed: false,
    };
  });

  return {
    storeId: input.storeId,
    accessKey: input.nfe.accessKey,
    number: input.nfe.number,
    series: input.nfe.series,
    supplierId: input.supplierId,
    issuedAt: input.nfe.issuedAt,
    enteredAt: input.enteredAt ?? new Date().toISOString(),
    status: "conferencia",
    origin: input.origin,
    freight: input.nfe.freight,
    ipi: input.nfe.ipi,
    discount: input.nfe.discount,
    productsTotal: input.nfe.productsTotal,
    total: input.nfe.total,
    xmlPath: input.xmlPath,
    division: "parts",
    items,
    duplicates: input.nfe.duplicates.map((dup) => ({
      number: dup.number,
      dueDate: dup.dueDate,
      amount: dup.amount,
    })),
  };
}

export type ILinkCounts = Record<ItemLinkMode, number>;

/** Contagem por tipo de vínculo, para os chips da fila de importação. */
export function summarizeLinks(
  items: ReadonlyArray<Pick<IFiscalNoteItem, "linkMode">>,
): ILinkCounts {
  const counts: ILinkCounts = { auto: 0, ia: 0, novo: 0, pend: 0 };
  for (const item of items) counts[item.linkMode]++;
  return counts;
}
