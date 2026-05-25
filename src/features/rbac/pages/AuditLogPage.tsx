import { useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuditsProvider, useSellersProvider } from "@/providers/data";
import type { IAuditLog, ID, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { EmptyState } from "@/features/shell/components/EmptyState";

export interface IAuditLogSearch {
  actorIds?: string[];
  actions?: string[];
  resources?: string[];
  since?: string;
  until?: string;
  page?: number;
}

const PAGE_SIZE = 20;

const RESOURCE_LABELS: Record<string, string> = {
  customer: "Cliente",
  vehicle: "Veículo",
  lead: "Lead",
  conversation: "Conversa",
  message: "Mensagem",
  part: "Peça",
  quote: "Orçamento",
  order: "Pedido",
  commission: "Comissão",
  goal: "Meta",
  recommendation: "Recomendação",
  transfer: "Transferência",
  segment: "Segmento",
  seller: "Vendedor",
  store: "Loja",
  settings: "Configurações",
  audit_log: "Auditoria",
  role: "Papel",
  carteira_transfer: "Transferência de carteira",
};

const ACTION_LABELS: Record<string, string> = {
  create: "criou",
  update: "editou",
  delete: "excluiu",
  approve: "aprovou",
  "auth.signin": "fez login",
  "auth.signout": "fez logout",
  "customer.create": "criou cliente",
  "customer.update": "editou cliente",
  "order.create": "criou pedido",
  "order.update_status": "atualizou status do pedido",
  "quote.send": "enviou orçamento",
  "quote.approve": "aprovou orçamento",
  "carteira.transfer": "transferiu carteira",
  "lead.convert": "converteu lead",
  "settings.update": "alterou configurações",
  "role.assign": "atribuiu papel",
};

const ACTION_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  create: "default",
  update: "secondary",
  delete: "destructive",
  approve: "default",
  "auth.signin": "secondary",
  "auth.signout": "secondary",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function resourceLabel(resource: string): string {
  return RESOURCE_LABELS[resource] ?? resource;
}

function actionBadgeVariant(action: string): "default" | "secondary" | "destructive" | "outline" {
  const head = action.split(".")[0];
  return ACTION_BADGE_VARIANT[action] ?? ACTION_BADGE_VARIANT[head] ?? "outline";
}

function formatRelative(timestamp: string): { relative: string; absolute: string } {
  const date = new Date(timestamp);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  let relative: string;
  if (minutes < 1) relative = "agora";
  else if (minutes < 60) relative = `há ${minutes} min`;
  else if (hours < 24) relative = `há ${hours} h`;
  else if (days < 30) relative = `há ${days} d`;
  else relative = date.toLocaleDateString("pt-BR");
  const absolute = date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return { relative, absolute };
}

interface IFilterPanelProps {
  sellers: ISeller[];
  selectedActors: string[];
  selectedActions: string[];
  selectedResources: string[];
  since?: string;
  until?: string;
  onPatch: (patch: Partial<IAuditLogSearch>) => void;
  onClear: () => void;
}

const KNOWN_ACTIONS = [
  "create",
  "update",
  "delete",
  "approve",
  "auth.signin",
  "auth.signout",
] as const;

const KNOWN_RESOURCES = [
  "customer",
  "vehicle",
  "lead",
  "conversation",
  "message",
  "quote",
  "order",
  "commission",
  "seller",
  "settings",
  "role",
  "transfer",
] as const;

function FilterPanel({
  sellers,
  selectedActors,
  selectedActions,
  selectedResources,
  since,
  until,
  onPatch,
  onClear,
}: IFilterPanelProps) {
  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  return (
    <aside className="space-y-5 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Filtros</h2>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Limpar
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Período</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="since" className="sr-only">
              De
            </Label>
            <Input
              id="since"
              type="date"
              value={since ?? ""}
              onChange={(e) => onPatch({ since: e.target.value || undefined })}
              className="text-xs"
            />
          </div>
          <div>
            <Label htmlFor="until" className="sr-only">
              Até
            </Label>
            <Input
              id="until"
              type="date"
              value={until ?? ""}
              onChange={(e) => onPatch({ until: e.target.value || undefined })}
              className="text-xs"
            />
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Ação</Label>
        <div className="space-y-1.5">
          {KNOWN_ACTIONS.map((action) => {
            const checked = selectedActions.includes(action);
            return (
              <label key={action} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onPatch({ actions: toggle(selectedActions, action) })}
                />
                <span className="text-foreground">{actionLabel(action)}</span>
              </label>
            );
          })}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Recurso</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {KNOWN_RESOURCES.map((resource) => {
            const checked = selectedResources.includes(resource);
            return (
              <label key={resource} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() =>
                    onPatch({ resources: toggle(selectedResources, resource) })
                  }
                />
                <span className="text-foreground">{resourceLabel(resource)}</span>
              </label>
            );
          })}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Ator</Label>
        <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
          {sellers.length === 0 && (
            <p className="text-xs text-muted-foreground">Carregando vendedores…</p>
          )}
          {sellers.map((seller) => {
            const checked = selectedActors.includes(seller.id);
            return (
              <label key={seller.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onPatch({ actorIds: toggle(selectedActors, seller.id) })}
                />
                <span className="text-foreground">{seller.fullName}</span>
              </label>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

interface IAuditItemProps {
  entry: IAuditLog;
  sellerNameById: Map<ID, string>;
  expanded: boolean;
  onToggle: () => void;
}

function AuditItem({ entry, sellerNameById, expanded, onToggle }: IAuditItemProps) {
  const { relative, absolute } = formatRelative(entry.timestamp);
  const actor = sellerNameById.get(entry.actorId) ?? entry.actorId;
  const initials = actor.substring(0, 2).toUpperCase();
  const beforeJson = entry.before ? JSON.stringify(entry.before, null, 2) : null;
  const afterJson = entry.after ? JSON.stringify(entry.after, null, 2) : null;

  return (
    <li className="rounded-lg border border-border bg-card transition-colors">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {initials}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{actor}</span>
            <Badge variant={actionBadgeVariant(entry.action)} className="text-xs">
              {actionLabel(entry.action)}
            </Badge>
            <span className="text-sm text-muted-foreground">·</span>
            <span className="text-sm text-muted-foreground">{resourceLabel(entry.resource)}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>{relative}</span>
                </TooltipTrigger>
                <TooltipContent side="top">{absolute}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span className="ml-2">#{entry.resourceId}</span>
          </div>
        </div>
        <Icon
          icon={expanded ? "mdi:chevron-up" : "mdi:chevron-down"}
          size={20}
          className="text-muted-foreground"
        />
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3">
          {!beforeJson && !afterJson && (
            <p className="text-xs text-muted-foreground">Sem snapshot before/after disponível.</p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {beforeJson && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Antes
                </div>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground">
                  {beforeJson}
                </pre>
              </div>
            )}
            {afterJson && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Depois
                </div>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground">
                  {afterJson}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export function AuditLogPage({ routeId }: { routeId: "/app/configuracoes/auditoria" }) {
  const search = useSearch({ from: routeId }) as IAuditLogSearch;
  const navigate = useNavigate({ from: routeId });
  const auditsProvider = useAuditsProvider();
  const sellersProvider = useSellersProvider();

  const [expandedId, setExpandedId] = useState<ID | null>(null);

  const page = search.page ?? 1;
  const actorIds = search.actorIds ?? [];
  const actions = search.actions ?? [];
  const resources = search.resources ?? [];

  const sellersQuery = useQuery({
    queryKey: ["audit-sellers"],
    queryFn: () => sellersProvider.list(),
  });

  const auditsQuery = useQuery({
    queryKey: [
      "audits",
      { actorIds, actions, resources, since: search.since, until: search.until, page },
    ],
    queryFn: () =>
      auditsProvider.list({
        page,
        pageSize: PAGE_SIZE,
        actorIds: actorIds.length ? actorIds : undefined,
        actions: actions.length ? actions : undefined,
        resources: resources.length ? resources : undefined,
        since: search.since,
        until: search.until,
      }),
  });

  const sellerNameById = useMemo(() => {
    const map = new Map<ID, string>();
    (sellersQuery.data ?? []).forEach((s) => map.set(s.id, s.fullName));
    return map;
  }, [sellersQuery.data]);

  const totalPages = useMemo(() => {
    const total = auditsQuery.data?.total ?? 0;
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }, [auditsQuery.data?.total]);

  function patchSearch(patch: Partial<IAuditLogSearch>) {
    void navigate({
      search: (prev) => {
        const next = { ...(prev as IAuditLogSearch), ...patch };
        // Reset page to 1 when any other filter changes
        if (Object.keys(patch).some((k) => k !== "page")) {
          next.page = 1;
        }
        return next;
      },
    });
  }

  function clearFilters() {
    void navigate({ search: {} as IAuditLogSearch });
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Auditoria</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Histórico imutável de ações sensíveis registradas pela plataforma.
          </p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() =>
                  toast.info("Exportação completa será liberada na Fase 2 (Supabase).")
                }
              >
                <Icon icon="mdi:download" size={16} />
                Exportar CSV
              </Button>
            </TooltipTrigger>
            <TooltipContent>Disponível na Fase 2</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </header>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <FilterPanel
          sellers={sellersQuery.data ?? []}
          selectedActors={actorIds}
          selectedActions={actions}
          selectedResources={resources}
          since={search.since}
          until={search.until}
          onPatch={patchSearch}
          onClear={clearFilters}
        />

        <section className="space-y-3">
          {auditsQuery.isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          )}

          {auditsQuery.isError && (
            <EmptyState
              icon="mdi:alert-circle-outline"
              title="Falha ao carregar auditoria"
              description={(auditsQuery.error as Error)?.message ?? "Tente novamente."}
            />
          )}

          {auditsQuery.data && auditsQuery.data.data.length === 0 && (
            <EmptyState
              icon="mdi:filter-variant-remove"
              title="Nenhum registro encontrado"
              description="Ajuste os filtros para ver outros eventos."
            />
          )}

          {auditsQuery.data && auditsQuery.data.data.length > 0 && (
            <>
              <ul className="space-y-2">
                {auditsQuery.data.data.map((entry) => (
                  <AuditItem
                    key={entry.id}
                    entry={entry}
                    sellerNameById={sellerNameById}
                    expanded={expandedId === entry.id}
                    onToggle={() =>
                      setExpandedId((current) => (current === entry.id ? null : entry.id))
                    }
                  />
                ))}
              </ul>

              <div className="flex items-center justify-between border-t border-border pt-3 text-sm text-muted-foreground">
                <span>
                  Página {page} de {totalPages} · {auditsQuery.data.total} eventos
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => patchSearch({ page: Math.max(1, page - 1) })}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => patchSearch({ page: Math.min(totalPages, page + 1) })}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
