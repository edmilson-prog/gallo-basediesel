import { Link } from "@tanstack/react-router";
import type { ContactSource, IContact } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { initialsFrom } from "@/shared/utils/avatar";
import { formatRelativeTimeBR } from "@/shared/utils/format";
import { contactInitials } from "../../engine/contactInitials";
import { CONTACT_SOURCE_LABELS } from "../../utils/labels";

/** Tags cap on the chip row — tighter when the contact is opted out (danger chip needs room). */
const TAG_CAP = 3;
const TAG_CAP_OPT_OUT = 1;

/**
 * Everything the card can ask the page to do.
 *
 * The first three are the inline footer buttons; the rest live behind the "…"
 * menu. They share one union so the page answers all of them in a single
 * exhaustive switch — a menu entry that nobody handles then fails to compile
 * instead of falling through to a toast.
 */
export type ContactAction =
  | "conversation"
  | "call"
  | "schedule"
  | "open"
  | "openCustomer"
  | "unlink"
  | "addTag"
  | "transferOwner"
  | "toggleOptOut";

interface IQuickActionDef {
  id: Extract<ContactAction, "conversation" | "call" | "schedule">;
  icon: string;
  label: string;
}

const QUICK_ACTIONS: IQuickActionDef[] = [
  { id: "conversation", icon: "mdi:message-text-outline", label: "Iniciar conversa" },
  { id: "call", icon: "mdi:phone-outline", label: "Ligar" },
  { id: "schedule", icon: "mdi:calendar-clock-outline", label: "Agendar retorno" },
];

export interface IContactCardProps {
  contact: IContact;
  selected: boolean;
  /**
   * Flags the contact as a probable duplicate. There is no detection engine yet
   * — that lands with the Fase 3 triage work — so no caller sets this today and
   * the chip stays dark. The slot exists so wiring it in later is a one-line change.
   */
  isDuplicate?: boolean;
  onSelect: (contact: IContact, selected: boolean) => void;
  onOpen: (contact: IContact) => void;
  onAction: (contact: IContact, action: ContactAction) => void;
  onLink: (contact: IContact) => void;
}

/** "Cargo · Origem", or just the origin when there's no role on file. */
function formatRoleOrigin(role: string | null, source: ContactSource): string {
  const originLabel = CONTACT_SOURCE_LABELS[source];
  return role ? `${role} · ${originLabel}` : originLabel;
}

/** "Cidade / UF", degrading gracefully when either half is missing. */
function formatCityUf(city: string | null, uf: string | null): string | null {
  if (city && uf) return `${city} / ${uf}`;
  return city ?? uf ?? null;
}

/**
 * Contact card for the Agenda grid — 1:1 port of the kit's card, translated to
 * semantic tokens. Colours come from tokens (accent, severity-*), everything
 * else (measurements, states, behaviour) is kept verbatim.
 */
export function ContactCard({
  contact,
  selected,
  isDuplicate = false,
  onSelect,
  onOpen,
  onAction,
  onLink,
}: IContactCardProps) {
  const cityUf = formatCityUf(contact.city, contact.uf);
  const tagCap = contact.optOut ? TAG_CAP_OPT_OUT : TAG_CAP;
  const shownTags = contact.tags.slice(0, tagCap);

  const handleOpen = () => onOpen(contact);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleOpen();
        }
      }}
      aria-label={`Contato ${contact.name}${contact.optOut ? ", em opt-out" : ""}`}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-[11px] overflow-hidden rounded-xl border border-border bg-card p-[14px_15px] text-left transition-all",
        "hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring",
        selected && "border-accent bg-accent/5",
      )}
    >
      {contact.optOut && (
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-severity-critical" />
      )}

      {/* Header: avatar, name, cargo · origem, and the selection checkbox. */}
      <div className="flex items-start gap-2.5 pr-6">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className="bg-accent/15 text-sm font-semibold text-accent">
            {contactInitials(contact.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 pt-0.5">
          <h3
            className="truncate font-display text-sm font-bold uppercase tracking-wide text-foreground"
            title={contact.name}
          >
            {contact.name}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {formatRoleOrigin(contact.role, contact.source)}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "absolute right-3 top-3 opacity-30 transition-opacity group-hover:opacity-100",
          selected && "opacity-100",
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelect(contact, Boolean(checked))}
          aria-label={`Selecionar ${contact.name}`}
        />
      </div>

      {/* Link block — the card's visual heart: linked to a customer, or loose. */}
      {contact.customerId ? (
        <Link
          to="/app/clientes/$id"
          params={{ id: contact.customerId }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2 transition-colors hover:bg-muted/60"
        >
          <Icon icon="mdi:office-building" size={16} className="shrink-0 text-accent" />
          <span className="truncate text-xs font-medium text-accent">
            {contact.customerName ?? "Cliente"}
          </span>
        </Link>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-severity-info bg-severity-info/10 px-2.5 py-2">
          <Icon icon="mdi:link-off" size={16} className="shrink-0 text-severity-info" />
          <span className="flex-1 truncate text-xs text-severity-info">Sem cliente</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLink(contact);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            className="shrink-0 text-xs font-semibold text-severity-info underline-offset-2 hover:underline"
          >
            Vincular
          </button>
        </div>
      )}

      {/* Phone, e-mail, cidade/UF — icon + text, each degrading to a muted fallback. */}
      <div className="flex flex-col gap-1.5 text-xs">
        <div className="flex items-center gap-1.5">
          {contact.phone ? (
            <>
              <Icon
                icon={contact.hasWhatsapp ? "mdi:whatsapp" : "mdi:phone-outline"}
                size={14}
                className={cn(
                  "shrink-0",
                  contact.hasWhatsapp ? "text-severity-success" : "text-muted-foreground",
                )}
              />
              <span className="truncate text-foreground">{contact.phone}</span>
            </>
          ) : (
            <>
              <Icon
                icon="mdi:phone-off-outline"
                size={14}
                className="shrink-0 text-muted-foreground/70"
              />
              <span className="italic text-muted-foreground/70">sem telefone</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {contact.email ? (
            <>
              <Icon icon="mdi:email-outline" size={14} className="shrink-0 text-muted-foreground" />
              <span className="truncate text-foreground">{contact.email}</span>
            </>
          ) : (
            <>
              <Icon
                icon="mdi:email-off-outline"
                size={14}
                className="shrink-0 text-muted-foreground/70"
              />
              <span className="italic text-muted-foreground/70">sem e-mail</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Icon
            icon="mdi:map-marker-outline"
            size={14}
            className="shrink-0 text-muted-foreground"
          />
          {cityUf ? (
            <span className="truncate text-foreground">{cityUf}</span>
          ) : (
            <span className="italic text-muted-foreground/70">sem localização</span>
          )}
        </div>
      </div>

      {/* Chips: opt-out, possible duplicate, then up to 3 tags (1 when opted out). */}
      <div className="flex flex-wrap items-center gap-1.5">
        {contact.optOut && (
          <Badge variant="critical" className="text-[10px]">
            Opt-out
          </Badge>
        )}
        {isDuplicate && (
          <Badge variant="warning" className="text-[10px]">
            Duplicado?
          </Badge>
        )}
        {shownTags.length > 0 ? (
          shownTags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="border-border bg-muted/50 text-[10px] text-muted-foreground"
            >
              {tag}
            </Badge>
          ))
        ) : (
          <span className="text-[10px] italic text-muted-foreground/70">sem etiquetas</span>
        )}
      </div>

      {/* Footer: owner + last contact on the left, quick actions on the right. */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {contact.ownerName ? (
            <Avatar className="h-[22px] w-[22px] shrink-0" title={contact.ownerName}>
              <AvatarFallback className="bg-muted text-[10px] font-semibold text-foreground">
                {initialsFrom(contact.ownerName)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <span
              aria-hidden
              className="h-[22px] w-[22px] shrink-0 rounded-full border border-dashed border-border"
            />
          )}
          <span className="truncate text-[11px] text-muted-foreground">
            {formatRelativeTimeBR(contact.lastContactAt)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {QUICK_ACTIONS.map((action) => {
            const disabled =
              (action.id === "conversation" && contact.optOut) ||
              (action.id === "call" && !contact.phone);
            return (
              <Tooltip key={action.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction(contact, action.id);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    aria-label={action.label}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <Icon icon={action.icon} size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {action.id === "conversation" && contact.optOut
                    ? "Contato em opt-out — conversa desabilitada"
                    : action.id === "call" && !contact.phone
                      ? "Contato sem telefone"
                      : action.label}
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* Deliberately no Radix Tooltip on this trigger: a tooltip wrapping a
              menu trigger stays open behind the menu. `title` gives the same
              hint without the stuck-tooltip behaviour. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Mais ações"
                title="Mais ações"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
              >
                <Icon icon="mdi:dots-horizontal" size={16} />
              </button>
            </DropdownMenuTrigger>
            {/* The menu renders in a portal, but React still bubbles its events
                through the component tree — without this the card's onClick
                would fire and open the drawer behind every menu choice. */}
            <DropdownMenuContent
              align="end"
              className="w-56"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onSelect={() => onAction(contact, "open")}>
                <Icon icon="mdi:card-account-details-outline" size={15} />
                Abrir contato
              </DropdownMenuItem>

              {contact.customerId ? (
                <>
                  <DropdownMenuItem onSelect={() => onAction(contact, "openCustomer")}>
                    <Icon icon="mdi:open-in-new" size={15} />
                    Ver ficha do cliente
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onAction(contact, "unlink")}>
                    <Icon icon="mdi:link-off" size={15} />
                    Desvincular do cliente
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onSelect={() => onLink(contact)}>
                  <Icon icon="mdi:link-variant" size={15} />
                  Vincular a cliente
                </DropdownMenuItem>
              )}

              <DropdownMenuItem onSelect={() => onAction(contact, "addTag")}>
                <Icon icon="mdi:tag-plus-outline" size={15} />
                Adicionar etiqueta
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction(contact, "transferOwner")}>
                <Icon icon="mdi:account-switch-outline" size={15} />
                Transferir responsável
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={() => onAction(contact, "toggleOptOut")}
                className={cn(
                  !contact.optOut && "text-severity-critical focus:text-severity-critical",
                )}
              >
                <Icon
                  icon={contact.optOut ? "mdi:shield-check-outline" : "mdi:shield-off-outline"}
                  size={15}
                />
                {contact.optOut ? "Remover opt-out" : "Marcar opt-out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
