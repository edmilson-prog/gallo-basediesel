import { Fragment, type ReactNode } from "react";
import {
  parseWhatsAppFormatting,
  type IWhatsAppTextSegment,
} from "../../engine/whatsappFormatting";

/**
 * Renders a message body honoring WhatsApp's inline formatting (`*bold*`,
 * `_italic_`, `~strike~`) so the conversation bubble matches what the customer
 * sees — notably the attendant signature `*Name:*` shows as bold, not literal.
 */
export function WhatsAppText({ text, className }: { text: string; className?: string }) {
  const segments = parseWhatsAppFormatting(text);
  return (
    <p className={className}>
      {segments.map((seg, i) => (
        <Fragment key={i}>{renderSegment(seg)}</Fragment>
      ))}
    </p>
  );
}

function renderSegment(seg: IWhatsAppTextSegment): ReactNode {
  let node: ReactNode = seg.text;
  if (seg.styles.includes("strike")) node = <s className="line-through">{node}</s>;
  if (seg.styles.includes("italic")) node = <em className="italic">{node}</em>;
  if (seg.styles.includes("bold")) node = <strong className="font-semibold">{node}</strong>;
  return node;
}
