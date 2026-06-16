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
  // --- Task 10: editing, guards, save/restore ---
  /** Per-area aria-live summary, e.g. "Comercial: 3 de 8 recursos com acesso". */
  areaLiveSummary: (area: string, withAccess: number, total: number) =>
    `${area}: ${withAccess} de ${total} recursos com acesso`,
  unsavedIndicator: "Alterações não salvas",
  save: "Salvar",
  saving: "Salvando...",
  discard: "Descartar",
  saveSuccess: "Permissões atualizadas.",
  saveError: "Não foi possível salvar as permissões.",
  noEditPermissionHint: "Você não tem permissão para editar papéis.",
  ownerImmutableBanner: "O papel Owner tem acesso total e não pode ser editado.",
  systemEditingBanner:
    "Você está editando um papel de sistema. Alterações afetam todos os usuários com este papel.",
  // System-role first-edit warning dialog.
  systemWarningTitle: "Editar papel de sistema?",
  systemWarningBody:
    "Este é um papel de sistema usado por todos os usuários com este perfil. Alterar suas permissões afeta o que essas pessoas podem fazer na plataforma. Você pode restaurar o padrão de fábrica a qualquer momento.",
  systemWarningDontAskAgain: "Não avisar novamente nesta sessão",
  systemWarningConfirm: "Entendi, continuar",
  systemWarningCancel: "Cancelar",
  // Restore-to-defaults.
  restoreDefaults: "Restaurar padrão",
  restoreTitle: "Restaurar permissões de fábrica?",
  restoreBody:
    "As permissões deste papel voltarão ao padrão original de fábrica. Esta ação substitui as permissões atuais.",
  restoreConfirm: "Restaurar padrão",
  restoreCancel: "Cancelar",
  restoreSuccess: "Permissões restauradas ao padrão.",
  restoreError: "Não foi possível restaurar as permissões.",
  // Unsaved-changes navigation guard.
  unsavedTitle: "Descartar alterações não salvas?",
  unsavedBody: "Você tem alterações não salvas neste papel. Se sair agora, elas serão perdidas.",
  unsavedConfirm: "Descartar e sair",
  unsavedKeepEditing: "Continuar editando",
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
