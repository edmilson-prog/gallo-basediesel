import { describe, it, expect } from "vitest";
import type { IConversation, IConversationContact, ICustomer, IMessage } from "@/shared/types";
import { displayFromContact, getConversationDisplay, getMessagePreview } from "./conversationDisplay";
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

describe("getConversationDisplay — B2B name fallback", () => {
  const b2b = (over: Partial<Extract<ICustomer, { type: "B2B" }>>): ICustomer =>
    ({
      id: "cust-b2b",
      type: "B2B",
      cnpj: "11.444.777/0001-61",
      razaoSocial: "",
      nomeFantasia: "",
      contactName: "",
      phone: "5554999990000",
      ...over,
    }) as unknown as ICustomer;

  it("uses nomeFantasia when present", () => {
    const d = getConversationDisplay(conv("c1"), b2b({ nomeFantasia: "Giodiesel" }), null);
    expect(d.name).toBe("Giodiesel");
  });

  it("falls back to razaoSocial when nomeFantasia is empty", () => {
    const d = getConversationDisplay(
      conv("c2"),
      b2b({ nomeFantasia: "", razaoSocial: "Giodiesel Comércio LTDA" }),
      null,
    );
    expect(d.name).toBe("Giodiesel Comércio LTDA");
  });

  it("falls back to contactName when both nomeFantasia and razaoSocial are empty", () => {
    const d = getConversationDisplay(
      conv("c3"),
      b2b({ nomeFantasia: "", razaoSocial: "", contactName: "Katrine" }),
      null,
    );
    expect(d.name).toBe("Katrine");
  });
});

describe("getMessagePreview — structured shares", () => {
  const msg = (over: Partial<IMessage>): IMessage => ({ text: "", ...over }) as IMessage;

  it("shows the contact's name (not a generic label) in the list preview", () => {
    expect(getMessagePreview(msg({ mediaType: "contact", text: "João Silva\n+5554999990000" }))).toBe(
      "👤 João Silva",
    );
  });

  it("shows the location's name when present", () => {
    expect(getMessagePreview(msg({ mediaType: "location", text: "Oficina Central\n-27.39,-53.4" }))).toBe(
      "📍 Oficina Central",
    );
  });

  it("falls back to the generic label when the share has no name", () => {
    expect(getMessagePreview(msg({ mediaType: "contact", text: "+5554999990000" }))).toBe(
      INBOX_STRINGS.mediaPreview.contact,
    );
    expect(getMessagePreview(msg({ mediaType: "location", text: "-27.39,-53.4" }))).toBe(
      INBOX_STRINGS.mediaPreview.location,
    );
  });

  it("still renders plain text for non-media messages", () => {
    expect(getMessagePreview(msg({ text: "olá, tudo bem?" }))).toBe("olá, tudo bem?");
  });
});
