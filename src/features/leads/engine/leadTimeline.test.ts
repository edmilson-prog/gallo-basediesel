import { describe, expect, it } from "vitest";
import type { IAuditLog, ILeadNote } from "@/shared/types";
import { buildLeadTimeline, type ITimelineConversation } from "./leadTimeline";

const NAMES: Record<string, string> = { "seller-1": "Lucas Costa" };
const nameOf = (id: string) => NAMES[id] ?? "";

const BASE = {
  nameOf,
  conversationTitle: (n: number) => `${n} mensagens no WhatsApp`,
  noteTitle: "Nota",
};

const CONVERSATION: ITimelineConversation = {
  id: "conv-1",
  at: "2026-08-08T12:00:00.000Z",
  messageCount: 4,
  preview: "Preciso de preço hoje, o caminhão tá parado",
};

const NOTE: ILeadNote = {
  id: "note-1",
  authorId: "seller-1",
  content: "Frota de 6 HR. Comprava na concorrência.",
  createdAt: "2026-08-07T17:08:00.000Z",
};

function audit(id: string, action: string, timestamp: string, after?: unknown): IAuditLog {
  return { id, action, actorId: "seller-1", resource: "lead", resourceId: "lead-1", timestamp, after } as IAuditLog;
}

describe("buildLeadTimeline", () => {
  it("funde as três fontes num fio só, do mais recente ao mais antigo", () => {
    const items = buildLeadTimeline({
      ...BASE,
      conversations: [CONVERSATION],
      notes: [NOTE],
      audits: [audit("a1", "lead.created", "2026-08-07T16:42:00.000Z")],
    });
    expect(items.map((i) => i.kind)).toEqual(["conversa", "nota", "historico"]);
    expect(items.map((i) => i.id)).toEqual(["conversation-conv-1", "note-note-1", "audit-a1"]);
  });

  it("resolve o autor da nota e o ator do histórico", () => {
    const [, note, history] = buildLeadTimeline({
      ...BASE,
      conversations: [CONVERSATION],
      notes: [NOTE],
      audits: [audit("a1", "lead.created", "2026-08-07T16:42:00.000Z")],
    });
    expect(note?.who).toBe("Lucas Costa");
    expect(history?.who).toBe("Lucas Costa");
  });

  it("traduz a ação do audit em vez de mostrar a chave crua", () => {
    // Sem entrada no catálogo, "lead.seller_changed" chegava assim na tela.
    const [item] = buildLeadTimeline({
      ...BASE,
      conversations: [],
      notes: [],
      audits: [audit("a1", "lead.seller_changed", "2026-08-08T10:00:00.000Z", { sellerId: "s" })],
    });
    expect(item?.title).toBe("Responsável alterado");
  });

  it("desempata pelo id quando dois eventos têm o mesmo instante", () => {
    // Um patch e o audit que ele produz caem no mesmo segundo; sem desempate a
    // ordem trocaria entre renders.
    const at = "2026-08-08T10:00:00.000Z";
    const first = buildLeadTimeline({
      ...BASE,
      conversations: [],
      notes: [],
      audits: [audit("b", "lead.updated", at), audit("a", "lead.updated", at)],
    });
    const second = buildLeadTimeline({
      ...BASE,
      conversations: [],
      notes: [],
      audits: [audit("a", "lead.updated", at), audit("b", "lead.updated", at)],
    });
    expect(first.map((i) => i.id)).toEqual(second.map((i) => i.id));
  });

  it("não inventa linha de preview quando a conversa não tem uma", () => {
    const [item] = buildLeadTimeline({
      ...BASE,
      conversations: [{ ...CONVERSATION, preview: "" }],
      notes: [],
      audits: [],
    });
    expect(item?.lines).toEqual([]);
  });

  it("devolve vazio sem nenhuma fonte", () => {
    expect(buildLeadTimeline({ ...BASE, conversations: [], notes: [], audits: [] })).toEqual([]);
  });
});
