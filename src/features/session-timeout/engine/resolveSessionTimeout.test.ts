import { describe, expect, it } from "vitest";
import type { ISessionTimeoutSettings } from "@/shared/types";
import { resolveSessionTimeout } from "./resolveSessionTimeout";

const base: ISessionTimeoutSettings = {
  enabled: true,
  idleMinutes: 30,
  warningSeconds: 60,
  soundEnabled: true,
  soundVolume: 0.5,
};

describe("resolveSessionTimeout", () => {
  it("falls back to the default when nothing is configured", () => {
    expect(resolveSessionTimeout(undefined, undefined)).toEqual({
      enabled: true,
      idleMs: 30 * 60_000,
      warningMs: 60_000,
      soundEnabled: true,
    });
  });

  it("is disabled when the global master switch is off", () => {
    expect(resolveSessionTimeout({ ...base, enabled: false }, undefined)).toEqual({
      enabled: false,
      idleMs: 0,
      warningMs: 0,
      soundEnabled: false,
    });
  });

  it("lets the override win over the global (even enabling with global off)", () => {
    const override: ISessionTimeoutSettings = {
      ...base,
      idleMinutes: 5,
      warningSeconds: 30,
      soundEnabled: false,
      soundVolume: 0.8,
    };
    expect(resolveSessionTimeout({ ...base, enabled: false }, override)).toEqual({
      enabled: true,
      idleMs: 5 * 60_000,
      warningMs: 30_000,
      soundEnabled: false,
    });
  });

  it("inherits the global when the override is null", () => {
    expect(resolveSessionTimeout(base, null)).toEqual({
      enabled: true,
      idleMs: 30 * 60_000,
      warningMs: 60_000,
      soundEnabled: true,
    });
  });

  it("clamps the warning window to be strictly shorter than idle", () => {
    const cfg: ISessionTimeoutSettings = { ...base, idleMinutes: 1, warningSeconds: 120 };
    expect(resolveSessionTimeout(cfg, undefined)).toEqual({
      enabled: true,
      idleMs: 60_000,
      warningMs: 59_000,
      soundEnabled: true,
    });
  });

  it("sanitizes non-positive/NaN values back to the default", () => {
    const cfg: ISessionTimeoutSettings = { ...base, idleMinutes: 0, warningSeconds: -5 };
    expect(resolveSessionTimeout(cfg, undefined)).toEqual({
      enabled: true,
      idleMs: 30 * 60_000,
      warningMs: 60_000,
      soundEnabled: true,
    });
  });
});
