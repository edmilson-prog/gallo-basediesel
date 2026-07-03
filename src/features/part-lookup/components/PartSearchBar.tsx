import type { ReactNode, Ref } from "react";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/Icon";
import { PART_LOOKUP_STRINGS as S } from "../i18n/pt-BR";

const VEHICLE_BRANDS = ["Volvo", "Scania", "Mercedes-Benz", "Ford", "Iveco"];

export interface IPartSearchBarProps {
  query: string;
  onQueryChange: (v: string) => void;
  vehicleBrand: string | null;
  onVehicleBrandChange: (v: string | null) => void;
  inStockOnly: boolean;
  onInStockToggle: () => void;
  inputRef?: Ref<HTMLInputElement>;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-card text-muted-foreground hover:bg-muted/60"
      }`}
    >
      {children}
    </button>
  );
}

export function PartSearchBar(props: IPartSearchBarProps) {
  const {
    query,
    onQueryChange,
    vehicleBrand,
    onVehicleBrandChange,
    inStockOnly,
    onInStockToggle,
    inputRef,
  } = props;
  return (
    <div className="space-y-2">
      <div className="relative">
        <Icon
          icon="mdi:magnify"
          size={16}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={S.searchPlaceholder}
          className="h-9 pl-8"
          aria-label={S.searchPlaceholder}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {VEHICLE_BRANDS.map((b) => (
          <Chip
            key={b}
            active={vehicleBrand === b}
            onClick={() => onVehicleBrandChange(vehicleBrand === b ? null : b)}
          >
            {b}
          </Chip>
        ))}
        <Chip active={inStockOnly} onClick={onInStockToggle}>
          {S.filterInStock}
        </Chip>
      </div>
    </div>
  );
}
