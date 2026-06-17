import { describe, expect, it } from "vitest";
import type { IWorkSchedule } from "@/shared/types";
import { evaluateAccess, canGrantAccess, OPERATIONAL_ROLES } from "./accessGate";

const WEEKDAY_8_18: IWorkSchedule = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday: weekday as 1 | 2 | 3 | 4 | 5,
  openAt: "08:00",
  closeAt: "18:00",
  enabled: true,
}));

const tuesdayMorning = new Date("2026-06-16T12:00:00Z"); // 09:00 SP, terça
const tuesdayNight = new Date("2026-06-16T23:30:00Z"); // 20:30 SP, terça

describe("evaluateAccess", () => {
  it("blocks an operational role outside the window", () => {
    const d = evaluateAccess({
      role: "Vendedor",
      active: true,
      workSchedule: WEEKDAY_8_18,
      now: tuesdayNight,
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("outside_hours");
    expect(d.nextOpenAt).toBeTruthy();
  });

  it("allows an operational role inside the window", () => {
    const d = evaluateAccess({
      role: "Vendedor",
      active: true,
      workSchedule: WEEKDAY_8_18,
      now: tuesdayMorning,
    });
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe("ok");
  });

  it("always allows Owner and Gestor regardless of hours", () => {
    for (const role of ["Owner", "Gestor"] as const) {
      const d = evaluateAccess({
        role,
        active: true,
        workSchedule: WEEKDAY_8_18,
        now: tuesdayNight,
      });
      expect(d.allowed).toBe(true);
    }
  });

  it("treats no schedule as unrestricted for operationals", () => {
    const d = evaluateAccess({ role: "SDR", active: true, now: tuesdayNight });
    expect(d.allowed).toBe(true);
  });

  it("a suspended/inactive user is blocked even inside the window", () => {
    const d = evaluateAccess({
      role: "Vendedor",
      active: false,
      workSchedule: WEEKDAY_8_18,
      now: tuesdayMorning,
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("suspended");
  });

  it("an active emergency grant unlocks login outside the window", () => {
    const d = evaluateAccess({
      role: "Vendedor",
      active: true,
      workSchedule: WEEKDAY_8_18,
      now: tuesdayNight,
      accessGrant: {
        grantedBy: "seller-x",
        grantedAt: "2026-06-16T22:00:00Z",
        expiresAt: "2026-06-17T01:00:00Z", // ainda válido às 23:30Z
      },
    });
    expect(d.allowed).toBe(true);
  });

  it("an expired grant does not unlock", () => {
    const d = evaluateAccess({
      role: "Vendedor",
      active: true,
      workSchedule: WEEKDAY_8_18,
      now: tuesdayNight,
      accessGrant: {
        grantedBy: "seller-x",
        grantedAt: "2026-06-16T10:00:00Z",
        expiresAt: "2026-06-16T12:00:00Z", // já expirou às 23:30Z
      },
    });
    expect(d.allowed).toBe(false);
  });

  it("a Cliente is never gated by hours", () => {
    const d = evaluateAccess({
      role: "Cliente",
      active: true,
      workSchedule: WEEKDAY_8_18,
      now: tuesdayNight,
    });
    expect(d.allowed).toBe(true);
  });
});

describe("OPERATIONAL_ROLES", () => {
  it("contains exactly the four operational roles", () => {
    expect([...OPERATIONAL_ROLES].sort()).toEqual(
      ["Financeiro", "SDR", "Vendedor", "VendedorExterno"].sort(),
    );
  });
});

describe("canGrantAccess", () => {
  it("Owner can grant to anyone", () => {
    expect(canGrantAccess({ role: "Owner", departmentId: "a" }, { departmentId: "b" })).toBe(true);
  });
  it("Gestor grants only within the same department", () => {
    expect(canGrantAccess({ role: "Gestor", departmentId: "a" }, { departmentId: "a" })).toBe(true);
    expect(canGrantAccess({ role: "Gestor", departmentId: "a" }, { departmentId: "b" })).toBe(
      false,
    );
  });
  it("operational roles cannot grant", () => {
    expect(canGrantAccess({ role: "Vendedor", departmentId: "a" }, { departmentId: "a" })).toBe(
      false,
    );
  });
});
