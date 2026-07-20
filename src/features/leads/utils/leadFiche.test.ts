import { describe, expect, it } from "vitest";
import type { IConversationContact, ILead } from "@/shared/types";
import { resolveLeadFicheIdentity } from "./leadFiche";

const baseLead: ILead = {
  id: "lead-1",
  storeId: "store-1",
  sellerId: null,
  name: "Luis Haffman",
  phone: "+554796061632",
  email: "luis@example.com",
  stage: { id: "stage-novo", name: "Novo", order: 1, color: "#5b6b7a" },
  temperature: "morno",
  origin: "whatsapp",
  conversations: [],
  tags: [],
  createdAt: "2026-07-19T12:14:41.000Z",
  updatedAt: "2026-07-19T12:14:41.000Z",
};

const contact: IConversationContact = {
  conversationId: "conv-1",
  refId: "lead-1",
  isLead: true,
  name: "LUIS HAFFMAN",
  phone: "+554796061632",
  avatarUrl: "https://cdn.example.com/contact.jpg",
  temperature: "morno",
};

describe("resolveLeadFicheIdentity", () => {
  it("prefers the full lead when resolved (degraded=false)", () => {
    const identity = resolveLeadFicheIdentity({ ...baseLead, avatarUrl: "lead.jpg" }, contact);
    expect(identity).toEqual({
      name: "Luis Haffman",
      phone: "+554796061632",
      email: "luis@example.com",
      avatarUrl: "lead.jpg",
      degraded: false,
    });
  });

  it("falls back to the contact's avatar when the lead has none", () => {
    const identity = resolveLeadFicheIdentity(baseLead, contact);
    expect(identity?.avatarUrl).toBe("https://cdn.example.com/contact.jpg");
    expect(identity?.degraded).toBe(false);
  });

  it("degrades to the pool-safe contact when the lead is unresolved (RPC null)", () => {
    const identity = resolveLeadFicheIdentity(null, contact);
    expect(identity).toEqual({
      name: "LUIS HAFFMAN",
      phone: "+554796061632",
      email: undefined,
      avatarUrl: "https://cdn.example.com/contact.jpg",
      degraded: true,
    });
  });

  it("falls back to the phone as the display name when the lead name is blank", () => {
    const identity = resolveLeadFicheIdentity({ ...baseLead, name: "  " }, null);
    expect(identity?.name).toBe("+554796061632");
  });

  it("returns null when neither lead nor contact resolved", () => {
    expect(resolveLeadFicheIdentity(null, null)).toBeNull();
  });
});
