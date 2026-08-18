import { describe, it, expect } from "vitest";
import type { IAdReferral } from "@/shared/types";
import { buildAdReferralView } from "./adReferral";

const FULL: IAdReferral = {
  sourceId: "120238998853430275",
  sourceUrl: "https://www.instagram.com/p/DZH3K8SDPSX/",
  sourceType: "ad",
  headline: "Filtro UFI: original de fábrica para sua caminhonete ou van diesel",
  body: "Você também está comprando filtro paralelo achando que está economizando?",
  mediaType: "video",
  mediaUrl: "https://www.facebook.com/reel/1661042501819712/",
};

describe("buildAdReferralView", () => {
  it("keeps every usable field of a complete referral", () => {
    const view = buildAdReferralView(FULL);
    expect(view).toMatchObject({
      headline: FULL.headline,
      body: FULL.body,
      mediaType: "video",
      adUrl: FULL.sourceUrl,
      postUrl: FULL.mediaUrl,
      sourceId: FULL.sourceId,
    });
  });

  it("returns null when there is no referral at all", () => {
    expect(buildAdReferralView(undefined)).toBeNull();
  });

  it("returns null when every field is empty or blank", () => {
    expect(buildAdReferralView({ headline: "   ", body: "", sourceId: "" })).toBeNull();
  });

  it("drops links whose scheme is not http(s)", () => {
    const view = buildAdReferralView({
      ...FULL,
      sourceUrl: "javascript:alert(1)",
      mediaUrl: "data:text/html,<script>alert(1)</script>",
    });
    expect(view?.adUrl).toBeUndefined();
    expect(view?.postUrl).toBeUndefined();
  });

  it("keeps a plain http link", () => {
    const view = buildAdReferralView({ ...FULL, sourceUrl: "http://fb.me/9lP68o2H3" });
    expect(view?.adUrl).toBe("http://fb.me/9lP68o2H3");
  });

  it("drops a malformed url instead of rendering it", () => {
    const view = buildAdReferralView({ ...FULL, sourceUrl: "não é uma url" });
    expect(view?.adUrl).toBeUndefined();
  });

  it("omits the post link when it repeats the ad link", () => {
    const view = buildAdReferralView({ ...FULL, mediaUrl: FULL.sourceUrl });
    expect(view?.adUrl).toBe(FULL.sourceUrl);
    expect(view?.postUrl).toBeUndefined();
  });

  it("marks a long body as collapsible", () => {
    const view = buildAdReferralView({ ...FULL, body: "a".repeat(200) });
    expect(view?.bodyCollapsible).toBe(true);
  });

  it("marks a body of more than three lines as collapsible", () => {
    const view = buildAdReferralView({ ...FULL, body: "um\ndois\ntrês\nquatro" });
    expect(view?.bodyCollapsible).toBe(true);
  });

  it("leaves a short single-line body expanded", () => {
    const view = buildAdReferralView({ ...FULL, body: "Fale com a gente sobre filtros." });
    expect(view?.bodyCollapsible).toBe(false);
  });

  it("trims surrounding whitespace and turns blanks into undefined", () => {
    const view = buildAdReferralView({
      headline: "  Filtro UFI  ",
      body: "   ",
      sourceId: " 12345 ",
    });
    expect(view).toMatchObject({ headline: "Filtro UFI", sourceId: "12345" });
    expect(view?.body).toBeUndefined();
  });

  it("ignores a media type the provider did not normalize", () => {
    const view = buildAdReferralView({ ...FULL, mediaType: "gif" as never });
    expect(view?.mediaType).toBeUndefined();
  });

  it("still renders when the only usable field is a link", () => {
    const view = buildAdReferralView({ sourceUrl: "https://fb.me/9lP68o2H3" });
    expect(view?.adUrl).toBe("https://fb.me/9lP68o2H3");
    expect(view?.headline).toBeUndefined();
  });
});
