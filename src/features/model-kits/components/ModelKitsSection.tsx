// src/features/model-kits/components/ModelKitsSection.tsx
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { ID, IVehicleModelKit } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { usePartsIndex } from "@/features/quotes/hooks/usePartsIndex";
import { useModelKits } from "../hooks/useModelKits";
import { useModelKitMutations } from "../hooks/useModelKitMutations";
import { ModelKitCard } from "./ModelKitCard";
import { DeleteModelKitDialog } from "./DeleteModelKitDialog";

export interface IModelKitsSectionProps {
  modelId: ID;
  modelLabel: string;
}

export function ModelKitsSection({ modelId, modelLabel }: IModelKitsSectionProps) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const canCreate = hasPermission(currentUser, "modelKit", "create");
  const canCurate = hasPermission(currentUser, "modelKit", "edit");

  const query = useModelKits({ modelId });
  const kits = query.data ?? [];

  const { partsById } = usePartsIndex();
  const mutations = useModelKitMutations();

  const [kitToDelete, setKitToDelete] = useState<IVehicleModelKit | null>(null);

  function handleCreate() {
    void navigate({ to: "/app/kits/$modelId/kit/novo", params: { modelId } });
  }

  function handleEdit(kit: IVehicleModelKit) {
    void navigate({
      to: "/app/kits/$modelId/kit/$kitId/editar",
      params: { modelId, kitId: kit.id },
    });
  }

  function handleApply(_kit: IVehicleModelKit) {
    // Route APP_ORCAMENTOS_NOVO not yet registered; wired in Task 15/17.
    toast.info("Abra um orçamento para aplicar este kit.");
  }

  // --- Loading state ---
  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Kits deste modelo</h2>
        <div className="animate-pulse rounded-lg bg-muted h-32" />
        <div className="animate-pulse rounded-lg bg-muted h-32" />
      </div>
    );
  }

  // --- Error state ---
  if (query.isError) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Kits deste modelo</h2>
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/40 p-6 text-center">
          <Icon icon="mdi:alert-circle-outline" size={32} className="text-destructive" />
          <p className="text-sm text-foreground">Não foi possível carregar os kits.</p>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  // --- Empty states ---
  if (kits.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-foreground">Kits deste modelo</h2>
          {canCreate && (
            <Button size="sm" onClick={handleCreate} className="gap-1">
              <Icon icon="mdi:plus" size={16} />
              Criar kit
            </Button>
          )}
        </div>
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
          <Icon icon="mdi:tray-plus" size={40} className="text-muted-foreground opacity-40" />
          {canCreate ? (
            <>
              <div className="space-y-1">
                <p className="font-medium text-foreground">Nenhum kit para este modelo ainda</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Crie um kit de filtros para agilizar orçamentos deste {modelLabel}.
                </p>
              </div>
              <Button size="sm" onClick={handleCreate} className="gap-1">
                <Icon icon="mdi:plus" size={16} />
                Criar kit
              </Button>
            </>
          ) : (
            <p className="font-medium text-foreground">
              Ainda não há kits oficiais para este modelo.
            </p>
          )}
        </div>
      </div>
    );
  }

  // --- Populated list ---
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-foreground">Kits deste modelo</h2>
        {canCreate && (
          <Button size="sm" onClick={handleCreate} className="gap-1">
            <Icon icon="mdi:plus" size={16} />
            Criar kit
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {kits.map((kit) => (
          <ModelKitCard
            key={kit.id}
            kit={kit}
            partsById={partsById}
            canManage={canCurate}
            onEdit={() => handleEdit(kit)}
            onApply={() => handleApply(kit)}
            onPromote={() => void mutations.promote(kit.id)}
            onDemote={() => void mutations.demote(kit.id)}
            onDelete={() => setKitToDelete(kit)}
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
