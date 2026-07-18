import type { IPriceTable } from "@/shared/types";

interface DintecPriceInput {
  custo: number | null;
  perc3: number | null;
  valor3: number | null;
  perc4: number | null;
  valor4: number | null;
  perc5: number | null;
  valor5: number | null;
  /** ECOMMERCE's markup is fixed company-wide and not persisted as its own
   *  VALOR column — DINTEC computes it live from CUSTO × (1 + PERC2/100). */
  perc2: number | null;
}

/**
 * Maps DINTEC's 3 persisted price tiers (VALOR3=Oficina, VALOR4=Atacado,
 * VALOR5=Varejo — confirmed against a real "Cadastro de Valores do Produto"
 * screen) plus the computed Ecommerce tier into GALLO's `IPriceTable[]`.
 * `markupPercent` is DINTEC's PERC column divided by 100 (DINTEC stores
 * percentage points, GALLO stores a 0..1 fraction — see the ABC-share bug
 * this exact convention mismatch caused in the customer BI fallback).
 */
export function buildDintecPriceTables(input: DintecPriceInput): IPriceTable[] {
  if (input.custo == null || input.custo <= 0) return [];
  const tables: IPriceTable[] = [];
  if (input.perc3 != null && input.valor3 != null && input.valor3 > 0) {
    tables.push({ id: "oficina", label: "Oficina", markupPercent: input.perc3 / 100, price: input.valor3 });
  }
  if (input.perc4 != null && input.valor4 != null && input.valor4 > 0) {
    tables.push({ id: "atacado", label: "Atacado", markupPercent: input.perc4 / 100, price: input.valor4 });
  }
  if (input.perc5 != null && input.valor5 != null && input.valor5 > 0) {
    tables.push({ id: "varejo", label: "Varejo", markupPercent: input.perc5 / 100, price: input.valor5 });
  }
  if (input.perc2 != null) {
    const price = Number((input.custo * (1 + input.perc2 / 100)).toFixed(2));
    tables.push({ id: "ecommerce", label: "Ecommerce", markupPercent: input.perc2 / 100, price });
  }
  return tables;
}
