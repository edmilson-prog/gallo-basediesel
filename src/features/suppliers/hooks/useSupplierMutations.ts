import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, ISupplier } from "@/shared/types";
import type { ICreateSupplierInput, IUpdateSupplierPatch } from "@/providers/data";
import { useSuppliersProvider } from "@/providers/data";
import { SUPPLIERS_STRINGS } from "../i18n/pt-BR";

const COPY = SUPPLIERS_STRINGS.mutations;

export function useSupplierMutations() {
  const provider = useSuppliersProvider();
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["suppliers"] });

  const create = useMutation<ISupplier, Error, ICreateSupplierInput>({
    mutationFn: (input) => provider.create(input),
    onSuccess: (supplier) => {
      void invalidate();
      toast.success(COPY.created(supplier.name));
    },
    onError: (error) => toast.error(error.message),
  });

  const update = useMutation<ISupplier, Error, { id: ID; patch: IUpdateSupplierPatch }>({
    mutationFn: ({ id, patch }) => provider.update(id, patch),
    onSuccess: () => {
      void invalidate();
      toast.success(COPY.updated);
    },
    onError: (error) => toast.error(error.message),
  });

  const archive = useMutation<ISupplier, Error, ID>({
    mutationFn: (id) => provider.archive(id),
    onSuccess: (supplier) => {
      void invalidate();
      toast.success(COPY.archived(supplier.name));
    },
    onError: (error) => toast.error(error.message),
  });

  return { create, update, archive };
}
