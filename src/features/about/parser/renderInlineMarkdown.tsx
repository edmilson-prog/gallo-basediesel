import type { ReactNode } from "react";
import { Fragment } from "react";

/**
 * Renders a minimal subset of inline markdown:
 *   - `code spans`        → <code>...</code>
 *   - **bold**            → <strong>...</strong>
 *   - *italic* / _italic_ → <em>...</em>
 *
 * Markdown links, images, headings, lists, html etc. are NOT supported.
 * If those appear in the source they render as literal text.
 *
 * Order matters: code first (so backticks aren't re-parsed as bold/italic).
 */
export function renderInlineMarkdown(input: string): ReactNode {
  // Token = code | bold | italic | text
  type Token = { type: "code" | "bold" | "italic" | "text"; value: string };
  const tokens: Token[] = [];

  // 1) extract code spans
  const codePieces = input.split(/(`[^`\n]+`)/g);
  for (const piece of codePieces) {
    if (/^`[^`\n]+`$/.test(piece)) {
      tokens.push({ type: "code", value: piece.slice(1, -1) });
    } else {
      // 2) inside the non-code parts, extract bold then italic
      const boldPieces = piece.split(/(\*\*[^*]+\*\*)/g);
      for (const bp of boldPieces) {
        if (/^\*\*[^*]+\*\*$/.test(bp)) {
          tokens.push({ type: "bold", value: bp.slice(2, -2) });
        } else {
          const italicPieces = bp.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
          for (const ip of italicPieces) {
            if (/^\*[^*\n]+\*$/.test(ip) || /^_[^_\n]+_$/.test(ip)) {
              tokens.push({ type: "italic", value: ip.slice(1, -1) });
            } else if (ip.length > 0) {
              tokens.push({ type: "text", value: ip });
            }
          }
        }
      }
    }
  }

  return tokens.map((t, i) => {
    const key = `${i}-${t.type}`;
    switch (t.type) {
      case "code":
        return (
          <code
            key={key}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
          >
            {t.value}
          </code>
        );
      case "bold":
        return (
          <strong key={key} className="font-semibold text-foreground">
            {t.value}
          </strong>
        );
      case "italic":
        return (
          <em key={key} className="italic">
            {t.value}
          </em>
        );
      default:
        return <Fragment key={key}>{t.value}</Fragment>;
    }
  });
}
