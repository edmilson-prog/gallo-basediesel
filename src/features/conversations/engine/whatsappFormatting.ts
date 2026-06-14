/**
 * Minimal parser for WhatsApp's inline text formatting so the conversation
 * bubbles render `*bold*`, `_italic_` and `~strike~` the way the customer sees
 * them on WhatsApp — instead of showing the literal markers (e.g. the attendant
 * signature `*Edmilson:* ...`).
 *
 * Pure and DOM-free; the JSX rendering lives in `components/bubbles/WhatsAppText`.
 * Monospace (triple backticks) is intentionally out of scope (rare in chat).
 */

export type WhatsAppTextStyle = "bold" | "italic" | "strike";

export interface IWhatsAppTextSegment {
  text: string;
  styles: WhatsAppTextStyle[];
}

const MARKERS: Record<string, WhatsAppTextStyle> = {
  "*": "bold",
  _: "italic",
  "~": "strike",
};

function isSpace(ch: string | undefined): boolean {
  return ch === undefined || /\s/.test(ch);
}

/**
 * A marker can OPEN a span only when the next char is non-space AND a matching
 * closing marker exists ahead (itself preceded by a non-space char). This keeps
 * stray markers literal — `2 * 3` and a lone `*foo` stay unformatted.
 */
function canOpen(text: string, index: number, marker: string): boolean {
  if (isSpace(text[index + 1])) return false;
  for (let j = index + 1; j < text.length; j += 1) {
    if (text[j] === marker && !isSpace(text[j - 1])) return true;
  }
  return false;
}

/** Splits `text` into styled segments following WhatsApp's inline markup. */
export function parseWhatsAppFormatting(text: string): IWhatsAppTextSegment[] {
  const segments: IWhatsAppTextSegment[] = [];
  const active: WhatsAppTextStyle[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer) {
      segments.push({ text: buffer, styles: [...active] });
      buffer = "";
    }
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    const style = MARKERS[ch];
    if (style) {
      const openIdx = active.lastIndexOf(style);
      if (openIdx !== -1) {
        // Candidate close — valid only when the previous char is non-space.
        if (!isSpace(text[i - 1])) {
          flush();
          active.splice(openIdx, 1);
          continue;
        }
      } else if (canOpen(text, i, ch)) {
        flush();
        active.push(style);
        continue;
      }
    }
    buffer += ch;
  }
  flush();
  return segments;
}
