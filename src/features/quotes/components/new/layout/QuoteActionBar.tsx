// src/features/quotes/components/new/layout/QuoteActionBar.tsx
import type { QuoteLayout } from "../../../types/editor";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { LayoutSwitcher } from "./LayoutSwitcher";

export interface IQuoteActionBarProps {
  layout: QuoteLayout;
  onLayoutChange: (l: QuoteLayout) => void;
  onBack: () => void;
  canSubmit: boolean;
  submitting: boolean;
  needsApproval: boolean;
  onSaveDraft: () => void;
  onSaveSend: () => void;
}

export function QuoteActionBar({
  layout,
  onLayoutChange,
  onBack,
  canSubmit,
  submitting,
  needsApproval,
  onSaveDraft,
  onSaveSend,
}: IQuoteActionBarProps) {
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Icon icon="mdi:chevron-left" size={14} />
          Voltar
        </button>
        <h1 className="text-lg font-semibold text-foreground">Novo orçamento</h1>
      </div>
      <div className="flex items-center gap-2">
        <LayoutSwitcher value={layout} onChange={onLayoutChange} />
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
          <Icon icon="mdi:send-outline" size={16} />
          {needsApproval ? "Salvar e solicitar aprovação" : "Salvar e enviar"}
        </Button>
      </div>
    </div>
  );
}
