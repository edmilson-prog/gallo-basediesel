/**
 * Centralized route constants — strongly typed strings.
 *
 * Use these instead of inline string literals so we can refactor paths
 * without grepping the codebase.
 */
export const ROUTES = {
  // Root
  HOME: "/",

  // Auth
  AUTH_LOGIN: "/auth/login",
  AUTH_LOGOUT: "/auth/logout",

  // App interno
  APP_INICIO: "/app/inicio",
  APP_ATENDIMENTO: "/app/atendimento",
  APP_CLIENTES: "/app/clientes",
  APP_LEADS: "/app/leads",
  APP_VEICULOS: "/app/veiculos",
  APP_CARTEIRA: "/app/carteira",
  APP_CATALOGO: "/app/catalogo",
  APP_ORCAMENTOS: "/app/orcamentos",
  APP_PEDIDOS: "/app/pedidos",
  APP_SDR: "/app/sdr",
  APP_INSIGHTS: "/app/insights",
  APP_STOREFRONT_ADMIN: "/app/storefront-admin",

  // Gestão
  GESTAO_INICIO: "/app/gestao",
  GESTAO_VENDAS: "/app/gestao/vendas",
  GESTAO_METAS: "/app/gestao/metas",
  GESTAO_RANKING: "/app/gestao/ranking",
  GESTAO_POSITIVACAO: "/app/gestao/positivacao",
  GESTAO_ABC: "/app/gestao/abc",
  GESTAO_CARTEIRA_ANALITICA: "/app/gestao/carteira-analitica",
  GESTAO_COMISSOES: "/app/gestao/comissoes",
  GESTAO_DRE: "/app/gestao/dre",
  GESTAO_RENTABILIDADE: "/app/gestao/rentabilidade",
  GESTAO_DESPESAS: "/app/gestao/despesas",
  GESTAO_ATENDIMENTO_ANALISE: "/app/gestao/atendimento-analise",
  GESTAO_CAIXA: "/app/gestao/caixa",
  GESTAO_ESTOQUE: "/app/gestao/estoque",
  GESTAO_ESTOQUE_MOVIMENTACAO: "/app/gestao/estoque-movimentacao",

  // Configurações
  CONFIG_INICIO: "/app/configuracoes",
  CONFIG_PERFIL: "/app/configuracoes/perfil",
  CONFIG_APARENCIA: "/app/configuracoes/aparencia",
  CONFIG_COMISSOES: "/app/configuracoes/comissoes",
  CONFIG_FINANCEIRO: "/app/configuracoes/financeiro",
  CONFIG_ESTOQUE_ANALISE: "/app/configuracoes/estoque-analise",
  CONFIG_SOBRE: "/app/configuracoes/sobre",
  CONFIG_INSIGHTS: "/app/configuracoes/insights",
  CONFIG_STOREFRONT: "/app/configuracoes/storefront",
  CONFIG_ECOMMERCE_INTEGRACAO: "/app/configuracoes/ecommerce-integracao",

  // Loja (vitrine)
  LOJA_HOME: "/loja",
  LOJA_BUSCA: "/loja/busca",
  LOJA_CARRINHO: "/loja/carrinho",
  LOJA_CHECKOUT: "/loja/checkout",
  LOJA_CONTA: "/loja/conta",
  LOJA_CONTA_PEDIDOS: "/loja/conta/pedidos",

  // Portal cliente B2B
  PORTAL: "/portal",

  // Erro
  SEM_PERMISSAO: "/sem-permissao",
  ERRO: "/erro",

  // Dev-only
  DESIGN_SYSTEM: "/design-system",
} as const;

export type RouteKey = keyof typeof ROUTES;
