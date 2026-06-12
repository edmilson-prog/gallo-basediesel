import { describe, it, expect } from "vitest";
import { classifyMediaRef } from "./mediaRef";

describe("classifyMediaRef", () => {
  it("treats empty / whitespace / nullish as none", () => {
    expect(classifyMediaRef(undefined)).toEqual({ kind: "none" });
    expect(classifyMediaRef(null)).toEqual({ kind: "none" });
    expect(classifyMediaRef("")).toEqual({ kind: "none" });
    expect(classifyMediaRef("   ")).toEqual({ kind: "none" });
  });

  it("passes through http(s) / blob / data URLs verbatim", () => {
    expect(classifyMediaRef("https://picsum.photos/seed/x/600/400")).toEqual({
      kind: "absolute",
      url: "https://picsum.photos/seed/x/600/400",
    });
    expect(classifyMediaRef("http://host/y.jpg")).toEqual({
      kind: "absolute",
      url: "http://host/y.jpg",
    });
    expect(classifyMediaRef("blob:abc-123")).toEqual({ kind: "absolute", url: "blob:abc-123" });
    expect(classifyMediaRef("data:audio/ogg;base64,AAAA")).toEqual({
      kind: "absolute",
      url: "data:audio/ogg;base64,AAAA",
    });
  });

  it("is case-insensitive on the scheme", () => {
    expect(classifyMediaRef("HTTPS://host/x")).toEqual({ kind: "absolute", url: "HTTPS://host/x" });
  });

  it("treats a bare storage object path as a storage ref to sign", () => {
    expect(classifyMediaRef("conversations/c1/m1/media.bin")).toEqual({
      kind: "storage",
      path: "conversations/c1/m1/media.bin",
    });
    expect(classifyMediaRef("store-123/uuid.jpg")).toEqual({
      kind: "storage",
      path: "store-123/uuid.jpg",
    });
  });

  it("trims surrounding whitespace before classifying", () => {
    expect(classifyMediaRef("  conversations/c/m/media.ogg  ")).toEqual({
      kind: "storage",
      path: "conversations/c/m/media.ogg",
    });
  });
});
