import type {
  INpsFilters,
  INpsSettings,
  INpsListFilters,
  INpsProvider,
  INpsRawMetrics,
  INpsRecovery,
  INpsRecoveryStatus,
  INpsBreakdown,
  INpsReasonSplit,
  INpsResponsePoint,
  INpsSurvey,
} from "@/shared/types";

/**
 * Mock implementation of {@link INpsProvider} (PRD-148B, design 2026-08-12).
 *
 * Unlike its siblings, this one does NOT delegate to `@/mocks`: NPS has no
 * mutable surface in the app (both writes belong to edge functions), so it
 * needs no shared store, no generator and no seed entry. Standing up that
 * machinery for a read-only dataset would add surface to the mock layer
 * without giving anything back. The dataset is generated here from a fixed
 * seed instead, which keeps it deterministic across reloads all the same.
 *
 * Distribution is roughly 60/20/20 promoters/passives/detractors — plausible
 * for a parts distributor, and deliberately not flattering.
 */

const SEED = 148_148;
const SURVEY_COUNT = 240;
const DAY_MS = 86_400_000;

/** Linear congruential generator — deterministic, and no dependency to pull in. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x100000000;
  };
}

function scoreFor(random: number): number {
  if (random < 0.6) return random < 0.3 ? 10 : 9; // promotor
  if (random < 0.8) return random < 0.7 ? 8 : 7; // neutro
  return Math.floor(random * 7) % 7; // detrator 0..6
}

const FIRST_NAMES = [
  "João",
  "Maria",
  "Antônio",
  "Cláudia",
  "Sebastião",
  "Vanderlei",
  "Rosângela",
  "Jair",
  "Luís",
  "Márcia",
  "Adriano",
  "Fátima",
];

const COMMENTS_BY_CLASS: Record<string, string[]> = {
  promoter: [
    "Atendimento rápido, peça chegou certinha.",
    "Sempre resolvem, nunca tive problema.",
    "O vendedor conhece o que vende, isso ajuda muito.",
    "",
  ],
  passive: ["Demorou um pouco, mas resolveu.", "Normal, dentro do esperado.", ""],
  detractor: [
    "Peça veio errada, perdi dois dias parado.",
    "Demorei pra ser atendido e ninguém me deu retorno.",
    "Preço bem acima do que combinamos.",
    "",
  ],
};

function classOf(score: number): "promoter" | "passive" | "detractor" {
  if (score <= 6) return "detractor";
  if (score <= 8) return "passive";
  return "promoter";
}

/** Chips offered by the public survey, per category — see NpsSurveyPublicPage. */
const REASONS_BY_CLASS: Record<string, string[]> = {
  promoter: ["Diagnóstico certo", "Prazo cumprido", "Atendimento", "Qualidade da peça", "Entrega"],
  passive: ["Prazo", "Preço", "Comunicação", "Atendimento"],
  detractor: ["Prazo não cumprido", "Falta de retorno", "Preço", "Peça com defeito", "Garantia"],
};

const MOCK_SELLER_NAMES = [
  "Thiago Oliveira",
  "Elaine Cruz",
  "Marcos Reis",
  "Jean Prass",
  "Diego Lopes",
];

const MOCK_STORE_NAMES = ["Frederico Westphalen", "Barra Velha"];

/** Built once at module load so repeated calls agree with each other. */
const DATASET: INpsSurvey[] = (() => {
  const random = makeRandom(SEED);
  const now = Date.now();

  return Array.from({ length: SURVEY_COUNT }, (_, index) => {
    const score = scoreFor(random());
    const npsClass = classOf(score);
    const comments = COMMENTS_BY_CLASS[npsClass] ?? [""];
    const comment = comments[Math.floor(random() * comments.length)] ?? "";
    // Spread over ~14 months so the 12-month trend chart has history.
    const respondedAt = new Date(now - Math.floor(random() * 420) * DAY_MS);
    const sentAt = new Date(respondedAt.getTime() - 3 * 3_600_000);
    const isCustomer = random() < 0.35;

    return {
      id: `nps-mock-${index}`,
      storeId: "store-1",
      conversationId: `conv-mock-${index}`,
      customerId: isCustomer ? `customer-mock-${index % 40}` : null,
      leadId: isCustomer ? null : `lead-mock-${index % 60}`,
      phoneDigits: `5555999${String(100000 + index).slice(-6)}`,
      recipientName: FIRST_NAMES[index % FIRST_NAMES.length] ?? "Cliente",
      trigger: "conversation_resolved" as const,
      orderId: null,
      channel: "whatsapp" as const,
      status: "responded" as const,
      score,
      comment: comment || null,
      sentAt: sentAt.toISOString(),
      respondedAt: respondedAt.toISOString(),
      expiresAt: new Date(sentAt.getTime() + 7 * DAY_MS).toISOString(),
      createdAt: sentAt.toISOString(),
      // One or two chips, chosen from the set that category is actually offered.
      reasons: (REASONS_BY_CLASS[npsClass] ?? []).filter(
        (_reason, position) => (index + position) % 3 === 0,
      ),
      storeName: MOCK_STORE_NAMES[index % MOCK_STORE_NAMES.length] ?? null,
      sellerName: MOCK_SELLER_NAMES[index % MOCK_SELLER_NAMES.length] ?? null,
    };
  });
})();

/** ~30% of surveys go unanswered, so the response rate is not a flat 100%. */
const UNANSWERED_RATIO = 0.42;

function applyFilters(surveys: INpsSurvey[], filters: INpsFilters): INpsSurvey[] {
  return surveys.filter((survey) => {
    if (filters.trigger && survey.trigger !== filters.trigger) return false;
    if (filters.audience === "customer" && survey.customerId === null) return false;
    if (filters.audience === "contact" && survey.customerId !== null) return false;
    return true;
  });
}

function toPoint(survey: INpsSurvey): INpsResponsePoint {
  return { score: survey.score ?? 0, respondedAt: survey.respondedAt ?? "" };
}

/** Mirrors the column defaults in 20260812140000_nps_schema.sql. */
const DEFAULT_SETTINGS: INpsSettings = {
  storeId: "store-1",
  enabled: false,
  triggerConversationEnabled: true,
  triggerConversationDelayHours: 2,
  triggerOrderEnabled: false,
  triggerOrderDelayHours: 24,
  cooldownDays: 30,
  tokenExpiryDays: 7,
  windowDays: 90,
  samplingRate: 1,
  sendWindowStartHour: 9,
  sendWindowEndHour: 20,
  minResponsesForScore: 5,
  maxBackfillDays: 3,
  dailyCap: 50,
  whatsappAccountId: null,
  targetScore: 60,
  bandExcellence: 75,
  bandQuality: 50,
  bandImprovement: 0,
  recoveryThreshold: 6,
  recoverySlaHours: 24,
  recoveryOwner: "attendant",
  recoveryEscalate: true,
  showWidget: true,
  showOnFiche: true,
  includeInRanking: false,
  anonymousForTeam: false,
};

let mockSettings: INpsSettings = { ...DEFAULT_SETTINGS };

/**
 * Treatment state, kept in memory rather than baked into the dataset.
 *
 * The board is the one place in NPS the app writes to, so the mock has to hold
 * a mutation for the tab to be testable at all — but only this, keyed by id, so
 * the deterministic dataset itself stays immutable.
 */
const mockRecoveries = new Map<
  string,
  { status: INpsRecoveryStatus; note: string | null; contactedAt: string | null }
>();

/** Plausible chip tallies, mirroring the kit's NPS_RAZOES. */
const MOCK_REASONS: INpsReasonSplit = {
  promoter: [
    { label: "Atendimento", count: 61 },
    { label: "Diagnóstico certo", count: 44 },
    { label: "Prazo cumprido", count: 33 },
    { label: "Qualidade da peça", count: 28 },
    { label: "Entrega", count: 19 },
  ],
  detractor: [
    { label: "Prazo não cumprido", count: 9 },
    { label: "Peça com defeito", count: 5 },
    { label: "Preço", count: 4 },
    { label: "Falta de retorno", count: 3 },
    { label: "Garantia", count: 2 },
  ],
};

const MOCK_SELLERS = [
  { id: "seller-1", name: "Thiago Oliveira" },
  { id: "seller-2", name: "Elaine Cruz" },
  { id: "seller-3", name: "Marcos Reis" },
  { id: "seller-4", name: "Jean Prass" },
  { id: "seller-5", name: "Diego Lopes" },
];

const MOCK_STORES = [
  { id: "store-1", name: "Frederico Westphalen" },
  { id: "store-2", name: "Barra Velha" },
];

/** Buckets a slice of the dataset by a key, mirroring the supabase provider. */
function breakdown(
  surveys: INpsSurvey[],
  keyOf: (survey: INpsSurvey, index: number) => string,
  names: Map<string, string>,
): INpsBreakdown[] {
  const buckets = new Map<string, { promoters: number; passives: number; detractors: number }>();
  surveys.forEach((survey, index) => {
    const key = keyOf(survey, index);
    const bucket = buckets.get(key) ?? { promoters: 0, passives: 0, detractors: 0 };
    const npsClass = classOf(survey.score ?? 0);
    if (npsClass === "promoter") bucket.promoters += 1;
    else if (npsClass === "passive") bucket.passives += 1;
    else bucket.detractors += 1;
    buckets.set(key, bucket);
  });
  return [...buckets.entries()].map(([key, counts]) => ({
    key,
    label: names.get(key) ?? key,
    ...counts,
  }));
}

export const mockNpsProvider: INpsProvider = {
  async rawMetrics(filters: INpsFilters): Promise<INpsRawMetrics> {
    const now = Date.now();
    const span = filters.windowDays * DAY_MS;
    const filtered = applyFilters(DATASET, filters);

    const inWindow = filtered.filter((survey) => {
      const at = new Date(survey.respondedAt ?? "").getTime();
      return at >= now - span;
    });
    const inPrevious = filtered.filter((survey) => {
      const at = new Date(survey.respondedAt ?? "").getTime();
      return at >= now - span * 2 && at < now - span;
    });

    const inflate = (count: number) => Math.round(count / (1 - UNANSWERED_RATIO));

    const sellerNames = new Map(MOCK_SELLERS.map((seller) => [seller.id, seller.name]));
    const storeNames = new Map(MOCK_STORES.map((store) => [store.id, store.name]));

    return {
      responses: inWindow.map(toPoint),
      previousResponses: inPrevious.map(toPoint),
      sent: inflate(inWindow.length),
      previousSent: inflate(inPrevious.length),
      byStore: breakdown(
        inWindow,
        (_survey, index) => MOCK_STORES[index % MOCK_STORES.length]?.id ?? "store-1",
        storeNames,
      ),
      reasons: MOCK_REASONS,
      bySeller: breakdown(
        inWindow,
        (_survey, index) => MOCK_SELLERS[index % MOCK_SELLERS.length]?.id ?? "seller-1",
        sellerNames,
      ),
    };
  },

  async list(filters: INpsListFilters): Promise<{ data: INpsSurvey[]; total: number }> {
    const now = Date.now();
    const span = filters.windowDays * DAY_MS;
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.max(1, filters.pageSize ?? 30);
    const search = filters.search?.trim().toLowerCase() ?? "";

    const matching = applyFilters(DATASET, filters)
      .filter((survey) => new Date(survey.respondedAt ?? "").getTime() >= now - span)
      .filter((survey) => !filters.npsClass || classOf(survey.score ?? 0) === filters.npsClass)
      .filter((survey) => !search || (survey.comment ?? "").toLowerCase().includes(search))
      .filter((survey) => !filters.hasComment || !!survey.comment)
      .filter((survey) => !filters.reason || survey.reasons.includes(filters.reason))
      .sort((a, b) => (b.respondedAt ?? "").localeCompare(a.respondedAt ?? ""));

    const from = (page - 1) * pageSize;
    return { data: matching.slice(from, from + pageSize), total: matching.length };
  },

  async listRecoveries(filters: INpsFilters, threshold: 6 | 8 = 6): Promise<INpsRecovery[]> {
    const now = Date.now();
    const span = filters.windowDays * DAY_MS;

    return applyFilters(DATASET, filters)
      .filter((survey) => (survey.score ?? 10) <= threshold)
      .filter((survey) => new Date(survey.respondedAt ?? "").getTime() >= now - span)
      .sort((a, b) => (a.respondedAt ?? "").localeCompare(b.respondedAt ?? ""))
      .map((survey) => {
        const tracked = mockRecoveries.get(survey.id);
        return {
          ...survey,
          recoveryStatus: tracked?.status ?? "novo",
          recoveryOwnerName: tracked ? (survey.sellerName ?? null) : null,
          recoveryNote: tracked?.note ?? null,
          recoveryContactedAt: tracked?.contactedAt ?? null,
          recoveryResolvedAt: tracked?.status === "resolvido" ? new Date().toISOString() : null,
        };
      });
  },

  async setRecovery(
    surveyId: string,
    status: "em_contato" | "resolvido" | null,
    note?: string | null,
  ): Promise<void> {
    if (status === null) {
      mockRecoveries.delete(surveyId);
      return;
    }
    const current = mockRecoveries.get(surveyId);
    mockRecoveries.set(surveyId, {
      status,
      note: note ?? current?.note ?? null,
      contactedAt: current?.contactedAt ?? new Date().toISOString(),
    });
  },

  async latestForCustomer(customerId: string): Promise<INpsSurvey | null> {
    const owned = DATASET.filter((survey) => survey.customerId === customerId).sort((a, b) =>
      (b.respondedAt ?? "").localeCompare(a.respondedAt ?? ""),
    );
    return owned[0] ?? null;
  },

  async getSettings(storeId: string): Promise<INpsSettings | null> {
    return { ...mockSettings, storeId };
  },

  async updateSettings(storeId: string, patch: Partial<INpsSettings>): Promise<INpsSettings> {
    mockSettings = { ...mockSettings, ...patch, storeId };
    return { ...mockSettings };
  },
};
