import { describe, it, expect } from "vitest";
import { SOUND_EVENTS, resolveEventConfig } from "./soundEvents";
import { DEFAULT_SOUND_SETTINGS, type ISoundSettings } from "@/shared/types";

describe("SOUND_EVENTS", () => {
  it("describes exactly the four default events", () => {
    expect(SOUND_EVENTS.map((e) => e.id).sort()).toEqual(
      Object.keys(DEFAULT_SOUND_SETTINGS.events).sort(),
    );
  });
});

describe("resolveEventConfig", () => {
  it("falls back to the event default when settings is undefined", () => {
    expect(resolveEventConfig(undefined, "updateAvailable")).toEqual(
      DEFAULT_SOUND_SETTINGS.events.updateAvailable,
    );
  });

  it("falls back when the event key is missing", () => {
    const partial = { events: {} } as unknown as ISoundSettings;
    expect(resolveEventConfig(partial, "sessionTimeout")).toEqual(
      DEFAULT_SOUND_SETTINGS.events.sessionTimeout,
    );
  });

  it("replaces an invalid templateId with the event default template", () => {
    const bad: ISoundSettings = {
      events: {
        ...DEFAULT_SOUND_SETTINGS.events,
        updateAvailable: { enabled: true, templateId: "nope" as never, volume: 0.4 },
      },
    };
    const out = resolveEventConfig(bad, "updateAvailable");
    expect(out.templateId).toBe(DEFAULT_SOUND_SETTINGS.events.updateAvailable.templateId);
    expect(out.volume).toBe(0.4);
    expect(out.enabled).toBe(true);
  });

  it("clamps volume into [0,1]", () => {
    const hi: ISoundSettings = {
      events: {
        ...DEFAULT_SOUND_SETTINGS.events,
        inboxNewInQueue: { enabled: false, templateId: "buzina", volume: 5 },
      },
    };
    const out = resolveEventConfig(hi, "inboxNewInQueue");
    expect(out.volume).toBe(1);
    expect(out.enabled).toBe(false);
    expect(out.templateId).toBe("buzina");
  });
});
