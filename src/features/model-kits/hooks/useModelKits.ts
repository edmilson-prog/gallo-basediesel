import { useQuery } from "@tanstack/react-query";
import { useModelKitsProvider, type IListModelKitsParams } from "@/providers/data";

export interface IUseModelKitsOptions {
  /** Defaults to true. Set false to hold the query until its params are known. */
  enabled?: boolean;
}

export function useModelKits(
  params: IListModelKitsParams = {},
  options: IUseModelKitsOptions = {},
) {
  const provider = useModelKitsProvider();
  return useQuery({
    queryKey: ["model-kits", params] as const,
    queryFn: () => provider.list(params),
    enabled: options.enabled ?? true,
  });
}
