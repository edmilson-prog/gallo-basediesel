import { describe, expect, it } from "vitest";
import { resolveLayout } from "./resolveLayout";

describe("resolveLayout", () => {
  it("forces the header switcher below 1024px, whatever the preference", () => {
    for (const preferred of ["rail", "tabs", "header"] as const) {
      expect(resolveLayout({ preferred, width: 900, funnelCount: 4 }).layout).toBe("header");
    }
  });

  it("collapses the rail between 1024 and 1279px", () => {
    const r = resolveLayout({ preferred: "rail", width: 1100, funnelCount: 4 });
    expect(r.layout).toBe("rail");
    expect(r.railCollapsed).toBe(true);
  });

  it("keeps the rail expanded from 1280px up", () => {
    const r = resolveLayout({ preferred: "rail", width: 1400, funnelCount: 4 });
    expect(r.layout).toBe("rail");
    expect(r.railCollapsed).toBe(false);
  });

  it("degrades tabs to the header switcher at 9 funnels or more", () => {
    expect(resolveLayout({ preferred: "tabs", width: 1400, funnelCount: 8 }).layout).toBe("tabs");
    expect(resolveLayout({ preferred: "tabs", width: 1400, funnelCount: 9 }).layout).toBe("header");
  });

  it("does not degrade the rail on funnel count — only tabs scroll horizontally", () => {
    expect(resolveLayout({ preferred: "rail", width: 1400, funnelCount: 20 }).layout).toBe("rail");
  });

  it("reports staticLabel with a single funnel, without changing the layout", () => {
    const r = resolveLayout({ preferred: "tabs", width: 1400, funnelCount: 1 });
    expect(r.staticLabel).toBe(true);
    expect(r.layout).toBe("tabs");
  });

  it("reports the empty state with zero funnels", () => {
    expect(resolveLayout({ preferred: "rail", width: 1400, funnelCount: 0 }).isEmpty).toBe(true);
    expect(resolveLayout({ preferred: "rail", width: 1400, funnelCount: 1 }).isEmpty).toBe(false);
  });

  it("returns the preference untouched when nothing degrades", () => {
    expect(resolveLayout({ preferred: "rail", width: 1400, funnelCount: 3 }).layout).toBe("rail");
    expect(resolveLayout({ preferred: "tabs", width: 1400, funnelCount: 3 }).layout).toBe("tabs");
    expect(resolveLayout({ preferred: "header", width: 1400, funnelCount: 3 }).layout).toBe(
      "header",
    );
  });

  /**
   * The load-bearing property of the whole design: degradation is a read-time
   * projection. Narrowing the window and widening it again must land on the
   * original preference, because nothing in this path writes back.
   */
  it("is reversible — a narrow window does not consume the preference", () => {
    const narrow = resolveLayout({ preferred: "rail", width: 800, funnelCount: 4 });
    expect(narrow.layout).toBe("header");
    const wideAgain = resolveLayout({ preferred: "rail", width: 1400, funnelCount: 4 });
    expect(wideAgain.layout).toBe("rail");
  });

  it("never reports railCollapsed for a layout that is not the rail", () => {
    expect(resolveLayout({ preferred: "header", width: 1100, funnelCount: 4 }).railCollapsed).toBe(
      false,
    );
    expect(resolveLayout({ preferred: "tabs", width: 1100, funnelCount: 4 }).railCollapsed).toBe(
      false,
    );
  });
});
