import { describe, expect, it } from "vitest";
import {
  DOUBLE_TAP_MS,
  FIT_SCALE,
  MAX_SCALE,
  ZOOM_SCALE,
  clampPan,
  clampScale,
  distanceBetween,
  fittedSize,
  isDoubleTap,
  panBounds,
  toggleZoom,
  zoomTowards,
} from "./imageZoom";

/** Tela de celular em pé, já descontados cabeçalho e legenda. */
const PHONE = { width: 400, height: 800 };
/** Foto de câmera deitada — o caso mais comum numa conversa de oficina. */
const LANDSCAPE_PHOTO = { width: 4000, height: 3000 };

describe("fittedSize", () => {
  it("encaixa a foto deitada pela largura, sobrando espaço em cima e embaixo", () => {
    expect(fittedSize(LANDSCAPE_PHOTO, PHONE)).toEqual({ width: 400, height: 300 });
  });

  it("encaixa a foto em pé ainda pela largura numa tela mais estreita que ela", () => {
    // 3:4 numa tela 1:2 continua limitada pela largura — a intuição de que
    // "foto em pé encaixa pela altura" só vale se a tela for mais larga.
    expect(fittedSize({ width: 3000, height: 4000 }, PHONE)).toEqual({
      width: 400,
      height: 4000 / 7.5,
    });
  });

  it("encaixa pela altura quando a foto é mais esguia que a tela", () => {
    expect(fittedSize({ width: 1000, height: 4000 }, PHONE)).toEqual({ width: 200, height: 800 });
  });

  it("devolve a própria área enquanto as dimensões naturais não chegaram", () => {
    // `onLoad` ainda não disparou: sem proporção conhecida, os limites saem
    // zerados e o arrasto fica inerte em vez de chutar um enquadramento.
    expect(fittedSize({ width: 0, height: 0 }, PHONE)).toEqual(PHONE);
    expect(panBounds({ width: 0, height: 0 }, PHONE, ZOOM_SCALE)).toEqual({ maxX: 0, maxY: 0 });
  });
});

describe("panBounds", () => {
  it("não deixa arrastar nada quando a foto está encaixada", () => {
    expect(panBounds(LANDSCAPE_PHOTO, PHONE, FIT_SCALE)).toEqual({ maxX: 0, maxY: 0 });
  });

  it("libera só o eixo que passou da tela", () => {
    // A 2,5× a foto deitada mede 1000×750: estourou a largura (400) mas ainda
    // cabe na altura (800). Liberar o eixo vertical abriria uma faixa vazia.
    expect(panBounds(LANDSCAPE_PHOTO, PHONE, ZOOM_SCALE)).toEqual({ maxX: 300, maxY: 0 });
  });

  it("libera os dois eixos quando a foto estoura a tela inteira", () => {
    expect(panBounds(LANDSCAPE_PHOTO, PHONE, 4)).toEqual({ maxX: 600, maxY: 200 });
  });
});

describe("clampPan", () => {
  const bounds = { maxX: 300, maxY: 0 };

  it("prende o arrasto à borda da foto", () => {
    expect(clampPan({ x: 900, y: 40 }, bounds)).toEqual({ x: 300, y: 0 });
    expect(clampPan({ x: -900, y: -40 }, bounds)).toEqual({ x: -300, y: 0 });
  });

  it("deixa passar o que já está dentro", () => {
    expect(clampPan({ x: 120, y: 0 }, bounds)).toEqual({ x: 120, y: 0 });
  });
});

describe("clampScale", () => {
  it("mantém a escala entre o encaixe e o teto", () => {
    expect(clampScale(0.2)).toBe(FIT_SCALE);
    expect(clampScale(2)).toBe(2);
    expect(clampScale(99)).toBe(MAX_SCALE);
  });

  it("cai no encaixe diante de número inválido", () => {
    // Duas leituras de pinça no mesmo ponto dão distância 0 e a razão vira
    // NaN/Infinity — a foto sumiria da tela em vez de ficar parada.
    expect(clampScale(Number.NaN)).toBe(FIT_SCALE);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(FIT_SCALE);
  });
});

describe("zoomTowards", () => {
  it("não desloca nada quando o toque é no centro", () => {
    expect(zoomTowards({ x: 200, y: 400 }, PHONE, ZOOM_SCALE)).toEqual({ x: 0, y: 0 });
  });

  it("puxa o ponto tocado para o centro, e não o contrário", () => {
    // Tocar embaixo à direita tem de mover a imagem para cima e para a
    // esquerda; o sinal invertido aproximaria justamente o canto oposto.
    const offset = zoomTowards({ x: 400, y: 800 }, PHONE, ZOOM_SCALE);
    expect(offset).toEqual({ x: -300, y: -600 });
  });
});

describe("distanceBetween", () => {
  it("mede a distância entre os dois dedos", () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("isDoubleTap", () => {
  const first = { at: 1000, point: { x: 200, y: 400 } };

  it("não conta o primeiro toque da vida como duplo", () => {
    expect(isDoubleTap(null, first)).toBe(false);
  });

  it("aceita dois toques rápidos e quase no mesmo lugar", () => {
    expect(isDoubleTap(first, { at: 1180, point: { x: 210, y: 405 } })).toBe(true);
  });

  it("recusa quando demorou demais", () => {
    expect(isDoubleTap(first, { at: 1000 + DOUBLE_TAP_MS + 1, point: { x: 200, y: 400 } })).toBe(
      false,
    );
  });

  it("recusa quando o dedo caiu longe", () => {
    // Dois toques distantes são duas intenções distintas, não um zoom.
    expect(isDoubleTap(first, { at: 1100, point: { x: 200, y: 500 } })).toBe(false);
  });

  it("recusa relógio andando para trás", () => {
    expect(isDoubleTap(first, { at: 900, point: { x: 200, y: 400 } })).toBe(false);
  });
});

describe("toggleZoom", () => {
  it("volta ao encaixe e recentra quando já estava aproximada", () => {
    const next = toggleZoom({ scale: ZOOM_SCALE }, { x: 10, y: 10 }, PHONE, LANDSCAPE_PHOTO);
    expect(next).toEqual({ scale: FIT_SCALE, offset: { x: 0, y: 0 } });
  });

  it("aproxima no ponto tocado, mas sem passar da borda da foto", () => {
    // O deslocamento cru seria {-300, -600}; o eixo vertical ainda cabe na
    // tela a 2,5×, então ele é zerado — aproximar não pode abrir faixa preta.
    const next = toggleZoom({ scale: FIT_SCALE }, { x: 400, y: 800 }, PHONE, LANDSCAPE_PHOTO);
    expect(next).toEqual({ scale: ZOOM_SCALE, offset: { x: -300, y: 0 } });
  });
});
