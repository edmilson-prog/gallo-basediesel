import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  FETCH_ALL_PAGE_SIZE,
  useFiscalNotesProvider,
  usePartsProvider,
  useSuppliersProvider,
} from "@/providers/data";
import type { ID, IFiscalNote } from "@/shared/types";
import { NfeParseError, parseNfe } from "../engine/nfeParser";
import { buildNoteFromNfe, supplierDraftFromEmitter } from "../engine/importNote";
import type { IMatchCandidate } from "../engine/itemMatcher";
import { FISCAL_NOTES_STRINGS } from "../i18n/pt-BR";

export interface IImportOutcome {
  note: IFiscalNote;
  /** `true` quando o CNPJ não existia e o cadastro nasceu do XML. */
  supplierCreated: boolean;
  supplierName: string;
}

/** Recusa esperada e explicável ao usuário — não é falha do sistema. */
export class ImportRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportRejected";
  }
}

/**
 * Coreografia da importação de um XML (PRD-216, origem 1: upload com parse no
 * cliente).
 *
 * A ordem importa: a chave é validada e conferida contra o banco ANTES de
 * qualquer escrita. Criar o fornecedor e só então descobrir que a nota é
 * duplicada deixaria um cadastro órfão.
 *
 * Toda a regra vive no `engine/`, que é testado; aqui só há I/O.
 */
export function useImportNfe(storeId: ID | null) {
  const notes = useFiscalNotesProvider();
  const suppliers = useSuppliersProvider();
  const parts = usePartsProvider();
  const queryClient = useQueryClient();
  const [isImporting, setIsImporting] = useState(false);

  async function importFile(file: File): Promise<IImportOutcome> {
    if (storeId === null) {
      throw new ImportRejected("Nenhuma loja ativa — recarregue a página e tente de novo.");
    }

    setIsImporting(true);
    try {
      const xml = await file.text();

      let parsed;
      try {
        parsed = parseNfe(xml);
      } catch (error) {
        if (error instanceof NfeParseError) {
          throw new ImportRejected(`${FISCAL_NOTES_STRINGS.import.parseError}: ${error.message}`);
        }
        throw error;
      }

      // Antes de escrever qualquer coisa.
      if (await notes.findByAccessKey(parsed.accessKey)) {
        throw new ImportRejected(FISCAL_NOTES_STRINGS.import.duplicateError(parsed.number));
      }

      const existing = await suppliers.findByCnpj(parsed.emitter.cnpj, storeId);
      const supplier =
        existing ?? (await suppliers.create(supplierDraftFromEmitter(parsed.emitter, storeId)));

      // FETCH_ALL_PAGE_SIZE, não um número redondo: o catálogo de produção já
      // passa de 4 mil peças, e truncar aqui degradaria as sugestões em
      // silêncio — o item simplesmente não acharia candidato.
      const catalog = await parts.list({ pageSize: FETCH_ALL_PAGE_SIZE, active: true });
      const candidates: IMatchCandidate[] = catalog.data.map((part) => ({
        partId: part.id,
        sku: part.sku,
        name: part.name,
        ncm: part.fiscal?.ncm,
        ean: part.gtin,
      }));

      const note = await notes.create(
        buildNoteFromNfe({
          nfe: parsed,
          storeId,
          supplierId: supplier.id,
          origin: "upload",
          candidates,
          // Vazio nesta fase: o mapa cProd → SKU só passa a ser gravado no
          // lançamento, que é da Fase 3.
          mappedCodes: {},
        }),
      );

      await queryClient.invalidateQueries({ queryKey: ["fiscal-notes"] });

      return {
        note,
        supplierCreated: existing === null,
        supplierName: supplier.tradeName ?? supplier.corporateName,
      };
    } finally {
      setIsImporting(false);
    }
  }

  return { importFile, isImporting };
}
