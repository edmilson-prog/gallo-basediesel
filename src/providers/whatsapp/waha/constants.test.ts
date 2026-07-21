import { describe, expect, it } from "vitest";
import { WAHA_DEFAULT_EVENTS } from "./constants";

describe("WAHA_DEFAULT_EVENTS", () => {
  it("subscribes message.reaction so customer reactions are not invisible", () => {
    expect(WAHA_DEFAULT_EVENTS).toContain("message.reaction");
  });
});
