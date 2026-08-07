import { describe, expect, it } from "vitest";
import { planPixSend } from "./planPixSend";

const KEY = {
  keyValue: "12345678000195",
  keyType: "cnpj" as const,
  receiverName: "GALLO BASE DIESEL",
};

const BASE = { context: "", qrAvailable: true };

describe("planPixSend", () => {
  it("puts the key LAST, bare and unsigned, when both options are on", () => {
    const plan = planPixSend(KEY, { ...BASE, sendText: true, sendQr: true });
    expect(plan).toHaveLength(2);
    const last = plan[plan.length - 1];
    expect(last?.kind).toBe("key");
    // Bare: byte-identical to the canonical key. Anything concatenated here
    // makes WhatsApp's long-press copy a string that fails in the bank app.
    expect(last?.text).toBe("12345678000195");
    expect(last?.unsigned).toBe(true);
  });

  it("carries the QR on the first message when the QR is available", () => {
    const plan = planPixSend(KEY, { ...BASE, sendText: true, sendQr: true });
    expect(plan[0]?.kind).toBe("caption");
    expect(plan[0]?.withQr).toBe(true);
  });

  it("still sends the key when the QR is unavailable — the complement never takes the product down", () => {
    const plan = planPixSend(KEY, { ...BASE, sendText: true, sendQr: true, qrAvailable: false });
    const last = plan[plan.length - 1];
    expect(last?.kind).toBe("key");
    expect(last?.text).toBe("12345678000195");
    // The caption degrades to a plain text message; no message claims a QR.
    expect(plan.every((m) => !m.withQr)).toBe(true);
  });

  it("sends nothing when QR-only and the QR is unavailable", () => {
    // A lone caption would announce a payment and deliver no way to make it.
    const plan = planPixSend(KEY, { ...BASE, sendText: false, sendQr: true, qrAvailable: false });
    expect(plan).toEqual([]);
  });

  it("sends a single QR message when QR-only and the QR is available", () => {
    const plan = planPixSend(KEY, { ...BASE, sendText: false, sendQr: true });
    expect(plan).toHaveLength(1);
    expect(plan[0]?.kind).toBe("caption");
    expect(plan[0]?.withQr).toBe(true);
    expect(plan.some((m) => m.kind === "key")).toBe(false);
  });

  it("sends caption then key when text-only", () => {
    const plan = planPixSend(KEY, { ...BASE, sendText: true, sendQr: false });
    expect(plan.map((m) => m.kind)).toEqual(["caption", "key"]);
    expect(plan[0]?.withQr).toBeFalsy();
  });

  it("plans nothing when neither option is selected", () => {
    expect(planPixSend(KEY, { ...BASE, sendText: false, sendQr: false })).toEqual([]);
  });

  it("never lets the key value leak into the caption", () => {
    for (const opts of [
      { sendText: true, sendQr: true },
      { sendText: true, sendQr: false },
      { sendText: false, sendQr: true },
    ]) {
      const plan = planPixSend(KEY, { ...BASE, ...opts });
      for (const message of plan.filter((m) => m.kind === "caption")) {
        expect(message.text).not.toContain(KEY.keyValue);
      }
    }
  });

  it("only the key message is unsigned", () => {
    const plan = planPixSend(KEY, { ...BASE, sendText: true, sendQr: true });
    for (const message of plan.filter((m) => m.kind !== "key")) {
      expect(message.unsigned).toBeFalsy();
    }
  });

  it("uses the attendant's context as the caption when one is given", () => {
    const plan = planPixSend(KEY, {
      ...BASE,
      sendText: true,
      sendQr: false,
      context: "Segue a chave do pedido 4471.",
    });
    expect(plan[0]?.text).toContain("Segue a chave do pedido 4471.");
  });

  it("promises the next message only when a key message actually follows", () => {
    const withKey = planPixSend(KEY, { ...BASE, sendText: true, sendQr: true });
    expect(withKey[0]?.text).toContain("tocar e segurar");

    const withoutKey = planPixSend(KEY, { ...BASE, sendText: false, sendQr: true });
    expect(withoutKey[0]?.text).not.toContain("tocar e segurar");
  });
});
