// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/features/fiscal-notes/engine/costAllocation.ts (sync: bun run sync:fiscal)

/**
 * Rateio de frete, IPI e desconto (PRD-216, RC-01).
 *
 * Por VALOR do item, nunca por quantidade ou peso. O resultado entra no custo
 * unitário que vai para a margem — é a diferença entre saber a margem real e
 * calcular sobre o `vUnCom` da nota, que ignora o frete.
 *
 * Sem arredondamento aqui de propósito: quem arredonda é a apresentação. Somar
 * valores já arredondados por item perde centavos contra o total da nota.
 */

export interface IAllocationItem {
  id: string;
  totalValue: number;
}

export interface IAllocationInput {
  items: IAllocationItem[];
  freight: number;
  ipi: number;
  discount: number;
}

export function allocateCharges(input: IAllocationInput): Map<string, number> {
  const allocation = new Map<string, number>();
  const charges = input.freight + input.ipi - input.discount;
  const productsTotal = input.items.reduce((sum, item) => sum + item.totalValue, 0);

  for (const item of input.items) {
    allocation.set(item.id, productsTotal === 0 ? 0 : charges * (item.totalValue / productsTotal));
  }
  return allocation;
}
