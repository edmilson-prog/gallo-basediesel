import type { ID, IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATALOG_STRINGS } from "../../../i18n/pt-BR";
import type { PartCodeState } from "../../../engine/newPart";
import { NewPartField } from "./NewPartField";

const COPY = CATALOG_STRINGS.newPart.code;

interface IStatusLook {
  /** `null` renders the spinner instead of a glyph. */
  icon: string | null;
  tone: "muted" | "primary" | "success" | "critical";
  text: string;
}

/**
 * What the code field is doing right now, in one sentence under the input.
 *
 * `duplicate` says nothing here — the panel beside the field already says it,
 * and saying it twice reads as two problems.
 */
function look(state: PartCodeState): IStatusLook | null {
  switch (state) {
    case "idle":
      return { icon: "mdi:auto-fix", tone: "muted", text: COPY.idle };
    case "typing":
      return { icon: "mdi:keyboard-outline", tone: "muted", text: COPY.typing };
    case "loading":
      return { icon: null, tone: "primary", text: COPY.loading };
    case "free":
      return { icon: "mdi:check-circle-outline", tone: "success", text: COPY.free };
    case "error":
      return { icon: "mdi:wifi-off", tone: "primary", text: COPY.error };
    default:
      return null;
  }
}

const TONE_CLASS: Record<IStatusLook["tone"], string> = {
  muted: "text-muted-foreground",
  primary: "text-primary",
  success: "text-severity-success",
  critical: "text-severity-critical",
};

export interface IPartCodeBandProps {
  code: string;
  onCodeChange: (next: string) => void;
  state: PartCodeState;
  duplicate: IPart | null;
  onOpenPart: (id: ID) => void;
}

/**
 * The code comes first, and the catalog answers while it is typed.
 *
 * This is the one field that already exists on the box and on the invoice, and
 * the only one that can say "we already have this" before the rest of the form
 * is filled in. Checking it on submit is how the base grew its duplicates.
 */
export function PartCodeBand({
  code,
  onCodeChange,
  state,
  duplicate,
  onOpenPart,
}: IPartCodeBandProps) {
  const status = look(state);
  const isDuplicate = state === "duplicate";

  const adornment =
    state === "loading" ? (
      <span
        aria-hidden="true"
        className="size-4 shrink-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary motion-reduce:animate-none"
      />
    ) : state === "free" ? (
      <Icon icon="mdi:check-circle" size={17} className="text-severity-success" />
    ) : isDuplicate ? (
      <Icon icon="mdi:alert-octagon" size={17} className="text-severity-critical" />
    ) : null;

  return (
    <section
      className={cn(
        "rounded-xl border bg-card p-[18px]",
        "transition-colors duration-200 motion-reduce:transition-none",
        isDuplicate ? "border-severity-critical/55" : "border-border",
      )}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <NewPartField
          id="new-part-code"
          label={COPY.label}
          note={COPY.note}
          required
          value={code}
          onChange={onCodeChange}
          placeholder={COPY.placeholder}
          mono
          size="lg"
          autoFocus
          invalid={isDuplicate}
          adornment={adornment}
          describedBy="new-part-code-status"
        >
          <div
            id="new-part-code-status"
            aria-live="polite"
            className={cn(
              "mt-2 flex min-h-4 items-center gap-[7px]",
              status ? TONE_CLASS[status.tone] : undefined,
            )}
          >
            {status &&
              (status.icon === null ? (
                <span
                  aria-hidden="true"
                  className="size-[13px] shrink-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary motion-reduce:animate-none"
                />
              ) : (
                <Icon icon={status.icon} size={13} className="shrink-0" />
              ))}
            <span
              className={cn("text-xs", status?.tone === "muted" ? "font-normal" : "font-semibold")}
            >
              {status?.text}
            </span>
          </div>
          {state === "idle" && (
            <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground/70">
              {COPY.hint}
            </p>
          )}
        </NewPartField>

        {duplicate && (
          <div className="animate-in fade-in slide-in-from-top-1 flex items-center gap-3 rounded-[9px] border border-severity-critical/45 bg-severity-critical/[0.07] px-3.5 py-3 duration-300 lg:mt-[26px]">
            <Icon
              icon="mdi:alert-octagon-outline"
              size={18}
              className="shrink-0 text-severity-critical"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-bold text-foreground">
                {COPY.duplicateTitle(duplicate.name)}
              </div>
              <div className="mt-px truncate text-[11.5px] text-muted-foreground">
                {COPY.duplicateDetail(duplicate.sku)}
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onOpenPart(duplicate.id)}
              className="shrink-0 gap-1.5 font-display text-xs font-bold uppercase tracking-[0.045em]"
            >
              <Icon icon="mdi:arrow-right" size={13} />
              {COPY.openPart}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
