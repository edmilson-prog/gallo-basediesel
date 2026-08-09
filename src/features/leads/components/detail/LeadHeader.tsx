import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { ID, ICustomer, ILead, ISeller, LeadTemperature } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDateBR, formatPhone, formatRelativeTimeBR } from "@/shared/utils/format";
import {
  getOriginMeta,
  TEMPERATURE_META,
  getInitials,
  isConverted,
  isLost,
} from "../../utils/leadDisplay";
import { LEAD_TEMPERATURES } from "../../utils/listFilters";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

const COPY = LEADS_STRINGS.detail;

export interface ILeadHeaderProps {
  lead: ILead;
  seller?: ISeller;
  /** Everyone the lead can be handed to — the responsável is editable here. */
  sellers: ISeller[];
  convertedCustomer?: ICustomer | null;
  canEdit: boolean;
  /** Field currently being written, from `useLeadPatch`. */
  pendingField: string | null;
  onTemperatureChange: (temperature: LeadTemperature) => void;
  onSellerChange: (sellerId: ID | null) => void;
  onMarkConverted: () => void;
  onMarkLost: () => void;
  onCreateQuote?: () => void;
}

/**
 * Who this is, how to reach them, what state they are in, and what can be done.
 *
 * The old header stacked identity and state into one paragraph of equal-weight
 * chips: the phone was plain text, the stage badge repeated what the funnel
 * card says better, and temperature and owner — the two things that change most
 * often — could only be edited by entering a page-wide edit mode.
 *
 * Now identity sits on top, state sits on its own rule below it and is editable
 * in place, and origin and creation date demote to quiet reference.
 */
export function LeadHeader({
  lead,
  seller,
  sellers,
  convertedCustomer,
  canEdit,
  pendingField,
  onTemperatureChange,
  onSellerChange,
  onMarkConverted,
  onMarkLost,
  onCreateQuote,
}: ILeadHeaderProps) {
  const navigate = useNavigate();
  const tempMeta = TEMPERATURE_META[lead.temperature];
  const originMeta = getOriginMeta(lead.origin);
  const converted = isConverted(lead);
  const lost = isLost(lead);
  const closed = converted || lost;

  return (
    <header className="shrink-0 border-b border-border bg-card px-6 pt-3">
      <button
        type="button"
        onClick={() => void navigate({ to: "/app/leads" })}
        className="inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon icon="mdi:arrow-left" size={13} aria-hidden />
        {LEADS_STRINGS.page.title}
        <span aria-hidden className="text-muted-foreground/60">
          /
        </span>
        <span className="max-w-[16rem] truncate text-muted-foreground/60">{lead.name}</span>
      </button>

      <div className="mt-2 flex flex-wrap items-start gap-3">
        <Avatar className="size-11">
          <AvatarFallback className="text-sm font-semibold">
            {getInitials(lead.name)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-[1_1_20rem]">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold text-foreground">{lead.name}</h1>
            {converted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-severity-success/15 px-2 py-0.5 text-[10px] font-semibold text-severity-success">
                <Icon icon="mdi:check-decagram" size={11} aria-hidden />
                {LEADS_STRINGS.card.converted}
              </span>
            )}
            {lost && (
              <span className="inline-flex items-center gap-1 rounded-full bg-severity-critical/15 px-2 py-0.5 text-[10px] font-semibold text-severity-critical">
                <Icon icon="mdi:close-octagon" size={11} aria-hidden />
                {LEADS_STRINGS.card.lost}
              </span>
            )}
          </div>
          <PhoneRow lead={lead} />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {convertedCustomer && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void navigate({
                  to: "/app/clientes/$id",
                  params: { id: convertedCustomer.id },
                })
              }
            >
              <Icon icon="mdi:open-in-new" size={14} aria-hidden />
              {COPY.viewCustomer}
            </Button>
          )}
          {!closed && (
            <>
              {onCreateQuote && (
                <Button variant="outline" size="sm" onClick={onCreateQuote}>
                  <Icon icon="mdi:file-document-outline" size={14} aria-hidden />
                  {COPY.actions.createQuote}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onMarkLost}>
                <Icon icon="mdi:close-octagon-outline" size={14} aria-hidden />
                {LEADS_STRINGS.card.lost}
              </Button>
              <Button size="sm" onClick={onMarkConverted}>
                <Icon icon="mdi:check-decagram" size={14} aria-hidden />
                {COPY.actions.markConverted}
              </Button>
            </>
          )}
        </div>
      </div>

      {/*
        The state rule. What changes often is editable right here; what is only
        ever read — origin, creation — is quiet reference at the end.
      */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border py-2.5">
        <InlineMenu
          label={COPY.state.temperature}
          disabled={!canEdit}
          pending={pendingField === "temperature"}
          trigger={
            <span className={cn("inline-flex items-center gap-1.5 font-semibold", tempMeta.text)}>
              <Icon icon={tempMeta.icon} size={13} aria-hidden />
              {tempMeta.label}
            </span>
          }
        >
          {LEAD_TEMPERATURES.map((t) => (
            <DropdownMenuItem
              key={t}
              className="gap-2 text-xs"
              disabled={t === lead.temperature}
              onSelect={() => onTemperatureChange(t)}
            >
              <Icon icon={TEMPERATURE_META[t].icon} size={13} aria-hidden />
              {TEMPERATURE_META[t].label}
            </DropdownMenuItem>
          ))}
        </InlineMenu>

        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium",
            originMeta.tone,
          )}
        >
          <Icon icon={originMeta.icon} size={13} aria-hidden />
          {originMeta.label}
        </span>

        <span aria-hidden className="h-4 w-px bg-border" />

        <InlineMenu
          label={COPY.state.seller}
          disabled={!canEdit}
          pending={pendingField === "sellerId"}
          trigger={
            <span className="inline-flex items-center gap-1.5">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
                {seller ? getInitials(seller.fullName) : "—"}
              </span>
              <span className={cn("font-medium", !seller && "text-muted-foreground")}>
                {seller?.fullName ?? COPY.state.sellerQueue}
              </span>
            </span>
          }
        >
          {sellers.map((s) => (
            <DropdownMenuItem
              key={s.id}
              className="gap-2 text-xs"
              disabled={s.id === lead.sellerId}
              onSelect={() => onSellerChange(s.id)}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
                {getInitials(s.fullName)}
              </span>
              <span className="truncate">{s.fullName}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            className="gap-2 text-xs"
            disabled={lead.sellerId === null}
            onSelect={() => onSellerChange(null)}
          >
            <Icon icon="mdi:account-off-outline" size={14} aria-hidden />
            {COPY.state.sellerQueue}
            <span className="ml-auto text-muted-foreground">{COPY.state.sellerQueueHint}</span>
          </DropdownMenuItem>
        </InlineMenu>

        <span aria-hidden className="h-4 w-px bg-border" />

        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon icon="mdi:calendar-plus" size={13} aria-hidden />
          {COPY.state.createdRelative(formatRelativeTimeBR(lead.createdAt))}
          <span className="text-muted-foreground/60">· {formatDateBR(lead.createdAt)}</span>
        </span>
      </div>
    </header>
  );
}

/**
 * The phone as the button it always was.
 *
 * It was a line of grey text under the name — the single most-used piece of
 * data on the screen, and the only way to act on it was to select it by hand.
 */
function PhoneRow({ lead }: { lead: ILead }) {
  const navigate = useNavigate();
  const digits = lead.phone.replace(/\D/g, "");
  const [conversationId] = lead.conversations;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatPhone(lead.phone));
      toast.success(COPY.phone.copied);
    } catch {
      toast.error(COPY.phone.copyError);
    }
  };

  const openWhatsapp = () => {
    // An existing conversation belongs in the Atendimento, where the history
    // and the 24h window live. wa.me is the fallback for a lead nobody has
    // written to yet.
    if (conversationId) {
      void navigate({ to: "/app/atendimento/$id", params: { id: conversationId } });
      return;
    }
    window.open(`https://wa.me/${digits}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-1">
      <span className="text-sm tabular-nums text-muted-foreground">{formatPhone(lead.phone)}</span>
      <PhoneAction icon="mdi:content-copy" label={COPY.phone.copy} onClick={() => void copy()} />
      <PhoneAction
        icon="mdi:whatsapp"
        label={COPY.phone.whatsapp}
        onClick={openWhatsapp}
        className="hover:text-severity-success"
      />
      <PhoneAction
        icon="mdi:phone"
        label={COPY.phone.call}
        onClick={() => {
          window.location.href = `tel:+${digits}`;
        }}
      />
    </div>
  );
}

function PhoneAction({
  icon,
  label,
  onClick,
  className,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            "inline-flex size-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Icon icon={icon} size={14} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface IInlineMenuProps {
  label: string;
  disabled: boolean;
  pending: boolean;
  trigger: React.ReactNode;
  children: React.ReactNode;
}

/** A labelled value that opens a menu — or just a labelled value, without edit rights. */
function InlineMenu({ label, disabled, pending, trigger, children }: IInlineMenuProps) {
  const body = (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {trigger}
      {pending && (
        <Icon
          icon="svg-spinners:ring-resize"
          size={12}
          aria-hidden
          className="text-muted-foreground"
        />
      )}
    </span>
  );

  if (disabled) return body;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={COPY.inline.edit(label)}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded px-1.5 py-1 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
        <Icon icon="mdi:chevron-down" size={12} className="text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
