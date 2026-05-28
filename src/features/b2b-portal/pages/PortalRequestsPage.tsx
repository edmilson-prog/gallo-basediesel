import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { formatDateBR } from "@/shared/utils/format";
import { usePortalSession } from "../hooks/usePortalSession";
import { usePortalStore } from "../store/portalStore";
import { PORTAL_REQUEST_STATUS_LABEL, PORTAL_STRINGS as S } from "../i18n/pt-BR";

const STATUS_TONE: Record<string, string> = {
  aberta: "border-primary/40 bg-primary/10 text-primary",
  em_orcamento: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  orcada: "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300",
  aprovada: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  rejeitada: "border-destructive/40 bg-destructive/10 text-destructive",
  convertida: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  cancelada: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export function PortalRequestsPage() {
  const { user, customer } = usePortalSession();
  const requests = usePortalStore((s) => s.requests).filter((r) => r.customerId === customer?.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold text-foreground">{S.requestsTitle}</h1>
        {user?.canCreateRequests && (
          <Button asChild size="sm">
            <Link to="/portal/solicitacoes/nova">
              <Icon icon="mdi:plus" size={16} className="mr-1" aria-hidden />
              {S.requestsNew}
            </Link>
          </Button>
        )}
      </div>

      {requests.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted-foreground">{S.requestsEmpty}</Card>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <Link key={r.id} to="/portal/solicitacoes/$id" params={{ id: r.id }}>
              <Card className="flex items-center justify-between gap-3 p-4 transition-colors hover:border-primary/40">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {r.items.length} {r.items.length === 1 ? "item" : "itens"}
                    {r.items[0] ? ` · ${r.items[0].description}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateBR(r.createdAt)}</p>
                </div>
                <Badge variant="outline" className={STATUS_TONE[r.status] ?? ""}>
                  {PORTAL_REQUEST_STATUS_LABEL[r.status]}
                </Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
