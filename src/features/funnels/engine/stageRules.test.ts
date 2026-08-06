import { describe, expect, it } from "vitest";
import { canDeleteStage, validateStageSet, type IStageDraft } from "./stageRules";

const s = (name: string, kind: IStageDraft["kind"], id = name): IStageDraft => ({
  id,
  name,
  kind,
  accent: 1,
  position: 0,
});

const VALID = [
  s("Novo", "entrada"),
  s("Andamento", "aberta"),
  s("Ganho", "ganho"),
  s("Perdido", "perda"),
];

describe("validateStageSet", () => {
  it("aceita o conjunto mínimo válido", () => {
    expect(validateStageSet(VALID)).toEqual([]);
  });

  it("exige uma etapa de entrada", () => {
    expect(validateStageSet(VALID.filter((x) => x.kind !== "entrada"))).toContain("missing_entrada");
  });

  it("exige uma etapa de ganho e uma de perda", () => {
    // A constraint trigger no banco rejeita isso de qualquer forma; a UI avisa
    // antes de o usuário perder o trabalho.
    expect(validateStageSet(VALID.filter((x) => x.kind !== "ganho"))).toContain("missing_ganho");
    expect(validateStageSet(VALID.filter((x) => x.kind !== "perda"))).toContain("missing_perda");
  });

  it("recusa mais de uma etapa do mesmo tipo terminal", () => {
    expect(validateStageSet([...VALID, s("Ganho 2", "ganho")])).toContain("too_many_terminals");
  });

  it("recusa mais de uma etapa de entrada", () => {
    expect(validateStageSet([...VALID, s("Outra entrada", "entrada")])).toContain(
      "too_many_terminals",
    );
  });

  it("aceita várias etapas abertas", () => {
    expect(validateStageSet([...VALID, s("Outra", "aberta")])).toEqual([]);
  });

  it("recusa nome repetido, ignorando caixa e espaços", () => {
    expect(validateStageSet([...VALID, s("  novo  ", "aberta", "x")])).toContain("duplicate_name");
  });

  it("recusa nome vazio", () => {
    expect(validateStageSet([...VALID, s("   ", "aberta", "x")])).toContain("empty_name");
  });

  it("recusa nome acima de 24 caracteres — o limite da coluna", () => {
    expect(validateStageSet([...VALID, s("a".repeat(25), "aberta", "x")])).toContain(
      "name_too_long",
    );
  });

  it("aceita exatamente 24 caracteres", () => {
    expect(validateStageSet([...VALID, s("a".repeat(24), "aberta", "x")])).toEqual([]);
  });

  it("não repete o mesmo problema quando ele ocorre duas vezes", () => {
    const issues = validateStageSet([...VALID, s("", "aberta", "x"), s("", "aberta", "y")]);
    expect(issues.filter((i) => i === "empty_name")).toHaveLength(1);
  });

  it("recusa um conjunto vazio apontando os três terminais que faltam", () => {
    expect(validateStageSet([])).toEqual(
      expect.arrayContaining(["missing_entrada", "missing_ganho", "missing_perda"]),
    );
  });
});

describe("canDeleteStage", () => {
  it("bloqueia excluir etapa terminal", () => {
    expect(canDeleteStage({ stage: VALID[2]!, leadCount: 0, all: VALID })).toEqual({
      allowed: false,
      reason: "terminal",
    });
  });

  it("bloqueia excluir a etapa de entrada", () => {
    expect(canDeleteStage({ stage: VALID[0]!, leadCount: 0, all: VALID }).reason).toBe("terminal");
  });

  it("bloqueia excluir etapa com leads", () => {
    // O FK de stage_id não tem cascade: excluir levantaria 23503. A UI pede o
    // destino antes, em vez de deixar o Postgres recusar.
    const all = [...VALID, s("Outra", "aberta", "o")];
    expect(canDeleteStage({ stage: all[1]!, leadCount: 12, all })).toEqual({
      allowed: false,
      reason: "has_leads",
    });
  });

  it("bloqueia excluir a última etapa aberta", () => {
    expect(canDeleteStage({ stage: VALID[1]!, leadCount: 0, all: VALID }).reason).toBe("last_open");
  });

  it("permite excluir uma aberta vazia quando há outra", () => {
    const all = [...VALID, s("Outra", "aberta", "o")];
    expect(canDeleteStage({ stage: all[4]!, leadCount: 0, all })).toEqual({ allowed: true });
  });

  it("diz 'terminal' antes de 'has_leads' quando as duas valem", () => {
    // A ordem importa: dizer "tem leads" sobre uma etapa que também é terminal
    // ofereceria ao usuário um caminho — mover os leads — que não destrava nada.
    expect(canDeleteStage({ stage: VALID[2]!, leadCount: 30, all: VALID }).reason).toBe("terminal");
  });
});
