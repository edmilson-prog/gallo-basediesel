// src/features/quotes/engine/quoteMessage.test.ts
import { describe, expect, it } from "vitest";
import {
  buildQuoteEmailHtml,
  buildQuoteEmailSubject,
  buildQuoteEmailText,
  buildQuoteWhatsAppText,
  type IQuoteMessageInput,
} from "./quoteMessage";

/** `Intl` puts a non-breaking space after "R$" — normalize it for the asserts. */
const plain = (s: string) => s.replace(/\u00a0/g, " ");

const base: IQuoteMessageInput = {
  number: "2026-0042",
  customerName: "Antonello Terraplanagem",
  storeName: "GALLO Matriz",
  items: [
    { partName: "Bico Injetor Common Rail", quantity: 2, total: 2579.8 },
    { partName: "Kit Reparo Bico Injetor", quantity: 1, total: 274.5 },
  ],
  subtotal: 2854.3,
  discount: 0,
  shipping: 148.5,
  total: 3002.8,
  validUntil: "2026-08-25T23:59:59.000Z",
};

describe("buildQuoteWhatsAppText", () => {
  it("opens with the quote number and names the customer", () => {
    const text = buildQuoteWhatsAppText(base);
    expect(text).toContain("#2026-0042");
    expect(text).toContain("Antonello Terraplanagem");
  });

  it("lists every item with quantity and line total", () => {
    const text = plain(buildQuoteWhatsAppText(base));
    expect(text).toContain("Bico Injetor Common Rail");
    expect(text).toContain("qtd 2");
    expect(text).toContain("R$ 2.579,80");
    expect(text).toContain("Kit Reparo Bico Injetor");
  });

  it("omits the discount line when there is no discount", () => {
    expect(buildQuoteWhatsAppText(base)).not.toContain("Desconto");
    expect(buildQuoteWhatsAppText({ ...base, discount: 120 })).toContain("Desconto");
  });

  it("closes with the total and the validity date", () => {
    const text = plain(buildQuoteWhatsAppText(base));
    expect(text).toContain("R$ 3.002,80");
    expect(text).toContain("25/08/2026");
  });

  it("never leaves a blank line at either end", () => {
    const text = buildQuoteWhatsAppText(base);
    expect(text.startsWith("\n")).toBe(false);
    expect(text.endsWith("\n")).toBe(false);
  });
});

describe("buildQuoteEmailSubject", () => {
  it("carries the number so replies stay threaded on it", () => {
    expect(buildQuoteEmailSubject(base)).toBe("Orçamento #2026-0042 — GALLO Matriz");
  });
});

describe("buildQuoteEmailHtml", () => {
  it("renders one table row per item", () => {
    const html = buildQuoteEmailHtml(base);
    expect(html.match(/<tr class="item"/g)).toHaveLength(2);
  });

  it("escapes markup coming from names — a quote must not inject HTML", () => {
    const html = buildQuoteEmailHtml({
      ...base,
      customerName: '<script>alert("x")</script>',
      items: [{ partName: "Bico <b>original</b>", quantity: 1, total: 10 }],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Bico &lt;b&gt;original&lt;/b&gt;");
  });

  it("shows the discount row only when there is a discount", () => {
    expect(buildQuoteEmailHtml(base)).not.toContain("Desconto");
    expect(buildQuoteEmailHtml({ ...base, discount: 120 })).toContain("Desconto");
  });
});

describe("buildQuoteEmailText", () => {
  it("mirrors the WhatsApp body as the plain-text alternative", () => {
    expect(buildQuoteEmailText(base)).toBe(buildQuoteWhatsAppText(base));
  });
});
