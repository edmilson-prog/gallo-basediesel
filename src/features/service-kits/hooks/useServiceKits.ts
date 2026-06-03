import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useServiceKitsProvider } from "@/providers/data/hooks/useServiceKitsProvider";

/** Reads kits for a store. Shares the ["service-kits", storeId] key with the editor. */
export function useServiceKits(storeId: ID) {
  const provider = useServiceKitsProvider();
  return useQuery({
    queryKey: ["service-kits", storeId] as const,
    queryFn: () => provider.list({ storeId }),
  });
}
