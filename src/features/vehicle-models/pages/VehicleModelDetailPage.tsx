import { useNavigate, useParams } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/features/auth/useAuth";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { useVehicleModel } from "../hooks/useVehicleModel";
import { useVehicleModelMutations } from "../hooks/useVehicleModelMutations";
import { BrandAvatar } from "../components/BrandAvatar";

function formatYearRange(yearStart?: number, yearEnd?: number): string | null {
  if (!yearStart) return null;
  const end = yearEnd != null ? String(yearEnd) : "atual";
  return `${yearStart}–${end}`;
}

export function VehicleModelDetailPage() {
  const { currentUser } = useAuth();
  const canManage = hasPermission(currentUser, "vehicleModel", "create");
  const navigate = useNavigate();
  const mutations = useVehicleModelMutations();

  // modelId provided by /app/kits/$modelId; strict: false for flexibility.
  const { modelId } = useParams({ strict: false }) as { modelId?: string };

  const modelQuery = useVehicleModel(modelId);
  const model = modelQuery.data;

  function goBack() {
    void navigate({ to: "/app/kits" });
  }

  function handleEdit() {
    if (!model) return;
    void navigate({
      to: "/app/kits/$modelId/editar",
      params: { modelId: model.id },
    });
  }

  function handleToggleStatus() {
    if (!model) return;
    void mutations.update(model.id, {
      status: model.status === "ativo" ? "inativo" : "ativo",
    });
  }

  const yearRange = model ? formatYearRange(model.yearStart, model.yearEnd) : null;
  const breadcrumbName = model ? `${model.brand} ${model.model} (${model.engine})` : "…";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={goBack} className="gap-1 px-1">
          <Icon icon="mdi:chevron-left" size={16} />
          Kits por modelo
        </Button>
        <Icon icon="mdi:chevron-right" size={14} className="opacity-50" />
        <span className="max-w-xs truncate text-foreground">{breadcrumbName}</span>
      </div>

      {/* Content */}
      {modelQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando modelo…</p>
      ) : !model ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center text-muted-foreground">
          <Icon icon="mdi:alert-circle-outline" size={40} className="opacity-40" />
          <div>
            <p className="font-medium text-foreground">Modelo não encontrado</p>
            <p className="text-sm">O modelo solicitado não existe ou foi removido.</p>
          </div>
          <Button variant="outline" onClick={goBack}>
            Voltar ao catálogo
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Model header */}
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
            <div className="flex items-start gap-4">
              {/* Larger avatar for detail page */}
              <BrandAvatar brand={model.brand} className="size-12" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold text-foreground">
                    {model.brand} {model.model}
                  </h1>
                  <Badge
                    variant={model.status === "ativo" ? "default" : "outline"}
                    className="text-xs"
                  >
                    {model.status === "ativo" ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-sm font-medium text-foreground/70">{model.engine}</p>
                {yearRange && (
                  <p className="mt-0.5 tabular-nums text-sm text-muted-foreground">{yearRange}</p>
                )}
              </div>
            </div>

            {/* Actions — Owner/Gestor only */}
            {canManage && (
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={handleEdit} className="gap-1">
                  <Icon icon="mdi:pencil-outline" size={16} />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleStatus}
                  disabled={mutations.saving}
                  className="gap-1"
                >
                  {model.status === "ativo" ? (
                    <>
                      <Icon icon="mdi:archive-outline" size={16} />
                      Inativar
                    </>
                  ) : (
                    <>
                      <Icon icon="mdi:restore" size={16} />
                      Reativar
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Kits section — honest empty slot (PRD-035) */}
          <div>
            <h2 className="mb-3 text-base font-semibold text-foreground">Kits deste modelo</h2>
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
              <Icon
                icon="mdi:package-variant-closed"
                size={40}
                className="text-muted-foreground opacity-40"
              />
              <div className="space-y-1">
                <p className="font-medium text-foreground">
                  Nenhum kit cadastrado para este modelo
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Em breve você poderá montar kits de peças aplicáveis a este modelo.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
