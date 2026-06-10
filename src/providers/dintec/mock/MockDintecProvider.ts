/**
 * GALLO BASE DIESEL — Mock DINTEC provider (PRD-121, RF-020..023).
 *
 * Deterministic synthetic batches so PRDs 122-126 can develop and test the
 * whole import pipeline before real DINTEC CSVs exist. Datasets are fixed
 * constants (no faker, no clock) — the same call always returns the same
 * rows, mirroring the canonical layouts documented for PRD-122.
 */

import type { IDintecImportProvider } from "../IDintecImportProvider";
import type {
  DintecBatchContext,
  DintecHealthCheckResult,
  DintecImportBatch,
  DintecImportEntityKind,
  DintecImportSource,
  DintecProviderCapabilities,
  DintecProviderName,
  DintecRow,
  DintecValidationResult,
} from "../types";
import { DEFAULT_DINTEC_CAPABILITIES } from "../types";

/** Canonical-layout records per entity kind (PRD-122 column names). */
const MOCK_CUSTOMERS: Array<{ dintecId: string; record: Record<string, string> }> = [
  {
    dintecId: "C001",
    record: {
      codigo: "C001",
      razao_social: "Auto Peças Silva LTDA",
      cpf_cnpj: "12.345.678/0001-90",
      tipo_pessoa: "J",
      endereco: "Rua das Oficinas, 123",
      cidade: "Frederico Westphalen",
      uf: "RS",
      cep: "98400-000",
      telefone: "55999990001",
      email: "contato@autopecassilva.com.br",
      data_cadastro: "15/03/2018",
    },
  },
  {
    dintecId: "C002",
    record: {
      codigo: "C002",
      razao_social: "Transportes Rota Sul ME",
      cpf_cnpj: "98.765.432/0001-10",
      tipo_pessoa: "J",
      endereco: "Av. dos Caminhoneiros, 456",
      cidade: "Palmitinho",
      uf: "RS",
      cep: "98430-000",
      telefone: "55999990002",
      email: "frota@rotasul.com.br",
      data_cadastro: "02/07/2020",
    },
  },
  {
    dintecId: "C003",
    record: {
      codigo: "C003",
      razao_social: "João Pereira",
      cpf_cnpj: "123.456.789-09",
      tipo_pessoa: "F",
      endereco: "Linha Faguense, s/n",
      cidade: "Taquaruçu do Sul",
      uf: "RS",
      cep: "98410-000",
      telefone: "55999990003",
      email: "",
      data_cadastro: "20/11/2023",
    },
  },
];

const MOCK_PARTS: Array<{ dintecId: string; record: Record<string, string> }> = [
  {
    dintecId: "P001",
    record: {
      codigo: "P001",
      descricao: "FILTRO ÓLEO LB6175",
      codigo_fabricante: "LB6175",
      marca: "MANN-FILTER",
      categoria: "FILTROS",
      preco_venda: "125,90",
      preco_custo: "78,40",
      estoque: "42",
      peso_kg: "0,500",
      ativo: "S",
    },
  },
  {
    dintecId: "P002",
    record: {
      codigo: "P002",
      descricao: "PASTILHA FREIO DIANTEIRA FH12",
      codigo_fabricante: "WVA29087",
      marca: "FRAS-LE",
      categoria: "FREIOS",
      preco_venda: "489,00",
      preco_custo: "312,50",
      estoque: "18",
      peso_kg: "4,200",
      ativo: "S",
    },
  },
  {
    dintecId: "P003",
    record: {
      codigo: "P003",
      descricao: "CORREIA POLY-V 8PK1230",
      codigo_fabricante: "8PK1230",
      marca: "GATES",
      categoria: "MOTOR",
      preco_venda: "98,70",
      preco_custo: "61,30",
      estoque: "65",
      peso_kg: "0,310",
      ativo: "S",
    },
  },
  {
    dintecId: "P004",
    record: {
      codigo: "P004",
      descricao: "AMORTECEDOR CABINE SCANIA R124",
      codigo_fabricante: "CB0045",
      marca: "COFAP",
      categoria: "SUSPENSÃO",
      preco_venda: "356,40",
      preco_custo: "228,90",
      estoque: "7",
      peso_kg: "2,850",
      ativo: "S",
    },
  },
  {
    dintecId: "P005",
    record: {
      codigo: "P005",
      descricao: "VÁLVULA PEDAL FREIO MB 1620",
      codigo_fabricante: "9730025210",
      marca: "WABCO",
      categoria: "FREIOS",
      preco_venda: "812,00",
      preco_custo: "545,00",
      estoque: "0",
      peso_kg: "1,950",
      ativo: "N",
    },
  },
];

const MOCK_ORDERS: Array<{ dintecId: string; record: Record<string, string> }> = [
  {
    dintecId: "P12345",
    record: {
      numero_pedido: "P12345",
      codigo_cliente: "C001",
      data: "25/05/2026",
      valor_total: "1547,80",
      forma_pagamento: "BOLETO",
      status: "FATURADO",
      nf_numero: "000123",
      nf_chave: "35260512345678000190550010000001231000001239",
    },
  },
  {
    dintecId: "P12346",
    record: {
      numero_pedido: "P12346",
      codigo_cliente: "C002",
      data: "28/05/2026",
      valor_total: "489,00",
      forma_pagamento: "PIX",
      status: "FATURADO",
      nf_numero: "000124",
      nf_chave: "35260598765432000110550010000001241000001246",
    },
  },
];

const MOCK_ORDER_ITEMS: Array<{ dintecId: string; record: Record<string, string> }> = [
  {
    dintecId: "P12345:P001",
    record: {
      numero_pedido: "P12345",
      codigo_peca: "P001",
      quantidade: "2",
      preco_unitario: "125,90",
      desconto_pct: "5,0",
    },
  },
  {
    dintecId: "P12345:P002",
    record: {
      numero_pedido: "P12345",
      codigo_peca: "P002",
      quantidade: "1",
      preco_unitario: "489,00",
      desconto_pct: "0,0",
    },
  },
  {
    dintecId: "P12345:P003",
    record: {
      numero_pedido: "P12345",
      codigo_peca: "P003",
      quantidade: "8",
      preco_unitario: "98,70",
      desconto_pct: "2,5",
    },
  },
  {
    dintecId: "P12346:P002",
    record: {
      numero_pedido: "P12346",
      codigo_peca: "P002",
      quantidade: "1",
      preco_unitario: "489,00",
      desconto_pct: "0,0",
    },
  },
];

const DATASETS: Partial<
  Record<DintecImportEntityKind, Array<{ dintecId: string; record: Record<string, string> }>>
> = {
  customer: MOCK_CUSTOMERS,
  part: MOCK_PARTS,
  order: MOCK_ORDERS,
  order_item: MOCK_ORDER_ITEMS,
  // `price` and `stock` are reserved kinds (PRD-121) — empty batches.
};

export class MockDintecProvider implements IDintecImportProvider {
  readonly providerName: DintecProviderName = "mock";
  readonly capabilities: DintecProviderCapabilities = DEFAULT_DINTEC_CAPABILITIES;

  async loadBatch(
    source: DintecImportSource,
    context: DintecBatchContext,
  ): Promise<DintecImportBatch> {
    const dataset = DATASETS[context.entityKind] ?? [];
    const rows: DintecRow[] = dataset.map((entry, index) => ({
      entityKind: context.entityKind,
      dintecId: entry.dintecId,
      rawRecord: { ...entry.record },
      rowNumber: index + 1,
    }));

    return {
      batchId: context.batchId,
      source,
      entityKind: context.entityKind,
      storeId: context.storeId,
      uploadedBy: context.uploadedBy,
      uploadedAt: context.uploadedAt,
      rows,
      detectedEncoding: "utf-8",
      detectedDelimiter: ";",
      totalRows: rows.length,
    };
  }

  async validateStructure(_batch: DintecImportBatch): Promise<DintecValidationResult> {
    return { valid: true, errors: [], warnings: [] };
  }

  async healthCheck(): Promise<DintecHealthCheckResult> {
    return { status: "healthy" };
  }
}
