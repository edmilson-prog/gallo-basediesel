import { describe, it, expect } from "vitest";
import { isChunkLoadError } from "./chunkError";

describe("isChunkLoadError", () => {
  const chunkMessages = [
    "Failed to fetch dynamically imported module: https://x/assets/app-CpiVtC6Y.js",
    "error loading dynamically imported module",
    "Importing a module script failed.",
    "Loading chunk 42 failed.",
    'Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
  ];

  it.each(chunkMessages)("detects chunk error: %s", (msg) => {
    expect(isChunkLoadError(new Error(msg))).toBe(true);
  });

  it("ignores a generic runtime error", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
  });

  it("ignores an API/network error", () => {
    expect(isChunkLoadError(new Error("Request failed with status code 500"))).toBe(false);
  });

  it("accepts a raw string message", () => {
    expect(isChunkLoadError("Failed to fetch dynamically imported module")).toBe(true);
  });

  it("handles non-error inputs", () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError(42)).toBe(false);
  });
});
