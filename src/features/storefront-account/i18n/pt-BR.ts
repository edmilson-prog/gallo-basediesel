/**
 * Strings (pt-BR) for the storefront account feature (PRD-065).
 *
 * Covers login, register, dashboard, orders, quotes, profile, addresses and
 * vehicles surfaces of `/loja/conta/*`.
 */
export const STOREFRONT_ACCOUNT_STRINGS = {
  // Login
  loginPageTitle: "Entrar · GALLO PARTS",
  loginPageDescription:
    "Acesse sua conta GALLO PARTS para acompanhar pedidos, orçamentos e gerenciar seu cadastro.",
  loginTitle: "Entrar na sua conta",
  loginSubtitle: "Use seu e-mail e senha para continuar.",
  loginEmailLabel: "E-mail",
  loginEmailPlaceholder: "voce@empresa.com.br",
  loginPasswordLabel: "Senha",
  loginPasswordPlaceholder: "Sua senha",
  loginSubmit: "Entrar",
  loginSubmitting: "Entrando…",
  loginForgot: "Esqueci minha senha",
  loginNoAccount: "Ainda não tem conta?",
  loginRegisterCta: "Cadastre-se",
  loginGuestCta: "Continuar como visitante",
  loginErrorNotFound: "Não encontramos uma conta com este e-mail. Verifique ou crie um cadastro.",
  loginDemoHint: "Modo demonstração — qualquer senha é aceita para clientes já cadastrados.",
  loginSuccess: (name: string) => `Bem-vindo(a) de volta, ${name}!`,

  // Register
  registerPageTitle: "Criar conta · GALLO PARTS",
  registerPageDescription:
    "Crie sua conta para comprar com mais agilidade na GALLO PARTS — endereços salvos, histórico e frota cadastrada.",
  registerTitle: "Criar uma conta",
  registerSubtitle: "Escolha o tipo de cadastro e preencha seus dados.",
  registerTypeLabel: "Tipo de cadastro",
  registerTypePf: "Pessoa física",
  registerTypePj: "Empresa (B2B)",
  registerNameLabel: "Nome completo",
  registerNamePlaceholder: "Seu nome completo",
  registerCpfLabel: "CPF",
  registerCpfPlaceholder: "000.000.000-00",
  registerCnpjLabel: "CNPJ",
  registerCnpjPlaceholder: "00.000.000/0000-00",
  registerRazaoSocialLabel: "Razão social",
  registerNomeFantasiaLabel: "Nome fantasia",
  registerContactLabel: "Nome do contato principal",
  registerEmailLabel: "E-mail",
  registerEmailPlaceholder: "voce@empresa.com.br",
  registerPhoneLabel: "Telefone / WhatsApp",
  registerPhonePlaceholder: "(99) 99999-9999",
  registerPasswordLabel: "Senha",
  registerPasswordPlaceholder: "Mínimo 6 caracteres",
  registerPasswordConfirmLabel: "Confirme a senha",
  registerLgpdLabel: "Li e concordo com os Termos de Uso e a Política de Privacidade (LGPD).",
  registerSubmit: "Criar conta",
  registerSubmitting: "Criando…",
  registerHaveAccount: "Já tem conta?",
  registerLoginCta: "Entrar",
  registerEmailTaken: "Este e-mail já está cadastrado. Tente entrar na sua conta.",
  registerSuccess: "Cadastro criado com sucesso!",
  guestMergeTitle: "Encontramos um pedido em seu nome",
  guestMergeByEmail:
    "Identificamos uma compra anterior feita como visitante com este e-mail. Deseja vincular esse histórico à sua nova conta?",
  guestMergeByDocument:
    "Identificamos uma compra anterior feita como visitante com este CPF/CNPJ. Deseja vincular esse histórico à sua nova conta?",
  guestMergeConfirm: "Sim, vincular",
  guestMergeCancel: "Agora não",
  guestMergeSuccess: "Pedido anterior vinculado à sua conta!",

  // Password recovery (placeholder)
  recoverPageTitle: "Recuperar senha · GALLO PARTS",
  recoverTitle: "Recuperar senha",
  recoverSubtitle: "Informe seu e-mail e enviaremos instruções para redefinir sua senha.",
  recoverSubmit: "Enviar instruções",
  recoverBack: "Voltar para o login",
  recoverDemoBanner: "Modo demonstração — envio real de e-mails será habilitado na Fase 2.",
  recoverSuccess: "Se houver uma conta com este e-mail, enviamos instruções (modo demonstração).",

  // Validation
  errRequired: "Campo obrigatório.",
  errEmailInvalid: "E-mail inválido.",
  errPhoneInvalid: "Telefone inválido — informe DDD + número.",
  errCpfInvalid: "CPF inválido. Confira os dígitos.",
  errCnpjInvalid: "CNPJ inválido. Confira os dígitos.",
  errCnpjNotFound: "CNPJ não encontrado na Receita.",
  cnpjChecking: "Consultando Receita…",
  cnpjLookupError: "Não foi possível validar o CNPJ na Receita agora.",
  cnpjRetry: "Tentar novamente",
  errPasswordMin: "Senha deve ter no mínimo 6 caracteres.",
  errPasswordMismatch: "As senhas não coincidem.",
  errZipInvalid: "CEP inválido — use o formato 00000-000.",
  errLgpdRequired: "Você precisa aceitar os Termos para continuar.",

  // Account shell
  accountGreet: (name: string) => `Olá, ${name.split(" ")[0]}!`,
  accountSubtitle: "Acompanhe suas compras e mantenha seus dados em dia.",
  navDashboard: "Painel",
  navOrders: "Meus pedidos",
  navQuotes: "Orçamentos",
  navProfile: "Perfil",
  navAddresses: "Endereços",
  navVehicles: "Veículos",
  navLogout: "Sair",
  logoutSuccess: "Sessão encerrada.",
  mobileMenuTitle: "Minha conta",

  // Dashboard
  dashboardCardOrdersTitle: "Pedidos",
  dashboardCardOrdersSubtitle: (n: number) =>
    n === 0
      ? "Nenhum pedido ainda"
      : n === 1
        ? "1 pedido no histórico"
        : `${n} pedidos no histórico`,
  dashboardCardOrdersActiveSubtitle: (n: number) =>
    n === 1 ? "1 pedido em andamento" : `${n} pedidos em andamento`,
  dashboardCardOrdersCta: "Ver todos",
  dashboardCardQuotesTitle: "Orçamentos",
  dashboardCardQuotesSubtitle: (n: number) =>
    n === 0 ? "Nenhum orçamento" : n === 1 ? "1 orçamento" : `${n} orçamentos`,
  dashboardCardQuotesActiveSubtitle: (n: number) =>
    n === 1 ? "1 aguardando resposta" : `${n} aguardando resposta`,
  dashboardCardQuotesCta: "Ver todos",
  dashboardCardProfileTitle: "Perfil",
  dashboardCardProfileSubtitle: "Dados, senha e preferências",
  dashboardCardProfileCta: "Editar",
  dashboardCardAddressesTitle: "Endereços",
  dashboardCardAddressesSubtitle: (n: number) =>
    n === 0 ? "Nenhum endereço salvo" : n === 1 ? "1 endereço salvo" : `${n} endereços salvos`,
  dashboardCardAddressesCta: "Gerenciar",
  dashboardCardVehiclesTitle: "Veículos da frota",
  dashboardCardVehiclesSubtitle: (n: number) =>
    n === 0
      ? "Nenhum veículo cadastrado"
      : n === 1
        ? "1 veículo cadastrado"
        : `${n} veículos cadastrados`,
  dashboardCardVehiclesCta: "Gerenciar",

  // Orders list
  ordersTitle: "Meus pedidos",
  ordersSubtitle: "Histórico completo de compras na GALLO PARTS.",
  ordersEmptyTitle: "Você ainda não fez pedidos",
  ordersEmptyHint: "Quando concluir uma compra, ela aparece aqui.",
  ordersEmptyCta: "Explorar catálogo",
  ordersFilterAll: "Todos",
  ordersFilterActive: "Em andamento",
  ordersFilterDone: "Concluídos",
  ordersFilterCanceled: "Cancelados",
  ordersCardItems: (n: number) => (n === 1 ? "1 item" : `${n} itens`),
  ordersCardTotal: "Total",
  ordersCardDate: "Data",
  ordersCardCta: "Ver detalhes",

  // Order detail
  orderDetailBack: "Voltar para meus pedidos",
  orderDetailNotFound: "Pedido não encontrado.",
  orderDetailNotYours: "Este pedido não pertence ao seu cadastro.",
  orderDetailItems: "Itens do pedido",
  orderDetailAddress: "Endereço de entrega",
  orderDetailNoAddress: "Endereço não informado.",
  orderDetailPayment: "Forma de pagamento",
  orderDetailPaymentStatus: "Status do pagamento",
  orderDetailFulfillmentStatus: "Status de envio",
  orderDetailTotals: "Resumo",
  orderDetailRepeatCta: "Repetir pedido",
  orderDetailRepeatToast: "Itens adicionados ao carrinho.",
  orderDetailWhatsAppCta: "Falar sobre este pedido",
  orderDetailWhatsAppMessage: (number: string) =>
    `Olá! Gostaria de falar sobre o pedido ${number} da minha conta.`,

  // Quotes list
  quotesTitle: "Orçamentos",
  quotesSubtitle: "Propostas comerciais enviadas a você.",
  quotesEmptyTitle: "Sem orçamentos no momento",
  quotesEmptyHint: "Solicite um orçamento ao seu vendedor ou via WhatsApp para que apareça aqui.",
  quotesCardValid: (date: string) => `Validade: ${date}`,
  quotesCardItems: (n: number) => (n === 1 ? "1 item" : `${n} itens`),

  // Quote detail
  quoteDetailBack: "Voltar para orçamentos",
  quoteDetailNotFound: "Orçamento não encontrado.",
  quoteDetailNotYours: "Este orçamento não pertence ao seu cadastro.",
  quoteDetailHeader: (number: string) => `Orçamento ${number}`,
  quoteDetailItems: "Itens",
  quoteDetailValidity: (date: string) => `Válido até ${date}`,
  quoteDetailAccept: "Aceitar orçamento",
  quoteDetailAcceptingToast: "Aceitando orçamento…",
  quoteDetailAcceptedToast: "Orçamento aceito! Estamos preparando seu pedido.",
  quoteDetailExpired: "Este orçamento já expirou.",
  quoteDetailAlreadyAccepted: "Este orçamento já foi aceito.",

  // Profile
  profileTitle: "Meu perfil",
  profileSubtitle: "Atualize seus dados de contato e senha.",
  profileDataSection: "Dados de contato",
  profilePasswordSection: "Trocar senha",
  profileCurrentPasswordLabel: "Senha atual",
  profileNewPasswordLabel: "Nova senha",
  profileNewPasswordConfirmLabel: "Confirme a nova senha",
  profilePreferencesSection: "Preferências",
  profileNewsletterLabel: "Quero receber novidades e ofertas por e-mail",
  profileNewsletterHint: "Em breve — envio real disponível na Fase 2.",
  profileSubmit: "Salvar alterações",
  profileSubmitting: "Salvando…",
  profileSavedToast: "Perfil atualizado com sucesso.",
  profilePasswordChangedToast: "Senha atualizada (modo demonstração — não há verificação real).",

  // Addresses
  addressesTitle: "Endereços salvos",
  addressesSubtitle: "Cadastre seus endereços para usar como entrega em futuras compras.",
  addressesAddCta: "Novo endereço",
  addressesEditCta: "Editar",
  addressesRemoveCta: "Remover",
  addressesMakeDefaultCta: "Tornar padrão",
  addressesDefaultBadge: "Padrão",
  addressesEmpty: "Você ainda não cadastrou endereços.",
  addressesEmptyCta: "Cadastrar primeiro endereço",
  addressesModalTitleCreate: "Novo endereço",
  addressesModalTitleEdit: "Editar endereço",
  addressesSave: "Salvar endereço",
  addressesRemoveConfirm: "Tem certeza que deseja remover este endereço?",
  addressesRemovedToast: "Endereço removido.",
  addressesSavedToast: "Endereço salvo.",

  // Vehicles
  vehiclesTitle: "Veículos da frota",
  vehiclesSubtitle: "Cadastre os veículos da sua frota para receber sugestões compatíveis.",
  vehiclesB2COnlyHint:
    "Esta área é exclusiva para clientes B2B. Quer cadastrar uma frota? Fale com nosso time.",

  // Notifications
  navNotifications: "Notificações",
  navPreferences: "Preferências de aviso",
  notificationsTitle: "Notificações",
  notificationsSubtitle: "Atualizações dos seus pedidos, orçamentos e novidades.",
  notificationsEmptyTitle: "Tudo em dia por aqui",
  notificationsEmptyHint: "Você não tem notificações no momento.",
  notificationPrefsTitle: "Preferências de aviso",
  notificationPrefsSubtitle: "Escolha como você quer ser avisado sobre cada novidade.",

  // Header dropdown
  headerDropdownAccount: "Minha conta",
  headerDropdownOrders: "Meus pedidos",
  headerDropdownLogout: "Sair",
} as const;

export type StorefrontAccountStrings = typeof STOREFRONT_ACCOUNT_STRINGS;
