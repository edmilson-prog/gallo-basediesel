/**
 * GALLO BASE DIESEL — Inbox unificada (PRD-010).
 *
 * Public surface of the conversations feature. The route files consume the
 * `InboxPage` for the list column and `InboxCenterPlaceholder` for the empty
 * center column (PRD-011 lands the real conversation viewer).
 *
 * Internal hooks and utilities live under subfolders and are imported with
 * the longer path; they're not exported here on purpose so the boundary
 * stays narrow and feature-internal refactors are cheap.
 */

export { InboxPage, InboxCenterPlaceholder } from "./pages/InboxPage";
export { validateInboxSearch } from "./hooks/useInboxFilters";
