import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/features/shell/components/EmptyState";
import type { ID } from "@/shared/types";
import { GOALS_STRINGS as S } from "../i18n/pt-BR";
import { useGoalsWithProgress } from "../hooks/useGoalsWithProgress";
import { useGoalMilestoneToast } from "../hooks/useGoalMilestoneToast";
import { GoalCard } from "./GoalCard";

export interface IIndividualGoalsDashboardProps {
  sellerId: ID | undefined;
  displayName?: string;
}

export function IndividualGoalsDashboard({
  sellerId,
  displayName,
}: IIndividualGoalsDashboardProps) {
  const active = useGoalsWithProgress({ sellerId, statuses: ["ativa"] });
  const history = useGoalsWithProgress({
    sellerId,
    statuses: ["concluida", "arquivada", "cancelada"],
  });

  useGoalMilestoneToast(active.items);

  const greeting =
    active.items.length === 1 ? S.greetingActiveOne : S.greetingActiveMany(active.items.length);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:target" size={26} className="text-primary" />
          {S.pageTitle}
        </h1>
        <p className="text-sm text-muted-foreground">
          {displayName ? `Olá, ${displayName} — ${greeting.toLowerCase()}.` : `${greeting}.`}
        </p>
      </header>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="mb-6 flex h-auto w-full max-w-md gap-1 bg-muted/40 p-1">
          <TabsTrigger value="active" className="flex h-9 flex-1 items-center justify-center gap-2">
            <Icon icon="mdi:target" size={16} />
            {S.tabActive}
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="flex h-9 flex-1 items-center justify-center gap-2"
          >
            <Icon icon="mdi:history" size={16} />
            {S.tabHistory}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="focus-visible:outline-none">
          {active.items.length === 0 ? (
            <EmptyState
              icon="mdi:target"
              title={S.emptyVendedor}
              description="Suas metas aparecerão aqui assim que o gestor criar uma."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {active.items.map(({ goal, progress }) => (
                <GoalCard key={goal.id} goal={goal} progress={progress} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="focus-visible:outline-none">
          {history.items.length === 0 ? (
            <EmptyState
              icon="mdi:history"
              title={S.emptyVendedorHistory}
              description="Metas anteriores ficarão registradas aqui."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {history.items.map(({ goal, progress }) => (
                <GoalCard key={goal.id} goal={goal} progress={progress} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
