import { describe, expect, it } from "vitest";
import { pickSugestaoName } from "./pickSugestaoName";

describe("pickSugestaoName", () => {
  it("devolve o único candidato quando não há disputa", () => {
    const only = { nome: "SENSOR SCANIA 2659850", ocorrencias: 6 };
    expect(pickSugestaoName([only])).toBe(only);
  });

  it("prefere o nome mais repetido — é o que o balcão mais usou", () => {
    const raro = { nome: "CATALISADOR", ocorrencias: 1 };
    const comum = { nome: "CATALISADOR VOLVO FH", ocorrencias: 9 };
    expect(pickSugestaoName([raro, comum])).toBe(comum);
  });

  it("no empate de repetição, fica com o nome mais descritivo (mais longo)", () => {
    const curto = { nome: "CATALISADOR", ocorrencias: 3 };
    const longo = { nome: "CATALISADOR IVECO DAILY 3.0", ocorrencias: 3 };
    expect(pickSugestaoName([curto, longo])).toBe(longo);
  });

  it("empatando repetição e tamanho, desempata alfabeticamente para ser determinístico", () => {
    const b = { nome: "BOMBA DE OLEO XY", ocorrencias: 2 };
    const a = { nome: "BOMBA DE AGUA XY", ocorrencias: 2 };
    expect(pickSugestaoName([b, a])).toBe(a);
    // A ordem de entrada não pode mudar o vencedor.
    expect(pickSugestaoName([a, b])).toBe(a);
  });

  it("preserva os demais campos do candidato vencedor", () => {
    const vencedor = { nome: "TURBINA MAN TGX", ocorrencias: 4, marca: "VOLKSWAGEN" };
    const perdedor = { nome: "TURBINA", ocorrencias: 1, marca: "" };
    expect(pickSugestaoName([perdedor, vencedor])).toEqual(vencedor);
  });

  it("recusa lista vazia em vez de devolver undefined silenciosamente", () => {
    expect(() => pickSugestaoName([])).toThrow(/vazio/);
  });
});
