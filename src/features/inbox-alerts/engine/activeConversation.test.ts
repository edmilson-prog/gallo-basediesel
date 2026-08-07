import { describe, expect, it } from "vitest";
import { activeConversationIdFromPath, isConversationActive } from "./activeConversation";

describe("activeConversationIdFromPath", () => {
  it("extracts the id from the conversation route", () => {
    expect(activeConversationIdFromPath("/app/atendimento/abc-123")).toBe("abc-123");
  });

  it("tolerates a trailing slash", () => {
    expect(activeConversationIdFromPath("/app/atendimento/abc-123/")).toBe("abc-123");
  });

  it("tolerates a query string", () => {
    expect(activeConversationIdFromPath("/app/atendimento/abc-123?status=aberta")).toBe("abc-123");
  });

  it("returns null on the Inbox list without a selection", () => {
    expect(activeConversationIdFromPath("/app/atendimento")).toBeNull();
    expect(activeConversationIdFromPath("/app/atendimento/")).toBeNull();
  });

  it("returns null outside the conversation route", () => {
    expect(activeConversationIdFromPath("/app/clientes")).toBeNull();
    expect(activeConversationIdFromPath("/app/gestao/atendimento-analise/abc-123")).toBeNull();
  });

  it("returns null for a nested path under a conversation", () => {
    expect(activeConversationIdFromPath("/app/atendimento/abc-123/midias")).toBeNull();
  });
});

describe("isConversationActive", () => {
  it("is active when the route matches and the tab is visible", () => {
    expect(isConversationActive("/app/atendimento/abc-123", "abc-123", "visible")).toBe(true);
  });

  it("is not active when the tab is hidden", () => {
    expect(isConversationActive("/app/atendimento/abc-123", "abc-123", "hidden")).toBe(false);
  });

  it("is not active for a different conversation", () => {
    expect(isConversationActive("/app/atendimento/abc-123", "zzz-999", "visible")).toBe(false);
  });

  it("is not active on another screen", () => {
    expect(isConversationActive("/app/clientes", "abc-123", "visible")).toBe(false);
  });

  it("is not active for an empty conversation id", () => {
    expect(isConversationActive("/app/atendimento/", "", "visible")).toBe(false);
  });
});
