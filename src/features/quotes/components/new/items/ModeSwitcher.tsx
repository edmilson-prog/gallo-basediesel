// src/features/quotes/components/new/items/ModeSwitcher.tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon } from "@/components/Icon";
import { QUOTE_ADD_MODE_OPTIONS, type QuoteAddMode } from "../../../types/editor";

export function ModeSwitcher({
  value,
  onChange,
}: {
  value: QuoteAddMode;
  onChange: (v: QuoteAddMode) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as QuoteAddMode)}
      aria-label="Modo de adição de itens"
      size="sm"
    >
      {QUOTE_ADD_MODE_OPTIONS.map((opt) => (
        <ToggleGroupItem
          key={opt.value}
          value={opt.value}
          aria-label={opt.label}
          className="gap-1 text-xs"
        >
          <Icon icon={opt.icon} size={14} />
          <span className="hidden sm:inline">{opt.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
