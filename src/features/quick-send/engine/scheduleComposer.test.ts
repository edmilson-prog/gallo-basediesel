import { describe, expect, it } from "vitest";
import {
  buildSchedulePayload,
  canSaveDraft,
  scheduleBlock,
  type IScheduleFormState,
} from "./scheduleComposer";

const NOW = new Date(2026, 5, 13, 12, 0).toISOString();
const future = new Date(2026, 5, 13, 18, 0).toISOString();
const past = new Date(2026, 5, 13, 6, 0).toISOString();

const base: IScheduleFormState = { text: "", media: null, scheduledFor: null };
const media = {
  mediaPath: "store/a.jpg",
  mediaType: "image" as const,
  fileName: "a.jpg",
  previewUrl: "blob:x",
};

describe("scheduleBlock", () => {
  it("blocks 'empty' when there is no text and no media", () => {
    expect(scheduleBlock({ ...base, scheduledFor: future }, NOW)).toBe("empty");
  });
  it("blocks 'no-time' when there is content but no time", () => {
    expect(scheduleBlock({ ...base, text: "olá" }, NOW)).toBe("no-time");
  });
  it("blocks 'past' when the time is not in the future", () => {
    expect(scheduleBlock({ ...base, text: "olá", scheduledFor: past }, NOW)).toBe("past");
  });
  it("returns null (can schedule) with content and a future time", () => {
    expect(scheduleBlock({ ...base, text: "olá", scheduledFor: future }, NOW)).toBeNull();
    expect(scheduleBlock({ ...base, media, scheduledFor: future }, NOW)).toBeNull();
  });
});

describe("canSaveDraft", () => {
  it("requires content (text or media), not a time", () => {
    expect(canSaveDraft(base)).toBe(false);
    expect(canSaveDraft({ ...base, text: "  " })).toBe(false);
    expect(canSaveDraft({ ...base, text: "oi" })).toBe(true);
    expect(canSaveDraft({ ...base, media })).toBe(true);
  });
});

describe("buildSchedulePayload", () => {
  it("builds a snippet payload from text only", () => {
    expect(buildSchedulePayload({ ...base, text: "  Bom dia!  " })).toEqual({
      type: "snippet",
      contextMessage: "Bom dia!",
    });
  });
  it("builds a media payload (path/type/filename) with the trimmed caption", () => {
    expect(buildSchedulePayload({ ...base, text: " legenda ", media })).toEqual({
      type: "media",
      contextMessage: "legenda",
      mediaPath: "store/a.jpg",
      mediaType: "image",
      fileName: "a.jpg",
    });
  });
  it("omits the caption when empty on a media payload", () => {
    expect(buildSchedulePayload({ ...base, media })).toEqual({
      type: "media",
      mediaPath: "store/a.jpg",
      mediaType: "image",
      fileName: "a.jpg",
    });
  });
  it("signs the snippet caption with the attendant name when provided", () => {
    expect(buildSchedulePayload({ ...base, text: "Bom dia!" }, "Edmilson")).toEqual({
      type: "snippet",
      contextMessage: "*Edmilson:* Bom dia!",
    });
  });
  it("signs a media caption but never an empty one", () => {
    expect(buildSchedulePayload({ ...base, text: "legenda", media }, "Edmilson")).toEqual({
      type: "media",
      contextMessage: "*Edmilson:* legenda",
      mediaPath: "store/a.jpg",
      mediaType: "image",
      fileName: "a.jpg",
    });
    expect(buildSchedulePayload({ ...base, media }, "Edmilson")).toEqual({
      type: "media",
      mediaPath: "store/a.jpg",
      mediaType: "image",
      fileName: "a.jpg",
    });
  });
});
