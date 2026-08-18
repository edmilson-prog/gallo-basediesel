import { describe, it, expect } from "vitest";
import { SOUND_TEMPLATES, SOUND_TEMPLATE_LIST } from "./soundTemplates";
import type { SoundTemplateId } from "@/shared/types";

const IDS: SoundTemplateId[] = [
  "marimba", "diesel", "buzina", "sino", "powerup", "fanfarra",
  "classic-short", "classic-queue",
];

describe("SOUND_TEMPLATES", () => {
  it("has an entry for every SoundTemplateId and no extras", () => {
    expect(Object.keys(SOUND_TEMPLATES).sort()).toEqual([...IDS].sort());
  });

  it("each template has matching id, non-empty label/description and a synth fn", () => {
    for (const id of IDS) {
      const t = SOUND_TEMPLATES[id];
      expect(t.id).toBe(id);
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(typeof t.synth).toBe("function");
    }
  });

  it("SOUND_TEMPLATE_LIST mirrors the map", () => {
    expect(SOUND_TEMPLATE_LIST.map((t) => t.id).sort()).toEqual([...IDS].sort());
  });
});
