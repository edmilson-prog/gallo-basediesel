/**
 * Cálculo WCAG 2.1 — razão de contraste entre duas cores hex/rgb.
 * Retorna a razão (1..21). 4.5 = AA texto normal, 3 = AA texto grande, 7 = AAA.
 */

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace("#", "").trim();
  if (m.length === 3) {
    const c0 = m[0]!;
    const c1 = m[1]!;
    const c2 = m[2]!;
    const r = parseInt(c0 + c0, 16);
    const g = parseInt(c1 + c1, 16);
    const b = parseInt(c2 + c2, 16);
    return [r, g, b];
  }
  if (m.length === 6) {
    return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
  }
  return null;
}

function parseColor(input: string): [number, number, number] | null {
  if (!input) return null;
  const s = input.trim();
  if (s.startsWith("#")) return hexToRgb(s);
  const rgbMatch = s.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch && rgbMatch[1]) {
    const parts = rgbMatch[1].split(",").map((p) => parseFloat(p));
    if (
      parts.length >= 3 &&
      parts[0] !== undefined &&
      parts[1] !== undefined &&
      parts[2] !== undefined
    ) {
      return [parts[0], parts[1], parts[2]];
    }
  }
  // fallback: usa canvas para resolver named/hsl/oklch
  if (typeof document !== "undefined") {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#000";
      ctx.fillStyle = s;
      const resolved = ctx.fillStyle as string;
      if (resolved.startsWith("#")) return hexToRgb(resolved);
    }
  }
  return null;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const srgb = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0]! + 0.7152 * srgb[1]! + 0.0722 * srgb[2]!;
}

export function contrastRatio(fg: string, bg: string): number | null {
  const f = parseColor(fg);
  const b = parseColor(bg);
  if (!f || !b) return null;
  const l1 = relativeLuminance(f);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export function wcagLevel(ratio: number): "AAA" | "AA" | "AA-large" | "FAIL" {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA-large";
  return "FAIL";
}

export function resolveCssVar(varName: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}
