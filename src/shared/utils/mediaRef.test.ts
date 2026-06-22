import { describe, it, expect } from "vitest";
import { classifyMediaRef, partitionMediaRefs, whatsappMediaObjectPath } from "./mediaRef";

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

describe("whatsappMediaObjectPath", () => {
  it("extracts the object path from a signed URL of our bucket", () => {
    expect(
      whatsappMediaObjectPath(
        "https://x.supabase.co/storage/v1/object/sign/whatsapp-media/conversations/c1/m1/media.ogg?token=abc",
      ),
    ).toBe("conversations/c1/m1/media.ogg");
  });
  it("returns null for an external URL", () => {
    expect(whatsappMediaObjectPath("https://picsum.photos/seed/x/600/400")).toBeNull();
  });
  it("returns null for a URL of another bucket", () => {
    expect(
      whatsappMediaObjectPath("https://x.supabase.co/storage/v1/object/public/avatars/a.png"),
    ).toBeNull();
  });
});

describe("partitionMediaRefs", () => {
  it("buckets storage paths, our-bucket absolutes (sign), external absolutes (passthrough), none", () => {
    const signedOwn =
      "https://x.supabase.co/storage/v1/object/sign/whatsapp-media/conversations/c/m/x.jpg?token=t";
    const plan = partitionMediaRefs([
      "conversations/c1/m1/media.ogg",
      signedOwn,
      "https://picsum.photos/seed/y/1/1",
      "",
      undefined as unknown as string,
    ]);
    expect(plan.toSign).toEqual([
      { ref: "conversations/c1/m1/media.ogg", objectPath: "conversations/c1/m1/media.ogg" },
      { ref: signedOwn, objectPath: "conversations/c/m/x.jpg" },
    ]);
    expect(plan.passthrough).toEqual([
      { ref: "https://picsum.photos/seed/y/1/1", url: "https://picsum.photos/seed/y/1/1" },
    ]);
    // "" classifies as none → unavailable (→ null downstream); undefined is not
    // a ref and is ignored entirely.
    expect(plan.unavailable).toEqual([""]);
  });

  it("dedups repeated refs", () => {
    const plan = partitionMediaRefs(["conversations/a/b/c.bin", "conversations/a/b/c.bin"]);
    expect(plan.toSign).toHaveLength(1);
  });
});
