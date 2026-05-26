import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useCurrentStore } from "@/features/multistore";
import { SectionHeader } from "../components/SectionHeader";
import { usePlatformSettings } from "../hooks/usePlatformSettings";

export function PipelineSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "store-matriz";
  const { settings, loading } = usePlatformSettings(storeId);

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Pipeline de leads"
          description="Estágios pelos quais um lead passa até virar cliente."
        />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const stages = [...settings.pipelineStages].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Pipeline de leads"
        description="Estágios pelos quais um lead passa até virar cliente (PRD-017). A edição visual estará disponível na Fase 2."
        action={
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button variant="outline" disabled>
                  <Icon icon="mdi:pencil-outline" size={16} />
                  Sugerir mudança
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Edição visual disponível na Fase 2.</TooltipContent>
          </Tooltip>
        }
      />

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between gap-2 border-b border-border pb-3">
          <p className="text-sm font-medium">{stages.length} estágios configurados</p>
          <Badge variant="outline" className="gap-1">
            <Icon icon="mdi:lock-outline" size={12} />
            Somente leitura
          </Badge>
        </div>

        <ol className="space-y-2">
          {stages.map((stage, index) => (
            <li
              key={stage.id}
              className="flex items-center gap-3 rounded-md border border-border bg-background p-3"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                {index + 1}
              </span>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: stage.color }}
                aria-hidden
              />
              <div className="flex-1">
                <p className="text-sm font-medium">{stage.name}</p>
                <p className="text-xs text-muted-foreground">Ordem #{stage.order}</p>
              </div>
              <Icon icon="mdi:chevron-right" size={16} className="text-muted-foreground" />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
