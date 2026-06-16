import type { PermissionAction, PermissionScope } from "@/shared/types";

/**
 * User-facing strings for the role editor (PRD-211).
 *
 * Code identifiers stay in English; every label here is Brazilian Portuguese
 * with correct accents. Resource labels/groups are NOT defined here on purpose:
 * they come from `listResources()` (resources are data now, PRD-211).
 */

/** Verbs shown as the matrix column headers, in canonical action order. */
export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: "Ver",
  create: "Criar",
  edit: "Editar",
  delete: "Excluir",
  approve: "Aprovar",
};

/** Short scope labels shown in the scope selector. */
export const SCOPE_LABELS: Record<PermissionScope, string> = {
  own: "Próprios",
  team: "Equipe",
  store: "Loja",
  all: "Tudo",
};

/** Longer scope descriptions used in tooltips / option helper text. */
export const SCOPE_DESCRIPTIONS: Record<PermissionScope, string> = {
  own: "Apenas os registros do próprio usuário",
  team: "Registros da equipe (departamento)",
  store: "Todos os registros da loja",
  all: "Todos os registros, em todas as lojas",
};

/** One Iconify name per scope level (never color-only). */
export const SCOPE_ICONS: Record<PermissionScope, string> = {
  own: "mdi:account",
  team: "mdi:account-group",
  store: "mdi:store",
  all: "mdi:earth",
};

/** Roles editor general UI copy. */
export const ROLE_EDITOR_LABELS = {
  pageTitle: "Papéis e permissões",
  pageDescription:
    "Defina o que cada papel pode fazer em cada recurso. Papéis de sistema têm permissões editáveis; papéis personalizados podem ser criados a partir de um papel base.",
  railSystemHeading: "De sistema",
  railCustomHeading: "Personalizados",
  railSelectLabel: "Selecionar papel",
  newRole: "Novo papel",
  newRoleTooltip: "Criar um novo papel personalizado",
  newRoleForbiddenTooltip: "Você não tem permissão para criar papéis",
  systemRoleBadge: "Papel de sistema",
  ownerImmutableBadge: "Permissões fixas",
  resourceColumn: "Recurso",
  scopeColumn: "Escopo",
  searchPlaceholder: "Buscar recurso...",
  searchHint: "Pressione “/” para buscar",
  noResults: "Nenhum recurso encontrado.",
  readOnlyBadge: "Somente leitura",
  areaSummary: (withEdit: number, total: number) => `${withEdit}/${total} com edição`,
} as const;

/**
 * Builds the accessible label for a single permission cell.
 * Example: "Clientes – Editar – permitido (escopo: Loja)".
 */
export function permissionCellLabel(
  resourceLabel: string,
  action: PermissionAction,
  allowed: boolean,
  scope: PermissionScope,
): string {
  const state = allowed ? "permitido" : "negado";
  return `${resourceLabel} – ${ACTION_LABELS[action]} – ${state} (escopo: ${SCOPE_LABELS[scope]})`;
}
