import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ICustomerSegment, ID, SegmentScope } from "@/shared/types";
import { useSegmentsProvider } from "@/providers/data/hooks/useSegmentsProvider";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";

export interface ICreateSegmentArgs {
  name: string;
  description?: string;
  scope: SegmentScope;
  filters: Record<string, unknown>;
}

export interface IUpdateSegmentArgs {
  id: ID;
  patch: Partial<ICreateSegmentArgs>;
}

export interface ISegmentsBuckets {
  privateOnes: ICustomerSegment[];
  shared: ICustomerSegment[];
  all: ICustomerSegment[];
  isLoading: boolean;
  refetch: () => void;
}

export function useSegments(): ISegmentsBuckets & {
  create: (args: ICreateSegmentArgs) => Promise<ICustomerSegment>;
  update: (args: IUpdateSegmentArgs) => Promise<ICustomerSegment>;
  remove: (id: ID) => Promise<void>;
  isMutating: boolean;
} {
  const provider = useSegmentsProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();

  const query = useQuery({
    queryKey: ["segments", currentStoreId, currentUser?.id ?? null] as const,
    queryFn: async () => {
      const res = await provider.list({ page: 1, pageSize: 500 });
      return res.data;
    },
    staleTime: 60_000,
  });

  const allRaw = query.data ?? [];
  const all = allRaw.filter(
    (s) => s.scope === "shared" || (currentUser ? s.ownerId === currentUser.id : false),
  );
  const privateOnes = all.filter((s) => s.scope === "private");
  const shared = all.filter((s) => s.scope === "shared");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["segments"] });

  const createMut = useMutation({
    mutationFn: (args: ICreateSegmentArgs) => {
      if (!currentUser) throw new Error("Usuário não autenticado");
      return provider.create({
        ownerId: currentUser.id,
        name: args.name,
        description: args.description,
        scope: args.scope,
        filters: args.filters,
      });
    },
    onSuccess: () => void invalidate(),
  });

  const updateMut = useMutation({
    mutationFn: (args: IUpdateSegmentArgs) => provider.update(args.id, args.patch),
    onSuccess: () => void invalidate(),
  });

  const removeMut = useMutation({
    mutationFn: (id: ID) => provider.delete(id),
    onSuccess: () => void invalidate(),
  });

  return {
    privateOnes,
    shared,
    all,
    isLoading: query.isLoading,
    refetch: () => void query.refetch(),
    create: (args) => createMut.mutateAsync(args),
    update: (args) => updateMut.mutateAsync(args),
    remove: (id) => removeMut.mutateAsync(id),
    isMutating: createMut.isPending || updateMut.isPending || removeMut.isPending,
  };
}
