// src/features/model-kits/components/ModelKitsSection.tsx
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ID, IPart, IVehicleModel, IVehicleModelKit } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { useModelKitMutations } from "../hooks/useModelKitMutations";
import { ModelKitCard } from "./ModelKitCard";
import { DeleteModelKitDialog } from "./DeleteModelKitDialog";

export interface IModelKitsSectionProps {
  model: IVehicleModel;
  kits: IVehicleModelKit[];
  partsById: Map<ID, IPart>;
  /** Catalog parts that serve this model — the empty state quotes this number. */
  compatiblePartsCount: number;
  applicationCounts: Record<ID, number>;
  /** False while the counts are loading — the card then omits the line. */
  applicationsReady: boolean;
  /** Sibling engines with no kit — offered as copy destinations on each card. */
  copyTargets: IVehicleModel[];
  isLoading: boolean;
  isError: boolean;
  onRetry(): void;
  onCopyTo(kit: IVehicleModelKit, target: IVehicleModel): void;
}

function SectionHeading({ action }: { action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
        Kits deste modelo
      </h2>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      {action}
    </div>
  );
}

export function ModelKitsSection({
  model,
  kits,
  partsById,
  compatiblePartsCount,
  applicationCounts,
  applicationsReady,
  copyTargets,
  isLoading,
  isError,
  onRetry,
  onCopyTo,
}: IModelKitsSectionProps) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const canCreate = hasPermission(currentUser, "modelKit", "create");
  const canCurate = hasPermission(currentUser, "modelKit", "edit");

  const mutations = useModelKitMutations();
  const [kitToDelete, setKitToDelete] = useState<IVehicleModelKit | null>(null);

  function handleCreate() {
    void navigate({ to: "/app/kits/$modelId/kit/novo", params: { modelId: model.id } });
  }

  function handleEdit(kit: IVehicleModelKit) {
    void navigate({
      to: "/app/kits/$modelId/kit/$kitId/editar",
      params: { modelId: model.id, kitId: kit.id },
    });
  }

  function handleApply(kit: IVehicleModelKit) {
    void navigate({ to: "/app/orcamentos/novo", search: { applyKitId: kit.id } });
  }

  const buildButton = canCreate ? (
    <Button size="sm" onClick={handleCreate} className="gap-1.5">
      <Icon icon="mdi:plus" size={16} />
      Montar kit
    </Button>
  ) : null;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <SectionHeading />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-3">
        <SectionHeading />
        <div className="flex flex-col items-center gap-3 rounded-xl border border-severity-critical/40 p-6 text-center">
          <Icon icon="mdi:alert-circle-outline" size={32} className="text-severity-critical" />
          <p className="text-sm text-foreground">Não foi possível carregar os kits.</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (kits.length === 0) {
    return (
      <div className="space-y-3">
        <SectionHeading />
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <Icon icon="mdi:package-variant" size={32} className="text-muted-foreground opacity-50" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">Nenhum kit para este modelo</p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              {compatiblePartsCount > 0 ? (
                <>
                  O catálogo já tem {compatiblePartsCount}{" "}
                  {compatiblePartsCount === 1 ? "peça que serve" : "peças que servem"} no{" "}
                  {model.model} {model.engine}. Montar o kit é escolher quais entram e em que
                  quantidade.
                </>
              ) : (
                <>
                  Nenhuma peça do catálogo está cadastrada para o {model.model} {model.engine}{" "}
                  ainda. O kit pode ser montado mesmo assim, buscando peças pelo nome ou SKU.
                </>
              )}
            </p>
          </div>
          {canCreate && (
            <Button size="sm" onClick={handleCreate} className="gap-1.5">
              <Icon icon="mdi:plus" size={16} />
              Montar kit
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SectionHeading action={buildButton} />

      <div className="flex flex-col gap-3">
        {kits.map((kit) => (
          <ModelKitCard
            key={kit.id}
            kit={kit}
            partsById={partsById}
            canManage={canCurate}
            appliedCount={applicationsReady ? (applicationCounts[kit.id] ?? 0) : undefined}
            copyTargets={copyTargets}
            onEdit={() => handleEdit(kit)}
            onApply={() => handleApply(kit)}
            onPromote={() => void mutations.promote(kit.id)}
            onDemote={() => void mutations.demote(kit.id)}
            onDelete={() => setKitToDelete(kit)}
            onCopyTo={(target) => onCopyTo(kit, target)}
          />
        ))}
      </div>

      <DeleteModelKitDialog
        kit={kitToDelete}
        onConfirm={() => {
          if (kitToDelete) {
            void mutations.remove(kitToDelete.id);
            setKitToDelete(null);
          }
        }}
        onOpenChange={(open) => {
          if (!open) setKitToDelete(null);
        }}
      />
    </div>
  );
}
