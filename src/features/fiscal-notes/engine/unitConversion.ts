import type { ItemConversionMode } from "@/shared/types";

/**
 * Conversão da unidade da nota para a unidade de estoque (PRD-216, RC-02/RC-03).
 *
 * Três modos:
 *   direto — a unidade da nota já é a de estoque, fator 1;
 *   conv   — a nota vem em embalagem (CX c/12) e o estoque é em UN;
 *   frac   — a compra é em volume (balde 20 L) e a venda é em fração (litro),
 *            e o saldo entra no SKU de destino, não no SKU faturado.
 *
 * Fator ausente, zero ou negativo devolve `null` em quantidade e custo. Isso
 * não é um erro a tratar: é o que mantém o item pendente e trava o botão de
 * lançar até o conferente definir o fator.
 */

export interface IConversionInput {
  quantity: number;
  mode: ItemConversionMode;
  factor: number | null;
  /** `uCom` — unidade como veio na nota. */
  noteUnit: string;
  /** Unidade escolhida na conferência para `conv`/`frac`. */
  conversionUnit?: string;
  /** Unidade de estoque da peça vinculada, quando há uma. */
  partUnit?: string;
  itemTotalValue: number;
  /** Parcela de frete/IPI/desconto deste item, vinda de `allocateCharges`. */
  allocatedCharges: number;
}

export interface IConversionResult {
  factor: number | null;
  stockQuantity: number | null;
  stockUnit: string;
  unitCost: number | null;
}

export function convertToStock(input: IConversionInput): IConversionResult {
  const factor =
    input.mode === "direto" ? 1 : input.factor !== null && input.factor > 0 ? input.factor : null;

  const stockUnit =
    input.mode === "direto"
      ? (input.partUnit ?? input.noteUnit)
      : (input.conversionUnit ?? input.partUnit ?? input.noteUnit);

  if (factor === null) {
    return { factor: null, stockQuantity: null, stockUnit, unitCost: null };
  }

  const stockQuantity = Number((input.quantity * factor).toFixed(2));
  if (stockQuantity === 0) {
    return { factor, stockQuantity: 0, stockUnit, unitCost: null };
  }

  return {
    factor,
    stockQuantity,
    stockUnit,
    unitCost: (input.itemTotalValue + input.allocatedCharges) / stockQuantity,
  };
}
