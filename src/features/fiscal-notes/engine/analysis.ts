import type { ID } from "@/shared/types";

/**
 * Análise das notas de entrada (PRD-216, RS-03).
 *
 * Seis famílias de card, todas cálculo determinístico — nenhuma depende de
 * modelo. O LLM só entra na sugestão de vínculo (RS-02), nunca aqui: um card
 * que diz "preço 12,4% acima" precisa ser reproduzível e auditável.
 *
 * A regra da casa (RS-04) está no que este módulo NÃO faz: ele descreve, não
 * aplica. Nenhuma função daqui muta nota, custo ou catálogo.
 */

export type AnalysisKind = "price" | "saving" | "fiscal" | "registry" | "fractioning" | "duplicate";

export type AnalysisSeverity = "danger" | "warning" | "success" | "info";

export interface ISeriesPoint {
  label: string;
  value: number;
}

export interface IAnalysisCard {
  kind: AnalysisKind;
  severity: AnalysisSeverity;
  title: string;
  description: string;
  series?: ISeriesPoint[];
}

export interface IPurchaseHistoryEntry {
  supplierName: string;
  unitCost: number;
  purchasedAt: string;
  /** Rótulo curto do ponto na série (ex.: "jul"). */
  label: string;
}

export interface IAnalysisItem {
  itemId: ID;
  partId?: ID;
  partName: string;
  description: string;
  ncm?: string;
  /** NCM que o catálogo tem para a peça vinculada. */
  catalogNcm?: string;
  /** Custo por unidade de estoque, já com rateio. */
  unitCost: number | null;
  stockUnit: string;
  monthlySales?: number;
  currentStock?: number;
  /** Fração que gira mais que a embalagem comprada. */
  fractionCandidate?: { partName: string; monthlySales: number };
  /** Mesma peça mais barata por unidade em outra embalagem/fornecedor. */
  cheaperAlternative?: { supplierName: string; packaging: string; unitCost: number };
}

export interface IAnalysisInput {
  noteId: ID;
  accessKey: string;
  supplierName: string;
  supplierIsNew: boolean;
  /** Chaves já no sistema, para a verificação de reentrada. */
  knownAccessKeys: string[];
  items: IAnalysisItem[];
  /** Histórico de compra por `partId`, do mais antigo ao mais recente. */
  purchaseHistory: Record<string, IPurchaseHistoryEntry[]>;
}

/** Abaixo disto a variação é ruído de negociação, não sinal. */
const PRICE_TOLERANCE = 0.05;

function pct(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function priceCard(item: IAnalysisItem, history: IPurchaseHistoryEntry[]): IAnalysisCard | null {
  if (item.unitCost === null) return null;
  const last = history[history.length - 1];
  if (!last || last.unitCost <= 0) return null;

  const delta = (item.unitCost - last.unitCost) / last.unitCost;
  if (Math.abs(delta) <= PRICE_TOLERANCE) return null;

  const rising = delta > 0;
  return {
    kind: "price",
    severity: rising ? "danger" : "success",
    title: `${item.partName} ${rising ? "subiu" : "caiu"} ${pct(Math.abs(delta) * 100)}%`,
    description:
      `Nesta nota o unitário veio a ${brl(item.unitCost)} por ${item.stockUnit} — ` +
      `a última compra foi a ${brl(last.unitCost)}, na ${last.supplierName}, em ${last.purchasedAt}.`,
    series: [
      ...history.map((h) => ({ label: h.label, value: h.unitCost })),
      { label: "agora", value: item.unitCost },
    ],
  };
}

function savingCard(item: IAnalysisItem): IAnalysisCard | null {
  const alt = item.cheaperAlternative;
  if (!alt || item.unitCost === null || item.unitCost <= alt.unitCost) return null;
  const delta = (item.unitCost - alt.unitCost) / item.unitCost;
  return {
    kind: "saving",
    severity: "success",
    title: `${item.partName}: ${alt.packaging} sai ${pct(delta * 100)}% mais barato`,
    description:
      `A ${alt.supplierName} entrega a ${brl(alt.unitCost)} por ${item.stockUnit}; ` +
      `esta compra saiu a ${brl(item.unitCost)}.`,
  };
}

function fiscalCard(items: IAnalysisItem[]): IAnalysisCard | null {
  const diverging = items.filter(
    (item) => item.ncm && item.catalogNcm && item.ncm !== item.catalogNcm,
  );
  const first = diverging[0];
  if (!first) return null;
  return {
    kind: "fiscal",
    severity: "warning",
    title: `NCM da nota difere do cadastro em ${diverging.length} ${diverging.length > 1 ? "itens" : "item"}`,
    description:
      `${first.partName} veio como ${first.ncm}; o cadastro diz ${first.catalogNcm}. ` +
      `Divergência de NCM muda imposto — conferir com a contabilidade antes de lançar.`,
  };
}

function registryCard(input: IAnalysisInput): IAnalysisCard | null {
  if (!input.supplierIsNew) return null;
  return {
    kind: "registry",
    severity: "info",
    title: `${input.supplierName} — fornecedor criado na importação`,
    description:
      "Nasceu do XML com razão social, CNPJ, IE e endereço. Faltam contato e categoria, " +
      "que não vêm no arquivo.",
  };
}

function fractioningCard(item: IAnalysisItem): IAnalysisCard | null {
  const fraction = item.fractionCandidate;
  if (!fraction || (item.monthlySales ?? 0) > 0) return null;
  return {
    kind: "fractioning",
    severity: "info",
    title: `${item.partName}: fracionar em ${fraction.partName}`,
    description:
      `A embalagem comprada está parada, e ${fraction.partName} vende ${fraction.monthlySales} por mês. ` +
      "Fracionar no recebimento libera venda no balcão sem parar capital.",
  };
}

function duplicateCard(input: IAnalysisInput): IAnalysisCard {
  const duplicated = input.knownAccessKeys.includes(input.accessKey);
  return duplicated
    ? {
        kind: "duplicate",
        severity: "danger",
        title: "Chave de acesso já existe no sistema",
        description: `A chave ${input.accessKey} já pertence a outra nota — este XML entraria duas vezes.`,
      }
    : {
        kind: "duplicate",
        severity: "success",
        title: "Nenhuma chave duplicada",
        description: "A chave de acesso desta nota não colide com nenhuma já importada.",
      };
}

export function analyzeNote(input: IAnalysisInput): IAnalysisCard[] {
  const cards: IAnalysisCard[] = [];

  for (const item of input.items) {
    const history = item.partId ? (input.purchaseHistory[item.partId] ?? []) : [];
    const price = priceCard(item, history);
    if (price) cards.push(price);
    const saving = savingCard(item);
    if (saving) cards.push(saving);
    const fractioning = fractioningCard(item);
    if (fractioning) cards.push(fractioning);
  }

  const fiscal = fiscalCard(input.items);
  if (fiscal) cards.push(fiscal);
  const registry = registryCard(input);
  if (registry) cards.push(registry);

  cards.push(duplicateCard(input));
  return cards;
}
