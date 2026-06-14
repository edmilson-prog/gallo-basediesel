import { describe, it, expect } from "vitest";
import {
  RECORDER_MIME_CANDIDATES,
  formatStopwatch,
  mimeToExtension,
  pickRecorderMimeType,
  recordingFileName,
} from "./audioRecording";

describe("mimeToExtension", () => {
  it("maps opus containers to their extension", () => {
    expect(mimeToExtension("audio/ogg;codecs=opus")).toBe("ogg");
    expect(mimeToExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(mimeToExtension("audio/webm")).toBe("webm");
  });

  it("maps mp4/aac and mpeg containers", () => {
    expect(mimeToExtension("audio/mp4")).toBe("m4a");
    expect(mimeToExtension("audio/mpeg")).toBe("mp3");
  });

  it("ignores codec params and casing", () => {
    expect(mimeToExtension("AUDIO/OGG;codecs=OPUS")).toBe("ogg");
  });

  it("falls back to webm for empty or unknown types", () => {
    expect(mimeToExtension("")).toBe("webm");
    expect(mimeToExtension("audio/x-weird")).toBe("webm");
  });
});

describe("pickRecorderMimeType", () => {
  it("prefers ogg/opus when supported", () => {
    expect(pickRecorderMimeType(() => true)).toBe("audio/ogg;codecs=opus");
  });

  it("falls back to the next candidate when ogg is unsupported (Chrome)", () => {
    const isSupported = (mime: string) => mime !== "audio/ogg;codecs=opus";
    expect(pickRecorderMimeType(isSupported)).toBe("audio/webm;codecs=opus");
  });

  it("walks the full preference order", () => {
    // Only the last candidate is supported.
    const last = RECORDER_MIME_CANDIDATES[RECORDER_MIME_CANDIDATES.length - 1];
    const isSupported = (mime: string) => mime === last;
    expect(pickRecorderMimeType(isSupported)).toBe(last);
  });

  it("returns empty string when nothing is supported (let the browser decide)", () => {
    expect(pickRecorderMimeType(() => false)).toBe("");
  });

  it("returns empty string when no checker is available", () => {
    expect(pickRecorderMimeType(undefined)).toBe("");
  });
});

describe("recordingFileName", () => {
  it("derives the extension from the recorder mime type", () => {
    expect(recordingFileName("audio/ogg;codecs=opus")).toBe("nota-de-voz.ogg");
    expect(recordingFileName("audio/webm;codecs=opus")).toBe("nota-de-voz.webm");
    expect(recordingFileName("audio/mp4")).toBe("nota-de-voz.m4a");
  });

  it("falls back to webm for an empty mime type", () => {
    expect(recordingFileName("")).toBe("nota-de-voz.webm");
  });
});

describe("formatStopwatch", () => {
  it("formats mm:ss with one decimal (tenths)", () => {
    expect(formatStopwatch(0)).toBe("00:00.0");
    expect(formatStopwatch(7.34)).toBe("00:07.3");
    expect(formatStopwatch(9.99)).toBe("00:09.9");
  });

  it("rolls over into minutes", () => {
    expect(formatStopwatch(67.85)).toBe("01:07.8");
    expect(formatStopwatch(600)).toBe("10:00.0");
  });

  it("clamps negatives to zero", () => {
    expect(formatStopwatch(-3)).toBe("00:00.0");
  });
});
