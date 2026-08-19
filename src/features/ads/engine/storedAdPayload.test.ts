import { describe, expect, it } from "vitest";

import { adReferralFromStoredNode } from "./storedAdPayload";

// Fixtures capturadas de webhook_deliveries.request_payload em produção
// (2026-08-10 a 2026-08-17). Só os campos do anúncio — que é conteúdo
// publicitário público — mais alguns vizinhos de ruído, para provar que o
// parser os ignora. A thumbnail base64 foi removida, como a RPC também faz.

/** Caminho extendedTextMessage, nó completo — 276 de 277 na amostra. */
const FIXTURE_COMPLETE = {
  title: "Filtro UFI: original de fábrica para sua caminhonete ou van diesel",
  body: "CATALISADORES COM FILTRO ORIGINAL E ENVIO PARA TODO O BRASIL!\nEstá procurando catalisadores?",
  sourceID: "120238998853430275",
  sourceURL: "https://fb.me/43Wa37bv8",
  sourceType: "ad",
  sourceApp: "facebook",
  mediaType: 2,
  mediaURL: "https://www.facebook.com/reel/1013737501044454/",
  thumbnailURL: "https://scontent.fcgh11-1.fna.fbcdn.net/v/t15.5256-10/737758495.jpg",
  showAdAttribution: true,
  containsAutoReply: true,
};

/** Caminho extendedTextMessage sem sourceURL — 1 caso real na amostra. */
const FIXTURE_NO_SOURCE_URL = {
  title: "Turbo Diesel RS",
  body: "Precisando de um módulo diesel original? A Turbo Diesel envia para todo o Brasil!",
  sourceID: "120249570427830275",
  sourceType: "ad",
  sourceApp: "facebook",
  mediaType: 2,
  mediaURL: "https://www.facebook.com/story.php?story_fbid=895802372913697&id=100047162754835",
};

describe("adReferralFromStoredNode", () => {
  it("mapeia o nó completo para IAdReferral com os nomes de campo do domínio", () => {
    expect(adReferralFromStoredNode(FIXTURE_COMPLETE)).toEqual({
      sourceId: "120238998853430275",
      sourceUrl: "https://fb.me/43Wa37bv8",
      sourceType: "ad",
      headline: "Filtro UFI: original de fábrica para sua caminhonete ou van diesel",
      body: "CATALISADORES COM FILTRO ORIGINAL E ENVIO PARA TODO O BRASIL!\nEstá procurando catalisadores?",
      mediaType: "video",
      mediaUrl: "https://www.facebook.com/reel/1013737501044454/",
    });
  });

  it("normaliza o mediaType numérico do WAHA (2 = vídeo)", () => {
    expect(adReferralFromStoredNode(FIXTURE_COMPLETE)?.mediaType).toBe("video");
    expect(adReferralFromStoredNode({ ...FIXTURE_COMPLETE, mediaType: 1 })?.mediaType).toBe(
      "image",
    );
    expect(
      adReferralFromStoredNode({ ...FIXTURE_COMPLETE, mediaType: 99 })?.mediaType,
    ).toBeUndefined();
  });

  it("aceita o nó sem sourceURL — sourceUrl fica indefinido, o resto sobrevive", () => {
    const result = adReferralFromStoredNode(FIXTURE_NO_SOURCE_URL);
    expect(result?.sourceId).toBe("120249570427830275");
    expect(result?.sourceUrl).toBeUndefined();
    expect(result?.headline).toBe("Turbo Diesel RS");
  });

  it("devolve undefined para nó ausente ou não-objeto", () => {
    expect(adReferralFromStoredNode(undefined)).toBeUndefined();
    expect(adReferralFromStoredNode(null)).toBeUndefined();
    expect(adReferralFromStoredNode("externalAdReply")).toBeUndefined();
    expect(adReferralFromStoredNode(42)).toBeUndefined();
  });

  it("devolve undefined quando o nó não tem sourceID — sem chave natural não há toque", () => {
    const { sourceID: _dropped, ...withoutSourceId } = FIXTURE_COMPLETE;
    expect(adReferralFromStoredNode(withoutSourceId)).toBeUndefined();
  });

  it("devolve undefined quando sourceID vem como número — jsonb não garante o tipo, e não deve lançar", () => {
    const nodeWithNumericSourceId = {
      title: "Filtro UFI: original de fábrica para sua caminhonete ou van diesel",
      body: "CATALISADORES COM FILTRO ORIGINAL E ENVIO PARA TODO O BRASIL!",
      // O valor só exercita o tipo errado (número, não string) — magnitude e precisão não importam aqui.
      sourceID: 120238998853430,
      sourceType: "ad",
    };
    expect(() => adReferralFromStoredNode(nodeWithNumericSourceId)).not.toThrow();
    expect(adReferralFromStoredNode(nodeWithNumericSourceId)).toBeUndefined();
  });
});
