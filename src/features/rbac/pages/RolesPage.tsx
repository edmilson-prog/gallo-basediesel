import { useMemo, useState } from "react";
import type { IPermission, PermissionAction, RoleName } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PERMISSIONS_MATRIX, ROLE_DESCRIPTIONS } from "../permissions/matrix";
import { RESOURCES, type ResourceName } from "../permissions/resources";
import { ACTIONS } from "../permissions/actions";

const ROLE_ORDER: RoleName[] = [
  "Owner",
  "Gestor",
  "Vendedor",
  "VendedorExterno",
  "SDR",
  "Financeiro",
  "Cliente",
];

const ROLE_LABELS: Record<RoleName, string> = {
  Owner: "Owner",
  Gestor: "Gestor",
  Vendedor: "Vendedor",
  VendedorExterno: "Vendedor Externo",
  SDR: "SDR",
  Financeiro: "Financeiro",
  Cliente: "Cliente",
};

const ROLE_ICONS: Record<RoleName, string> = {
  Owner: "mdi:crown",
  Gestor: "mdi:account-tie",
  Vendedor: "mdi:account-cash",
  VendedorExterno: "mdi:map-marker-account",
  SDR: "mdi:robot",
  Financeiro: "mdi:calculator",
  Cliente: "mdi:account-circle",
};

const RESOURCE_LABELS: Record<ResourceName, string> = {
  customer: "Clientes",
  vehicle: "Veículos",
  lead: "Leads",
  conversation: "Conversas",
  message: "Mensagens",
  part: "Catálogo",
  quote: "Orçamentos",
  order: "Pedidos",
  commission: "Comissões",
  goal: "Metas",
  recommendation: "Recomendações",
  transfer: "Transferências",
  segment: "Segmentos",
  seller: "Vendedores",
  store: "Lojas",
  settings: "Configurações",
  audit_log: "Auditoria",
  role: "Papéis",
};

const ACTION_LABELS: Record<PermissionAction, string> = {
  view: "Ver",
  create: "Criar",
  edit: "Editar",
  delete: "Excluir",
  approve: "Aprovar",
};

const SCOPE_LABELS = {
  own: "Próprios",
  team: "Equipe",
  store: "Loja",
  all: "Tudo",
} as const;

function permissionByResource(perms: IPermission[]): Map<string, IPermission> {
  const map = new Map<string, IPermission>();
  perms.forEach((p) => map.set(p.resource, p));
  return map;
}

function RolePermissionTable({ role }: { role: RoleName }) {
  const byResource = useMemo(() => permissionByResource(PERMISSIONS_MATRIX[role]), [role]);

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="w-[200px]">
              Recurso
            </TableHead>
            {ACTIONS.map((action) => (
              <TableHead key={action} scope="col" className="text-center">
                {ACTION_LABELS[action]}
              </TableHead>
            ))}
            <TableHead scope="col" className="w-[120px] text-center">
              Escopo
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {RESOURCES.map((resource) => {
            const perm = byResource.get(resource);
            return (
              <TableRow key={resource}>
                <TableCell className="font-medium text-foreground">
                  {RESOURCE_LABELS[resource]}
                </TableCell>
                {ACTIONS.map((action) => {
                  const has = perm?.actions.includes(action);
                  return (
                    <TableCell key={action} className="text-center">
                      {has ? (
                        <Icon
                          icon="mdi:check-circle"
                          size={18}
                          className="inline-block text-primary"
                          ariaLabel={`Permitido: ${ACTION_LABELS[action]}`}
                        />
                      ) : (
                        <span aria-hidden className="text-muted-foreground/40">
                          —
                        </span>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell className="text-center">
                  {perm ? (
                    <Badge variant="secondary">{SCOPE_LABELS[perm.scope]}</Badge>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function RolesPage() {
  const [active, setActive] = useState<RoleName>("Owner");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Papéis e permissões
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Visualização da matriz de permissões dos 7 papéis suportados pela plataforma. Cada
            célula marcada indica que o papel tem a ação no recurso, no escopo informado.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 px-2.5 py-1">
          <Icon icon="mdi:lock-outline" size={14} />
          Somente leitura · edição na Fase 2
        </Badge>
      </header>

      <Tabs value={active} onValueChange={(v) => setActive(v as RoleName)}>
        <TabsList className="flex h-auto flex-wrap gap-1 bg-muted p-1">
          {ROLE_ORDER.map((role) => (
            <TabsTrigger
              key={role}
              value={role}
              className="flex items-center gap-2 data-[state=active]:bg-card"
            >
              <Icon icon={ROLE_ICONS[role]} size={16} />
              {ROLE_LABELS[role]}
            </TabsTrigger>
          ))}
        </TabsList>

        {ROLE_ORDER.map((role) => (
          <TabsContent key={role} value={role} className="mt-4 space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon icon={ROLE_ICONS[role]} size={20} />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-foreground">{ROLE_LABELS[role]}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
                </div>
              </div>
            </div>
            <RolePermissionTable role={role} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
