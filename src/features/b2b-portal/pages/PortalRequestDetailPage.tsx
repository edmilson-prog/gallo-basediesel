import { Link, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { usePortalSession } from "../hooks/usePortalSession";
import { usePortalStore } from "../store/portalStore";
import { PORTAL_REQUEST_STATUS_LABEL, PORTAL_STRINGS as S } from "../i18n/pt-BR";

export function PortalRequestDetailPage() {
  const { id } = useParams({ from: "/portal/solicitacoes/$id" });
  const { user } = usePortalSession();
  const request = usePortalStore((s) => s.requests.find((r) => r.id === id));
  const updateRequest = usePortalStore((s) => s.updateRequest);

  if (!request) {
    return (
      <EmptyState
        icon="mdi:file-search-outline"
        title="Solicitação não encontrada"
        actionLabel={S.back}
        actionTo="/portal/solicitacoes"
      />
    );
  }

  const estimated = request.estimatedTotal ?? 0;
  const limit = user?.approvalLimit ?? 0;
  const aboveLimit = estimated > limit;
  const canApprove = Boolean(user?.canApproveOrders);
  const needsApproval = request.status === "orcada" || request.status === "aberta";

  const handleApprove = () => {
    if (!user) return;
    updateRequest(request.id, {
      status: "aprovada",
      approvedBy: user.id,
      approvedAt: new Date().toISOString(),
    });
    auditLog({
      actorId: user.id,
      action: "portal_request_approve",
      resource: "quote",
      resourceId: request.id,
      after: { status: "aprovada" },
      storeId: request.storeId,
    });
    toast.success(S.reqApproved);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        to="/portal/solicitacoes"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      >
        <Icon icon="mdi:chevron-left" size={14} aria-hidden />
        {S.requestsTitle}
      </Link>

      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-lg font-semibold text-foreground">
            Solicitação {request.id.slice(-6).toUpperCase()}
          </h1>
          <Badge variant="outline">{PORTAL_REQUEST_STATUS_LABEL[request.status]}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Criada em {formatDateBR(request.createdAt)} · urgência {request.urgency}
        </p>

        <div className="space-y-1 border-t border-border pt-3 text-sm">
          {request.items.map((it) => (
            <div key={it.id} className="flex justify-between">
              <span className="text-foreground">
                {it.quantity}× {it.description}
              </span>
            </div>
          ))}
        </div>

        {request.notes && (
          <p className="border-t border-border pt-3 text-sm text-muted-foreground">{request.notes}</p>
        )}
      </Card>

      {request.relatedQuoteId ? (
        <Card className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Orçamento vinculado</p>
            <p className="text-xs text-muted-foreground">{formatBRL(estimated)}</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/portal/pedidos">Ver detalhe</Link>
          </Button>
        </Card>
      ) : (
        <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Icon icon="mdi:clock-outline" size={16} aria-hidden />
          Aguardando a GALLO enviar o orçamento.
        </Card>
      )}

      {/* Internal approval workflow */}
      {needsApproval && (
        <Card className="space-y-3 p-4">
          <p className="text-sm font-medium text-foreground">Aprovação interna</p>
          {canApprove && !aboveLimit ? (
            <Button onClick={handleApprove}>
              <Icon icon="mdi:check" size={16} className="mr-1" aria-hidden />
              {S.reqApprove}
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button disabled>
                      <Icon icon="mdi:check" size={16} className="mr-1" aria-hidden />
                      {S.reqApprove}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {!canApprove ? "Você não pode aprovar pedidos" : S.reqAboveLimit}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {aboveLimit && (
            <p className="text-xs text-muted-foreground">
              Valor estimado {formatBRL(estimated)} acima do seu limite ({formatBRL(limit)}).
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
