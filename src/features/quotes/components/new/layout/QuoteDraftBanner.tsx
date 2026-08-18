// src/features/quotes/components/new/layout/QuoteDraftBanner.tsx
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";

export interface IQuoteDraftBannerProps {
  /** ISO timestamp of the unsaved draft found in localStorage. */
  savedAt: string;
  onRestore: () => void;
  onDiscard: () => void;
}

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Offer to restore the autosaved draft of a quote that was never submitted. */
export function QuoteDraftBanner({ savedAt, onRestore, onDiscard }: IQuoteDraftBannerProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-severity-warning/30 bg-severity-warning/5 px-3 py-2">
      <Icon icon="mdi:history" size={16} className="shrink-0 text-severity-warning" />
      <p className="min-w-0 flex-1 text-xs text-foreground">
        Há um rascunho não salvo de {dateTimeFormatter.format(new Date(savedAt))}.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onRestore}>
        Restaurar
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
        Descartar
      </Button>
    </div>
  );
}
