import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";

export function useLeadDetail(id: ID | undefined) {
  const provider = useLeadsProvider();
  return useQuery({
    queryKey: ["lead", id] as const,
    enabled: Boolean(id),
    queryFn: () => provider.get(id as ID),
    staleTime: 15_000,
  });
}
