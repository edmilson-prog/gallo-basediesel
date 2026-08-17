import { useNavigate } from "@tanstack/react-router";
import type { IContact } from "@/shared/types";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatPhone, formatRelativeTimeBR } from "@/shared/utils/format";
import { isPhoneLikeName } from "@/shared/utils/avatar";
import { contactInitials, CONTACT_SOURCE_LABELS } from "@/features/contacts";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";

const COPY = CUSTOMER_STRINGS.detail.contacts;

export interface ICustomerContactRowProps {
  contact: IContact;
  /** Holds the customer's WhatsApp anchor — derived, never stored on the row. */
  isPrimary: boolean;
  onSetPrimary: (contact: IContact) => void;
  onUnlink: (contact: IContact) => void;
}

/**
 * One person who speaks for the company.
 *
 * A LIST ROW, not a table row: this panel holds one to six people, so the
 * resizable-columns machinery the list screens use (ux-guidelines §4) would be
 * ceremony with no return. `ConversationsTab` sits in the same ficha and made
 * the same call.
 *
 * The row itself is NOT clickable. It carries three independent targets (the
 * name, the number, the menu) and wrapping them in an outer button would nest
 * targets and produce accidental navigation.
 */
export function CustomerContactRow({
  contact,
  isPrimary,
  onSetPrimary,
  onUnlink,
}: ICustomerContactRowProps) {
  const navigate = useNavigate();
  const digits = contact.phoneDigits ?? contact.phone?.replace(/\D/g, "") ?? "";
  // The contact was never named — the agenda kept the number as the name.
  // Repeating it in the phone column would be noise, so that column goes quiet.
  const isUnnamed = isPhoneLikeName(contact.name);

  return (
    <li
      className={cn(
        "group relative grid items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 motion-reduce:transition-none",
        "grid-cols-[auto_minmax(0,1fr)_auto]",
        "sm:grid-cols-[auto_minmax(0,1fr)_11rem_7rem_auto]",
      )}
    >
      {contact.optOut && (
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-severity-critical" />
      )}

      <span
        aria-hidden
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold",
          isPrimary ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {contactInitials(contact.name)}
      </span>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "truncate font-display text-sm font-bold uppercase tracking-wide text-foreground",
              isUnnamed && "tabular-nums tracking-[0.01em]",
            )}
            title={contact.name}
          >
            {contact.name}
          </span>
          {isPrimary && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-primary">
              <Icon icon="mdi:star" size={10} aria-hidden />
              {COPY.primary}
            </span>
          )}
          {contact.optOut && (
            <span className="inline-flex shrink-0 items-center rounded-full border border-severity-critical/30 bg-severity-critical/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-severity-critical">
              {COPY.optOut}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {contact.role
            ? `${contact.role} · ${CONTACT_SOURCE_LABELS[contact.source]}`
            : CONTACT_SOURCE_LABELS[contact.source]}
        </p>
      </div>

      {/* Fixed width, never 1fr: an 8-digit landline and a 9-digit mobile must
          land on the same left margin or the column reads as a ragged list. */}
      <div className="hidden items-center gap-1.5 sm:flex">
        {!isUnnamed && (
          <>
            {/* The glyph CHANGES with the state, not just its colour — colour is
                never the only carrier of meaning (ux-guidelines §5). */}
            <Icon
              icon={contact.hasWhatsapp ? "mdi:whatsapp" : "mdi:phone-outline"}
              size={14}
              aria-label={contact.hasWhatsapp ? COPY.hasWhatsapp : COPY.noWhatsapp}
              className={cn(
                "shrink-0",
                contact.hasWhatsapp ? "text-severity-success" : "text-muted-foreground/70",
              )}
            />
            {digits ? (
              <a
                href={`tel:${digits}`}
                className="truncate font-display text-[13px] font-bold tabular-nums tracking-[0.01em] text-foreground transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                {formatPhone(contact.phone ?? "")}
              </a>
            ) : (
              <span className="text-xs italic text-muted-foreground">—</span>
            )}
          </>
        )}
      </div>

      <div className="hidden text-right sm:block">
        <p className="text-[11px] text-muted-foreground">
          {contact.lastContactAt ? formatRelativeTimeBR(contact.lastContactAt) : COPY.neverContacted}
        </p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={COPY.rowActions(contact.name)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-60 transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 data-[state=open]:bg-muted data-[state=open]:opacity-100 motion-reduce:transition-none"
          >
            <Icon icon="mdi:dots-vertical" size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {digits && (
            <DropdownMenuItem onSelect={() => window.open(`tel:${digits}`, "_self")}>
              <Icon icon="mdi:phone-outline" size={14} />
              {COPY.call}
            </DropdownMenuItem>
          )}
          {!isPrimary && digits && (
            <DropdownMenuItem onSelect={() => onSetPrimary(contact)}>
              <Icon icon="mdi:star-outline" size={14} />
              {COPY.setPrimary}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() =>
              void navigate({ to: "/app/agenda", search: { q: digits || contact.name } } as never)
            }
          >
            <Icon icon="mdi:notebook-outline" size={14} />
            {COPY.viewInAgenda}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => onUnlink(contact)}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Icon icon="mdi:link-off" size={14} />
            {COPY.unlink}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
