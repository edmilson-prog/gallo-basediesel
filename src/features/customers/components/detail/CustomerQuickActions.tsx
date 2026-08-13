import { useNavigate } from "@tanstack/react-router";
import type { ICustomer } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { getCustomerName } from "../../utils/customerDisplay";
import type { CustomerTabKey } from "../CustomerTabs";

const COPY = CUSTOMER_STRINGS.detail.quickActions;

export interface ICustomerQuickActionsProps {
  customer: ICustomer;
  /** Most recent conversation id, or null when the contact never talked to us. */
  latestConversationId: string | null;
  onGoToTab: (tab: CustomerTabKey) => void;
  /** Opens the wallet transfer modal owned by the overflow menu. */
  onTransferWallet?: () => void;
  className?: string;
}

interface IQuickAction {
  key: string;
  icon: string;
  label: string;
  /** Present = the action is unavailable and this explains why. */
  unavailable?: string;
  run?: () => void;
  /** Renders a hairline separator before this action. */
  separatorBefore?: boolean;
}

/**
 * The six header actions of the kit: WhatsApp · Ligar · Agendar | Nova nota ·
 * Adicionar veículo | Transferir carteira, in three groups split by hairlines.
 *
 * Every action here either does something real or is visibly disabled with the
 * reason in its tooltip. None of them fall through to a toast that merely tells
 * the user where to click next — a disabled control that explains itself beats a
 * live control that goes nowhere.
 *
 * E-mail is not one of them, by design: the kit spends this row on actions, and
 * the address is already a one-click `mailto:` in the facts band below.
 */
export function CustomerQuickActions({
  customer,
  latestConversationId,
  onGoToTab,
  onTransferWallet,
  className,
}: ICustomerQuickActionsProps) {
  const navigate = useNavigate();
  const phoneDigits = customer.phone?.replace(/\D/g, "") ?? "";
  // Same gate the overflow menu applies to its own "Transferir carteira" item.
  const canTransfer = usePermission("transfer", "create");

  const actions: IQuickAction[] = [
    {
      key: "whatsapp",
      icon: "mdi:whatsapp",
      label: COPY.whatsapp,
      unavailable: latestConversationId ? undefined : COPY.whatsappEmpty,
      run: latestConversationId
        ? () => void navigate({ to: `/app/atendimento/${latestConversationId}` as never })
        : undefined,
    },
    {
      key: "call",
      icon: "mdi:phone-outline",
      label: COPY.call,
      unavailable: phoneDigits ? undefined : COPY.callEmpty,
      run: phoneDigits ? () => window.open(`tel:${phoneDigits}`, "_self") : undefined,
    },
    {
      key: "schedule",
      icon: "mdi:calendar-plus",
      label: COPY.schedule,
      // The follow-up date lives on the agenda's contact record, so this hands
      // the seller to the agenda already filtered on this customer instead of
      // duplicating the scheduling form here.
      run: () =>
        void navigate({
          to: "/app/agenda",
          search: { q: phoneDigits || getCustomerName(customer) },
        } as never),
    },
    {
      key: "note",
      icon: "mdi:note-plus-outline",
      label: COPY.newNote,
      run: () => onGoToTab("notas"),
      separatorBefore: true,
    },
    {
      key: "vehicle",
      icon: "mdi:truck-plus-outline",
      label: COPY.addVehicle,
      run: () => onGoToTab("frota"),
    },
  ];

  if (canTransfer && onTransferWallet) {
    actions.push({
      key: "transfer",
      icon: "mdi:swap-horizontal",
      label: COPY.transferWallet,
      unavailable: customer.sellerId === null ? COPY.transferWalletEmpty : undefined,
      run: customer.sellerId === null ? undefined : onTransferWallet,
      separatorBefore: true,
    });
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {actions.map((action) => (
        <div key={action.key} className="flex items-center">
          {action.separatorBefore && <span aria-hidden className="mx-1.5 h-4 w-px bg-border" />}
          <Tooltip>
            <TooltipTrigger asChild>
              {/* A disabled button reports no pointer events, so the tooltip needs
                  a live wrapper to stay reachable and keep explaining itself. */}
              <span className="inline-flex">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-[34px] w-[34px] text-muted-foreground hover:text-foreground"
                  disabled={action.unavailable != null}
                  aria-label={action.unavailable ?? action.label}
                  onClick={action.run}
                >
                  <Icon icon={action.icon} size={16} />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">{action.unavailable ?? action.label}</TooltipContent>
          </Tooltip>
        </div>
      ))}
    </div>
  );
}
