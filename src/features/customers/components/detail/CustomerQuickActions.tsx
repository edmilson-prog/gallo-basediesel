import { useNavigate } from "@tanstack/react-router";
import type { ICustomer } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import type { CustomerTabKey } from "../CustomerTabs";

const COPY = CUSTOMER_STRINGS.detail.quickActions;

export interface ICustomerQuickActionsProps {
  customer: ICustomer;
  /** Most recent conversation id, or null when the contact never talked to us. */
  latestConversationId: string | null;
  onGoToTab: (tab: CustomerTabKey) => void;
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
 * The six header actions from the kit, minus the ones the overflow menu already
 * owns (transfer wallet, rename, block).
 *
 * Every action here either does something real or is visibly disabled with the
 * reason in its tooltip. None of them fall through to a toast that merely tells
 * the user where to click next — a disabled control that explains itself beats a
 * live control that goes nowhere.
 */
export function CustomerQuickActions({
  customer,
  latestConversationId,
  onGoToTab,
  className,
}: ICustomerQuickActionsProps) {
  const navigate = useNavigate();
  const phoneDigits = customer.phone?.replace(/\D/g, "") ?? "";
  const email = customer.email?.trim();

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
      key: "email",
      icon: "mdi:email-outline",
      label: COPY.email,
      unavailable: email ? undefined : COPY.emailEmpty,
      run: email ? () => window.open(`mailto:${email}`, "_self") : undefined,
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

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {actions.map((action) => (
        <div key={action.key} className="flex items-center">
          {action.separatorBefore && <span aria-hidden className="mx-1.5 h-4 w-px bg-border" />}
          <Tooltip>
            <TooltipTrigger asChild>
              {/* A disabled button reports no pointer events, so the tooltip needs
                  a live wrapper to stay reachable and keep explaining itself. */}
              <span className="inline-flex">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
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
