import { describe, expect, it } from "vitest";
import { configFromDraft, type IAccountDraft } from "./accountDraft";

const base: IAccountDraft = {
  label: "X",
  credentialsRef: "WA_X",
  phoneNumberId: "",
  businessAccountId: "",
  baseUrl: "",
  instanceName: "",
  instanceId: "",
  failoverPolicy: "disabled",
  failoverAccountId: "",
};

describe("configFromDraft", () => {
  it("meta: both ids present → meta config", () => {
    const r = configFromDraft("meta", { ...base, phoneNumberId: "PN", businessAccountId: "WABA" });
    expect(r).toEqual({ ok: true, config: { phoneNumberId: "PN", businessAccountId: "WABA" } });
  });

  it("evolution: both fields empty → null (clear)", () => {
    expect(configFromDraft("evolution", base)).toEqual({ ok: true, config: null });
  });

  it("evolution: partial → not ok", () => {
    expect(configFromDraft("evolution", { ...base, baseUrl: "https://x" })).toEqual({ ok: false });
  });

  it("evolution-go: baseUrl present preserves a non-empty instanceId", () => {
    const r = configFromDraft("evolution-go", {
      ...base,
      baseUrl: "https://evogo.x/",
      instanceId: "abc123",
    });
    expect(r).toEqual({ ok: true, config: { baseUrl: "https://evogo.x/", instanceId: "abc123" } });
  });

  it("evolution-go: baseUrl present + empty instanceId still ok (not yet paired)", () => {
    const r = configFromDraft("evolution-go", { ...base, baseUrl: "https://evogo.x" });
    expect(r).toEqual({ ok: true, config: { baseUrl: "https://evogo.x", instanceId: "" } });
  });

  it("evolution-go: empty baseUrl → not ok", () => {
    expect(configFromDraft("evolution-go", base)).toEqual({ ok: false });
  });
});
