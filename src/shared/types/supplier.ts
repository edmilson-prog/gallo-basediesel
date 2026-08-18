import type { ID, ISO8601 } from "./common";

/**
 * Fornecedor de mercadoria (PRD-216).
 *
 * Nasce de duas formas: cadastrado à mão ou criado automaticamente do bloco
 * `<emit>` de um XML de NF-e. No segundo caso `createdFromXml` é `true` e
 * `contactName`/`contactEmail`/`category` ficam vazios de propósito — esses
 * campos não vêm no XML e inventá-los seria pior que deixá-los em branco.
 */
export interface ISupplier {
  id: ID;
  storeId: ID;
  /** Só dígitos, 14 posições. Chave de vínculo na importação. */
  cnpj: string;
  corporateName: string;
  tradeName?: string;
  /** Inscrição estadual. */
  stateRegistration?: string;
  address?: string;
  /** Condição de pagamento sugerida, lida das duplicatas (ex.: "30/60/90"). */
  paymentTerms?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  category?: string;
  active: boolean;
  /** `true` quando o cadastro veio do bloco `<emit>` de um XML. */
  createdFromXml: boolean;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}
