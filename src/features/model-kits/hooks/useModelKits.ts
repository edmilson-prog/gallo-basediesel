import { useQuery } from "@tanstack/react-query";
import { useModelKitsProvider, type IListModelKitsParams } from "@/providers/data";

export function useModelKits(params: IListModelKitsParams = {}) {
  const provider = useModelKitsProvider();
  return useQuery({
    queryKey: ["model-kits", params] as const,
    queryFn: () => provider.list(params),
  });
}
