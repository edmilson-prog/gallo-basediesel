import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrentStore } from "@/features/multistore";
import { SectionHeader } from "../components/SectionHeader";
import { usePlatformSettings } from "../hooks/usePlatformSettings";

export function PipelineSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
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
        description="Pipeline legado da loja. Continua alimentando os modais de conversão e de perda, o menu da conversa e o filtro de estágio na visão consolidada de Leads — por isso segue aqui. Para administrar os funis, use Funis."
        action={
          /* The old button promised an edition that never arrived — the "Fase 2"
             it referred to belongs to PRD-017's own phasing, not to the
             multi-funnel work, and it has been stalled for a long time. It is
             replaced by a link to the screen that actually administers funnels,
             rather than a disabled control that says "later" forever. */
          <Button variant="outline" asChild>
            <Link to="/app/configuracoes/atendimento/funis">
              <Icon icon="mdi:filter-variant" size={16} />
              Administrar funis
            </Link>
          </Button>
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
