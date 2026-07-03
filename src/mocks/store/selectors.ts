import type {
  ID,
  IAssetCombo,
  IAssetLibraryItem,
  IMediaAsset,
  INotification,
  IQuickReply,
  IScheduledSend,
  ITrackableLink,
} from "@/shared/types";
import { getMockState } from "./mockStore";

/**
 * Pure read helpers over the mock store. Each selector returns plain arrays /
 * objects; they never mutate. Used by APIs in `src/mocks/api/*` to compose
 * paginated / filtered results.
 */

export function selectAllCustomers() {
  return getMockState().customers;
}

export function selectCustomerById(id: ID) {
  return getMockState().customers.find((c) => c.id === id) ?? null;
}

export function selectCustomersBySeller(sellerId: ID) {
  return getMockState().customers.filter((c) => c.sellerId === sellerId);
}

export function selectAllOrders() {
  return getMockState().orders;
}

export function selectOrderById(id: ID) {
  return getMockState().orders.find((o) => o.id === id) ?? null;
}

export function selectOrdersByCustomer(customerId: ID) {
  return getMockState().orders.filter((o) => o.customerId === customerId);
}

export function selectAllConversations() {
  return getMockState().conversations;
}

export function selectConversationById(id: ID) {
  return getMockState().conversations.find((c) => c.id === id) ?? null;
}

export function selectMessagesByConversation(conversationId: ID) {
  return getMockState().messages.filter((m) => m.conversationId === conversationId);
}

export function selectAllParts() {
  return getMockState().parts;
}

export function selectPartById(id: ID) {
  return getMockState().parts.find((p) => p.id === id) ?? null;
}

export function selectAllLeads() {
  return getMockState().leads;
}

export function selectLeadById(id: ID) {
  return getMockState().leads.find((l) => l.id === id) ?? null;
}

export function selectAllVehicles() {
  return getMockState().vehicles;
}

export function selectVehicleById(id: ID) {
  return getMockState().vehicles.find((v) => v.id === id) ?? null;
}

export function selectVehiclesByCustomer(customerId: ID) {
  return getMockState().vehicles.filter((v) => v.customerId === customerId);
}

export function selectAllSellers() {
  return getMockState().sellers;
}

export function selectSellerById(id: ID) {
  return getMockState().sellers.find((s) => s.id === id) ?? null;
}

export function selectAllStores() {
  return getMockState().stores;
}

export function selectStoreById(id: ID) {
  return getMockState().stores.find((s) => s.id === id) ?? null;
}

export function selectAllQuotes() {
  return getMockState().quotes;
}

export function selectQuoteById(id: ID) {
  return getMockState().quotes.find((q) => q.id === id) ?? null;
}

export function selectAllCommissions() {
  return getMockState().commissions;
}

export function selectAllExpenses() {
  return getMockState().expenses;
}

export function selectExpenseById(id: ID) {
  return getMockState().expenses.find((e) => e.id === id) ?? null;
}

export function selectAllCashFlowEntries() {
  return getMockState().cashFlowEntries;
}

export function selectAllGoals() {
  return getMockState().goals;
}

export function selectAllIndicators() {
  return getMockState().indicators;
}

export function selectAllRecommendations() {
  return getMockState().recommendations;
}

export function selectAllTransfers() {
  return getMockState().transfers;
}

export function selectAllSegments() {
  return getMockState().segments;
}

export function selectAllAudits() {
  return getMockState().audits;
}

export function selectAllBadges() {
  return getMockState().badges;
}

export function selectAllRankings() {
  return getMockState().rankings;
}

export function selectAllPositivations() {
  return getMockState().positivations;
}

export function selectAllAbcs() {
  return getMockState().abcClassifications;
}

export function selectAllWhatsAppAccounts() {
  return getMockState().whatsappAccounts;
}

export function selectAllRoles() {
  return getMockState().roles;
}

export function selectAllRbacResources() {
  return getMockState().rbacResources;
}

export function selectAllDepartments() {
  return getMockState().departments;
}

export function selectAllRotationQueues() {
  return getMockState().rotationQueues;
}

export function selectAllRotationParticipants() {
  return getMockState().rotationParticipants;
}

export function selectAllDistributionTraces() {
  return getMockState().distributionTraces;
}

export function selectDistributionTraceById(id: ID) {
  return getMockState().distributionTraces.find((t) => t.id === id) ?? null;
}

export function selectAllConversationActivity() {
  return getMockState().conversationActivity;
}

export function selectAllSdrSessions() {
  return getMockState().sdrSessions;
}

export function selectSdrSessionByConversation(conversationId: ID) {
  return getMockState().sdrSessions.find((s) => s.conversationId === conversationId) ?? null;
}

export function selectActiveSdrSessions() {
  return getMockState().sdrSessions.filter(
    (s) => s.state !== "finalizado" && s.state !== "pausado",
  );
}

export function selectAllSdrEscalations() {
  return getMockState().sdrEscalations;
}

export function selectSdrEscalationById(id: ID) {
  return getMockState().sdrEscalations.find((e) => e.id === id) ?? null;
}

export function selectSdrEscalationByConversation(conversationId: ID) {
  // Most recent first — escalations are appended sequentially.
  const all = getMockState().sdrEscalations.filter((e) => e.conversationId === conversationId);
  if (all.length === 0) return null;
  return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function selectAllNotifications(): INotification[] {
  return getMockState().notifications;
}

export function selectNotificationById(id: ID): INotification | null {
  return getMockState().notifications.find((n) => n.id === id) ?? null;
}

export function selectNotificationsByRecipient(recipientId: ID): INotification[] {
  return getMockState().notifications.filter((n) => n.recipientId === recipientId);
}

export function selectAllMediaAssets(): IMediaAsset[] {
  return getMockState().mediaAssets;
}

export function selectMediaAssetById(id: ID): IMediaAsset | null {
  return getMockState().mediaAssets.find((m) => m.id === id) ?? null;
}

export function selectMediaAssetsByConversation(conversationId: ID): IMediaAsset[] {
  return getMockState().mediaAssets.filter((m) => m.conversationId === conversationId);
}

export function selectMediaAssetsByCustomer(customerId: ID): IMediaAsset[] {
  return getMockState().mediaAssets.filter((m) => m.customerId === customerId);
}

export function selectMediaAssetByMessage(messageId: ID): IMediaAsset | null {
  return getMockState().mediaAssets.find((m) => m.messageId === messageId) ?? null;
}

export function selectMediaAssetByContentHash(contentHash: string): IMediaAsset | null {
  return getMockState().mediaAssets.find((m) => m.contentHash === contentHash) ?? null;
}

// --- Quick Send & Asset Library (PRD-027) ---

export function selectAllAssetLibraryItems(): IAssetLibraryItem[] {
  return getMockState().assetLibraryItems;
}

export function selectAssetLibraryItemById(id: ID): IAssetLibraryItem | null {
  return getMockState().assetLibraryItems.find((a) => a.id === id) ?? null;
}

export function selectAllQuickReplies(): IQuickReply[] {
  return getMockState().quickReplies;
}

export function selectQuickReplyById(id: ID): IQuickReply | null {
  return getMockState().quickReplies.find((q) => q.id === id) ?? null;
}

export function selectAllTrackableLinks(): ITrackableLink[] {
  return getMockState().trackableLinks;
}

export function selectTrackableLinkById(id: ID): ITrackableLink | null {
  return getMockState().trackableLinks.find((l) => l.id === id) ?? null;
}

export function selectTrackableLinksByConversation(conversationId: ID): ITrackableLink[] {
  return getMockState().trackableLinks.filter((l) => l.conversationId === conversationId);
}

export function selectAllAssetCombos(): IAssetCombo[] {
  return getMockState().assetCombos;
}

export function selectAllScheduledSends(): IScheduledSend[] {
  return getMockState().scheduledSends;
}

export function selectScheduledSendsByConversation(conversationId: ID): IScheduledSend[] {
  return getMockState().scheduledSends.filter((s) => s.conversationId === conversationId);
}
