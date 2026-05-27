/**
 * Gamification feature barrel (PRD-043).
 *
 * Composes the score/badge engine over the existing data providers (goals,
 * orders, customers, sellers, settings) — no provider of its own. Surfaces:
 *  - `/app/gestao/ranking` — `RankingPage`
 *  - `/app/gestao/ranking/$sellerId` — `SellerRankingDetailPage`
 *  - `/app/configuracoes/gamificacao` — `GamificationConfigPage`
 *
 * Plus reusable widgets:
 *  - `<TopPerformersWidget />` (PRD-014 — Painel Gestor)
 *  - `<RankingHighlightWidget />` (PRD-040 — Cockpit Executivo)
 *  - `<SellerBadgesGrid />` (reused by future seller profile screens)
 */

export {
  calculateSellerScore,
  calculateRanking,
  evaluateBadgesForSeller,
  sumBreakdown,
  findBadgeDefinition,
} from "./engine";
export type { IGamificationContext, IGamificationPeriod } from "./engine";

export {
  DEFAULT_BADGE_CATALOG,
  BADGE_CATALOG_BY_SLUG,
  getBadgeDefinition,
} from "./catalog/badgeCatalog";

export { resolvePeriod, previousPeriod, labelForPeriod } from "./utils/periods";
export type { RankingPeriodType } from "./utils/periods";

export { RankingPage } from "./pages/RankingPage";
export { SellerRankingDetailPage } from "./pages/SellerRankingDetailPage";
export { GamificationConfigPage } from "./pages/GamificationConfigPage";

export { SellerBadgesGrid } from "./components/SellerBadgesGrid";

export { useRanking } from "./hooks/useRanking";
export { useBadges } from "./hooks/useBadges";
export {
  useRankingFilters,
  validateRankingSearch,
  DEFAULT_RANKING_FILTERS,
} from "./hooks/useRankingFilters";
export type { IRankingScope, IUseRankingParams, IUseRankingResult } from "./hooks/useRanking";
export type {
  IRankingFiltersSearch,
  IRankingFiltersState,
  IUseRankingFiltersResult,
} from "./hooks/useRankingFilters";

export { BadgeChip } from "./components/BadgeChip";
export { RarityBadge } from "./components/RarityBadge";
export { SellerAvatar } from "./components/SellerAvatar";
export { TopPerformersWidget } from "./components/TopPerformersWidget";
export { RankingHighlightWidget } from "./components/RankingHighlightWidget";
