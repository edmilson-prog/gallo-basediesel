import { describe, it, expect } from "vitest";
import { buildPixCaption, sanitizeWhatsAppMarkers } from "./pixMessage";

describe("sanitizeWhatsAppMarkers", () => {
  it("removes the characters that would corrupt WhatsApp formatting", () => {
    // A stray * or _ in the receiver name breaks the bold of the whole message.
    expect(sanitizeWhatsAppMarkers("GALLO *BASE* _DIESEL_")).toBe("GALLO BASE DIESEL");
    expect(sanitizeWhatsAppMarkers("A~B`C")).toBe("ABC");
  });

  it("leaves ordinary text untouched", () => {
    expect(sanitizeWhatsAppMarkers("GALLO BASE DIESEL")).toBe("GALLO BASE DIESEL");
  });
});

describe("buildPixCaption", () => {
  it("uses the custom context when the attendant typed one", () => {
    const caption = buildPixCaption({
      receiverName: "GALLO BASE DIESEL",
      keyType: "cnpj",
      context: "Segue a chave para o pagamento do pedido 4471.",
      includeKeyHint: true,
    });
    expect(caption).toContain("Segue a chave para o pagamento do pedido 4471.");
  });

  it("falls back to a default block naming the receiver and key type", () => {
    const caption = buildPixCaption({
      receiverName: "GALLO BASE DIESEL",
      keyType: "cnpj",
      includeKeyHint: true,
    });
    expect(caption).toContain("*Pagamento via PIX*");
    expect(caption).toContain("GALLO BASE DIESEL");
    expect(caption).toContain("CNPJ");
  });

  it("teaches the long-press gesture when the key follows in its own message", () => {
    const caption = buildPixCaption({
      receiverName: "GALLO",
      keyType: "cnpj",
      includeKeyHint: true,
    });
    expect(caption).toContain("tocar e segurar");
  });

  it("omits the long-press hint when no key message follows", () => {
    const caption = buildPixCaption({
      receiverName: "GALLO",
      keyType: "cnpj",
      includeKeyHint: false,
    });
    expect(caption).not.toContain("tocar e segurar");
  });

  it("sanitizes the receiver name so it cannot break the bold markers", () => {
    const caption = buildPixCaption({
      receiverName: "GALLO *BASE*",
      keyType: "cnpj",
      includeKeyHint: false,
    });
    expect(caption).toContain("GALLO BASE");
    // Only the intentional bold markers survive.
    expect(caption.split("*")).toHaveLength(3);
  });
});
