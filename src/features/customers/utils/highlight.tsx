import type { ReactNode } from "react";

/**
 * Wrap occurrences of `term` (case-insensitive) inside `text` with a `<mark>`
 * so the table cell can highlight the matched substring.
 */
export function highlightSearchTerm(text: string, term: string | undefined): ReactNode {
  if (!term || !term.trim()) return text;
  const needle = term.trim();
  if (needle.length === 0) return text;
  const re = new RegExp(`(${escapeRegex(needle)})`, "ig");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        re.test(part) ? (
          <mark
            key={i}
            className="rounded bg-amber-200/70 px-0.5 text-foreground dark:bg-amber-400/30"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
