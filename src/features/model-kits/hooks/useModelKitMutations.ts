// src/features/model-kits/hooks/useModelKitMutations.ts
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IVehicleModel, IVehicleModelKit } from "@/shared/types";
import { renameKitForModel } from "../engine";
import {
  recordAuditLogSync,
  useModelKitsProvider,
  type ICreateModelKitInput,
  type IUpdateModelKitPatch,
} from "@/providers/data";
import { readCurrentUserSync } from "@/features/auth/guards";

export interface IUseModelKitMutations {
  saving: boolean;
  create: (input: ICreateModelKitInput) => Promise<IVehicleModelKit>;
  /** Copies a kit onto another canonical model — always as a draft to be reviewed. */
  copyToModel: (
    kit: IVehicleModelKit,
    source: IVehicleModel,
    target: IVehicleModel,
  ) => Promise<IVehicleModelKit>;
  update: (id: ID, patch: IUpdateModelKitPatch) => Promise<IVehicleModelKit>;
  promote: (id: ID) => Promise<IVehicleModelKit>;
  demote: (id: ID) => Promise<IVehicleModelKit>;
  remove: (id: ID) => Promise<void>;
}

/** Model-kit write operations with cache invalidation, toasts and audit log. */
export function useModelKitMutations(): IUseModelKitMutations {
  const provider = useModelKitsProvider();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const invalidate = useCallback(
    (id?: ID) => {
      void queryClient.invalidateQueries({ queryKey: ["model-kits"] });
      if (id) {
        void queryClient.invalidateQueries({ queryKey: ["model-kit", id] });
      }
    },
    [queryClient],
  );

  const audit = useCallback((action: string, resourceId: ID, before?: unknown, after?: unknown) => {
    const user = readCurrentUserSync();
    recordAuditLogSync({
      actorId: user?.id ?? "mock-user",
      action,
      resource: "modelKit",
      resourceId,
      before,
      after,
    });
  }, []);

  const wrap = useCallback(async <T>(op: () => Promise<T>, okMsg: string): Promise<T> => {
    setSaving(true);
    try {
      const result = await op();
      toast.success(okMsg);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Operação falhou.";
      toast.error(msg);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    saving,

    create: (input) =>
      wrap(async () => {
        const created = await provider.create(input);
        invalidate(created.id);
        audit("create", created.id, undefined, created);
        return created;
      }, "Kit criado."),

    copyToModel: (kit, source, target) =>
      wrap(async () => {
        const created = await provider.create({
          modelId: target.id,
          storeId: kit.storeId,
          name: renameKitForModel(kit.name, source, target),
          category: kit.category,
          // A copy is never born official: the destination engine still needs a look.
          status: "rascunho",
          items: kit.items.map((item) => ({ ...item })),
        });
        invalidate(created.id);
        audit("copy", created.id, kit, created);
        return created;
      }, `Kit copiado para o ${target.engine} — entra como rascunho.`),

    update: (id, patch) =>
      wrap(async () => {
        const before = await provider.get(id);
        const updated = await provider.update(id, patch);
        invalidate(id);
        audit("update", id, before, updated);
        return updated;
      }, "Kit atualizado."),

    promote: (id) =>
      wrap(async () => {
        const before = await provider.get(id);
        const updated = await provider.update(id, { status: "oficial" });
        invalidate(id);
        audit("promote", id, before, updated);
        return updated;
      }, "Kit promovido a oficial."),

    demote: (id) =>
      wrap(async () => {
        const before = await provider.get(id);
        const updated = await provider.update(id, { status: "rascunho" });
        invalidate(id);
        audit("demote", id, before, updated);
        return updated;
      }, "Kit voltou para rascunho."),

    remove: (id) =>
      wrap(async () => {
        const before = await provider.get(id);
        await provider.delete(id);
        invalidate(id);
        audit("delete", id, before, undefined);
      }, "Kit excluído."),
  };
}
