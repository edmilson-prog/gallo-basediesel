/**
 * Pure engine for PRD-043 — Ranking & Gamification.
 *
 * All functions here are side-effect-free and consume pre-loaded entities.
 * Hooks compose them with TanStack Query data sources upstream.
 */
export {
  calculateSellerScore,
  calculateRanking,
  sumBreakdown,
  findBadgeDefinition,
} from "./calculateSellerScore";
export type { IGamificationContext, IGamificationPeriod } from "./calculateSellerScore";
export { evaluateBadgesForSeller } from "./evaluateBadges";
