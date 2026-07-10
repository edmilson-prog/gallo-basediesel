import { describe, expect, it } from "vitest";
import { generateWahaSessionName } from "./sessionName";

describe("generateWahaSessionName", () => {
  it("slugifies the label and appends a short suffix", () => {
    const name = generateWahaSessionName("Loja Centro — Vendas", []);
    expect(name).toMatch(/^loja-centro-vendas-[a-f0-9]{6}$/);
  });

  it("avoids collisions with existing names", () => {
    const first = generateWahaSessionName("Vendas", []);
    const second = generateWahaSessionName("Vendas", [first]);
    expect(second).not.toBe(first);
  });

  it("strips accents and non-alphanumeric characters", () => {
    const name = generateWahaSessionName("Depósito São José!", []);
    expect(name).toMatch(/^deposito-sao-jose-[a-f0-9]{6}$/);
  });
});
