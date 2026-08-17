/** Every user-facing string of the suppliers feature. */
export const SUPPLIERS_STRINGS = {
  page: {
    title: "Fornecedores",
    description:
      "Quem fornece, em que condição e o que se compra de cada um. O prazo médio de pagamento aqui é a contraparte do prazo médio de recebimento.",
  },
  kpis: {
    active: "Fornecedores ativos",
    withDocument: "Com CNPJ",
    linkedParts: "Peças vinculadas",
    purchases: "Compras 12 meses",
    leadTime: "Prazo médio de entrega",
    leadTimeUnit: "dias",
    withDocumentHint: "clique para ver quem falta",
  },
  categories: {
    all: "Todos",
    parts: "Peças",
    services: "Serviços",
    freight: "Frete",
    financial: "Financeiro",
  },
  sort: {
    name: "Nome",
    parts: "Peças",
    purchases: "Compras",
    completeness: "Cadastro",
  },
  columns: {
    supplier: "Fornecedor",
    terms: "Condição",
    parts: "Peças",
    purchases: "Compras 12m",
    completeness: "Cadastro",
    contact: "Contato",
  },
  search: {
    placeholder: "Buscar por nome ou CNPJ…",
    label: "Buscar fornecedor",
  },
  actions: {
    create: "Novo fornecedor",
    edit: "Editar cadastro",
    fullSheet: "Ficha completa",
    archive: "Desativar fornecedor",
  },
  empty: {
    list: "Nenhum fornecedor encontrado.",
    listHint: "Ajuste os filtros ou cadastre o primeiro fornecedor.",
    entries: "Sem notas de entrada registradas.",
    items: "Ainda sem itens vinculados.",
    purchases: "Sem compras registradas — o histórico começa na primeira nota de entrada.",
    payables:
      "O contas a pagar ainda não existe no sistema. Quando existir, os títulos deste fornecedor aparecem aqui.",
  },
  complete: "Cadastro completo",
  newBadge: "novo",
} as const;
