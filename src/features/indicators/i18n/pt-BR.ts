/**
 * User-facing strings for the Indicators feature.
 * Brazilian Portuguese with correct diacritics throughout.
 */
export const indicatorsPtBR = {
  title: "Indicadores",
  subtitle: "Acompanhamento de vendas por produto",
  new: "Novo indicador",
  empty: "Nenhum indicador ainda — crie o primeiro",
  emptySeller: "Você ainda não participa de nenhum indicador ativo",
  emptyHint: "Crie o primeiro indicador de produto para começar a acompanhar o desempenho.",
  chartEmpty: "Nenhum indicador para exibir.",
  metric: {
    faturamento: "Faturamento",
    quantidade: "Quantidade",
    margem: "Margem",
    pedidos: "Pedidos",
  },
  scope: { store: "Loja", individual: "Individual", global: "Global" },
  status: { ativo: "Ativo", concluido: "Concluído", arquivado: "Arquivado", cancelado: "Cancelado" },
  selectorKind: { category: "Categoria", sku: "Produtos", group: "Grupo" },
  kpis: {
    active: "Indicadores ativos",
    avgAttainment: "Atingimento médio",
    above: "Acima de 100%",
    behind: "Atrasados",
  },
  contribution: "Contribuição por vendedor",
  evolution: "Evolução",
  expected: "Esperado",
  realized: "Realizado",
} as const;
