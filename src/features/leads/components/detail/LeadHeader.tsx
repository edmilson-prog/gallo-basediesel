import { useNavigate } from "@tanstack/react-router";
import type { ICustomer, ILead, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/shared/utils/format";
import { getAccentClasses } from "@/features/funnels/engine/accentClasses";
import { hexToAccentSlot } from "@/features/funnels/engine/legacyStageColor";
import {
  getOriginMeta,
  TEMPERATURE_META,
  getInitials,
  isConverted,
  isLost,
} from "../../utils/leadDisplay";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

export interface ILeadHeaderProps {
  lead: ILead;
  seller?: ISeller;
  convertedCustomer?: ICustomer | null;
  canEdit: boolean;
  onEdit: () => void;
  onMarkConverted: () => void;
  onMarkLost: () => void;
  onCreateQuote?: () => void;
}

const COPY = LEADS_STRINGS.detail;

export function LeadHeader({
  lead,
  seller,
  convertedCustomer,
  canEdit,
  onEdit,
  onMarkConverted,
  onMarkLost,
  onCreateQuote,
}: ILeadHeaderProps) {
  const navigate = useNavigate();
  const tempMeta = TEMPERATURE_META[lead.temperature];
  const originMeta = getOriginMeta(lead.origin);
  const converted = isConverted(lead);
  const lost = isLost(lead);

  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-border bg-card px-6 py-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void navigate({ to: "/app/leads" })}
        className="gap-1.5"
      >
        <Icon icon="mdi:arrow-left" size={16} />
        {LEADS_STRINGS.page.backToList}
      </Button>

      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          <AvatarFallback className="text-sm font-semibold">
            {getInitials(lead.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-foreground">{lead.name}</h1>
          <p className="text-sm text-muted-foreground">{formatPhone(lead.phone)}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium text-foreground",
                getAccentClasses(hexToAccentSlot(lead.stage.color)).border,
              )}
            >
              {lead.stage.name}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                tempMeta.tone,
              )}
            >
              <Icon icon={tempMeta.icon} size={11} />
              {tempMeta.label}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                originMeta.tone,
              )}
            >
              <Icon icon={originMeta.icon} size={11} />
              {originMeta.label}
            </span>
            {converted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-severity-success/15 px-2 py-0.5 text-[10px] font-semibold text-severity-success">
                <Icon icon="mdi:check-decagram" size={11} />
                {LEADS_STRINGS.card.converted}
              </span>
            )}
            {lost && (
              <span className="inline-flex items-center gap-1 rounded-full bg-severity-critical/15 px-2 py-0.5 text-[10px] font-semibold text-severity-critical">
                <Icon icon="mdi:close-octagon" size={11} />
                {LEADS_STRINGS.card.lost}
              </span>
            )}
            {seller && (
              <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Icon icon="mdi:account-tie-outline" size={11} />
                {seller.fullName}
              </span>
            )}
          </div>
        </div>
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
            <Icon icon="mdi:open-in-new" size={14} />
            {COPY.viewCustomer}
          </Button>
        )}
        {!converted && !lost && (
          <>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Icon icon="mdi:pencil-outline" size={14} />
                {COPY.actions.edit}
              </Button>
            )}
            <Button variant="default" size="sm" onClick={onMarkConverted}>
              <Icon icon="mdi:check-decagram" size={14} />
              {COPY.actions.markConverted}
            </Button>
            <Button variant="destructive" size="sm" onClick={onMarkLost}>
              <Icon icon="mdi:close-octagon-outline" size={14} />
              {COPY.actions.markLost}
            </Button>
            {onCreateQuote && (
              <Button variant="ghost" size="sm" onClick={onCreateQuote}>
                <Icon icon="mdi:file-document-outline" size={14} />
                {COPY.actions.createQuote}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
