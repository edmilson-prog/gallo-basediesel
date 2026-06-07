// src/features/quick-send/components/SnippetField.tsx
import { useMemo, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface ISnippetFieldProps {
  value: string;
  gaps: string[];
  onChange: (text: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

const GAP_RE = /(\{\{[^}]*\}\}|\[[^\]]*\])/g;

/**
 * Overlay-sync layer that mirrors the textarea content and renders unresolved
 * placeholders (`{{...}}` / `[...]`) as amber pills (severity-warning), without
 * replacing the native <textarea> (preserves auto-resize/paste/IME, D-6).
 *
 * The actual <textarea> is owned by MessageInput; this component renders only
 * the highlight overlay + the "N fields to fill" counter and is positioned
 * absolutely BEHIND the (transparent-text) textarea by the parent.
 */
export function SnippetField({ value, gaps, textareaRef: _textareaRef, onChange: _onChange }: ISnippetFieldProps) {
  const segments = useMemo(() => {
    const parts: { text: string; gap: boolean }[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    GAP_RE.lastIndex = 0;
    while ((m = GAP_RE.exec(value)) !== null) {
      if (m.index > last) parts.push({ text: value.slice(last, m.index), gap: false });
      parts.push({ text: m[0], gap: true });
      last = m.index + m[0].length;
    }
    if (last < value.length) parts.push({ text: value.slice(last), gap: false });
    return parts;
  }, [value]);

  return (
    <>
      <div
        aria-hidden="true"
        // Padding / font-size / line-height MUST match the <textarea> in MessageInput
        // exactly (ui/textarea defaults: px-3 py-2 text-base md:text-sm) or the amber
        // pills drift off the real glyphs. Keep these classes in lock-step with the
        // textarea className in MessageInput step 10 (D-6, spec §10 top risk).
        className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-2 text-base leading-normal text-transparent md:text-sm"
      >
        {segments.map((seg, i) =>
          seg.gap ? (
            <mark
              key={i}
              className="rounded bg-amber-500/25 text-transparent ring-1 ring-amber-500/50"
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </div>
      {gaps.length > 0 && (
        <div
          className={cn(
            "pointer-events-none absolute -top-5 left-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300",
          )}
          role="status"
        >
          {QUICK_SEND_STRINGS.snippet.fieldsToFill(gaps.length)}
        </div>
      )}
    </>
  );
}
