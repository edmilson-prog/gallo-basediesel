import { describe, expect, it } from "vitest";
import { describeDevice } from "./deviceLabel";

const CHROME_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const SAFARI_IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
const FIREFOX_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:129.0) Gecko/20100101 Firefox/129.0";
const EDGE_WIN = `${CHROME_WIN} Edg/128.0.0.0`;

describe("describeDevice", () => {
  it("names browser and system on desktop", () => {
    expect(describeDevice(CHROME_WIN)).toEqual({
      label: "Chrome · Windows",
      icon: "lucide:monitor",
    });
  });

  it("detects Edge before Chrome", () => {
    expect(describeDevice(EDGE_WIN).label).toBe("Edge · Windows");
  });

  it("detects Firefox on macOS", () => {
    expect(describeDevice(FIREFOX_MAC)).toEqual({
      label: "Firefox · macOS",
      icon: "lucide:monitor",
    });
  });

  it("uses the phone icon on Android", () => {
    expect(describeDevice(CHROME_ANDROID)).toEqual({
      label: "Chrome · Android",
      icon: "lucide:smartphone",
    });
  });

  it("uses the tablet icon on iPad", () => {
    expect(describeDevice(SAFARI_IPAD)).toEqual({
      label: "Safari · iPadOS",
      icon: "lucide:tablet",
    });
  });

  it("degrades gracefully on an unknown agent", () => {
    expect(describeDevice("")).toEqual({
      label: "Navegador · sistema não identificado",
      icon: "lucide:monitor",
    });
  });
});
