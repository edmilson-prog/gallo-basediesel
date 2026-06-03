// src/features/vehicle-models/hooks/useVehicleModelMutations.ts
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IVehicleModel } from "@/shared/types";
import {
  recordAuditLogSync,
  type ICreateVehicleModelInput,
  type IUpdateVehicleModelPatch,
} from "@/providers/data";
import { useVehicleModelsProvider } from "@/providers/data/hooks/useVehicleModelsProvider";
import { readCurrentUserSync } from "@/features/auth/guards";

export interface IUseVehicleModelMutations {
  saving: boolean;
  create: (input: ICreateVehicleModelInput) => Promise<IVehicleModel>;
  update: (id: ID, patch: IUpdateVehicleModelPatch) => Promise<IVehicleModel>;
  remove: (id: ID) => Promise<void>;
}

/** Vehicle-model write operations with cache invalidation, toasts and audit log. */
export function useVehicleModelMutations(): IUseVehicleModelMutations {
  const provider = useVehicleModelsProvider();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["vehicle-models"] });
  }, [queryClient]);

  const audit = useCallback((action: string, resourceId: ID, after?: unknown) => {
    const user = readCurrentUserSync();
    recordAuditLogSync({
      actorId: user?.id ?? "mock-user",
      action,
      resource: "vehicleModel",
      resourceId,
      after,
    });
  }, []);

  const wrap = useCallback(
    async <T>(op: () => Promise<T>, okMsg: string): Promise<T> => {
      setSaving(true);
      try {
        const result = await op();
        invalidate();
        toast.success(okMsg);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Operação falhou.";
        toast.error(msg);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [invalidate],
  );

  return {
    saving,
    create: (input) =>
      wrap(async () => {
        const created = await provider.create(input);
        audit("create", created.id, created);
        return created;
      }, "Modelo criado com sucesso."),
    update: (id, patch) =>
      wrap(async () => {
        const updated = await provider.update(id, patch);
        audit(patch.status ? "update_status" : "update", updated.id, updated);
        return updated;
      }, "Modelo atualizado."),
    remove: (id) =>
      wrap(async () => {
        await provider.delete(id);
        audit("delete", id);
      }, "Modelo excluído."),
  };
}
