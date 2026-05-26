import type { IQuoteResponseMatch, QuoteResponseIntent } from "@/shared/types";

interface IIntentRule {
  intent: QuoteResponseIntent;
  patterns: RegExp[];
  /** Friendly keyword list surfaced on the inspector. */
  keywords: string[];
}

/**
 * Pattern rules evaluated in declaration order. The first rule that matches
 * wins — make sure narrower rules (e.g. "1" for accept) come before broader
 * ones (e.g. arbitrary numeric prefixes).
 */
const RULES: IIntentRule[] = [
  {
    intent: "negotiate",
    keywords: ["desconto", "mais barato", "negociar", "menor", "abaixar"],
    patterns: [
      /\bdesconto\b/i,
      /\bmais\s+barato\b/i,
      /\bpor\s+menos\b/i,
      /\bmais\s+em\s+conta\b/i,
      /\bnegoci/i,
      /\babaix(a|ar)\b/i,
      /\bt[ãa]\s+caro\b/i,
      /\bdiminu/i,
    ],
  },
  {
    intent: "escalate",
    keywords: ["3", "vendedor", "humano", "atendente", "alguém"],
    patterns: [
      /^\s*3(\D|$)/,
      /\bvendedor\b/i,
      /\bhumano\b/i,
      /\batendente\b/i,
      /\balgu[ée]m\b/i,
      /\bfalar com\b/i,
    ],
  },
  {
    intent: "accept",
    keywords: ["1", "sim", "aceito", "fechado", "ok", "pode mandar"],
    patterns: [
      /^\s*1(\D|$)/,
      /\bsim\b/i,
      /\baceito\b/i,
      /\bfechado\b/i,
      /\bfechou\b/i,
      /\bpode mandar\b/i,
      /\bbora\b/i,
      /\bvamos l[aá]\b/i,
      /\bok\b/i,
      /\bbeleza\b/i,
      /\bconfirm[ao]\b/i,
    ],
  },
  {
    intent: "reject",
    keywords: ["2", "não", "deixa", "obrigado mas não", "agora não"],
    patterns: [
      /^\s*2(\D|$)/,
      /\bn[ãa]o\b/i,
      /\bdeixa\b/i,
      /\bdispens/i,
      /\bdeixa\s+pra/i,
      /\bagora\s+n[ãa]o\b/i,
    ],
  },
];

/**
 * Classify a customer reply to a previously-sent quote into one of the five
 * intents defined by PRD-022 RF-016/017. Returns `unknown` as a sink so the
 * SDR can re-prompt instead of guessing.
 */
export function parseQuoteResponse(text: string): IQuoteResponseMatch {
  const norm = text.trim();
  if (norm.length === 0) {
    return { intent: "unknown", matchedKeywords: [] };
  }
  for (const rule of RULES) {
    const matched: string[] = [];
    for (let i = 0; i < rule.patterns.length; i += 1) {
      if (rule.patterns[i].test(norm)) {
        matched.push(rule.keywords[i] ?? rule.patterns[i].source);
      }
    }
    if (matched.length > 0) {
      return { intent: rule.intent, matchedKeywords: matched };
    }
  }
  return { intent: "unknown", matchedKeywords: [] };
}
