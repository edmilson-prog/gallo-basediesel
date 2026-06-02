import type {
  ConversationChannel,
  ConversationStatus,
  IConversation,
  ICustomer,
  ILead,
  IMessage,
  ISeller,
  MessageAuthorType,
  MessageMediaType,
  ID,
} from "@/shared/types";
import { SEED_STORE_ID } from "../data";

/**
 * Author marker used inside scripted turns.
 * - `customer`: the human on the other side
 * - `seller`: the assigned seller
 * - `sdr`: the SDR agent
 * - `system`: system note (rarely used)
 */
type ScriptAuthor = MessageAuthorType;

/**
 * A single turn in a scripted thread. `text` is the message body; `offsetMin`
 * is the minutes elapsed from the conversation start. `media` adds an optional
 * picture/audio attachment.
 */
interface IScriptedTurn {
  author: ScriptAuthor;
  text: string;
  offsetMin: number;
  media?: MessageMediaType;
}

/**
 * Strategy used to pick the participant for the scenario.
 * Keeps the script reusable across different generated datasets.
 */
type ParticipantPicker =
  | {
      kind: "customerByTier";
      tier: "first-b2b" | "first-b2c" | "dormant" | "dormant-b2c" | "vip" | "atRisk";
    }
  | { kind: "leadByStage"; stage: "new" | "qualified" };

interface IScriptedScenario {
  /** Slug appended to ids — must be unique. */
  slug: string;
  /** Human-readable label (logged in the console for QA, not shown in UI). */
  label: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  isSdrActive: boolean;
  /** Seller resolution — by deterministic id when known, or by "round-robin" fallback. */
  assignedSellerId: ID | "round-robin" | "none";
  participant: ParticipantPicker;
  /** Tags applied to the conversation. Should match labels in seedTags.ts when possible. */
  tags: string[];
  /** Days ago the conversation started (1 = yesterday). */
  daysAgo: number;
  /** Ordered turns. First turn is always the participant initiating. */
  turns: IScriptedTurn[];
}

/**
 * 12 scripted scenarios covering aquisição, recompra, volume, urgência, objeção,
 * pós-venda, recovery, SDR off-hours, e-commerce. Each conversation has a
 * coherent narrative — unlike the random generator, the order and choice of
 * lines tell a recognisable story for client demos and QA.
 *
 * PRD-043 introduced badges, PRDs 010/011 the inbox and conversation views,
 * PRD-020 the SDR. These scenarios light up all of those surfaces together.
 */
const SCENARIOS: IScriptedScenario[] = [
  // ─── 1. Aquisição via SDR + escalação ────────────────────────────────
  {
    slug: "sdr-escalation-volvo-pastilha",
    label: "Lead frio → SDR identifica peça → escala para Marina",
    channel: "whatsapp",
    status: "em_andamento",
    isSdrActive: false, // SDR já transferiu
    assignedSellerId: "seller-marina-cardoso",
    participant: { kind: "leadByStage", stage: "new" },
    tags: ["Volvo", "Frota pesada"],
    daysAgo: 1,
    turns: [
      {
        author: "customer",
        offsetMin: 0,
        text: "Oi, boa tarde! Vocês têm pastilha de freio para Volvo FH 460 ano 2019?",
      },
      {
        author: "sdr",
        offsetMin: 1,
        text: "Olá! Sou o assistente da GALLO Base Diesel — em que posso ajudar?",
      },
      {
        author: "sdr",
        offsetMin: 2,
        text: "Para qual veículo é a peça? Marca, modelo e ano por favor.",
      },
      { author: "customer", offsetMin: 4, text: "Volvo FH 460, 2019, eixo dianteiro" },
      { author: "sdr", offsetMin: 5, text: "Vou consultar nosso estoque, um momento…" },
      {
        author: "sdr",
        offsetMin: 6,
        text: "Encontrei 2 opções compatíveis: pastilha original Bosch (cód. OE 21568045) em pronta entrega e a equivalente Fras-le. Posso enviar a cotação?",
      },
      {
        author: "customer",
        offsetMin: 8,
        text: "Pode mandar, mas preferia falar com alguém pra negociar valor",
      },
      {
        author: "sdr",
        offsetMin: 9,
        text: "Vou transferir para um vendedor humano finalizar com você. Um instante.",
      },
      {
        author: "system",
        offsetMin: 10,
        text: "🔁 Conversa transferida do SDR para Marina Cardoso",
      },
      {
        author: "seller",
        offsetMin: 18,
        text: "Oi! Aqui é a Marina. Recebi o histórico do SDR — pastilha FH 460 dianteira, confere?",
      },
      { author: "customer", offsetMin: 25, text: "Confere. Quantos jogos vocês têm em estoque?" },
      {
        author: "seller",
        offsetMin: 27,
        text: "Temos 8 jogos do original e 14 do Fras-le. Original sai por R$ 890 o jogo, Fras-le R$ 620. À vista 5% off em ambos.",
      },
    ],
  },

  // ─── 2. Recompra B2B veloz ──────────────────────────────────────────
  {
    slug: "recompra-cliente-recorrente",
    label: "Cliente A recorrente, recompra rápida",
    channel: "whatsapp",
    status: "resolvida",
    isSdrActive: false,
    assignedSellerId: "seller-carlos-santos",
    participant: { kind: "customerByTier", tier: "vip" },
    tags: ["Cliente recorrente", "VIP", "Pagador em dia"],
    daysAgo: 3,
    turns: [
      {
        author: "customer",
        offsetMin: 0,
        text: "Carlos, bom dia! Manda igual ao pedido do mês passado, mesmas quantidades",
      },
      {
        author: "seller",
        offsetMin: 8,
        text: "Bom dia! Confirmando: 12 filtros de óleo, 6 correias dentadas e 4 jogos de pastilha. Mesmo endereço de entrega?",
      },
      { author: "customer", offsetMin: 10, text: "Isso mesmo. Pode faturar." },
      {
        author: "seller",
        offsetMin: 12,
        text: "Fechado. Vou montar a NF agora e te mando o boleto 28 dias como sempre.",
      },
      { author: "customer", offsetMin: 13, text: "👍" },
      {
        author: "seller",
        offsetMin: 45,
        text: "NF emitida e boleto no e-mail. Entrega quinta de manhã.",
      },
      { author: "customer", offsetMin: 60, text: "Recebido, valeu!" },
    ],
  },

  // ─── 3. Cotação em volume / fleet manager ──────────────────────────
  {
    slug: "negociacao-volume-frota",
    label: "Fleet manager pedindo cotação de 50 turbocompressores",
    channel: "whatsapp",
    status: "em_andamento",
    isSdrActive: false,
    assignedSellerId: "seller-marina-cardoso",
    participant: { kind: "customerByTier", tier: "first-b2b" },
    tags: ["Frota pesada", "Scania", "VIP"],
    daysAgo: 2,
    turns: [
      {
        author: "customer",
        offsetMin: 0,
        text: "Marina, preciso de cotação para 50 turbocompressores Scania R450 — vamos renovar a frota toda",
      },
      {
        author: "seller",
        offsetMin: 6,
        text: "Olá! Volume desse porte eu monto uma proposta especial. Pode me passar o número do chassi de pelo menos 3 caminhões pra confirmar a aplicação correta?",
      },
      {
        author: "customer",
        offsetMin: 30,
        text: "Mando hoje à tarde. Mas a princípio é Scania R450 ano 2017-2019, motor DC13. Qual a faixa de preço?",
      },
      {
        author: "seller",
        offsetMin: 35,
        text: "Linha Holset original gira em torno de R$ 12.500/un no varejo. Pra esse volume consigo trabalhar em R$ 10.800 com prazo 45 dias, ou R$ 10.200 à vista.",
      },
      {
        author: "customer",
        offsetMin: 38,
        text: "À vista 50 unidades é R$ 510 mil. Quero R$ 9.800/un, fechamos esta semana.",
      },
      {
        author: "seller",
        offsetMin: 42,
        text: "Vou subir essa proposta com a diretoria. Em 1h te respondo.",
      },
      {
        author: "system",
        offsetMin: 60,
        text: "⚠️ Pedido de aprovação de desconto > 5% — aguardando Owner",
      },
      {
        author: "seller",
        offsetMin: 110,
        text: "Boa! Aprovado em R$ 9.950 à vista, 50 unidades, entrega 15 dias dividida em 2 lotes. Fechamos?",
      },
    ],
  },

  // ─── 4. Urgência — caminhão parado na estrada ───────────────────────
  {
    slug: "urgencia-caminhao-parado",
    label: "Cliente urgente, caminhão parado na BR-386",
    channel: "phone",
    status: "aguardando",
    isSdrActive: false,
    assignedSellerId: "none",
    participant: { kind: "customerByTier", tier: "first-b2b" },
    tags: ["Frota pesada", "Mercedes-Benz"],
    daysAgo: 0,
    turns: [
      {
        author: "customer",
        offsetMin: 0,
        text: "URGENTE! Carreta Mercedes Actros parou na BR-386 km 137, motorista diz que é bomba injetora",
      },
      {
        author: "customer",
        offsetMin: 2,
        text: "Vocês têm bomba injetora pra Actros 2546 ano 2020? Preciso despachar HOJE",
      },
      { author: "customer", offsetMin: 6, text: "Alguém atende?" },
    ],
  },

  // ─── 5. Objeção de preço ────────────────────────────────────────────
  {
    slug: "objecao-preco-concorrencia",
    label: "Cliente compara preço com concorrência",
    channel: "whatsapp",
    status: "em_andamento",
    isSdrActive: false,
    assignedSellerId: "seller-rafael-lima",
    participant: { kind: "customerByTier", tier: "first-b2b" },
    tags: ["Iveco"],
    daysAgo: 1,
    turns: [
      {
        author: "customer",
        offsetMin: 0,
        text: "Rafael, recebi proposta da Diesel Sul por R$ 4.200 no mesmo kit de embreagem Iveco. Vocês cobrem?",
      },
      {
        author: "seller",
        offsetMin: 12,
        text: "Oi! Nosso valor é R$ 4.580. Posso trabalhar R$ 4.290 mantendo a garantia de 12 meses e frete CIF — eles entregam onde?",
      },
      {
        author: "customer",
        offsetMin: 30,
        text: "Eles cobram frete à parte e a garantia é 6 meses só",
      },
      {
        author: "seller",
        offsetMin: 35,
        text: "Então tecnicamente o nosso fica até melhor. CIF + 12 meses de garantia + assistência técnica. Posso emitir a NF?",
      },
      { author: "customer", offsetMin: 90, text: "Deixa eu pensar e te respondo amanhã" },
      {
        author: "seller",
        offsetMin: 95,
        text: "Tranquilo. Se quiser eu seguro esse preço por 48h.",
      },
    ],
  },

  // ─── 6. Pós-venda — peça que não encaixou ───────────────────────────
  {
    slug: "pos-venda-reclamacao",
    label: "Cliente reclama de peça que não encaixou",
    channel: "whatsapp",
    status: "em_andamento",
    isSdrActive: false,
    assignedSellerId: "seller-carlos-santos",
    participant: { kind: "customerByTier", tier: "first-b2b" },
    tags: ["Ford Cargo", "Oficina parceira"],
    daysAgo: 4,
    turns: [
      {
        author: "customer",
        offsetMin: 0,
        text: "Carlos, problemão. O kit de juntas que veio na NF 8842 não encaixou no Cargo 2429",
      },
      {
        author: "customer",
        offsetMin: 1,
        text: "Mecânico diz que é para o motor MWM 6.12 e o nosso é Cummins ISBe",
      },
      {
        author: "customer",
        offsetMin: 1,
        text: "Estou com o caminhão aberto na oficina, preciso de solução",
        media: "image",
      },
      {
        author: "seller",
        offsetMin: 14,
        text: "Calma, vou resolver agora. Me confirma o chassi do caminhão?",
      },
      { author: "customer", offsetMin: 18, text: "9BFXXXKXXXXX12345" },
      {
        author: "seller",
        offsetMin: 25,
        text: "Conferi aqui — você tem razão, motor Cummins. Erro nosso na separação. Vou despachar hoje o kit correto e mando motoboy buscar o errado.",
      },
      { author: "customer", offsetMin: 28, text: "Hoje mesmo? Não tem outra opção mais rápida?" },
      {
        author: "seller",
        offsetMin: 32,
        text: "Já está saindo de Frederico Westphalen, chega em Passo Fundo em 2h30. Sem custo de frete e estendo a garantia para 18 meses pela inconveniência.",
      },
      { author: "customer", offsetMin: 35, text: "Ok, fico no aguardo. Valeu pela rapidez" },
    ],
  },

  // ─── 7. Re-engajamento — orçamento expirado ─────────────────────────
  {
    slug: "reengajamento-orcamento-expirado",
    label: "Vendedor retoma cliente que sumiu após orçamento",
    channel: "whatsapp",
    status: "aguardando_cliente",
    isSdrActive: false,
    assignedSellerId: "seller-rafael-lima",
    participant: { kind: "customerByTier", tier: "first-b2c" },
    tags: ["Volvo"],
    daysAgo: 7,
    turns: [
      {
        author: "seller",
        offsetMin: 0,
        text: "Bom dia! Aqui é o Rafael da GALLO. Lembrei que aquele orçamento de bomba d'água Volvo FH que te mandei está vencendo amanhã. Quer que eu renove com algum ajuste?",
      },
      { author: "seller", offsetMin: 1, text: "Posso baixar R$ 80 se fechar essa semana." },
    ],
  },

  // ─── 8. Happy path — pedido fechado, NF, entrega ────────────────────
  {
    slug: "happy-path-fechamento",
    label: "Pedido B2B aprovado e entregue",
    channel: "whatsapp",
    status: "resolvida",
    isSdrActive: false,
    assignedSellerId: "seller-marina-cardoso",
    participant: { kind: "customerByTier", tier: "first-b2b" },
    tags: ["Mercedes-Benz", "Cliente recorrente", "Pagador em dia"],
    daysAgo: 5,
    turns: [
      {
        author: "customer",
        offsetMin: 0,
        text: "Marina, pode mandar 4 kits de embreagem para os Atego e 2 turbos Mercedes 1726",
      },
      {
        author: "seller",
        offsetMin: 15,
        text: "Anotado! Embreagens linha LUK e turbos Holset originais. Total R$ 38.400 com 28d, NF em nome da Transportadora Aurora, ok?",
      },
      { author: "customer", offsetMin: 18, text: "Perfeito, pode emitir" },
      {
        author: "seller",
        offsetMin: 45,
        text: "NF 8923 emitida, boleto no e-mail. Entrega prevista terça-feira.",
      },
      { author: "customer", offsetMin: 65, text: "Recebido, obrigado!" },
      {
        author: "seller",
        offsetMin: 4320,
        text: "Oi! Chegou tudo certo? Algum problema na conferência?",
      },
      {
        author: "customer",
        offsetMin: 4380,
        text: "Chegou redondinho, mecânico já montou o primeiro Atego. Sucesso!",
      },
      { author: "seller", offsetMin: 4385, text: "Massa! Qualquer coisa estou à disposição." },
    ],
  },

  // ─── 9. E-commerce — dúvida sobre frete ─────────────────────────────
  {
    slug: "ecommerce-duvida-frete",
    label: "Carrinho criado no e-commerce, dúvida sobre frete",
    channel: "ecommerce",
    status: "em_andamento",
    isSdrActive: false,
    assignedSellerId: "seller-rafael-lima",
    participant: { kind: "customerByTier", tier: "first-b2c" },
    tags: ["Scania"],
    daysAgo: 1,
    turns: [
      {
        author: "customer",
        offsetMin: 0,
        text: "Coloquei 2 filtros e 1 correia no carrinho mas o frete não aparece pra Erechim/RS",
      },
      { author: "system", offsetMin: 1, text: "🛒 Carrinho #CART-1042 vinculado — Scania R450" },
      {
        author: "seller",
        offsetMin: 22,
        text: "Oi! Erechim entrega em 24h por transportadora própria. Valor é R$ 45 — vou liberar manualmente no seu pedido. Pode finalizar?",
      },
      {
        author: "customer",
        offsetMin: 50,
        text: "Finalizei, pagamento PIX, número do pedido #4471",
      },
      {
        author: "seller",
        offsetMin: 55,
        text: "Pagamento confirmado, separação inicia hoje à tarde. Te aviso quando despachar.",
      },
    ],
  },

  // ─── 10. Recovery — cliente dormente ────────────────────────────────
  {
    slug: "recovery-dormente-90d",
    label: "Vendedor proativo recupera cliente dormente",
    channel: "whatsapp",
    status: "em_andamento",
    isSdrActive: false,
    assignedSellerId: "seller-carlos-santos",
    participant: { kind: "customerByTier", tier: "dormant" },
    tags: ["Em recuperação", "Volvo"],
    daysAgo: 0,
    turns: [
      {
        author: "seller",
        offsetMin: 0,
        text: "Bom dia! Aqui é o Carlos da GALLO. Notei que faz uns 3 meses que não fazemos pedido, está tudo bem por aí?",
      },
      {
        author: "customer",
        offsetMin: 35,
        text: "Oi Carlos! Tudo certo. Estávamos com a frota parada por sazonalidade, mas semana que vem retomamos.",
      },
      {
        author: "seller",
        offsetMin: 40,
        text: "Que bom! Lançamos uma condição para retomada: nos próximos 30 dias damos 8% de desconto no primeiro pedido acima de R$ 5 mil. Te mando o catálogo?",
      },
      {
        author: "customer",
        offsetMin: 50,
        text: "Pode mandar. Preciso conferir o estoque da oficina e te volto.",
      },
      {
        author: "seller",
        offsetMin: 55,
        text: "Catálogo enviado por e-mail. Estou aqui pra qualquer ajuste.",
      },
    ],
  },

  // ─── 11. SDR off-hours + agendamento ────────────────────────────────
  {
    slug: "sdr-off-hours",
    label: "SDR atendendo fora do horário, agendamento manhã seguinte",
    channel: "whatsapp",
    status: "aguardando_cliente",
    isSdrActive: true,
    assignedSellerId: "none",
    participant: { kind: "leadByStage", stage: "qualified" },
    tags: ["Iveco"],
    daysAgo: 0,
    turns: [
      {
        author: "customer",
        offsetMin: 0,
        text: "Boa noite, vocês têm bico injetor pra Iveco Tector 240E25?",
      },
      {
        author: "sdr",
        offsetMin: 1,
        text: "Olá! Sou o assistente da GALLO Base Diesel — em que posso ajudar?",
      },
      {
        author: "sdr",
        offsetMin: 2,
        text: "Posso te adiantar: temos Bosch CRIN 2 e Delphi como opções compatíveis. Estoque atual em Frederico Westphalen.",
      },
      { author: "customer", offsetMin: 4, text: "Quanto sai cada um?" },
      {
        author: "sdr",
        offsetMin: 5,
        text: "Faixa de R$ 1.200 (Delphi) a R$ 1.480 (Bosch). Como nosso atendimento humano está fora do expediente, posso agendar um vendedor para te ligar amanhã 8h e fechar a cotação?",
      },
      { author: "customer", offsetMin: 7, text: "Pode agendar sim" },
      {
        author: "sdr",
        offsetMin: 8,
        text: "Combinado! Marina vai te ligar amanhã às 8h. Tenha uma boa noite.",
      },
    ],
  },

  // ─── 12. B2C parcelamento + retirada na loja ────────────────────────
  {
    slug: "b2c-parcelamento-retirada",
    label: "B2C ansioso, parcelamento e retirada na loja",
    channel: "site",
    status: "resolvida",
    isSdrActive: false,
    assignedSellerId: "seller-rafael-lima",
    participant: { kind: "customerByTier", tier: "first-b2c" },
    tags: ["Ford Cargo"],
    daysAgo: 6,
    turns: [
      {
        author: "customer",
        offsetMin: 0,
        text: "Oi! Preciso de um kit de embreagem Ford Cargo 1119, dá pra parcelar?",
      },
      {
        author: "seller",
        offsetMin: 12,
        text: "Boa tarde! Sim, dá pra parcelar em 3x sem juros no cartão. Valor à vista R$ 2.180, parcelado R$ 2.290.",
      },
      { author: "customer", offsetMin: 15, text: "Posso retirar na loja amanhã?" },
      {
        author: "seller",
        offsetMin: 16,
        text: "Pode sim, estoque ok. Loja em Frederico Westphalen, horário 8h-18h. Quer que eu já separe?",
      },
      { author: "customer", offsetMin: 18, text: "Separa por favor, vou aí 14h" },
      {
        author: "seller",
        offsetMin: 20,
        text: "Separado! Pedido #4478. Pode passar direto no balcão amanhã 14h.",
      },
      { author: "customer", offsetMin: 1500, text: "Retirei agora, peça beleza. Valeu Rafael!" },
    ],
  },

  // ─── 13. Copiloto R1 — prazo perguntado 2× sem resposta (alert/high) ──
  {
    slug: "copilot-prazo-sem-resposta",
    label: "Copiloto · R1 alerta: cliente pergunta o prazo 2× e ninguém responde",
    channel: "whatsapp",
    status: "aguardando",
    isSdrActive: false,
    assignedSellerId: "seller-marina-cardoso",
    participant: { kind: "customerByTier", tier: "first-b2b" },
    tags: ["Scania", "Frota pesada"],
    daysAgo: 0,
    turns: [
      {
        author: "customer",
        offsetMin: 0,
        text: "Marina, fechei os 6 filtros ontem. Qual o prazo de entrega pra Erechim?",
      },
      {
        author: "seller",
        offsetMin: 20,
        text: "Oi! Deixa eu confirmar com a logística e já te falo.",
      },
      {
        author: "customer",
        offsetMin: 180,
        text: "E aí, conseguiu a previsão de entrega? O caminhão sai sexta cedo",
      },
      {
        author: "customer",
        offsetMin: 420,
        text: "Marina, só preciso saber o prazo pra me organizar. Chega quando?",
      },
    ],
  },

  // ─── 14. Copiloto R2 — B2C pede NF em nome da empresa (action/medium) ─
  {
    slug: "copilot-faturamento-b2c",
    label: "Copiloto · R2 ação: cliente B2C (CPF) pede NF em nome da empresa",
    channel: "whatsapp",
    status: "em_andamento",
    isSdrActive: false,
    assignedSellerId: "seller-rafael-lima",
    participant: { kind: "customerByTier", tier: "first-b2c" },
    tags: ["Ford Cargo"],
    daysAgo: 0,
    turns: [
      {
        author: "customer",
        offsetMin: 0,
        text: "Rafael, vou levar o kit de embreagem do Cargo 1119, pode separar",
      },
      {
        author: "seller",
        offsetMin: 8,
        text: "Boa tarde! Separado. Fecha em R$ 2.180 à vista. Confirmo a emissão?",
      },
      {
        author: "customer",
        offsetMin: 12,
        text: "Confirma. Só que dessa vez preciso da nota fiscal em nome da empresa, no CNPJ da transportadora",
      },
    ],
  },

  // ─── 15. Copiloto R3 — cliente dormente com intenção de compra (opp) ──
  {
    slug: "copilot-dormente-oportunidade",
    label: "Copiloto · R3 oportunidade: cliente dormente volta perguntando preço",
    channel: "whatsapp",
    status: "em_andamento",
    isSdrActive: false,
    assignedSellerId: "seller-carlos-santos",
    participant: { kind: "customerByTier", tier: "dormant" },
    tags: ["Em recuperação", "Volvo"],
    daysAgo: 0,
    turns: [
      {
        author: "customer",
        offsetMin: 0,
        text: "Carlos, faz tempo que não compro com vocês. Vi que preciso trocar a bomba d'água do FH",
      },
      {
        author: "customer",
        offsetMin: 3,
        text: "Consegue me passar uma cotação? Queria saber o valor pra fechar essa semana",
      },
    ],
  },

  // ─── 16. Copiloto R1+R2+R3 — B2C dormente, três sinais juntos ─────────
  {
    slug: "copilot-tres-sinais",
    label: "Copiloto · R1+R2+R3: B2C dormente — prazo 2×, NF da empresa e preço",
    channel: "whatsapp",
    status: "em_andamento",
    isSdrActive: false,
    assignedSellerId: "seller-rafael-lima",
    participant: { kind: "customerByTier", tier: "dormant-b2c" },
    tags: ["Em recuperação", "Iveco"],
    daysAgo: 0,
    turns: [
      {
        author: "customer",
        offsetMin: 0,
        text: "Oi Rafael! Sumi um tempo, mas preciso de um par de amortecedores pro Iveco Daily. Qual o valor?",
      },
      {
        author: "seller",
        offsetMin: 10,
        text: "Opa, que bom te ver de volta! O par sai por R$ 740. Quer que eu já reserve?",
      },
      {
        author: "customer",
        offsetMin: 14,
        text: "Pode reservar. Vou precisar da nota fiscal em nome da empresa, no CNPJ da oficina",
      },
      {
        author: "customer",
        offsetMin: 200,
        text: "Rafael, qual o prazo de entrega? Preciso pra amanhã",
      },
      {
        author: "customer",
        offsetMin: 520,
        text: "Conseguiu ver a previsão de entrega? Ainda não tive retorno do prazo",
      },
    ],
  },
];

// ────────────────────────────────────────────────────────────────────
// Public generator
// ────────────────────────────────────────────────────────────────────

interface IGenerateScriptedInput {
  customers: ICustomer[];
  leads: ILead[];
  sellers: ISeller[];
  whatsappAccountIds: ID[];
  now?: Date;
}

interface IScriptedResult {
  conversations: IConversation[];
  messages: IMessage[];
}

/**
 * Materialize the scripted scenarios against the already-generated entities.
 * Picks deterministic participants so two runs of the bootstrap yield the same
 * conversations.
 */
export function generateScriptedConversations(input: IGenerateScriptedInput): IScriptedResult {
  const { customers, leads, sellers, whatsappAccountIds } = input;
  const now = input.now ?? new Date();

  const conversations: IConversation[] = [];
  const messages: IMessage[] = [];

  const fallbackWhatsapp = whatsappAccountIds[0];
  let roundRobinIdx = 0;
  const vendedorSellers = sellers.filter((s) => s.id !== "seller-joao-gallo");

  // Sort customers / leads deterministically so the participant picks are stable
  // across runs even when the underlying generators reshuffle.
  const sortedCustomers = [...customers].sort((a, b) => a.id.localeCompare(b.id));
  const sortedLeads = [...leads].sort((a, b) => a.id.localeCompare(b.id));

  const b2bs = sortedCustomers.filter((c) => c.type === "B2B");
  const b2cs = sortedCustomers.filter((c) => c.type === "B2C");

  function pickCustomerFor(picker: ParticipantPicker): ICustomer | undefined {
    if (picker.kind !== "customerByTier") return undefined;
    switch (picker.tier) {
      case "first-b2b":
        return b2bs[0];
      case "first-b2c":
        return b2cs[0];
      case "dormant-b2c":
        // Prefer a naturally dormant B2C; fall back to the LAST B2C (not the
        // shared b2cs[0]) so the determinism guard below mutates an isolated
        // customer if the seed produced no dormant B2C.
        return b2cs.find((c) => c.status === "dormente") ?? b2cs[b2cs.length - 1] ?? b2cs[0];
      case "vip":
        return b2bs.find((c) => c.tags?.includes("VIP")) ?? b2bs[1] ?? b2bs[0];
      case "dormant":
        return sortedCustomers.find((c) => c.status === "dormente") ?? b2bs[2] ?? b2bs[0];
      case "atRisk":
        return sortedCustomers.find((c) => c.status === "dormente") ?? b2bs[3] ?? b2bs[0];
    }
  }

  function pickLeadFor(picker: ParticipantPicker): ILead | undefined {
    if (picker.kind !== "leadByStage") return undefined;
    // We don't filter by stage strictly — pick by index for determinism.
    if (picker.stage === "new") return sortedLeads[0];
    return sortedLeads[1] ?? sortedLeads[0];
  }

  function resolveSellerId(scenario: IScriptedScenario): ID | undefined {
    if (scenario.assignedSellerId === "none") return undefined;
    if (scenario.assignedSellerId === "round-robin") {
      const seller = vendedorSellers[roundRobinIdx % vendedorSellers.length];
      roundRobinIdx += 1;
      return seller?.id;
    }
    // Make sure the seller actually exists; fall back to round-robin if not.
    const found = sellers.find((s) => s.id === scenario.assignedSellerId);
    return found?.id ?? vendedorSellers[0]?.id;
  }

  SCENARIOS.forEach((scenario, idx) => {
    const customer =
      scenario.participant.kind === "customerByTier"
        ? pickCustomerFor(scenario.participant)
        : undefined;

    // Determinism guard for the three-signal copilot demo (R1+R2+R3): R3 needs a
    // customer whose lifecycle status is "dormente". If the seeded dataset didn't
    // produce a dormant B2C, promote the chosen one so the rule fires every run.
    // Coherent side effect: this customer's Ficha will also read as dormant.
    if (scenario.slug === "copilot-tres-sinais" && customer && customer.status !== "dormente") {
      customer.status = "dormente";
    }
    const lead =
      scenario.participant.kind === "leadByStage" ? pickLeadFor(scenario.participant) : undefined;
    if (!customer && !lead) return; // skip scenario if dataset is too small

    const sellerId = resolveSellerId(scenario);
    const convId: ID = `scripted-conv-${String(idx + 1).padStart(3, "0")}-${scenario.slug.slice(0, 16)}`;

    const startedMs = now.getTime() - scenario.daysAgo * 86400_000 - 8 * 60 * 60 * 1000; // ~8h into the day
    const startedAt = new Date(startedMs);

    // Build messages with their absolute timestamps, derive lastMessageAt from
    // the final turn.
    let lastMessageMs = startedMs;
    scenario.turns.forEach((turn, turnIdx) => {
      const ts = new Date(startedMs + turn.offsetMin * 60_000);
      lastMessageMs = Math.max(lastMessageMs, ts.getTime());
      const direction = turn.author === "customer" ? "in" : "out";
      const authorId: ID | undefined = (() => {
        switch (turn.author) {
          case "customer":
            return customer?.id ?? lead?.id;
          case "seller":
            return sellerId;
          case "sdr":
            return "sdr-agent";
          case "system":
            return undefined;
        }
      })();
      const message: IMessage = {
        id: `scripted-msg-${String(idx + 1).padStart(3, "0")}-${String(turnIdx + 1).padStart(2, "0")}`,
        conversationId: convId,
        direction,
        authorType: turn.author,
        authorId,
        provider: scenario.channel === "whatsapp" ? "meta" : "mock",
        text: turn.text,
        mediaType: turn.media,
        mediaUrl: turn.media
          ? `https://picsum.photos/seed/${convId}-${turnIdx}/600/400`
          : undefined,
        status: direction === "in" ? "delivered" : "read",
        sentAt: ts.toISOString(),
        deliveredAt: direction === "out" ? ts.toISOString() : undefined,
        readAt: direction === "out" ? ts.toISOString() : undefined,
      };
      messages.push(message);
    });

    const conv: IConversation = {
      id: convId,
      storeId: SEED_STORE_ID,
      customerId: customer?.id,
      leadId: lead?.id,
      assignedSellerId: scenario.isSdrActive ? undefined : sellerId,
      channel: scenario.channel,
      whatsappAccountId: scenario.channel === "whatsapp" ? fallbackWhatsapp : undefined,
      status: scenario.status,
      isSdrActive: scenario.isSdrActive,
      tags: scenario.tags,
      lastMessageAt: new Date(lastMessageMs).toISOString(),
      // Conversations awaiting human reply surface unread badge in the inbox.
      unreadCount:
        scenario.status === "aguardando"
          ? Math.max(1, scenario.turns.filter((t) => t.author === "customer").length - 1)
          : 0,
      createdAt: startedAt.toISOString(),
    };
    conversations.push(conv);

    // Attach to lead.conversations if applicable.
    if (lead && !lead.conversations.includes(convId)) {
      lead.conversations.push(convId);
    }
  });

  return { conversations, messages };
}

/** Exported only for visibility in dev tools / docs. */
export const SCRIPTED_CONVERSATION_SCENARIOS = SCENARIOS;
