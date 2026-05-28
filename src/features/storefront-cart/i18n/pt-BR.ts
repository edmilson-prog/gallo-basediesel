export const STOREFRONT_CART_STRINGS = {
  // Cart page
  cartTitle: "Seu carrinho",
  cartItemsHeading: (n: number) => (n === 1 ? "1 item no carrinho" : `${n} itens no carrinho`),
  cartContinueShopping: "Continuar comprando",
  cartContinueShoppingHref: "/loja",
  cartRemove: "Remover",
  cartItemRemoved: "Item removido do carrinho.",
  cartItemStockClamped: (name: string, max: number) =>
    `Ajustamos a quantidade de "${name}" para ${max} (limite do estoque).`,
  cartItemRemovedAuto: (name: string) =>
    `"${name}" foi removido do carrinho — peça sem estoque no momento.`,
  cartUnitPrice: "Preço unitário",
  cartLineTotal: "Subtotal",
  cartQuantityAria: "Quantidade",

  // Coupon (placeholder)
  couponTitle: "Cupom de desconto",
  couponPlaceholder: "Insira o código do cupom",
  couponDisabledHint: "Cupons funcionais disponíveis na Fase 2.",

  // Summary
  summaryTitle: "Resumo do pedido",
  summarySubtotal: "Subtotal",
  summaryShipping: "Frete",
  summaryShippingToCalculate: "Calcule informando o CEP",
  summaryShippingNegotiate: "A combinar",
  summaryTotal: "Total",
  summaryCheckoutCta: "Finalizar pedido",
  summaryShipMethod: (label: string) => `Entrega via ${label}`,

  // Shipping
  shippingCalcTitle: "Frete",
  shippingZipLabel: "CEP de entrega",
  shippingZipPlaceholder: "00000-000",
  shippingCalcCta: "Calcular",
  shippingCalcMissing: "Informe o CEP para calcular o frete.",
  shippingCalcInvalid: "CEP inválido — use o formato 00000-000.",
  shippingCalcResult: (value: string) => `Frete: ${value}`,
  shippingCalcNegotiate: "Frete a combinar para esta região.",

  // Empty
  emptyTitle: "Seu carrinho está vazio",
  emptyHint: "Comece adicionando peças do catálogo GALLO PARTS.",
  emptyCta: "Explorar catálogo",

  // Mini preview
  miniPreviewTitle: "Seu carrinho",
  miniPreviewSubtotal: "Subtotal",
  miniPreviewSeeCart: "Ver carrinho completo",
  miniPreviewEmpty: "Carrinho vazio. Adicione peças para começar.",
  miniPreviewExploreCta: "Explorar catálogo",
  miniPreviewMoreItems: (n: number) => (n === 1 ? "+1 item adicional" : `+${n} itens adicionais`),

  // Checkout
  checkoutTitle: "Checkout",
  checkoutStep1: "Identificação",
  checkoutStep2: "Endereço",
  checkoutStep3: "Pagamento",
  checkoutBack: "Voltar",
  checkoutContinue: "Continuar",
  checkoutConfirmCta: "Confirmar pedido",
  checkoutDemoBanner:
    "Pedido em modo demonstração — pagamento real e emissão de NF disponíveis na Fase 2.",

  // Identification step
  idLoggedAs: (name: string) => `Você está logado(a) como ${name}.`,
  idLoggedHint: "Vamos usar seus dados para esta compra.",
  idGuestCta: "Continuar como visitante",
  idLoginCta: "Entrar / criar conta",
  idGuestTitle: "Dados de visitante",
  idGuestHint:
    "Precisamos desses dados para emitir o pedido e a nota fiscal. Você pode criar uma conta depois.",
  idGuestNameLabel: "Nome completo",
  idGuestNamePlaceholder: "Como deve aparecer no pedido",
  idGuestTypeLabel: "Tipo de cadastro",
  idGuestTypePf: "Pessoa física (CPF)",
  idGuestTypePj: "Pessoa jurídica (CNPJ)",
  idGuestDocLabel: (kind: "pf" | "pj") => (kind === "pf" ? "CPF" : "CNPJ"),
  idGuestDocPlaceholder: (kind: "pf" | "pj") =>
    kind === "pf" ? "000.000.000-00" : "00.000.000/0000-00",
  idGuestEmailLabel: "E-mail",
  idGuestPhoneLabel: "Telefone / WhatsApp",
  idGuestPhonePlaceholder: "(99) 99999-9999",

  // Validation errors
  errRequired: "Campo obrigatório.",
  errEmailInvalid: "E-mail inválido.",
  errPhoneInvalid: "Telefone inválido — informe DDD + número.",
  errCpfInvalid: "CPF inválido — use o formato 000.000.000-00.",
  errCnpjInvalid: "CNPJ inválido — use o formato 00.000.000/0000-00.",
  errZipInvalid: "CEP inválido — use o formato 00000-000.",

  // Address step
  addressTitle: "Endereço de entrega",
  addressSavedHeading: "Use um endereço já cadastrado",
  addressNewToggle: "+ Novo endereço",
  addressZipLabel: "CEP",
  addressZipPlaceholder: "00000-000",
  addressZipLookupCta: "Buscar",
  addressZipLookupLoading: "Buscando…",
  addressZipLookupFailed: "Não localizamos esse CEP — preencha manualmente.",
  addressStreetLabel: "Rua / avenida",
  addressNumberLabel: "Número",
  addressComplementLabel: "Complemento",
  addressDistrictLabel: "Bairro",
  addressCityLabel: "Cidade",
  addressStateLabel: "UF",
  addressSaveToggle: "Salvar este endereço para futuras compras",
  addressSaveDisabledHint: "Faça login para salvar endereços.",

  // Payment step
  paymentTitle: "Forma de pagamento",
  paymentPix: "PIX",
  paymentPixHint: "Você receberá o código PIX após confirmação.",
  paymentBoleto: "Boleto bancário",
  paymentBoletoHint: "Boleto será enviado por e-mail em até 30 minutos.",
  paymentCard: "Cartão de crédito",
  paymentCardHint: "Integração com adquirente disponível na Fase 2.",
  reviewTitle: "Revisão final",
  reviewItems: "Itens",
  reviewAddress: "Endereço de entrega",
  reviewPayment: "Forma de pagamento",
  reviewTotals: "Valores",

  // Confirmation
  confirmTitle: "Pedido confirmado!",
  confirmSubtitle: (n: string) => `Número do pedido: ${n}`,
  confirmBody:
    "Você receberá os próximos passos por e-mail e WhatsApp. Nosso time já foi notificado.",
  confirmAccountCta: "Acessar minha conta",
  confirmStoreCta: "Voltar para a loja",
  confirmDemoBanner:
    "Pedido registrado em modo demonstração — sistema de pagamento e NF completo na Fase 2.",
  confirmCreateFailed: "Não foi possível criar o pedido. Tente novamente em instantes.",
} as const;
