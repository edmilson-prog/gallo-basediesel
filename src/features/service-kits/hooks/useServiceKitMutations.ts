import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IServiceKit } from "@/shared/types";
import { type ICreateServiceKitInput } from "@/providers/data";
import { useServiceKitsProvider } from "@/providers/data/hooks/useServiceKitsProvider";

export interface IUseServiceKitMutations {
  saving: boolean;
  create: (input: ICreateServiceKitInput) => Promise<IServiceKit>;
  update: (id: ID, patch: Partial<ICreateServiceKitInput>) => Promise<IServiceKit>;
  remove: (id: ID) => Promise<void>;
  duplicate: (id: ID) => Promise<IServiceKit>;
}

/** Service-kit write operations with cache invalidation + toasts. */
export function useServiceKitMutations(): IUseServiceKitMutations {
  const provider = useServiceKitsProvider();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["service-kits"] });
  }, [queryClient]);

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
    create: (input) => wrap(() => provider.create(input), "Kit criado com sucesso."),
    update: (id, patch) => wrap(() => provider.update(id, patch), "Kit atualizado."),
    remove: (id) => wrap(() => provider.delete(id), "Kit excluído."),
    duplicate: (id) => wrap(() => provider.duplicate(id), "Kit duplicado."),
  };
}
