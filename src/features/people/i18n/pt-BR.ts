/**
 * User-facing strings for the Departments (Departamentos) screen (PRD-211
 * Task 12 — the dormant `ITeam` revived as "Departamento").
 *
 * Code identifiers stay in English; every label here is Brazilian Portuguese
 * with correct accents.
 */
export const DEPARTMENTS_LABELS = {
  pageTitle: "Departamentos",
  pageDescription:
    "Agrupe a equipe em departamentos. Cada departamento tem um gestor responsável e os membros que o compõem.",
  searchPlaceholder: "Buscar departamento...",
  searchHint: 'Pressione "/" para buscar',
  newDepartment: "Novo departamento",
  newDepartmentForbidden: "Você não tem permissão para criar departamentos.",
  // List / cards
  managerLabel: "Gestor",
  noManager: "Sem gestor",
  membersLabel: (count: number) => (count === 1 ? "1 membro" : `${count} membros`),
  noMembers: "Sem membros",
  edit: "Editar",
  delete: "Excluir",
  editForbidden: "Apenas o gestor responsável ou o proprietário podem editar este departamento.",
  emptyTitle: "Nenhum departamento ainda",
  emptyBody: "Crie o primeiro departamento para organizar a equipe.",
  errorTitle: "Não foi possível carregar os departamentos.",
  retry: "Tentar novamente",
  noSearchResults: "Nenhum departamento corresponde à busca.",
  // Form dialog
  createTitle: "Novo departamento",
  editTitle: (name: string) => `Editar departamento — ${name}`,
  createDescription: "Defina o nome, o gestor responsável e os membros do departamento.",
  editDescription: "Atualize o nome, o gestor responsável e os membros do departamento.",
  nameLabel: "Nome",
  namePlaceholder: "Ex.: Vendas internas",
  nameRequired: "Informe o nome do departamento.",
  managerSelectLabel: "Gestor responsável (opcional)",
  managerPlaceholder: "Selecione um gestor",
  managerNone: "Sem gestor",
  membersSelectLabel: "Membros",
  membersTrigger: (count: number) =>
    count === 0 ? "Selecionar membros" : count === 1 ? "1 membro" : `${count} membros`,
  membersSearchPlaceholder: "Buscar membro...",
  membersEmpty: "Nenhum vendedor encontrado.",
  cancel: "Cancelar",
  create: "Criar",
  save: "Salvar alterações",
  saving: "Salvando…",
  createSuccess: (name: string) => `Departamento "${name}" criado.`,
  updateSuccess: (name: string) => `Departamento "${name}" atualizado.`,
  createError: "Não foi possível criar o departamento.",
  updateError: "Não foi possível salvar o departamento.",
  // Delete confirm
  deleteTitle: "Excluir departamento?",
  deleteBody: (name: string) =>
    `O departamento "${name}" será removido e seus membros ficarão sem departamento. Esta ação não pode ser desfeita.`,
  deleteCancel: "Cancelar",
  deleteConfirm: "Excluir",
  deleteSuccess: (name: string) => `Departamento "${name}" excluído.`,
  deleteError: "Não foi possível excluir o departamento.",
} as const;
