import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ID, ISeller, SdrEscalationReason, SdrFinishReason } from "@/shared/types";
import { useSellersProvider } from "@/providers/data";
import {
  ESCALATION_REASON_LABEL,
  FINISH_REASON_LABEL,
} from "../config/labels";
import type { ISdrHistoryFiltersState } from "../hooks/useSdrHistoryFilters";

export interface ISdrHistoryFiltersProps {
  state: ISdrHistoryFiltersState;
  toggleFinishReason: (reason: SdrFinishReason) => void;
  setEscalationReason: (reason: SdrEscalationReason | "all") => void;
  setSellerId: (id: ID | "all") => void;
  setHasQuote: (value: "all" | "yes" | "no") => void;
  reset: () => void;
}

const FINISH_OPTIONS: SdrFinishReason[] = [
  "completed",
  "escalated",
  "abandoned",
  "paused_by_human",
];

const ESCALATION_OPTIONS: (SdrEscalationReason | "all")[] = [
  "all",
  "customer_requested",
  "negotiation_detected",
  "sdr_failed",
  "complexity",
  "out_of_scope",
];

export function SdrHistoryFilters({
  state,
  toggleFinishReason,
  setEscalationReason,
  setSellerId,
  setHasQuote,
  reset,
}: ISdrHistoryFiltersProps) {
  const sellersProvider = useSellersProvider();
  const [sellers, setSellers] = useState<ISeller[]>([]);

  useEffect(() => {
    let cancelled = false;
    void sellersProvider.list({ active: true }).then((list) => {
      if (!cancelled) setSellers(list);
    });
    return () => {
      cancelled = true;
    };
  }, [sellersProvider]);

  const finishLabel =
    state.finishReasons.length === 0
      ? "Todos"
      : state.finishReasons.length === 1
        ? FINISH_REASON_LABEL[state.finishReasons[0]]
        : `${state.finishReasons.length} estados`;

  const escalationLabel =
    state.escalationReason === "all"
      ? "Todos os motivos"
      : ESCALATION_REASON_LABEL[state.escalationReason];

  const sellerLabel =
    state.sellerId === "all"
      ? "Todos"
      : (sellers.find((s) => s.id === state.sellerId)?.fullName ?? state.sellerId);

  const quoteLabel =
    state.hasQuote === "all"
      ? "Todos"
      : state.hasQuote === "yes"
        ? "Com orçamento"
        : "Sem orçamento";

  const activeCount =
    (state.finishReasons.length > 0 ? 1 : 0) +
    (state.escalationReason !== "all" ? 1 : 0) +
    (state.sellerId !== "all" ? 1 : 0) +
    (state.hasQuote !== "all" ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={state.finishReasons.length > 0 ? "secondary" : "outline"}
            size="sm"
            className="h-9 gap-1 text-xs"
          >
            <span className="text-muted-foreground">Estado:</span>
            <span className="font-medium">{finishLabel}</span>
            <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Estado final</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {FINISH_OPTIONS.map((reason) => (
            <DropdownMenuCheckboxItem
              key={reason}
              checked={state.finishReasons.includes(reason)}
              onCheckedChange={() => toggleFinishReason(reason)}
              onSelect={(e) => e.preventDefault()}
            >
              {FINISH_REASON_LABEL[reason]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={state.escalationReason !== "all" ? "secondary" : "outline"}
            size="sm"
            className="h-9 gap-1 text-xs"
          >
            <span className="text-muted-foreground">Motivo:</span>
            <span className="font-medium">{escalationLabel}</span>
            <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Motivo da escalação</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={state.escalationReason}
            onValueChange={(v) => setEscalationReason(v as SdrEscalationReason | "all")}
          >
            {ESCALATION_OPTIONS.map((reason) => (
              <DropdownMenuRadioItem key={reason} value={reason}>
                {reason === "all" ? "Todos" : ESCALATION_REASON_LABEL[reason]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={state.sellerId !== "all" ? "secondary" : "outline"}
            size="sm"
            className="h-9 gap-1 text-xs"
          >
            <span className="text-muted-foreground">Vendedor:</span>
            <span className="font-medium">{sellerLabel}</span>
            <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuLabel>Vendedor escalado</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={state.sellerId}
            onValueChange={(v) => setSellerId(v as ID | "all")}
          >
            <DropdownMenuRadioItem value="all">Todos</DropdownMenuRadioItem>
            {sellers.map((seller) => (
              <DropdownMenuRadioItem key={seller.id} value={seller.id}>
                {seller.fullName}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={state.hasQuote !== "all" ? "secondary" : "outline"}
            size="sm"
            className="h-9 gap-1 text-xs"
          >
            <span className="text-muted-foreground">Orçamento:</span>
            <span className="font-medium">{quoteLabel}</span>
            <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Orçamento gerado?</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={state.hasQuote}
            onValueChange={(v) => setHasQuote(v as "all" | "yes" | "no")}
          >
            <DropdownMenuRadioItem value="all">Todos</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="yes">Com orçamento</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="no">Sem orçamento</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {activeCount > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={reset}
          className="h-9 gap-1 text-xs"
        >
          <Icon icon="mdi:close-circle-outline" size={14} />
          Limpar ({activeCount})
        </Button>
      )}
    </div>
  );
}
