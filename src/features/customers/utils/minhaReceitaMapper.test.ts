import { describe, expect, it } from "vitest";
import {
  formatCep,
  isSituacaoAtiva,
  mapMinhaReceitaResponse,
  type IMinhaReceitaRawResponse,
} from "./minhaReceitaMapper";

describe("formatCep", () => {
  it("formats 8 raw digits into 00000-000", () => {
    expect(formatCep("20031170")).toBe("20031-170");
  });

  it("returns the input unchanged when it isn't 8 digits", () => {
    expect(formatCep("123")).toBe("123");
  });
});

describe("isSituacaoAtiva", () => {
  it("is true for ATIVA", () => {
    expect(isSituacaoAtiva("ATIVA")).toBe(true);
  });

  it("is false for any other status", () => {
    expect(isSituacaoAtiva("BAIXADA")).toBe(false);
    expect(isSituacaoAtiva("SUSPENSA")).toBe(false);
  });

  it("is false when undefined", () => {
    expect(isSituacaoAtiva(undefined)).toBe(false);
  });
});

describe("mapMinhaReceitaResponse", () => {
  const fullRaw: IMinhaReceitaRawResponse = {
    razao_social: "PETROLEO BRASILEIRO S A PETROBRAS",
    nome_fantasia: "PETROBRAS - EDISE",
    descricao_situacao_cadastral: "ATIVA",
    logradouro: "REPUBLICA DO CHILE",
    numero: "65",
    complemento: "",
    bairro: "CENTRO",
    municipio: "RIO DE JANEIRO",
    uf: "RJ",
    cep: "20031170",
  };

  it("maps name, situation and address from a full response", () => {
    const result = mapMinhaReceitaResponse("33000167000101", fullRaw);
    expect(result).toEqual({
      cnpj: "33000167000101",
      razaoSocial: "PETROLEO BRASILEIRO S A PETROBRAS",
      nomeFantasia: "PETROBRAS - EDISE",
      situacaoCadastral: "ATIVA",
      address: {
        street: "REPUBLICA DO CHILE",
        number: "65",
        complement: undefined,
        district: "CENTRO",
        city: "RIO DE JANEIRO",
        state: "RJ",
        zipCode: "20031-170",
      },
    });
  });

  it("omits address when logradouro/municipio/uf are missing", () => {
    const result = mapMinhaReceitaResponse("33000167000101", {
      razao_social: "EMPRESA SEM ENDERECO",
      nome_fantasia: "",
    });
    expect(result.address).toBeUndefined();
  });

  it("defaults the house number to S/N when absent", () => {
    const result = mapMinhaReceitaResponse("33000167000101", {
      ...fullRaw,
      numero: "",
    });
    expect(result.address?.number).toBe("S/N");
  });

  it("trims a blank razao_social/nome_fantasia to empty string, not undefined", () => {
    const result = mapMinhaReceitaResponse("33000167000101", {});
    expect(result.razaoSocial).toBe("");
    expect(result.nomeFantasia).toBe("");
    expect(result.situacaoCadastral).toBeUndefined();
  });
});
