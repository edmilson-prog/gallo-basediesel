import { describe, expect, it } from "vitest";
import {
  evaluateAccountState,
  resolveEffectiveAccount,
  shouldAutoActivateFailover,
  shouldAutoRestoreFailover,
  type IFailoverAwareAccount,
} from "./failover";
import { WhatsAppProviderError } from "./errors";
import type { IAccountRecord } from "./webhook/core";

function account(overrides: Partial<IFailoverAwareAccount> = {}): IFailoverAwareAccount {
  return {
    id: "acc-meta",
    storeId: "store-1",
    provider: "meta",
    phoneNumber: "+5555998001000",
    credentialsRef: "WA_MATRIZ",
    providerConfig: null,
    currentState: "healthy",
    stateChangedAt: null,
    failoverPolicy: "disabled",
    failoverAccountId: null,
    isFailoverActive: false,
    ...overrides,
  };
}

function backup(overrides: Partial<IAccountRecord> = {}): IAccountRecord {
  return {
    id: "acc-evo",
    storeId: "store-1",
    provider: "evolution",
    phoneNumber: "+5555998002000",
    credentialsRef: "WA_BACKUP",
    providerConfig: null,
    ...overrides,
  };
}

describe("evaluateAccountState (RF-020)", () => {
  it("error rate >= 70% with enough sample → down", () => {
    expect(evaluateAccountState({ totalCalls: 10, errorCalls: 8, currentState: "healthy" })).toBe(
      "down",
    );
  });

  it("error rate between 10% and 70% → degraded", () => {
    expect(evaluateAccountState({ totalCalls: 20, errorCalls: 4, currentState: "healthy" })).toBe(
      "degraded",
    );
  });

  it("error rate < 10% → healthy (recovers a degraded account)", () => {
    expect(evaluateAccountState({ totalCalls: 50, errorCalls: 1, currentState: "degraded" })).toBe(
      "healthy",
    );
  });

  it("below the minimum sample keeps the current state (no false positives)", () => {
    expect(evaluateAccountState({ totalCalls: 2, errorCalls: 2, currentState: "healthy" })).toBe(
      "healthy",
    );
    expect(evaluateAccountState({ totalCalls: 0, errorCalls: 0, currentState: "degraded" })).toBe(
      "degraded",
    );
  });

  it("healthCheck=down wins regardless of traffic", () => {
    expect(
      evaluateAccountState({
        healthCheck: "down",
        totalCalls: 100,
        errorCalls: 0,
        currentState: "healthy",
      }),
    ).toBe("down");
  });

  it("healthCheck=healthy with no traffic restores", () => {
    expect(
      evaluateAccountState({
        healthCheck: "healthy",
        totalCalls: 0,
        errorCalls: 0,
        currentState: "down",
      }),
    ).toBe("healthy");
  });

  it("paused is sticky — only manual action leaves it", () => {
    expect(
      evaluateAccountState({
        healthCheck: "healthy",
        totalCalls: 100,
        errorCalls: 0,
        currentState: "paused",
      }),
    ).toBe("paused");
  });
});

describe("shouldAutoActivateFailover (RF-030)", () => {
  it("activates on automatic policy + down + configured backup", () => {
    expect(
      shouldAutoActivateFailover(
        account({
          failoverPolicy: "automatic",
          failoverAccountId: "acc-evo",
          currentState: "down",
        }),
      ),
    ).toBe(true);
  });

  it("never activates on manual/disabled policy or when already active", () => {
    expect(
      shouldAutoActivateFailover(
        account({ failoverPolicy: "manual", failoverAccountId: "acc-evo", currentState: "down" }),
      ),
    ).toBe(false);
    expect(
      shouldAutoActivateFailover(
        account({
          failoverPolicy: "automatic",
          failoverAccountId: "acc-evo",
          currentState: "down",
          isFailoverActive: true,
        }),
      ),
    ).toBe(false);
  });
});

describe("shouldAutoRestoreFailover (RF-031)", () => {
  const now = Date.parse("2026-06-10T12:00:00Z");

  it("restores after 30min continuously healthy", () => {
    expect(
      shouldAutoRestoreFailover(
        account({
          isFailoverActive: true,
          currentState: "healthy",
          stateChangedAt: "2026-06-10T11:25:00Z",
        }),
        now,
      ),
    ).toBe(true);
  });

  it("does not restore before the threshold or while unhealthy", () => {
    expect(
      shouldAutoRestoreFailover(
        account({
          isFailoverActive: true,
          currentState: "healthy",
          stateChangedAt: "2026-06-10T11:45:00Z",
        }),
        now,
      ),
    ).toBe(false);
    expect(
      shouldAutoRestoreFailover(
        account({
          isFailoverActive: true,
          currentState: "degraded",
          stateChangedAt: "2026-06-10T10:00:00Z",
        }),
        now,
      ),
    ).toBe(false);
  });
});

describe("resolveEffectiveAccount (RF-040/041)", () => {
  it("inactive failover → primary", () => {
    const primary = account({ failoverAccountId: "acc-evo", failoverPolicy: "manual" });
    const result = resolveEffectiveAccount({ primary, failover: backup(), kind: "text" });
    expect(result.account.id).toBe("acc-meta");
    expect(result.usedFailover).toBe(false);
  });

  it("active failover routes text/media to the backup", () => {
    const primary = account({
      failoverAccountId: "acc-evo",
      failoverPolicy: "automatic",
      isFailoverActive: true,
      currentState: "down",
    });
    expect(resolveEffectiveAccount({ primary, failover: backup(), kind: "text" }).account.id).toBe(
      "acc-evo",
    );
    expect(
      resolveEffectiveAccount({ primary, failover: backup(), kind: "media" }).usedFailover,
    ).toBe(true);
  });

  it("template over a non-Meta backup bounces FAILOVER_INCOMPATIBLE 422", () => {
    const primary = account({
      failoverAccountId: "acc-evo",
      failoverPolicy: "automatic",
      isFailoverActive: true,
      currentState: "down",
    });
    try {
      resolveEffectiveAccount({ primary, failover: backup(), kind: "template" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(WhatsAppProviderError);
      expect((error as WhatsAppProviderError).code).toBe("FAILOVER_INCOMPATIBLE");
      expect((error as WhatsAppProviderError).httpStatus).toBe(422);
    }
  });

  it("template over a Meta backup is allowed", () => {
    const primary = account({
      failoverAccountId: "acc-meta-2",
      failoverPolicy: "manual",
      isFailoverActive: true,
    });
    const metaBackup = backup({ id: "acc-meta-2", provider: "meta" });
    const result = resolveEffectiveAccount({ primary, failover: metaBackup, kind: "template" });
    expect(result.account.id).toBe("acc-meta-2");
    expect(result.usedFailover).toBe(true);
  });

  it("missing backup row fails open to the primary", () => {
    const primary = account({
      failoverAccountId: "acc-gone",
      failoverPolicy: "automatic",
      isFailoverActive: true,
    });
    const result = resolveEffectiveAccount({ primary, failover: null, kind: "text" });
    expect(result.account.id).toBe("acc-meta");
    expect(result.usedFailover).toBe(false);
  });
});
