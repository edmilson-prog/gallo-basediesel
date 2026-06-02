// src/features/quotes/components/new/layout/LayoutSwitcher.tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon } from "@/components/Icon";
import { QUOTE_LAYOUT_OPTIONS, type QuoteLayout } from "../../../types/editor";

export function LayoutSwitcher({
  value,
  onChange,
}: {
  value: QuoteLayout;
  onChange: (v: QuoteLayout) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as QuoteLayout)}
      aria-label="Layout do editor"
    >
      {QUOTE_LAYOUT_OPTIONS.map((opt) => (
        <ToggleGroupItem key={opt.value} value={opt.value} aria-label={opt.label} title={opt.label}>
          <Icon icon={opt.icon} size={16} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
