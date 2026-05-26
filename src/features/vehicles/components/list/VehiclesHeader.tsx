import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.list;

export interface IVehiclesHeaderProps {
  total: number;
  searchValue: string;
  onSearchChange: (q: string) => void;
  canCreate: boolean;
  onCreate: () => void;
}

export function VehiclesHeader({
  total,
  searchValue,
  onSearchChange,
  canCreate,
  onCreate,
}: IVehiclesHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="text-base font-semibold text-foreground">{COPY.title}</h1>
        <Badge variant="outline" className="bg-muted/50 text-xs text-muted-foreground">
          {COPY.subtitle(total)}
        </Badge>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div className="relative">
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={COPY.searchPlaceholder}
            className="h-9 w-[300px] pl-8 text-sm"
          />
        </div>
        {canCreate && (
          <Button size="sm" className="gap-1.5" onClick={onCreate}>
            <Icon icon="mdi:plus" size={16} />
            {COPY.addButton}
          </Button>
        )}
      </div>
    </div>
  );
}
