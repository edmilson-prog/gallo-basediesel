/**
 * Preference defaults per role/type — PRD-008 Anexo B.
 *
 * Encodes the channel×category matrix applied when a recipient has no saved
 * preferences yet. Also provides the lock and optional-category predicates
 * used by the router (RF-017) and the preference store (Task 2.3).
 *
 * Role resolution:
 *   - recipientType "seller" → role in {"vendedor","gestor","owner"}; default "vendedor"
 *   - recipientType "customer" → role is irrelevant; "cliente" column always used
 *
 * Channel legend (Fase 1):
 *   - inApp / toast → active in the channel registry
 *   - email / whatsapp / sms / push → encoded per Anexo B future intent; the
 *     channel registry marks them deferred in Fase 1, so defaults here do NOT
 *     gate delivery — they set user intent for when the channels activate (Onda 8).
 *
 * 🔒 non-silenceable (RF-017): inApp on transactional + system is locked,
 *    regardless of what the matrix says. Use isChannelLocked() to enforce.
 */

import type {
  INotificationPreference,
  NotificationCategory,
  NotificationChannel,
  NotificationRecipientType,
} from "@/shared/types";

// ---------------------------------------------------------------------------
// Lock + optional predicates (RF-017)
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the channel+category combination is non-silenceable.
 * The router must ignore user preferences and keep inApp enabled for these.
 *
 * Currently locked: inApp on transactional and system.
 */
export function isChannelLocked(
  category: NotificationCategory,
  channel: NotificationChannel,
): boolean {
  if (channel !== "inApp") return false;
  return category === "transactional" || category === "system";
}

/**
 * Returns `true` for categories where the recipient may opt out completely
 * (no channel is forced on). Currently: marketing and gamification.
 */
export function isCategoryFullyOptional(category: NotificationCategory): boolean {
  return category === "marketing" || category === "gamification";
}

// ---------------------------------------------------------------------------
// Per-role matrices — source of truth: PRD-008 Anexo B
// ---------------------------------------------------------------------------

/**
 * Channel×category defaults for role "Vendedor".
 *
 * | category      | inApp | toast | email | whatsapp | sms | push |
 * |---------------|-------|-------|-------|----------|-----|------|
 * | transactional | 🔒 ✓  |  ✓    |   —   |    —     |  —  |  —   |
 * | operational   |  ✓    |  ✓    |   —   |    —     |  —  |  —   |
 * | commercial    |  ✓    |  —    |   —   |    —     |  —  |  —   |
 * | gamification  |  ✓    |  ✓    |   —   |    —     |  —  |  —   |
 * | system        | 🔒 ✓  |  ✓    |   —   |    —     |  —  |  —   |
 * | marketing     |  —    |  —    |   —   |    —     |  —  |  —   |
 */
const VENDEDOR_MATRIX: INotificationPreference["matrix"] = {
  transactional: {
    inApp: true,
    toast: true,
    email: false,
    whatsapp: false,
    sms: false,
    push: false,
  },
  operational: { inApp: true, toast: true, email: false, whatsapp: false, sms: false, push: false },
  commercial: { inApp: true, toast: false, email: false, whatsapp: false, sms: false, push: false },
  gamification: {
    inApp: true,
    toast: true,
    email: false,
    whatsapp: false,
    sms: false,
    push: false,
  },
  system: { inApp: true, toast: true, email: false, whatsapp: false, sms: false, push: false },
  marketing: { inApp: false, toast: false, email: false, whatsapp: false, sms: false, push: false },
};

/**
 * Channel×category defaults for role "Gestor".
 *
 * | category      | inApp | toast | email | whatsapp | sms | push |
 * |---------------|-------|-------|-------|----------|-----|------|
 * | transactional | 🔒 ✓  |  ✓    |   —   |    —     |  —  |  —   |
 * | operational   |  ✓    |  ✓    |   —   |    —     |  —  |  —   |
 * | commercial    |  ✓    |  —    |   —   |    —     |  —  |  —   |
 * | gamification  |  ✓    |  —    |   —   |    —     |  —  |  —   |
 * | system        | 🔒 ✓  |  ✓    |   —   |    —     |  —  |  —   |
 * | marketing     |  —    |  —    |   —   |    —     |  —  |  —   |
 */
const GESTOR_MATRIX: INotificationPreference["matrix"] = {
  transactional: {
    inApp: true,
    toast: true,
    email: false,
    whatsapp: false,
    sms: false,
    push: false,
  },
  operational: { inApp: true, toast: true, email: false, whatsapp: false, sms: false, push: false },
  commercial: { inApp: true, toast: false, email: false, whatsapp: false, sms: false, push: false },
  gamification: {
    inApp: true,
    toast: false,
    email: false,
    whatsapp: false,
    sms: false,
    push: false,
  },
  system: { inApp: true, toast: true, email: false, whatsapp: false, sms: false, push: false },
  marketing: { inApp: false, toast: false, email: false, whatsapp: false, sms: false, push: false },
};

/**
 * Channel×category defaults for role "Owner".
 *
 * | category      | inApp | toast | email | whatsapp | sms | push |
 * |---------------|-------|-------|-------|----------|-----|------|
 * | transactional | 🔒 ✓  |  ✓    |   —   |    —     |  —  |  —   |
 * | operational   |  ✓    |  —    |   —   |    —     |  —  |  —   |
 * | commercial    |  ✓    |  —    |   —   |    —     |  —  |  —   |
 * | gamification  |  —    |  —    |   —   |    —     |  —  |  —   |
 * | system        | 🔒 ✓  |  ✓    |   —   |    —     |  —  |  —   |
 * | marketing     |  —    |  —    |   —   |    —     |  —  |  —   |
 */
const OWNER_MATRIX: INotificationPreference["matrix"] = {
  transactional: {
    inApp: true,
    toast: true,
    email: false,
    whatsapp: false,
    sms: false,
    push: false,
  },
  operational: {
    inApp: true,
    toast: false,
    email: false,
    whatsapp: false,
    sms: false,
    push: false,
  },
  commercial: { inApp: true, toast: false, email: false, whatsapp: false, sms: false, push: false },
  gamification: {
    inApp: false,
    toast: false,
    email: false,
    whatsapp: false,
    sms: false,
    push: false,
  },
  system: { inApp: true, toast: true, email: false, whatsapp: false, sms: false, push: false },
  marketing: { inApp: false, toast: false, email: false, whatsapp: false, sms: false, push: false },
};

/**
 * Channel×category defaults for type "Cliente" (customer).
 *
 * External channels email/whatsapp are encoded as `true` per Anexo B Onda 8
 * intent ("✓ na Onda 8"). In Fase 1 they resolve as `deferred` because the
 * channel registry only activates inApp/toast.
 *
 * | category      | inApp | toast | email | whatsapp | sms | push |
 * |---------------|-------|-------|-------|----------|-----|------|
 * | transactional | 🔒 ✓  |  —    |  ✓*   |   ✓*     |  —  |  —   |
 * | operational   |  —    |  —    |   —   |    —     |  —  |  —   |
 * | commercial    |  ✓    |  —    |   —   |    —     |  —  |  —   |
 * | gamification  |  —    |  —    |   —   |    —     |  —  |  —   |
 * | system        | 🔒 ✓  |  —    |   —   |    —     |  —  |  —   |
 * | marketing     |  —    |  —    |   —   |    —     |  —  |  —   |
 *
 * *email/whatsapp ✓ = intent for Onda 8; deferred in Fase 1.
 */
const CLIENTE_MATRIX: INotificationPreference["matrix"] = {
  transactional: {
    inApp: true,
    toast: false,
    email: true,
    whatsapp: true,
    sms: false,
    push: false,
  },
  operational: {
    inApp: false,
    toast: false,
    email: false,
    whatsapp: false,
    sms: false,
    push: false,
  },
  commercial: { inApp: true, toast: false, email: false, whatsapp: false, sms: false, push: false },
  gamification: {
    inApp: false,
    toast: false,
    email: false,
    whatsapp: false,
    sms: false,
    push: false,
  },
  system: { inApp: true, toast: false, email: false, whatsapp: false, sms: false, push: false },
  marketing: { inApp: false, toast: false, email: false, whatsapp: false, sms: false, push: false },
};

// ---------------------------------------------------------------------------
// Role resolution helpers
// ---------------------------------------------------------------------------

/** Normalised role names accepted by defaultPreferenceFor. */
type SellerRole = "vendedor" | "gestor" | "owner";

function resolveSellerMatrix(role: string | undefined): INotificationPreference["matrix"] {
  const normalised = (role ?? "vendedor").toLowerCase() as SellerRole;
  switch (normalised) {
    case "gestor":
      return GESTOR_MATRIX;
    case "owner":
      return OWNER_MATRIX;
    case "vendedor":
    default:
      return VENDEDOR_MATRIX;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds the full default `INotificationPreference` for a given recipient
 * when no saved preferences exist yet (RF-018).
 *
 * @param recipientType - "seller" or "customer"
 * @param role          - For sellers: "vendedor" | "gestor" | "owner" (default "vendedor").
 *                        Ignored for customers.
 *
 * The returned `updatedAt` is a constant placeholder (not `new Date()`) so
 * defaults remain deterministic and do not produce a new value on every call.
 * Callers that persist a pref record should replace `updatedAt` with
 * `new Date().toISOString()` at write time.
 */
export function defaultPreferenceFor(
  recipientType: NotificationRecipientType,
  role?: string,
): INotificationPreference {
  const matrix = recipientType === "customer" ? CLIENTE_MATRIX : resolveSellerMatrix(role);

  return {
    recipientId: "", // placeholder — caller must set the real ID before persisting
    recipientType,
    matrix,
    updatedAt: "1970-01-01T00:00:00.000Z", // sentinel for "not yet saved"
  };
}
