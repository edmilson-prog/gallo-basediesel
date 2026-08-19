import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, ISupplier } from "@/shared/types";
import { useSuppliersProvider } from "@/providers/data";
import { SUPPLIERS_STRINGS } from "../i18n/pt-BR";

const COPY = SUPPLIERS_STRINGS.mutations;

/** What `ISuppliersProvider.create` takes — the Tally contract has no
 *  separate `ICreateSupplierInput`, just the row minus its server-assigned
 *  columns. */
type ICreateSupplierInput = Omit<ISupplier, "id" | "createdAt" | "updatedAt">;

export function useSupplierMutations() {
  const provider = useSuppliersProvider();
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["suppliers"] });

  const create = useMutation<ISupplier, Error, ICreateSupplierInput>({
    mutationFn: (input) => provider.create(input),
    onSuccess: (supplier) => {
      toast.success(COPY.created(supplier.corporateName));
      // Returned (not `void`-ed away like `update`/`archive` below) so
      // `mutateAsync` doesn't settle until the "suppliers" queries have
      // actually refetched. `SupplierFormDialog`'s caller selects the new
      // row by id the instant `mutateAsync` resolves (the pending queue's
      // "Cadastrar" → cadastro → select-the-new-supplier flow) — that only
      // works once `useSuppliersList`'s cache actually contains it. Mirrors
      // `CustomersListPage.handleCreateCustomer`'s
      // `await list.invalidate(); url.setSelectedId(created.id);`.
      return invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const update = useMutation<ISupplier, Error, { id: ID; patch: Partial<ISupplier> }>({
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
      toast.success(COPY.archived(supplier.corporateName));
    },
    onError: (error) => toast.error(error.message),
  });

  return { create, update, archive };
}
