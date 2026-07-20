import { describe, it, expect } from "vitest";
import {
  DEFAULT_SOUND_SETTINGS,
  type SoundEventId,
  type SoundTemplateId,
} from "./sound";

const EVENT_IDS: SoundEventId[] = [
  "updateAvailable",
  "inboxAssignedMine",
  "inboxNewInQueue",
  "sessionTimeout",
];
const TEMPLATE_IDS: SoundTemplateId[] = [
  "marimba", "diesel", "buzina", "sino", "powerup", "fanfarra",
  "classic-short", "classic-queue",
];

describe("DEFAULT_SOUND_SETTINGS", () => {
  it("covers exactly the four events", () => {
    expect(Object.keys(DEFAULT_SOUND_SETTINGS.events).sort()).toEqual([...EVENT_IDS].sort());
  });

  it("uses valid template ids and volumes in [0,1]", () => {
    for (const id of EVENT_IDS) {
      const cfg = DEFAULT_SOUND_SETTINGS.events[id];
      expect(TEMPLATE_IDS).toContain(cfg.templateId);
      expect(cfg.volume).toBeGreaterThanOrEqual(0);
      expect(cfg.volume).toBeLessThanOrEqual(1);
      expect(typeof cfg.enabled).toBe("boolean");
    }
  });

  it("defaults the update prompt to marimba", () => {
    expect(DEFAULT_SOUND_SETTINGS.events.updateAvailable.templateId).toBe("marimba");
  });
});
