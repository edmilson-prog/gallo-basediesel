import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";

interface IStoreSearchParams {
  q?: string;
  marca?: string;
}

function validateSearch(raw: Record<string, unknown>): IStoreSearchParams {
  const out: IStoreSearchParams = {};
  if (typeof raw.q === "string" && raw.q.trim().length > 0) out.q = raw.q.trim();
  if (typeof raw.marca === "string" && raw.marca.length > 0) out.marca = raw.marca;
  return out;
}

export const Route = createFileRoute("/loja/busca")({
  validateSearch,
  component: () => (
    <PlaceholderPage
      publicTone
      icon="mdi:magnify"
      title="Busca avançada"
      backTo="/loja"
      backLabel="Voltar à vitrine"
    />
  ),
});
