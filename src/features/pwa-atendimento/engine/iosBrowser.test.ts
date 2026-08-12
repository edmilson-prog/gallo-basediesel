import { describe, expect, it } from "vitest";
import { detectIosBrowser, shouldWarnAboutIosBrowser } from "./iosBrowser";

/** Real user agents, so a regex tweak cannot quietly pass on invented strings. */
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/137.0.7151.51 Mobile/15E148 Safari/604.1";
const FIREFOX_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/139.0 Mobile/15E148 Safari/605.1.15";
const EDGE_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 EdgiOS/136.0 Mobile/15E148 Safari/604.1";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36";
const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";

describe("detectIosBrowser", () => {
  it("recognises Safari on an iPhone", () => {
    expect(detectIosBrowser(SAFARI_IOS)).toBe("safari");
  });

  it.each([
    ["Chrome", CHROME_IOS],
    ["Firefox", FIREFOX_IOS],
    ["Edge", EDGE_IOS],
  ])("recognises %s on iOS as not-Safari", (_name, userAgent) => {
    // Every one of these carries "Safari/604.1" in the UA, which is exactly why
    // a naive `includes("Safari")` check would call them Safari.
    expect(detectIosBrowser(userAgent)).toBe("other");
  });

  it("does not treat Android as iOS", () => {
    expect(detectIosBrowser(CHROME_ANDROID)).toBe("not-ios");
  });

  it("does not treat desktop Safari as iOS", () => {
    expect(detectIosBrowser(SAFARI_MAC)).toBe("not-ios");
  });

  it("covers the iPad and the iPod too", () => {
    expect(detectIosBrowser(SAFARI_IOS.replace("iPhone", "iPad"))).toBe("safari");
    expect(detectIosBrowser(CHROME_IOS.replace("iPhone", "iPod"))).toBe("other");
  });

  it("treats an empty user agent as not iOS rather than guessing", () => {
    expect(detectIosBrowser("")).toBe("not-ios");
  });
});

describe("shouldWarnAboutIosBrowser", () => {
  it("warns only where the install would go wrong", () => {
    expect(shouldWarnAboutIosBrowser(CHROME_IOS)).toBe(true);
    expect(shouldWarnAboutIosBrowser(SAFARI_IOS)).toBe(false);
    expect(shouldWarnAboutIosBrowser(CHROME_ANDROID)).toBe(false);
  });
});
