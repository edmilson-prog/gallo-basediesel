import qrcode from "qrcode-generator";
import { computeQrGeometry, PIX_QR_BOX_RATIO, PIX_QR_EXPORT, QUIET_MODULES } from "./qrGeometry";

// ⚠️ Os valores abaixo são hex literal DE PROPÓSITO e NÃO violam a regra de
// tokens semânticos do projeto: não são superfície de UI, são os BYTES de uma
// imagem que sai do app e é lida por um scanner. Um QR precisa ser preto puro
// sobre branco puro em qualquer tema — tematizar aqui quebra a leitura. Os
// tokens governam a MOLDURA no CRM (bg-muted, border-border), nunca o conteúdo
// do PNG. Não troque por bg-foreground.
const MODULE_COLOR = "#000000";
const BG_COLOR = "#FFFFFF";

/** Error correction M (15%): L does not survive WhatsApp recompression. */
const ERROR_CORRECTION = "M" as const;

export interface IDrawPixQrOptions {
  /** Preview mode: square canvas of this CSS size, scaled by DPR. */
  cssSize?: number;
}

/** Draws the payload onto the canvas. Returns false when the 2D context is unavailable. */
export function drawPixQr(
  canvas: HTMLCanvasElement,
  payload: string,
  opts: IDrawPixQrOptions = {},
): boolean {
  const qr = qrcode(0, ERROR_CORRECTION);
  qr.addData(payload); // payload já normalizado em ASCII pelo pixBrCode
  qr.make();
  const count = qr.getModuleCount();

  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const width = opts.cssSize ? Math.round(opts.cssSize * dpr) : PIX_QR_EXPORT.width;
  const height = opts.cssSize ? Math.round(opts.cssSize * dpr) : PIX_QR_EXPORT.height;

  canvas.width = width;
  canvas.height = height;
  if (opts.cssSize) {
    canvas.style.width = `${opts.cssSize}px`;
    canvas.style.height = `${opts.cssSize}px`;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, width, height);

  // Preview fills the square canvas; the 4:3 export insets to the target box.
  const g = computeQrGeometry(count, width, height, opts.cssSize ? 1 : PIX_QR_BOX_RATIO);
  ctx.fillStyle = MODULE_COLOR;
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!qr.isDark(row, col)) continue;
      ctx.fillRect(
        g.originX + (QUIET_MODULES + col) * g.scale,
        g.originY + (QUIET_MODULES + row) * g.scale,
        g.scale,
        g.scale,
      );
    }
  }
  return true;
}

/** Slugifies an alias for the download filename. */
function slug(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "chave"
  );
}

/**
 * PNG only — JPEG artefacts on 1px module edges destroy scannability.
 * The filename reaches ImageBubble's download label, so it must be descriptive.
 */
export function canvasToPixFile(canvas: HTMLCanvasElement, alias: string): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? new File([blob], `pix-${slug(alias)}.png`, { type: "image/png" }) : null);
    }, "image/png");
  });
}
