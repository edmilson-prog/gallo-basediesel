import { describe, expect, it } from "vitest";
import {
  formatCep,
  formatReceitaAddressLine,
  formatReceitaDate,
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

describe("formatReceitaDate", () => {
  it("turns an ISO date into dd/mm/aaaa", () => {
    expect(formatReceitaDate("1966-09-28")).toBe("28/09/1966");
  });

  it("accepts a full ISO timestamp", () => {
    expect(formatReceitaDate("1966-09-28T00:00:00.000Z")).toBe("28/09/1966");
  });

  it("is undefined for anything that isn't an ISO date", () => {
    expect(formatReceitaDate(undefined)).toBeUndefined();
    expect(formatReceitaDate("")).toBeUndefined();
    expect(formatReceitaDate("28/09/1966")).toBeUndefined();
  });
});

describe("formatReceitaAddressLine", () => {
  it("joins street, district and city into one readable line", () => {
    expect(
      formatReceitaAddressLine({
        street: "AVENIDA REPUBLICA DO CHILE",
        number: "65",
        district: "CENTRO",
        city: "RIO DE JANEIRO",
        state: "RJ",
        zipCode: "20031-170",
      }),
    ).toBe("AVENIDA REPUBLICA DO CHILE, 65 — CENTRO · RIO DE JANEIRO/RJ");
  });

  it("skips the district when the dataset has none", () => {
    expect(
      formatReceitaAddressLine({
        street: "LINHA SAO JOSE",
        number: "S/N",
        district: "",
        city: "FREDERICO WESTPHALEN",
        state: "RS",
        zipCode: "",
      }),
    ).toBe("LINHA SAO JOSE, S/N · FREDERICO WESTPHALEN/RS");
  });

  it("is null without an address", () => {
    expect(formatReceitaAddressLine(undefined)).toBeNull();
  });
});

describe("mapMinhaReceitaResponse", () => {
  const fullRaw: IMinhaReceitaRawResponse = {
    razao_social: "PETROLEO BRASILEIRO S A PETROBRAS",
    nome_fantasia: "PETROBRAS - EDISE",
    descricao_situacao_cadastral: "ATIVA",
    data_inicio_atividade: "1966-09-28",
    cnae_fiscal_descricao: "Extração de petróleo e gás natural",
    ddd_telefone_1: "2132242312",
    email: "Contato@Petrobras.COM.BR",
    descricao_tipo_de_logradouro: "AVENIDA",
    logradouro: "REPUBLICA DO CHILE",
    numero: "65",
    complemento: "",
    bairro: "CENTRO",
    municipio: "RIO DE JANEIRO",
    uf: "RJ",
    cep: "20031170",
  };

  it("maps name, situation, fiscal facts and address from a full response", () => {
    const result = mapMinhaReceitaResponse("33000167000101", fullRaw);
    expect(result).toEqual({
      cnpj: "33000167000101",
      razaoSocial: "PETROLEO BRASILEIRO S A PETROBRAS",
      nomeFantasia: "PETROBRAS - EDISE",
      situacaoCadastral: "ATIVA",
      cnae: "Extração de petróleo e gás natural",
      openedAt: "28/09/1966",
      phone: "2132242312",
      email: "contato@petrobras.com.br",
      address: {
        street: "AVENIDA REPUBLICA DO CHILE",
        number: "65",
        complement: undefined,
        district: "CENTRO",
        city: "RIO DE JANEIRO",
        state: "RJ",
        zipCode: "20031-170",
      },
    });
  });

  it("keeps the street as-is when the dataset has no street type", () => {
    const result = mapMinhaReceitaResponse("33000167000101", {
      ...fullRaw,
      descricao_tipo_de_logradouro: undefined,
    });
    expect(result.address?.street).toBe("REPUBLICA DO CHILE");
  });

  it("normalizes a formatted phone down to digits", () => {
    const result = mapMinhaReceitaResponse("33000167000101", {
      ...fullRaw,
      ddd_telefone_1: "(21) 3224-2312",
    });
    expect(result.phone).toBe("2132242312");
  });

  it("drops a phone that isn't a full 10/11-digit number", () => {
    expect(
      mapMinhaReceitaResponse("1", { ...fullRaw, ddd_telefone_1: "32242312" }).phone,
    ).toBeUndefined();
    expect(mapMinhaReceitaResponse("1", { ...fullRaw, ddd_telefone_1: "" }).phone).toBeUndefined();
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
    expect(result.cnae).toBeUndefined();
    expect(result.openedAt).toBeUndefined();
    expect(result.phone).toBeUndefined();
    expect(result.email).toBeUndefined();
  });
});
