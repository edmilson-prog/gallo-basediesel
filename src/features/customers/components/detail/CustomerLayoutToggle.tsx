import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import type { CustomerDetailLayout } from "../../hooks/useCustomerDetailLayout";

const COPY = CUSTOMER_STRINGS.detail.layout;

export interface ICustomerLayoutToggleProps {
  layout: CustomerDetailLayout;
  onToggle: () => void;
}

/**
 * Switches the header between the kit's two directions — A · Faixas and
 * B · Painel — so they can be compared on the real screen with real data.
 *
 * Owner and Gestor only: this is an evaluation control, not a per-seller
 * setting. When a direction is picked for good, this component and the
 * losing header go away together.
 */
export function CustomerLayoutToggle({ layout, onToggle }: ICustomerLayoutToggleProps) {
  const { hasRole } = useAuth();
  if (!hasRole(["Owner", "Gestor"])) return null;

  const nextLabel = layout === "faixas" ? COPY.painel : COPY.faixas;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-[34px] w-[34px] text-muted-foreground hover:text-foreground"
          aria-label={COPY.switchTo(nextLabel)}
          onClick={onToggle}
        >
          <Icon
            icon={layout === "faixas" ? "mdi:view-split-vertical" : "mdi:view-agenda-outline"}
            size={16}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{COPY.switchTo(nextLabel)}</TooltipContent>
    </Tooltip>
  );
}
