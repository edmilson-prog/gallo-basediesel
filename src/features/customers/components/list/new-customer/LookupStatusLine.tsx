import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { NewCustomerDocState } from "../../../engine/newCustomerLookup";
import { CUSTOMER_STRINGS } from "../../../i18n/pt-BR";

const COPY = CUSTOMER_STRINGS.newCustomer.status;

interface IStatusLook {
  /** `null` renders the spinner instead of a glyph. */
  icon: string | null;
  tone: "muted" | "critical" | "primary";
  text: string;
}

/**
 * What the field is doing right now, in one sentence under the input.
 *
 * States that have their own panel (`done`, `duplicate`) render nothing here —
 * the panel already says it, and saying it twice reads as two problems.
 */
function look(state: NewCustomerDocState, type: ICustomer["type"]): IStatusLook | null {
  switch (state) {
    case "idle":
      return { icon: "mdi:creation-outline", tone: "muted", text: COPY.idle };
    case "typing":
      return { icon: "mdi:creation-outline", tone: "muted", text: COPY.typing };
    case "invalid":
      return {
        icon: "mdi:alert-circle-outline",
        tone: "critical",
        text: type === "B2B" ? COPY.invalidCnpj : COPY.invalidCpf,
      };
    case "loading":
      return { icon: null, tone: "primary", text: COPY.loading };
    case "notfound":
      return { icon: "mdi:magnify-remove-outline", tone: "critical", text: COPY.notfound };
    case "error":
      return { icon: "mdi:wifi-off", tone: "primary", text: COPY.error };
    case "manual":
      return { icon: "mdi:pencil-outline", tone: "muted", text: COPY.manual };
    default:
      return null;
  }
}

export interface ILookupStatusLineProps {
  state: NewCustomerDocState;
  type: ICustomer["type"];
  id?: string;
}

export function LookupStatusLine({ state, type, id }: ILookupStatusLineProps) {
  const status = look(state, type);
  if (!status) return null;

  const toneClass = {
    muted: "text-muted-foreground",
    critical: "text-severity-critical",
    primary: "text-primary",
  }[status.tone];

  return (
    <div
      id={id}
      aria-live="polite"
      className={cn("mt-[7px] flex min-h-4 items-center gap-[7px]", toneClass)}
    >
      {status.icon === null ? (
        <span
          aria-hidden="true"
          className="size-[13px] shrink-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary motion-reduce:animate-none"
        />
      ) : (
        <Icon icon={status.icon} size={13} className="shrink-0" />
      )}
      <span className={cn("text-xs", status.tone === "muted" ? "font-normal" : "font-semibold")}>
        {status.text}
      </span>
    </div>
  );
}
