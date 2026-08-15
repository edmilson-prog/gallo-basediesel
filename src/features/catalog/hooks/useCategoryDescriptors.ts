import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ID, IPartCategory } from "@/shared/types";
import { usePartCategoriesProvider, type ISavePartCategoryInput } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import {
  BUILTIN_PART_CATEGORY_DESCRIPTORS,
  mergeCategoryDescriptors,
  type IPartCategoryDescriptor,
} from "../utils/categories";

export const PART_CATEGORIES_QUERY_KEY = "part-categories";

export interface IUseCategoryDescriptorsResult {
  /** Built-ins merged with the stored layer, including archived families. */
  descriptors: IPartCategoryDescriptor[];
  /** Same list without archived families — what pickers should offer. */
  active: IPartCategoryDescriptor[];
  /** Raw stored rows (empty when the table is untouched or unreachable). */
  rows: IPartCategory[];
  isLoading: boolean;
  /** True when the stored layer could not be read — the built-ins are showing. */
  isDegraded: boolean;
}

/**
 * The live part taxonomy — read-only, and cheap enough to call from a table row.
 *
 * Reading never fails loudly: if `part_categories` is missing (migration not
 * applied yet), empty or blocked by RLS, this falls back to the built-in
 * families, which is exactly the behaviour that shipped before the table
 * existed. Writes live in {@link useCategoryAdmin} so that rendering a cell
 * never registers a mutation observer.
 */
export function useCategoryDescriptors(): IUseCategoryDescriptorsResult {
  const provider = usePartCategoriesProvider();
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? undefined;

  const query = useQuery({
    queryKey: [PART_CATEGORIES_QUERY_KEY, storeId ?? null] as const,
    queryFn: () => provider.list(storeId ? { storeId } : undefined),
    staleTime: 5 * 60_000,
    // The built-in fallback makes a failed read a non-event; one retry is
    // enough to ride out a blip without stalling every catalog screen.
    retry: 1,
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);

  const descriptors = useMemo(() => {
    if (query.isError) return [...BUILTIN_PART_CATEGORY_DESCRIPTORS];
    return mergeCategoryDescriptors(rows);
  }, [rows, query.isError]);

  const active = useMemo(
    () => descriptors.filter((descriptor) => !descriptor.archived),
    [descriptors],
  );

  return {
    descriptors,
    active,
    rows,
    isLoading: query.isLoading,
    isDegraded: query.isError,
  };
}

export interface IUseCategoryAdminResult {
  save: (input: ISavePartCategoryInput) => Promise<void>;
  remove: (id: ID) => Promise<void>;
  isSaving: boolean;
}

/** Write side of the taxonomy — only the category manager needs it. */
export function useCategoryAdmin(): IUseCategoryAdminResult {
  const provider = usePartCategoriesProvider();
  const { currentStoreId } = useCurrentStore();
  const queryClient = useQueryClient();
  const storeId = currentStoreId ?? undefined;

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [PART_CATEGORIES_QUERY_KEY] });
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: (input: ISavePartCategoryInput) =>
      provider.save(storeId ? { storeId, ...input } : input),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: ID) => provider.delete(id),
    onSuccess: invalidate,
  });

  const save = useCallback(
    async (input: ISavePartCategoryInput) => {
      await saveMutation.mutateAsync(input);
    },
    [saveMutation],
  );

  const remove = useCallback(
    async (id: ID) => {
      await removeMutation.mutateAsync(id);
    },
    [removeMutation],
  );

  return { save, remove, isSaving: saveMutation.isPending || removeMutation.isPending };
}
