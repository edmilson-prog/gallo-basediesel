import { useQuery } from "@tanstack/react-query";
import { useModelKitsProvider } from "@/providers/data";

export function useModelKit(id: string | undefined) {
  const provider = useModelKitsProvider();
  return useQuery({
    queryKey: ["model-kit", id] as const,
    queryFn: () => provider.get(id as string),
    enabled: Boolean(id),
  });
}
