// src/features/quotes/components/new/layout/QuoteActionBar.tsx
import type { QuoteDensity, QuoteLayout } from "../../../types/editor";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { ScrollProgressBar } from "@/features/shell/components/ScrollProgressBar";
import { DisplayMenu } from "./DisplayMenu";

export interface IQuoteActionBarProps {
  layout: QuoteLayout;
  onLayoutChange: (l: QuoteLayout) => void;
  density: QuoteDensity;
  onDensityChange: (d: QuoteDensity) => void;
  onBack: () => void;
  canSubmit: boolean;
  submitting: boolean;
  needsApproval: boolean;
  onSaveDraft: () => void;
  onSaveSend: () => void;
  /** ISO timestamp of the last autosave, shown as "salvo às HH:MM". */
  savedAt?: string | null;
}

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

export function QuoteActionBar({
  layout,
  onLayoutChange,
  density,
  onDensityChange,
  onBack,
  canSubmit,
  submitting,
  needsApproval,
  onSaveDraft,
  onSaveSend,
  savedAt,
}: IQuoteActionBarProps) {
  return (
    <div className="sticky top-0 z-20 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/40 bg-background/85 px-3 py-2.5 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50 md:px-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
      >
        <Icon icon="mdi:chevron-left" size={16} />
        Voltar
      </button>
      <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
      <h1 className="shrink-0 text-lg font-semibold text-foreground">Novo orçamento</h1>
      <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Rascunho
      </span>
      {savedAt && (
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <Icon icon="mdi:check-all" size={13} />
          salvo às {timeFormatter.format(new Date(savedAt))}
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <DisplayMenu
          layout={layout}
          onLayoutChange={onLayoutChange}
          density={density}
          onDensityChange={onDensityChange}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!canSubmit || submitting}
          onClick={onSaveDraft}
        >
          <Icon icon="mdi:content-save-outline" size={16} />
          Salvar rascunho
        </Button>
        <Button size="sm" disabled={!canSubmit || submitting} onClick={onSaveSend}>
          <Icon icon={needsApproval ? "mdi:shield-alert-outline" : "mdi:send-outline"} size={16} />
          {needsApproval ? "Salvar e solicitar aprovação" : "Salvar e enviar"}
        </Button>
      </div>

      <ScrollProgressBar />
    </div>
  );
}
