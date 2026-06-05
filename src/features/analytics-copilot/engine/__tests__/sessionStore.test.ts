import { describe, expect, it } from "vitest";
import type { IAnalyticsMessage } from "@/shared/types/analytics-copilot";
import {
  createSession,
  deriveTitle,
  appendMessages,
  upsertSession,
  deleteSession,
  enforceRetention,
  parseSessionList,
  type ICopilotSessionRecord,
} from "../sessionStore";

const NOW = "2026-05-20T10:00:00.000Z";

function userMsg(text: string): IAnalyticsMessage {
  return { id: "u1", role: "user", text, timestamp: NOW };
}

describe("sessionStore", () => {
  it("createSession cria sessão vazia com título padrão", () => {
    const s = createSession(NOW, "abc");
    expect(s.id).toBe("abc");
    expect(s.messages).toEqual([]);
    expect(s.title).toBe("Nova conversa");
    expect(s.createdAt).toBe(NOW);
  });

  it("deriveTitle usa a 1ª pergunta do usuário truncada", () => {
    expect(deriveTitle([userMsg("Quanto faturei esse mês?")])).toBe("Quanto faturei esse mês?");
    const long = "a".repeat(60);
    expect(deriveTitle([userMsg(long)]).length).toBeLessThanOrEqual(41); // 40 + reticências
    expect(deriveTitle([])).toBe("Nova conversa");
  });

  it("appendMessages atualiza mensagens, título e updatedAt", () => {
    const s = createSession("2026-05-20T09:00:00.000Z", "abc");
    const next = appendMessages(s, [userMsg("Qual a margem?")], NOW);
    expect(next.messages).toHaveLength(1);
    expect(next.title).toBe("Qual a margem?");
    expect(next.updatedAt).toBe(NOW);
    expect(s.messages).toHaveLength(0); // imutável
  });

  it("upsertSession substitui pelo id e move para o topo", () => {
    const a = createSession(NOW, "a");
    const b = createSession(NOW, "b");
    const list = [a, b];
    const updated = { ...b, title: "X" };
    const next = upsertSession(list, updated);
    expect(next[0]!.id).toBe("b");
    expect(next[0]!.title).toBe("X");
    expect(next).toHaveLength(2);
  });

  it("deleteSession remove pelo id", () => {
    const a = createSession(NOW, "a");
    const b = createSession(NOW, "b");
    expect(deleteSession([a, b], "a").map((s) => s.id)).toEqual(["b"]);
  });

  it("enforceRetention mantém as N mais recentes", () => {
    const list: ICopilotSessionRecord[] = Array.from({ length: 55 }, (_, i) =>
      createSession(NOW, `s${i}`),
    );
    expect(enforceRetention(list, 50)).toHaveLength(50);
  });

  it("parseSessionList rejeita shape inválido", () => {
    expect(parseSessionList("não é json")).toEqual([]);
    expect(parseSessionList(JSON.stringify([{ foo: 1 }]))).toEqual([]);
    const valid = [createSession(NOW, "a")];
    expect(parseSessionList(JSON.stringify(valid))).toHaveLength(1);
  });
});
