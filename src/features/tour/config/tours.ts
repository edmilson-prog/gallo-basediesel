// src/features/tour/config/tours.ts
import type { TourDef } from "../types";

// Rich tours (holofote) — Atendimento has two states (inbox vs open conversation).
const ATENDIMENTO_INBOX: TourDef = {
  key: "atendimento-inbox",
  kind: "rich",
  label: "Atendimento — caixa de conversas",
  route: "/app/atendimento",
  steps: [
    {
      icon: "mdi:hand-wave",
      title: "Bem-vindo ao Atendimento",
      body: "Em 1 minuto você aprende a receber, responder e organizar suas conversas.",
    },
    {
      target: "inbox-header",
      icon: "mdi:inbox",
      title: "O topo da caixa",
      body: "Aqui ficam o total de conversas, a busca e o botão para iniciar um atendimento novo.",
      placement: "bottom",
    },
    {
      target: "inbox-filters",
      icon: "mdi:filter-variant",
      title: "Encontre conversas",
      body: "Filtre por status, não lidas ou número da conta.",
      placement: "bottom",
    },
    {
      target: "inbox-list",
      icon: "mdi:message-text",
      title: "Sua caixa de conversas",
      body: "Cada conversa mostra o contato, a última mensagem e o status. As não lidas ficam no topo.",
      placement: "right",
    },
  ],
};

const ATENDIMENTO_CONVERSA: TourDef = {
  key: "atendimento-conversa",
  kind: "rich",
  label: "Atendimento — dentro da conversa",
  matchPrefix: "/app/atendimento/",
  steps: [
    {
      target: "conversation-header",
      icon: "mdi:account",
      title: "Quem é o cliente",
      body: "No topo aparece o contato, por qual número você responde e as ações: transferir, notas e a ficha.",
      placement: "bottom",
    },
    {
      target: "message-list",
      icon: "mdi:message-text-outline",
      title: "O histórico",
      body: "Todas as mensagens ficam aqui. Cada uma mostra se foi enviada, entregue ou lida.",
      placement: "left",
    },
    {
      target: "composer",
      icon: "mdi:send",
      title: "Responda por aqui",
      body: "Digite e envie. Use o anexo para mandar foto da peça ou o PDF do orçamento.",
      placement: "top",
    },
    {
      icon: "mdi:check-circle",
      title: "Pronto!",
      body: "Você pode rever este tour quando quiser no ícone ? no topo da tela.",
    },
  ],
};

// Welcome cards (estilo C) — one per sidebar item. Single centered step.
function welcome(key: string, label: string, route: string, icon: string, body: string): TourDef {
  return { key, kind: "welcome", label, route, steps: [{ icon, title: label, body }] };
}

const WELCOME_TOURS: TourDef[] = [
  welcome("welcome-inicio", "Início", "/app/inicio", "mdi:home-variant", "Seu ponto de partida: resumo do dia, conversas recentes e atalhos rápidos."),
  welcome("welcome-clientes", "Clientes", "/app/clientes", "mdi:account-multiple", "Sua base B2B e B2C: busque, filtre e abra a ficha completa de cada cliente."),
  welcome("welcome-leads", "Leads", "/app/leads", "mdi:account-question", "Oportunidades em andamento: acompanhe o funil e mova os leads entre etapas."),
  welcome("welcome-veiculos", "Veículos", "/app/veiculos", "mdi:truck", "A frota dos clientes: cadastre caminhões e use o modelo para achar a peça certa."),
  welcome("welcome-carteira", "Carteira", "/app/carteira", "mdi:briefcase-account", "Sua carteira de clientes: quem é seu, responsáveis e transferências."),
  welcome("welcome-catalogo", "Catálogo", "/app/catalogo", "mdi:cog", "Catálogo de peças: busque por código, aplicação ou modelo de veículo."),
  welcome("welcome-kits", "Kits por modelo", "/app/kits", "mdi:truck-outline", "Kits prontos por modelo de caminhão para montar orçamentos mais rápido."),
  welcome("welcome-orcamentos", "Orçamentos", "/app/orcamentos", "mdi:file-document-outline", "Monte orçamentos com peças do catálogo e envie direto pelo WhatsApp."),
  welcome("welcome-pedidos", "Pedidos", "/app/pedidos", "mdi:clipboard-list", "Acompanhe seus pedidos do rascunho até a entrega."),
  welcome("welcome-storefront-admin", "Admin da Loja", "/app/storefront-admin", "mdi:storefront", "Configure a loja online: produtos, categorias e destaques da vitrine."),
  welcome("welcome-sdr", "Painel SDR", "/app/sdr", "mdi:robot", "Qualificação automática de leads: acompanhe sessões e escalações."),
  welcome("welcome-copiloto", "Copiloto", "/app/gestao/copiloto", "mdi:robot-happy-outline", "Seu assistente de IA: peça resumos, análises e ajuda nas conversas."),
  welcome("welcome-gestao", "Visão executiva", "/app/gestao", "mdi:view-dashboard", "Panorama do negócio: os principais números da operação num só lugar."),
  welcome("welcome-vendas", "Vendas", "/app/gestao/vendas", "mdi:chart-line", "Análise de vendas: evolução, ranking e desempenho por período."),
  welcome("welcome-forecast", "Forecast", "/app/gestao/forecast", "mdi:chart-timeline", "Projeção de vendas: o que está previsto para fechar no período."),
  welcome("welcome-metas", "Metas", "/app/gestao/metas", "mdi:target", "Metas da equipe: defina, acompanhe e bata os objetivos do mês."),
  welcome("welcome-indicadores", "Indicadores", "/app/gestao/indicadores", "mdi:chart-line", "Indicadores de desempenho da operação comercial."),
  welcome("welcome-ranking", "Ranking", "/app/gestao/ranking", "mdi:trophy", "Ranking dos vendedores: gamificação e disputa saudável."),
  welcome("welcome-positivacao", "Positivação", "/app/gestao/positivacao", "mdi:account-check", "Clientes que compraram no período: acompanhe a positivação da carteira."),
  welcome("welcome-abc", "Curva ABC", "/app/gestao/abc", "mdi:chart-arc", "Classifique clientes e produtos por relevância (A, B e C)."),
  welcome("welcome-carteira-analitica", "Carteira Analítica", "/app/gestao/carteira-analitica", "mdi:heart-pulse", "Saúde da carteira: quem está ativo, em risco ou inativo."),
  welcome("welcome-comissoes", "Comissões", "/app/gestao/comissoes", "mdi:cash-multiple", "Apuração de comissões por vendedor e período."),
  welcome("welcome-dre", "DRE Gerencial", "/app/gestao/dre", "mdi:file-chart", "Demonstração de resultados: receitas, custos e lucro."),
  welcome("welcome-rentabilidade", "Rentabilidade", "/app/gestao/rentabilidade", "mdi:scale-balance", "Margem e rentabilidade por produto, cliente e venda."),
  welcome("welcome-despesas", "Despesas", "/app/gestao/despesas", "mdi:cash-remove", "Lance e acompanhe as despesas da operação."),
  welcome("welcome-caixa", "Fluxo de Caixa", "/app/gestao/caixa", "mdi:cash-flow", "Entradas e saídas: a saúde financeira ao longo do tempo."),
  welcome("welcome-estoque", "Estoque", "/app/gestao/estoque", "mdi:warehouse", "Posição de estoque: o que tem, onde e quanto."),
  welcome("welcome-estoque-mov", "Movimentação", "/app/gestao/estoque-movimentacao", "mdi:swap-vertical-variant", "Entradas e saídas de estoque, item a item."),
  welcome("welcome-insights", "Insights", "/app/insights", "mdi:brain", "Recomendações automáticas para agir sobre clientes e vendas."),
  welcome("welcome-saude", "Saúde do Sistema", "/app/gestao/saude", "mdi:pulse", "Status técnico da plataforma: integrações, WhatsApp e serviços."),
  welcome("welcome-config", "Admin", "/app/configuracoes", "mdi:cog-outline", "Configurações gerais da loja, equipe e plataforma."),
  welcome("welcome-perfil", "Perfil", "/app/configuracoes/perfil", "mdi:account", "Seus dados, disponibilidade e preferências de conta."),
  welcome("welcome-aparencia", "Aparência", "/app/configuracoes/aparencia", "mdi:palette", "Tema, cores e modo claro/escuro."),
];

export const TOURS: TourDef[] = [ATENDIMENTO_INBOX, ATENDIMENTO_CONVERSA, ...WELCOME_TOURS];

export function getTourByKey(key: string): TourDef | undefined {
  return TOURS.find((t) => t.key === key);
}
