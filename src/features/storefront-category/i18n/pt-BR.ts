export const STOREFRONT_CATEGORY_STRINGS = {
  // Breadcrumbs
  breadcrumbHome: "Home",
  breadcrumbStore: "Loja",

  // Header
  headerCountLabel: (n: number) =>
    n === 1 ? "1 produto disponível" : `${n.toLocaleString("pt-BR")} produtos disponíveis`,
  headerLoadingLabel: "Carregando produtos…",
  headerDefaultDescription: (label: string) =>
    `Encontre ${label.toLowerCase()} originais e equivalentes para Volvo, Scania, Mercedes-Benz, Ford Cargo, Iveco e mais.`,

  // Filters
  filtersTitle: "Filtros",
  filtersClearAll: "Limpar filtros",
  filtersActive: (n: number) =>
    n === 0 ? "Nenhum filtro ativo" : n === 1 ? "1 filtro ativo" : `${n} filtros ativos`,
  filtersMobileCta: "Filtros",
  filtersMobileApply: "Ver resultados",
  filtersSubcategoryTitle: "Subcategoria",
  filtersBrandTitle: "Marca compatível",
  filtersBrandAll: "Todas as marcas",
  filtersManufacturerTitle: "Fabricante",
  filtersTypeTitle: "Tipo",
  filtersTypeAll: "Original e equivalente",
  filtersTypeOriginal: "Apenas original",
  filtersTypeEquivalent: "Apenas equivalente",
  filtersPriceTitle: "Faixa de preço",
  filtersPriceMinPlaceholder: "Mín. R$",
  filtersPriceMaxPlaceholder: "Máx. R$",
  filtersStockTitle: "Disponibilidade",
  filtersStockOnlyAvailable: "Apenas peças em estoque",

  // Sort
  sortLabel: "Ordenar por",
  sortRelevance: "Mais relevantes",
  sortPriceAsc: "Menor preço",
  sortPriceDesc: "Maior preço",
  sortTopSelling: "Mais vendidos",
  sortNewest: "Lançamentos",

  // Pagination
  paginationLabel: (page: number, total: number) => `Página ${page} de ${total}`,
  paginationPrev: "Anterior",
  paginationNext: "Próxima",

  // Empty state
  emptyTitle: "Esta categoria ainda não tem produtos com os filtros aplicados",
  emptyHint: "Tente afrouxar os filtros ou volte para explorar outras categorias.",
  emptyClearFilters: "Limpar filtros",
  emptyBackToCategories: "Ver todas as categorias",

  // Invalid slug
  invalidTitle: "Categoria não encontrada",
  invalidDescription:
    "Não localizamos essa categoria em nosso catálogo. Confira as opções disponíveis abaixo.",
  invalidSuggestionsTitle: "Categorias populares",
  invalidSpecialsTitle: "Listas especiais",
  invalidBackToStore: "Voltar à loja",

  // Promotions placeholder
  promotionsEmptyBanner:
    "Estamos preparando promoções fixas. Por enquanto, esta lista mostra apenas itens selecionados manualmente — o sistema completo chega na Fase 2.",
} as const;
