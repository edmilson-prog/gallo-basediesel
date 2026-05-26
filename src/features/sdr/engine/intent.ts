import type { ISdrIntentMatch, SdrIntent } from "@/shared/types";

/**
 * Keyword buckets evaluated in priority order. The MVP keeps the matcher
 * intentionally simple (lowercase + token-aware includes); LLM classification
 * replaces this module on Fase 2 without touching `sdrRespond()`.
 */
interface IIntentRule {
  intent: SdrIntent;
  keywords: string[];
}

const VEHICLE_BRANDS = [
  "volvo",
  "scania",
  "mercedes",
  "mercedes-benz",
  "mb",
  "ford",
  "cargo",
  "iveco",
];

const INTENT_RULES: IIntentRule[] = [
  {
    intent: "escalar_humano",
    keywords: [
      "humano",
      "vendedor",
      "atendente",
      "pessoa",
      "alguém",
      "alguem",
      "ajuda",
      "falar com",
    ],
  },
  {
    intent: "gerar_orcamento",
    keywords: ["orçamento", "orcamento", "valor", "preço", "preco", "quanto custa", "cotação"],
  },
  {
    intent: "identificar_peca",
    keywords: [
      "peça",
      "peca",
      "preciso",
      "comprar",
      "tem o",
      "tem a",
      "tem uma",
      "tem um",
      "filtro",
      "freio",
      "bomba",
      "injetor",
      "amortecedor",
      "embreagem",
      ...VEHICLE_BRANDS,
    ],
  },
  {
    intent: "faq_horario",
    keywords: ["horário", "horario", "horarios", "atendimento", "aberto", "que horas"],
  },
  {
    intent: "faq_entrega",
    keywords: ["entrega", "frete", "envio", "região", "regiao", "cep"],
  },
];

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function findMatches(text: string, keywords: string[]): string[] {
  const norm = normalize(text);
  const found: string[] = [];
  for (const kw of keywords) {
    if (norm.includes(kw)) found.push(kw);
  }
  return found;
}

/**
 * Classify the customer message into a coarse intent. Returns
 * `texto_livre` as a sink when nothing matches — the engine then routes the
 * raw text into `collectedData.needs` for the next state.
 */
export function detectIntent(text: string): ISdrIntentMatch {
  if (!text || text.trim().length === 0) {
    return { intent: "texto_livre", confidence: 0, matchedKeywords: [] };
  }

  for (const rule of INTENT_RULES) {
    const matches = findMatches(text, rule.keywords);
    if (matches.length > 0) {
      const confidence = Math.min(1, 0.6 + 0.1 * matches.length);
      return { intent: rule.intent, confidence, matchedKeywords: matches };
    }
  }

  return { intent: "texto_livre", confidence: 0.3, matchedKeywords: [] };
}
