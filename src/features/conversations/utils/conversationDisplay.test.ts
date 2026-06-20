import { describe, it, expect } from "vitest";
import type { IConversation, IConversationContact } from "@/shared/types";
import { displayFromContact } from "./conversationDisplay";
import { INBOX_STRINGS } from "../i18n/pt-BR";

/**
 * Unit tests for `displayFromContact` — the pool-safe display path that renders
 * the inbox name from a server-resolved {@link IConversationContact} (so a seller
 * sees the real name of an unassigned conversation instead of "Lead anônimo").
 */

/** Minimal conversation fixture — only the id (the unknown fallback's hue seed). */
function conv(id: string): IConversation {
  return { id } as unknown as IConversation;
}

describe("displayFromContact", () => {
  it("renders a resolved customer contact", () => {
    const contact: IConversationContact = {
      conversationId: "c1",
      refId: "cust-1",
      isLead: false,
      name: "Auto Peças Silva",
      phone: "5511999998888",
      avatarUrl: "https://cdn/a.png",
      temperature: null,
    };
    const d = displayFromContact(conv("c1"), contact);
    expect(d.name).toBe("Auto Peças Silva");
    expect(d.isLead).toBe(false);
    expect(d.phone).toBe("5511999998888");
    expect(d.avatarUrl).toBe("https://cdn/a.png");
    expect(d.temperature).toBeNull();
    expect(d.initials).toBeTruthy();
  });

  it("renders a lead contact with its temperature", () => {
    const contact: IConversationContact = {
      conversationId: "c2",
      refId: "lead-1",
      isLead: true,
      name: "João Motorista",
      phone: "551188887777",
      temperature: "quente",
    };
    const d = displayFromContact(conv("c2"), contact);
    expect(d.name).toBe("João Motorista");
    expect(d.isLead).toBe(true);
    expect(d.temperature).toBe("quente");
  });

  it("falls back to 'Lead anônimo' when the contact is null", () => {
    const d = displayFromContact(conv("c3"), null);
    expect(d.name).toBe(INBOX_STRINGS.unknownParticipant);
    expect(d.initials).toBe("?");
    expect(d.phone).toBe("");
  });

  it("falls back when the contact name is blank (unresolved)", () => {
    const contact = {
      conversationId: "c4",
      refId: "x",
      isLead: false,
      name: "   ",
      phone: "",
    } as IConversationContact;
    const d = displayFromContact(conv("c4"), contact);
    expect(d.name).toBe(INBOX_STRINGS.unknownParticipant);
  });

  it("seeds the avatar hue from refId, independent of the conversation id", () => {
    const base: IConversationContact = {
      conversationId: "c5",
      refId: "ref-A",
      isLead: false,
      name: "Cliente X",
      phone: "",
      temperature: null,
    };
    const d1 = displayFromContact(conv("c5"), base);
    const d2 = displayFromContact(conv("totally-different-conv"), {
      ...base,
      conversationId: "totally-different-conv",
    });
    expect(d1.hue).toBe(d2.hue);
  });
});
