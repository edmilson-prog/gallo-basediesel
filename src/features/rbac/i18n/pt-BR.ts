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
  // --- Task 11: custom role CRUD (create / duplicate / rename / delete) ---
  // Per-role kebab actions.
  roleActionsLabel: "Ações do papel",
  actionDuplicate: "Duplicar",
  actionRename: "Renomear",
  actionDelete: "Excluir",
  actionRenameSystemDisabled: "Papéis de sistema não podem ser renomeados",
  // Create / duplicate dialog.
  createTitle: "Novo papel",
  createDescription:
    "Crie um papel personalizado a partir de um papel base. A matriz de permissões fica disponível depois de criar.",
  duplicateTitle: "Duplicar papel",
  duplicateDescription:
    "Cria um novo papel personalizado com as permissões copiadas do papel selecionado. Ajuste a matriz depois de criar.",
  // Edit-meta (rename) dialog.
  renameTitle: "Renomear papel",
  renameDescription: "Atualize o nome e a descrição deste papel personalizado.",
  // Form fields.
  fieldName: "Nome",
  fieldNamePlaceholder: "Ex.: Vendedor júnior",
  fieldDescription: "Descrição (opcional)",
  fieldDescriptionPlaceholder: "Para que serve este papel?",
  fieldBaseRole: "Papel base",
  fieldBaseRolePlaceholder: "Selecione o papel base",
  baseRoleHelp:
    "O papel base define o teto de acesso real (RLS); a matriz de permissões apenas refina a navegação dentro desse teto.",
  fieldInitialPermissions: "Permissões iniciais",
  initialBlank: "Em branco",
  initialDuplicate: "Duplicar de…",
  fieldDuplicateSource: "Copiar permissões de",
  fieldDuplicateSourcePlaceholder: "Selecione um papel",
  // Validation.
  nameRequired: "Informe um nome para o papel.",
  nameTooLong: "O nome deve ter no máximo 60 caracteres.",
  nameDuplicate: "Já existe um papel com este nome.",
  baseRoleRequired: "Selecione um papel base.",
  duplicateSourceRequired: "Selecione o papel a duplicar.",
  // Submit buttons.
  createSubmit: "Criar papel",
  duplicateSubmit: "Duplicar papel",
  renameSubmit: "Salvar alterações",
  creating: "Criando...",
  saving2: "Salvando...",
  // Toasts.
  createSuccess: "Papel criado.",
  createError: "Não foi possível criar o papel.",
  duplicateSuccess: "Papel duplicado.",
  renameSuccess: "Papel atualizado.",
  renameError: "Não foi possível atualizar o papel.",
  deleteSuccess: "Papel excluído.",
  deleteError: "Não foi possível excluir o papel.",
  // Delete confirmation.
  deleteTitle: "Excluir papel?",
  deleteBody: (name: string) =>
    `O papel "${name}" será excluído permanentemente. Esta ação não pode ser desfeita.`,
  deleteConfirm: "Excluir",
  deleteCancel: "Cancelar",
  /** Shown when the provider blocks deletion because users still reference the role. */
  deleteInUse: (count: number) =>
    `${count} usuário(s) precisam ser remanejados antes de excluir este papel.`,
  /** Suffix appended to a duplicated role's default name. */
  copySuffix: (name: string) => `${name} (cópia)`,
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
