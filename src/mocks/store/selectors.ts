import type { ID } from "@/shared/types";
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

export function selectAllQuotes() {
  return getMockState().quotes;
}

export function selectQuoteById(id: ID) {
  return getMockState().quotes.find((q) => q.id === id) ?? null;
}

export function selectAllCommissions() {
  return getMockState().commissions;
}

export function selectAllGoals() {
  return getMockState().goals;
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
