import { describe, it, expect } from "vitest";
import { buildSummaryFooter } from "./summaryFooter";

describe("buildSummaryFooter", () => {
  it("lists status, seller and instance in that order", () => {
    expect(
      buildSummaryFooter({
        statusLabel: "Em atendimento",
        sellerName: "Edmilson Souza",
        instanceLabel: "GALLO Matriz (Oficial)",
      }),
    ).toEqual([
      { kind: "status", text: "Em atendimento" },
      { kind: "seller", text: "Edmilson Souza" },
      { kind: "instance", text: "GALLO Matriz (Oficial)" },
    ]);
  });

  it("drops the instance on a single-instance store", () => {
    expect(buildSummaryFooter({ statusLabel: "Resolvida", sellerName: "Lucas Bender" })).toEqual([
      { kind: "status", text: "Resolvida" },
      { kind: "seller", text: "Lucas Bender" },
    ]);
  });

  it("drops the seller on an unassigned (queued) conversation", () => {
    expect(
      buildSummaryFooter({ statusLabel: "Aguardando", instanceLabel: "Comercial Lucas" }),
    ).toEqual([
      { kind: "status", text: "Aguardando" },
      { kind: "instance", text: "Comercial Lucas" },
    ]);
  });

  it("always keeps the status — it is the one field that is never absent", () => {
    expect(buildSummaryFooter({ statusLabel: "Arquivada" })).toEqual([
      { kind: "status", text: "Arquivada" },
    ]);
  });

  it("treats blank and whitespace-only names as absent, not as an empty segment", () => {
    // Otherwise the renderer emits "Aguardando ·  · Comercial Lucas".
    expect(
      buildSummaryFooter({ statusLabel: "Aguardando", sellerName: "   ", instanceLabel: "" }),
    ).toEqual([{ kind: "status", text: "Aguardando" }]);
  });

  it("trims surrounding whitespace off the values it keeps", () => {
    expect(
      buildSummaryFooter({ statusLabel: "Resolvida", sellerName: "  Ana Paula  " }),
    ).toEqual([
      { kind: "status", text: "Resolvida" },
      { kind: "seller", text: "Ana Paula" },
    ]);
  });

  it("treats a null seller (unassigned) the same as an absent one", () => {
    expect(
      buildSummaryFooter({ statusLabel: "Aguardando", sellerName: null, instanceLabel: null }),
    ).toEqual([{ kind: "status", text: "Aguardando" }]);
  });
});
