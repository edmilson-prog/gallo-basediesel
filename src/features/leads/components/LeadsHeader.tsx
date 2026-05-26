import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LEADS_STRINGS } from "../i18n/pt-BR";
import type { LeadsView } from "../hooks/useLeadsUrlState";

const COPY = LEADS_STRINGS.page;

export interface ILeadsHeaderProps {
  activeCount: number;
  searchValue: string;
  view: LeadsView;
  canCreate: boolean;
  onSearchChange: (q: string) => void;
  onViewChange: (view: LeadsView) => void;
  onCreate: () => void;
}

export function LeadsHeader({
  activeCount,
  searchValue,
  view,
  canCreate,
  onSearchChange,
  onViewChange,
  onCreate,
}: ILeadsHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="text-base font-semibold text-foreground">{COPY.title}</h1>
        <Badge variant="outline" className="bg-muted/50 text-xs text-muted-foreground">
          {COPY.activeCount(activeCount)}
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
            className="h-9 w-[260px] pl-8 text-sm"
          />
        </div>

        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(val) => {
            if (val === "kanban" || val === "list") onViewChange(val);
          }}
          variant="outline"
          size="sm"
          aria-label="Modo de visualização"
        >
          <ToggleGroupItem value="kanban" aria-label={LEADS_STRINGS.views.kanban}>
            <Icon icon="mdi:view-column-outline" size={16} />
            <span className="ml-1 hidden sm:inline">{LEADS_STRINGS.views.kanban}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label={LEADS_STRINGS.views.list}>
            <Icon icon="mdi:format-list-bulleted" size={16} />
            <span className="ml-1 hidden sm:inline">{LEADS_STRINGS.views.list}</span>
          </ToggleGroupItem>
        </ToggleGroup>

        {canCreate && (
          <Button size="sm" className="gap-1.5" onClick={onCreate}>
            <Icon icon="mdi:plus" size={16} />
            {COPY.addLead}
          </Button>
        )}
      </div>
    </div>
  );
}
