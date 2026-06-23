// src/features/quick-send/components/library-admin/QuickReplyEditor.tsx
import { useRef, useState, useCallback, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { resolvePlaceholders } from "../../engine/placeholderResolver";
import { PLACEHOLDER_KEYS } from "../../engine/placeholderVocabulary";
import { SnippetField } from "../SnippetField";
import { QuickReplyPreviewBubble } from "./QuickReplyPreviewBubble";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export interface IQuickReplyEditorProps {
  initial?: { shortcut: string; title: string; body: string };
  onSubmit: (v: { shortcut: string; title: string; body: string }) => Promise<void> | void;
  onCancel?: () => void;
  /** Visible set (mine + store) for collision warning — non-blocking. */
  existingShortcuts: string[];
  submitLabel: string;
}

const SHORTCUT_RE = /^\/\S+$/;

/**
 * Form for creating or editing a quick reply. Includes:
 *  - Shortcut field (mono, `/` prefix + no-spaces validation)
 *  - Title field
 *  - Body textarea with SnippetField overlay painting `{{...}}` as amber pills
 *  - Placeholder chips row that insert `{{key}}` at the cursor position
 *  - Non-blocking collision warning when `existingShortcuts` contains the shortcut
 *  - Live preview via `QuickReplyPreviewBubble`
 *  - Submit disabled while any required field is blank
 */
export function QuickReplyEditor({
  initial,
  onSubmit,
  onCancel,
  existingShortcuts,
  submitLabel,
}: IQuickReplyEditorProps) {
  const s = QUICK_SEND_STRINGS.quickReplies;

  const [shortcut, setShortcut] = useState(initial?.shortcut ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [submitting, setSubmitting] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // --- Derived state ----------------------------------------------------------

  const shortcutTrimmed = shortcut.trim();
  const shortcutIsValid = shortcutTrimmed === "" || SHORTCUT_RE.test(shortcutTrimmed);
  const shortcutInvalid = shortcutTrimmed !== "" && !SHORTCUT_RE.test(shortcutTrimmed);

  // Collision check — normalise to lower-case for comparison (non-blocking)
  const normalizedExisting = existingShortcuts.map((s) => s.toLowerCase().trim());
  const hasCollision =
    shortcutTrimmed !== "" &&
    shortcutIsValid &&
    normalizedExisting.includes(shortcutTrimmed.toLowerCase());

  // Compute gaps for the SnippetField overlay
  const { gaps } = resolvePlaceholders(body, {});

  // Disable submit when any required field is empty
  const canSubmit = shortcutTrimmed !== "" && title.trim() !== "" && body.trim() !== "" && !shortcutInvalid;

  // --- Chip insertion ---------------------------------------------------------

  /**
   * Insert `{{key}}` at the current cursor position in the body textarea.
   * Falls back to appending at the end when the ref isn't focused.
   */
  const insertPlaceholder = useCallback(
    (key: string) => {
      const el = bodyRef.current;
      const token = `{{${key}}}`;
      if (!el) {
        setBody((prev) => prev + token);
        return;
      }
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = el.value.slice(0, start) + token + el.value.slice(end);
      setBody(next);
      // Restore cursor position after the inserted token
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      });
    },
    [],
  );

  // --- Submit -----------------------------------------------------------------

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        shortcut: shortcutTrimmed,
        title: title.trim(),
        body: body.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  // --- Render -----------------------------------------------------------------

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── Left column: form ── */}
      <div className="space-y-4">
        {/* Shortcut */}
        <div className="space-y-1">
          <label htmlFor="qr-shortcut" className="text-sm font-medium text-foreground">
            {s.shortcut}
          </label>
          <Input
            id="qr-shortcut"
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder={s.shortcutPlaceholder}
            className={cn(
              "font-mono",
              shortcutInvalid && "border-severity-warning ring-1 ring-severity-warning/50",
            )}
            aria-invalid={shortcutInvalid}
            aria-describedby={
              shortcutInvalid ? "qr-shortcut-error" : hasCollision ? "qr-shortcut-warn" : undefined
            }
            autoComplete="off"
            spellCheck={false}
          />
          {shortcutInvalid && (
            <p
              id="qr-shortcut-error"
              role="alert"
              className="flex items-center gap-1 text-[11px] text-severity-warning"
            >
              <Icon icon="mdi:alert-outline" size={12} aria-hidden="true" />
              {s.shortcutInvalid}
            </p>
          )}
          {!shortcutInvalid && hasCollision && (
            <p
              id="qr-shortcut-warn"
              role="status"
              className="flex items-center gap-1 text-[11px] text-severity-warning"
            >
              <Icon icon="mdi:alert-circle-outline" size={12} aria-hidden="true" />
              {s.shortcutCollision(shortcutTrimmed)}
            </p>
          )}
        </div>

        {/* Title */}
        <div className="space-y-1">
          <label htmlFor="qr-title" className="text-sm font-medium text-foreground">
            {s.title}
          </label>
          <Input
            id="qr-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={QUICK_SEND_STRINGS.library.snippetTitlePlaceholder}
          />
        </div>

        {/* Body + SnippetField overlay */}
        <div className="space-y-1">
          <label htmlFor="qr-body" className="text-sm font-medium text-foreground">
            {s.body}
          </label>

          {/* Placeholder chips */}
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={s.insertPlaceholder}
          >
            {PLACEHOLDER_KEYS.map((key) => (
              <Badge
                key={key}
                variant="outline"
                className="cursor-pointer font-mono text-[11px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                role="button"
                tabIndex={0}
                aria-label={`${s.insertPlaceholder}: {{${key}}}`}
                onClick={() => insertPlaceholder(key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    insertPlaceholder(key);
                  }
                }}
              >
                {`{{${key}}}`}
              </Badge>
            ))}
          </div>

          {/* Textarea + overlay wrapper */}
          <div className="relative">
            <Textarea
              id="qr-body"
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={QUICK_SEND_STRINGS.library.snippetBodyPlaceholder}
              rows={4}
              className="relative resize-none bg-transparent text-base md:text-sm"
              style={{ caretColor: "currentColor" }}
            />
            <SnippetField
              value={body}
              gaps={gaps}
              onChange={setBody}
              textareaRef={bodyRef as RefObject<HTMLTextAreaElement>}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            aria-label={submitLabel}
            title={!canSubmit && !shortcutInvalid ? s.missingFields : undefined}
          >
            {submitting && (
              <Icon icon="mdi:loading" size={14} className="animate-spin" aria-hidden="true" />
            )}
            {submitLabel}
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={submitting}>
              {s.cancel}
            </Button>
          )}
        </div>
      </div>

      {/* ── Right column: live preview ── */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <QuickReplyPreviewBubble body={body} />
      </div>
    </div>
  );
}
