export const STOREFRONT_PRODUCT_STRINGS = {
  // Breadcrumbs
  breadcrumbHome: "Home",
  breadcrumbStore: "Loja",

  // Info
  infoOemLabel: "Cód. OEM",
  infoSkuLabel: "SKU",
  infoBrandLabel: "Fabricante",
  badgeOriginal: "Original",
  badgeEquivalent: "Equivalente",
  badgeTopSelling: "Mais vendido",
  badgeOnSale: "Em promoção",

  // Stock indicator (longer copy than the inline badge)
  stockInStock: "Em estoque — pronta entrega",
  stockLow: (n: number) =>
    n === 1 ? "Últimas unidades · 1 disponível" : `Últimas unidades · ${n} disponíveis`,
  stockOut: "Esgotado",
  stockOutHint:
    "Esta peça está sem estoque no momento. Fale com a GALLO pelo WhatsApp para verificar previsão.",
  notifyMeCta: "Avise-me quando voltar",
  notifyMeDisabledHint: "Sistema de notificação chega na Fase 2.",

  // Quantity
  qtyLabel: "Quantidade",
  qtyDecreaseAria: "Diminuir quantidade",
  qtyIncreaseAria: "Aumentar quantidade",

  // CTAs
  ctaAddToCart: "Adicionar ao carrinho",
  ctaSeeCart: "Ver carrinho",
  ctaShareWhatsapp: "Compartilhar no WhatsApp",
  ctaCopyLink: "Copiar link",
  ctaCheckStock: "Falar com vendedor (WhatsApp)",

  // Toast
  toastAdded: (qty: number) =>
    qty === 1 ? "Produto adicionado ao carrinho." : `${qty} unidades adicionadas ao carrinho.`,
  toastLinkCopied: "Link copiado para a área de transferência.",
  toastLinkCopyFailed: "Não foi possível copiar o link.",

  // Tabs
  tabApplications: "Aplicações",
  tabEquivalents: "Equivalências",
  tabSpecifications: "Especificações",

  // Applications tab
  appCheckTitle: "Verificar compatibilidade",
  appCheckSubtitle: "Informe seu caminhão e destacaremos a aplicação correspondente.",
  appBrandLabel: "Marca",
  appModelLabel: "Modelo",
  appYearLabel: "Ano",
  appBrandPlaceholder: "Selecione a marca",
  appModelPlaceholder: "Selecione o modelo",
  appYearPlaceholder: "Selecione o ano",
  appCheckCta: "Verificar",
  appCheckClear: "Limpar",
  appCompatibleBadge: "✓ Compatível",
  appNoMatchHint: "Nenhuma aplicação compatível foi encontrada para o veículo informado.",
  appYearRange: (start: number, end: number) => (start === end ? `${start}` : `${start} – ${end}`),
  appEngineLabel: "Motor",
  appEmpty: "Esta peça ainda não tem aplicações cadastradas.",

  // Equivalents tab
  equivLoading: "Buscando equivalentes…",
  equivEmpty: "Sem equivalentes cadastrados para esta peça.",
  equivSavingsLabel: (pct: number) => `Economia de ${pct}%`,
  equivMoreExpensive: (pct: number) => `${pct}% mais caro`,
  equivSamePrice: "Mesmo preço",
  equivSeeDetails: "Ver ficha",

  // Specifications tab
  specsTitle: "Ficha técnica",
  specsWeight: "Peso",
  specsDimensions: "Dimensões",
  specsDivision: "Divisão",
  specsCategory: "Categoria",
  specsSubcategory: "Subcategoria",
  specsSupplier: "Fornecedor",
  specsAlternativeCodes: "Códigos alternativos",
  specsDescription: "Descrição completa",
  specsWarrantyTitle: "Garantia e procedência",
  specsWarrantyBody:
    "Toda peça GALLO BASE DIESEL passa por conferência de procedência e laudo do fornecedor antes da expedição. Garantia mínima de 90 dias contra defeitos de fabricação, conforme o Código de Defesa do Consumidor.",
  specsValueMissing: "Não informado",

  // Related
  relatedTitle: "Produtos relacionados",
  relatedSubtitle: "Outras peças que combinam com este produto.",
  relatedEmpty: "Sem produtos relacionados no momento.",

  // FAQ placeholder
  faqTitle: "Dúvidas frequentes",
  faqPlaceholder:
    "Sistema de perguntas e respostas estará disponível na Fase 2. Por enquanto, fale com a GALLO pelo WhatsApp.",

  // Not found
  notFoundTitle: "Produto não encontrado",
  notFoundDescription:
    "Não localizamos esta peça em nosso catálogo. Ela pode ter sido removida ou o link está incorreto.",
  notFoundBackToStore: "Voltar à loja",
  notFoundSearchCta: "Buscar peças",

  // Gallery
  galleryAlt: (name: string) => `Imagem do produto ${name}`,
  galleryLightboxClose: "Fechar visualização ampliada",
  // sr-only header of the lightbox — Radix logs an error when a Dialog has no
  // accessible name, and a warning when it has no description.
  galleryLightboxTitle: "Imagem ampliada do produto",
  galleryLightboxDescription: "Visualização ampliada da imagem do produto.",
} as const;
