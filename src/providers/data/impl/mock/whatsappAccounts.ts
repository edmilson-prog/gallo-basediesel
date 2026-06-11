import { whatsappAccountsApi } from "@/mocks";
import type {
  IWhatsAppAccountMetrics,
  IWhatsAppAccountsProvider,
} from "../../contracts/whatsappAccounts";
import { computeFailureRate } from "../../contracts/whatsappAccounts";

/** Deterministic demo metrics derived from the account id (stable across reloads). */
function mockMetrics(id: string, days: number): IWhatsAppAccountMetrics {
  const hash = [...id].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const sent = 40 + (hash % 140);
  const failed = hash % 5;
  const hoursAgo = 1 + (hash % 70);
  return {
    windowDays: days,
    sent,
    failed,
    failureRate: computeFailureRate(sent, failed),
    lastOutboundAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
  };
}

export const mockWhatsAppAccountsProvider: IWhatsAppAccountsProvider = {
  list: (params = {}) => whatsappAccountsApi.list(params),
  get: (id) => whatsappAccountsApi.get(id),
  update: (id, patch) =>
    whatsappAccountsApi.update(id, {
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.credentialsRef !== undefined ? { credentialsRef: patch.credentialsRef } : {}),
      ...(patch.providerConfig !== undefined
        ? { providerConfig: patch.providerConfig ?? undefined }
        : {}),
      ...(patch.failoverPolicy !== undefined ? { failoverPolicy: patch.failoverPolicy } : {}),
      ...(patch.failoverAccountId !== undefined
        ? { failoverAccountId: patch.failoverAccountId ?? undefined }
        : {}),
      ...(patch.isFailoverActive !== undefined ? { isFailoverActive: patch.isFailoverActive } : {}),
    }),
  getMetrics: async (id, days = 30) => mockMetrics(String(id), days),
};
