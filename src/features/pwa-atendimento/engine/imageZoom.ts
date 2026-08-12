/**
 * Geometria pura do visualizador de imagem em tela cheia.
 *
 * O visualizador desenha a foto com `object-contain` e aplica
 * `translate(offset) scale(scale)` por cima. Toda a matemática que decide
 * *quanto* dá para arrastar, *para onde* a foto anda ao aproximar e *quando*
 * dois toques contam como um toque duplo mora aqui, fora do React — é o que
 * permite testar o comportamento sem um aparelho na mão.
 */

/** Foto encaixada na tela, sem aproximação. */
export const FIT_SCALE = 1;
/** Aproximação de um toque duplo — o suficiente para ler um documento fotografado. */
export const ZOOM_SCALE = 2.5;
/** Teto da pinça. Acima disso a foto do WhatsApp já é só borrão. */
export const MAX_SCALE = 4;

/** Janela entre os dois toques, em ms. */
export const DOUBLE_TAP_MS = 300;
/** Quanto o dedo pode escorregar entre os dois toques e ainda contar como toque duplo. */
export const DOUBLE_TAP_SLOP_PX = 32;
/** A partir daqui o gesto vira arrasto, não toque. */
export const TAP_SLOP_PX = 8;

export interface ISize {
  width: number;
  height: number;
}

export interface IPoint {
  x: number;
  y: number;
}

export interface IPanBounds {
  maxX: number;
  maxY: number;
}

export interface ITapSample {
  /** `event.timeStamp` — relógio do próprio evento, não do sistema. */
  at: number;
  point: IPoint;
}

/**
 * `-0` e `0` são o mesmo pixel, mas não são o mesmo valor para comparação —
 * e o sinal negativo chega a vazar para o `transform`. Prende no zero positivo.
 */
function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

/** Dimensões naturais ainda desconhecidas — `onLoad` não disparou. */
function isUnmeasured(natural: ISize): boolean {
  return !(natural.width > 0) || !(natural.height > 0);
}

/**
 * Caixa que a imagem realmente ocupa dentro da área do visualizador com
 * `object-contain` — quase nunca é a área inteira: uma foto deitada numa tela
 * em pé sobra em cima e embaixo, e é essa sobra que faz a diferença entre
 * arrastar até a borda da foto ou até o vazio ao lado dela.
 *
 * Enquanto as dimensões naturais não chegaram, devolve a própria área — é só
 * um enquadramento provisório; quem trava o gesto nesse intervalo é
 * `panBounds`, que recusa arrastar uma foto que ainda não mediu.
 */
export function fittedSize(natural: ISize, viewport: ISize): ISize {
  if (isUnmeasured(natural)) {
    return { width: viewport.width, height: viewport.height };
  }
  const fit = Math.min(viewport.width / natural.width, viewport.height / natural.height);
  return { width: natural.width * fit, height: natural.height * fit };
}

/**
 * Quanto a imagem pode ser arrastada em cada eixo, a partir do centro. Zero
 * quando o lado ampliado ainda cabe na tela — arrastar um eixo que já cabe só
 * abriria uma faixa vazia — e zero também enquanto a foto não foi medida, para
 * o gesto ficar inerte em vez de arrastar contra uma proporção chutada.
 */
export function panBounds(natural: ISize, viewport: ISize, scale: number): IPanBounds {
  if (isUnmeasured(natural)) return { maxX: 0, maxY: 0 };
  const fitted = fittedSize(natural, viewport);
  return {
    maxX: Math.max(0, (fitted.width * scale - viewport.width) / 2),
    maxY: Math.max(0, (fitted.height * scale - viewport.height) / 2),
  };
}

/** Prende o deslocamento aos limites — a foto nunca sai de vista. */
export function clampPan(offset: IPoint, bounds: IPanBounds): IPoint {
  return {
    x: normalizeZero(Math.min(bounds.maxX, Math.max(-bounds.maxX, offset.x))),
    y: normalizeZero(Math.min(bounds.maxY, Math.max(-bounds.maxY, offset.y))),
  };
}

/** Prende a escala entre o encaixe e o teto. NaN/Infinity caem no encaixe. */
export function clampScale(value: number): number {
  if (!Number.isFinite(value)) return FIT_SCALE;
  return Math.min(MAX_SCALE, Math.max(FIT_SCALE, value));
}

/**
 * Deslocamento que mantém `point` parado ao aproximar para `scale`.
 *
 * A transformação é `translate(t) scale(s)` em torno do centro, então um ponto
 * a `p` do centro vai parar em `s·p + t`. Querer que ele fique onde está é
 * resolver `s·p + t = p`, ou seja `t = p·(1 − s)`. Sem isso o toque duplo
 * aproximaria sempre o meio da foto, e o meio quase nunca é o que a pessoa
 * quer ler.
 */
export function zoomTowards(point: IPoint, viewport: ISize, scale: number): IPoint {
  const dx = point.x - viewport.width / 2;
  const dy = point.y - viewport.height / 2;
  return { x: normalizeZero(dx * (1 - scale)), y: normalizeZero(dy * (1 - scale)) };
}

/** Distância entre dois dedos — base da pinça. */
export function distanceBetween(a: IPoint, b: IPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Dois toques viram um toque duplo se forem rápidos E quase no mesmo lugar. */
export function isDoubleTap(previous: ITapSample | null, current: ITapSample): boolean {
  if (!previous) return false;
  const elapsed = current.at - previous.at;
  if (elapsed < 0 || elapsed > DOUBLE_TAP_MS) return false;
  return distanceBetween(previous.point, current.point) <= DOUBLE_TAP_SLOP_PX;
}

/**
 * Próximo estado do toque duplo: alterna entre encaixe e aproximação, e ao
 * aproximar já entrega o deslocamento certo, preso aos limites.
 */
export function toggleZoom(
  current: { scale: number },
  point: IPoint,
  viewport: ISize,
  natural: ISize,
): { scale: number; offset: IPoint } {
  if (current.scale > FIT_SCALE) {
    return { scale: FIT_SCALE, offset: { x: 0, y: 0 } };
  }
  const scale = ZOOM_SCALE;
  return {
    scale,
    offset: clampPan(zoomTowards(point, viewport, scale), panBounds(natural, viewport, scale)),
  };
}
