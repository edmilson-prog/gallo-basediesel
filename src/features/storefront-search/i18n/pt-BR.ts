export const STOREFRONT_SEARCH_STRINGS = {
  // Page header
  pageTitle: "Busca",
  searchPlaceholder: "Busque por código OEM, nome ou marca",
  searchAriaLabel: "Buscar peças",
  resultsCount: (n: number) =>
    n === 1 ? "1 peça encontrada" : `${n.toLocaleString("pt-BR")} peças encontradas`,
  resultsLoading: "Carregando resultados…",

  // Auto-complete
  acProductsHeading: "Produtos",
  acCategoriesHeading: "Categorias",
  acBrandsHeading: "Marcas",
  acEmpty: "Sem sugestões para esta busca.",

  // Sort
  sortLabel: "Ordenar por",
  sortRelevance: "Relevância",
  sortPriceAsc: "Menor preço",
  sortPriceDesc: "Maior preço",
  sortTopSelling: "Mais vendidos",
  sortNewest: "Lançamentos",

  // Filters panel
  filtersTitle: "Filtros",
  filtersActive: (n: number) =>
    n === 0 ? "Nenhum filtro ativo" : n === 1 ? "1 filtro ativo" : `${n} filtros ativos`,
  filtersClearAll: "Limpar tudo",
  filtersApply: "Aplicar",
  filtersMobileCta: "Filtros",
  filtersMobileApply: "Ver resultados",

  // Vehicle filter
  vehicleFilterTitle: "Qual seu caminhão?",
  vehicleFilterSubtitle: "Filtramos para mostrar só o que serve no seu veículo.",
  vehicleBrandLabel: "Marca",
  vehicleModelLabel: "Modelo",
  vehicleYearLabel: "Ano",
  vehicleBrandPlaceholder: "Selecione a marca",
  vehicleModelPlaceholder: "Selecione o modelo",
  vehicleYearPlaceholder: "Selecione o ano",
  vehicleApplyCta: "Aplicar veículo",
  vehicleClearLabel: (brand: string, model: string, year: number | null) =>
    year ? `Filtrado para ${brand} ${model} ${year}` : `Filtrado para ${brand} ${model}`,
  vehicleClearAria: "Limpar filtro de veículo",

  // Other filters
  categoryFilterTitle: "Categoria",
  brandFilterTitle: "Marca compatível",
  brandFilterAll: "Todas as marcas",
  manufacturerFilterTitle: "Fabricante da peça",
  typeFilterTitle: "Tipo",
  typeAll: "Original e equivalente",
  typeOriginal: "Apenas original",
  typeEquivalent: "Apenas equivalente",
  priceFilterTitle: "Faixa de preço",
  priceMinPlaceholder: "Mín. R$",
  priceMaxPlaceholder: "Máx. R$",
  stockFilterTitle: "Disponibilidade",
  stockOnlyAvailable: "Apenas peças em estoque",

  // Product card
  cardAddToCart: "Adicionar ao carrinho",
  cardSeeDetails: "Ver detalhes",
  cardOriginalBadge: "Original",
  cardEquivalentBadge: "Equivalente",
  cardOutOfStock: "Sem estoque",
  cardLowStock: "Últimas unidades",
  cardInStock: "Em estoque",
  addedToCartToast: "Produto adicionado ao carrinho.",

  // Pagination
  paginationLabel: (page: number, total: number) => `Página ${page} de ${total}`,
  paginationPrev: "Anterior",
  paginationNext: "Próxima",

  // Empty state
  emptyTitle: "Não encontramos peças para sua busca",
  emptyHint: "Tente buscar pelo código OEM, refine os filtros ou fale com nosso time.",
  emptyClearFilters: "Limpar filtros",
  emptyContactCta: "Falar com vendedor (WhatsApp)",
} as const;
