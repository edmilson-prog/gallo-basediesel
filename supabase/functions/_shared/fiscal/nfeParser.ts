// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/features/fiscal-notes/engine/nfeParser.ts (sync: bun run sync:fiscal)

import { isValidNfeKey } from "./nfeKey.ts";
import { child, children, num, parseXml, text, type IXmlNode } from "./xml.ts";

/**
 * Parser da NF-e 4.00 (PRD-216).
 *
 * Lê o que a entrada de mercadoria precisa: cabeçalho, emitente, itens como
 * vieram (cProd, NCM, CFOP, uCom × vUnCom), encargos e duplicatas. Não
 * interpreta impostos por item — ICMS/ST são leitura da contabilidade, não
 * desta feature.
 *
 * Falha alto e explícito: XML que não é NF-e, chave com DV inválido ou nota
 * sem item viram `NfeParseError` em vez de nota parcial no banco.
 *
 * Sem dependência de DOM — espelhado para as Edge Functions.
 */

export class NfeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NfeParseError";
  }
}

export interface IParsedNfeEmitter {
  cnpj: string;
  corporateName: string;
  tradeName?: string;
  stateRegistration?: string;
  address?: string;
}

export interface IParsedNfeItem {
  seq: number;
  supplierCode: string;
  description: string;
  ncm?: string;
  cfop?: string;
  ean?: string;
  unit: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
}

export interface IParsedNfeDuplicate {
  number: string;
  dueDate: string;
  amount: number;
}

export interface IParsedNfe {
  accessKey: string;
  number: string;
  series: string;
  issuedAt: string;
  emitter: IParsedNfeEmitter;
  items: IParsedNfeItem[];
  duplicates: IParsedNfeDuplicate[];
  freight: number;
  ipi: number;
  discount: number;
  productsTotal: number;
  total: number;
}

const EMPTY_NODE: IXmlNode = { tag: "", attrs: {}, children: [], text: "" };

/** A SEFAZ manda literalmente "SEM GTIN" quando o produto não tem EAN. */
function readEan(raw: string): string | undefined {
  const value = raw.trim();
  if (!value || value.toUpperCase() === "SEM GTIN") return undefined;
  return value;
}

function optional(value: string): string | undefined {
  return value ? value : undefined;
}

function readAddress(emit: IXmlNode | undefined): string | undefined {
  const ender = child(emit, "enderEmit");
  if (!ender) return undefined;
  const street = text(ender, "xLgr");
  const number = text(ender, "nro");
  const district = text(ender, "xBairro");
  const city = text(ender, "xMun");
  const uf = text(ender, "UF");
  const line = [street && number ? `${street}, ${number}` : street, district]
    .filter(Boolean)
    .join(" — ");
  const place = city && uf ? `${city}/${uf}` : city || uf;
  return optional([line, place].filter(Boolean).join(" — "));
}

function readItem(det: IXmlNode, index: number): IParsedNfeItem {
  const prod = child(det, "prod");
  if (!prod) throw new NfeParseError(`Item ${index + 1} da nota não tem bloco <prod>.`);
  const quantity = num(prod, "qCom");
  const unitValue = num(prod, "vUnCom");
  const declaredTotal = num(prod, "vProd");
  return {
    seq: Number(det.attrs.nItem) || index + 1,
    supplierCode: text(prod, "cProd"),
    description: text(prod, "xProd"),
    ncm: optional(text(prod, "NCM")),
    cfop: optional(text(prod, "CFOP")),
    ean: readEan(text(prod, "cEAN")),
    unit: text(prod, "uCom"),
    quantity,
    unitValue,
    // vProd é a fonte; só cai no produto quando o emissor omite a tag.
    totalValue: declaredTotal || Number((quantity * unitValue).toFixed(2)),
  };
}

export function parseNfe(xml: string): IParsedNfe {
  const root = parseXml(xml);

  // Aceita tanto o XML autorizado (<nfeProc>) quanto a NF-e solta (<NFe>).
  const inf =
    child(root, "nfeProc", "NFe", "infNFe") ?? child(root, "NFe", "infNFe") ?? child(root, "infNFe");
  if (!inf) throw new NfeParseError("XML não é uma NF-e — bloco <infNFe> não encontrado.");

  const accessKey = (inf.attrs.Id ?? "").replace(/^NFe/i, "").replace(/\D/g, "");
  if (!isValidNfeKey(accessKey)) {
    throw new NfeParseError(
      `Chave de acesso inválida ou com dígito verificador incorreto: ${accessKey || "(ausente)"}.`,
    );
  }

  const ide = child(inf, "ide");
  const emit = child(inf, "emit");
  if (!emit) throw new NfeParseError("NF-e sem bloco <emit> — não há fornecedor a vincular.");

  const dets = children(inf, "det");
  if (dets.length === 0) throw new NfeParseError("NF-e sem nenhum item — nada a conferir.");

  const icmsTot = child(inf, "total", "ICMSTot");
  const items = dets.map(readItem);

  return {
    accessKey,
    number: text(ide, "nNF"),
    series: text(ide, "serie"),
    issuedAt: text(ide, "dhEmi") || text(ide, "dEmi"),
    emitter: {
      cnpj: text(emit, "CNPJ").replace(/\D/g, ""),
      corporateName: text(emit, "xNome"),
      tradeName: optional(text(emit, "xFant")),
      stateRegistration: optional(text(emit, "IE")),
      address: readAddress(emit),
    },
    items,
    duplicates: children(child(inf, "cobr") ?? EMPTY_NODE, "dup").map((dup) => ({
      number: text(dup, "nDup"),
      dueDate: text(dup, "dVenc"),
      amount: num(dup, "vDup"),
    })),
    freight: num(icmsTot, "vFrete"),
    ipi: num(icmsTot, "vIPI"),
    discount: num(icmsTot, "vDesc"),
    productsTotal:
      num(icmsTot, "vProd") || Number(items.reduce((a, i) => a + i.totalValue, 0).toFixed(2)),
    total: num(icmsTot, "vNF"),
  };
}
