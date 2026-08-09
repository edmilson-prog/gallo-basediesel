import { describe, expect, it } from "vitest";
import { resolveTriageMode } from "./triageMode";

const NOW = new Date("2026-08-06T12:00:00.000Z");
const base = { kind: "entrada" as const, threshold: 50, oldestEnteredAt: undefined, now: NOW };

describe("resolveTriageMode", () => {
  it("não liga em etapa que não é a de entrada, por maior que seja", () => {
    // Uma coluna "Em negociação" com mil leads é um problema de vendas, não de
    // triagem, e trocar o modo dela esconderia o trabalho de alguém.
    expect(resolveTriageMode({ ...base, kind: "aberta", count: 5000 }).active).toBe(false);
    expect(resolveTriageMode({ ...base, kind: "ganho", count: 5000 }).active).toBe(false);
    expect(resolveTriageMode({ ...base, kind: "perda", count: 5000 }).active).toBe(false);
  });

  it("liga acima do limite", () => {
    expect(resolveTriageMode({ ...base, count: 51 }).active).toBe(true);
  });

  it("não liga exatamente no limite", () => {
    // "passa de 50" é passar, não alcançar.
    expect(resolveTriageMode({ ...base, count: 50 }).active).toBe(false);
  });

  it("não liga abaixo do limite", () => {
    expect(resolveTriageMode({ ...base, count: 49 }).active).toBe(false);
  });

  it("respeita um limite configurado diferente do padrão", () => {
    expect(resolveTriageMode({ ...base, count: 11, threshold: 10 }).active).toBe(true);
    expect(resolveTriageMode({ ...base, count: 11, threshold: 200 }).active).toBe(false);
  });

  it("devolve a contagem recebida, que é a do servidor", () => {
    expect(resolveTriageMode({ ...base, count: 903 }).count).toBe(903);
  });

  it("calcula há quantos dias o mais antigo está parado", () => {
    const view = resolveTriageMode({
      ...base,
      count: 903,
      oldestEnteredAt: "2026-07-07T12:00:00.000Z",
    });
    expect(view.oldestDays).toBe(30);
  });

  it("devolve null quando não sabe qual é o mais antigo", () => {
    expect(resolveTriageMode({ ...base, count: 903 }).oldestDays).toBeNull();
  });

  it("nunca devolve idade negativa para data no futuro", () => {
    const view = resolveTriageMode({
      ...base,
      count: 903,
      oldestEnteredAt: "2026-09-01T00:00:00.000Z",
    });
    expect(view.oldestDays).toBe(0);
  });

  it("um limite zero ou negativo não liga o modo em coluna vazia", () => {
    // Configuração inválida não deve transformar uma coluna vazia em alarme.
    expect(resolveTriageMode({ ...base, count: 0, threshold: 0 }).active).toBe(false);
    expect(resolveTriageMode({ ...base, count: 0, threshold: -5 }).active).toBe(false);
  });

  it("com limite zero, um único lead já liga o modo", () => {
    // Não é o caso de configuração inválida: é alguém pedindo alerta imediato.
    expect(resolveTriageMode({ ...base, count: 1, threshold: 0 }).active).toBe(true);
  });
});
