import type { ID, ISO8601, Money } from "./common";

/** Forma de pagamento preferida combinada com o fornecedor. */
export type SupplierPaymentMethod = "boleto" | "pix" | "transferencia" | "debito_automatico";

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
  /** Prazo de entrega combinado, em dias. */
  leadTimeDays?: number;
  preferredPaymentMethod?: SupplierPaymentMethod;
  /** O que se compra dele — texto livre alimentado no cadastro. */
  suppliedItems?: string[];
  /** Situação cadastral na Receita, capturada na consulta do cadastro. */
  registryStatus?: string;
  /** CNAE principal, mesma origem. */
  registryActivity?: string;
  city?: string;
  state?: string;
  notes?: string;
  active: boolean;
  /** `true` quando o cadastro veio do bloco `<emit>` de um XML. */
  createdFromXml: boolean;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/** One stock-entry line, read from `parts.suppliers` (jsonb). */
export interface ISupplierEntry {
  invoiceNumber?: string;
  invoiceDate?: ISO8601;
  cost: Money;
  quantity: number;
  /** The part the entry belongs to — lets the drawer link back to the catalog. */
  partId: ID;
  partName: string;
}

/**
 * Derived metrics. Everything here is computed on read, never stored.
 * `openAmount` / `nextDueDate` / `onTimeDeliveryRate` are deliberately ABSENT:
 * they need the `payable` entity, which does not exist yet.
 */
export interface ISupplierStats {
  supplierId: ID;
  /** Parts whose `supplier` text matches this record's normalized name. */
  linkedParts: number;
  purchasesLast12Months: Money;
  /** Most recent entries first, capped by the provider at 8. */
  lastEntries: ISupplierEntry[];
  /** 12 positions, oldest → newest, for the drawer chart. */
  monthlyPurchases: Money[];
}

/**
 * Nome de fornecedor que aparece em `parts.supplier` e ainda não tem cadastro.
 * Derivado em tempo de leitura — nunca gravado. Some da fila assim que existe
 * um `ISupplier` cuja razão social normaliza para a mesma chave.
 */
export interface IPendingSupplier {
  /** A chave normalizada — identidade estável da linha na fila. */
  key: string;
  /** O nome como o catálogo o escreve, já em Title Case. */
  displayName: string;
  /** Quantas peças referenciam este nome. */
  partCount: number;
}
