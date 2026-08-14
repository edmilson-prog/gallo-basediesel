import { describe, expect, it } from "vitest";
import type { IPart } from "@/shared/types";
import {
  buildCatalogCsv,
  CATALOG_CSV_HEADERS,
  catalogCsvFilename,
  escapeCsvValue,
} from "./csvExport";

function makePart(overrides: Partial<IPart> = {}): IPart {
  return {
    id: "part-1",
    sku: "1201",
    name: "Filtro de ar MANN C20500",
    oemCodes: ["81.08405-0021"],
    equivalentPartIds: [],
    applications: [
      {
        id: "app-1",
        vehicleBrand: "VOLVO",
        vehicleModel: "FH 460",
        yearStart: 2018,
        yearEnd: 2024,
      },
    ],
    brand: "MANN FILTER",
    supplier: "SCHERER S/A",
    category: "filtro",
    subcategory: "ar",
    unitCost: 98.4,
    unitPrice: 189.9,
    marginPercent: 0.8,
    stockAvailable: 6,
    stockMinimum: 4,
    division: "parts",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function rowsOf(csv: string): string[] {
  return csv.split("\r\n");
}

/** First data row of a single-part export. */
function dataRow(csv: string): string {
  const row = rowsOf(csv)[1];
  if (row == null) throw new Error("CSV has no data row");
  return row;
}

describe("escapeCsvValue", () => {
  it("leaves plain values untouched", () => {
    expect(escapeCsvValue("MANN FILTER")).toBe("MANN FILTER");
  });

  it("quotes values containing the separator", () => {
    expect(escapeCsvValue("FILTRO; AR")).toBe('"FILTRO; AR"');
  });

  it("doubles embedded quotes", () => {
    expect(escapeCsvValue('CANO 3"')).toBe('"CANO 3"""');
  });

  it("quotes values containing line breaks", () => {
    expect(escapeCsvValue("linha1\nlinha2")).toBe('"linha1\nlinha2"');
  });

  it.each(["=SOMA(A1)", "+1", "-1", "@import"])(
    "neutralises the formula trigger in %s",
    (value) => {
      expect(escapeCsvValue(value).replace(/^"/, "")).toMatch(/^'/);
    },
  );
});

describe("buildCatalogCsv", () => {
  it("starts with the header row", () => {
    const [header] = rowsOf(buildCatalogCsv([]));
    expect(header).toBe(CATALOG_CSV_HEADERS.join(";"));
  });

  it("writes one row per part", () => {
    const csv = buildCatalogCsv([makePart({ id: "a" }), makePart({ id: "b" })]);
    expect(rowsOf(csv)).toHaveLength(3);
  });

  it("uses pt-BR decimals and computes the margin on the sale price", () => {
    const cells = dataRow(buildCatalogCsv([makePart()])).split(";");
    expect(cells).toContain("189,90"); // preço
    expect(cells).toContain("98,40"); // custo
    expect(cells).toContain("48,2"); // margem % — (189.90 − 98.40) / 189.90
  });

  it("leaves cost and margin blank when there is no cost", () => {
    const cells = dataRow(buildCatalogCsv([makePart({ unitCost: 0 })])).split(";");
    expect(cells[10]).toBe(""); // custo
    expect(cells[11]).toBe(""); // margem
  });

  it("joins multi-valued columns with a pipe", () => {
    const [, row] = rowsOf(
      buildCatalogCsv([
        makePart({
          oemCodes: ["A1", "B2"],
          crossReferences: [{ brand: "Fleetguard", code: "AF25065" }],
        }),
      ]),
    );
    expect(row).toContain("A1 | B2");
    expect(row).toContain("Fleetguard AF25065");
    expect(row).toContain("VOLVO FH 460");
  });

  it("lists what the record is still missing", () => {
    const [, row] = rowsOf(
      buildCatalogCsv([
        makePart({ category: undefined, oemCodes: [], applications: [], unitCost: 0 }),
      ]),
    );
    expect(row).toContain("Categoria | OEM | Aplicação | Custo");
  });

  it("resolves the category label rather than its slug", () => {
    const [, row] = rowsOf(buildCatalogCsv([makePart()]));
    expect(row).toContain("Filtros");
  });
});

describe("catalogCsvFilename", () => {
  it("stamps the export date", () => {
    expect(catalogCsvFilename(new Date("2026-08-14T10:00:00.000Z"))).toBe(
      "catalogo-2026-08-14.csv",
    );
  });
});
