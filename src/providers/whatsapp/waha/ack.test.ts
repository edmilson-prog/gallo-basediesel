import { describe, expect, it } from "vitest";
import { mapWahaAckToStatus, parseWahaAckPayload } from "./ack";

describe("mapWahaAckToStatus", () => {
  it("maps ERROR (-1) to failed", () => {
    expect(mapWahaAckToStatus(-1)).toBe("failed");
  });

  it("maps anything below -1 to failed too", () => {
    expect(mapWahaAckToStatus(-5)).toBe("failed");
  });

  it("maps PENDING (0) to queued", () => {
    expect(mapWahaAckToStatus(0)).toBe("queued");
  });

  it("maps SERVER (1) to sent", () => {
    expect(mapWahaAckToStatus(1)).toBe("sent");
  });

  it("maps DEVICE (2) to delivered", () => {
    expect(mapWahaAckToStatus(2)).toBe("delivered");
  });

  it("maps READ (3) to read", () => {
    expect(mapWahaAckToStatus(3)).toBe("read");
  });

  it("maps PLAYED (4) to read", () => {
    expect(mapWahaAckToStatus(4)).toBe("read");
  });

  it("maps any unknown level above 4 to read (future-proof)", () => {
    expect(mapWahaAckToStatus(9)).toBe("read");
  });
});

describe("parseWahaAckPayload", () => {
  it("parses a genuine message.ack payload", () => {
    const result = parseWahaAckPayload({
      id: "true_5554981572275@c.us_3EB0274BCFD094540295AC",
      from: "5554981572275@c.us",
      participant: null,
      fromMe: true,
      ack: 3,
      ackName: "READ",
    });
    expect(result).toEqual({
      providerMessageId: "true_5554981572275@c.us_3EB0274BCFD094540295AC",
      status: "read",
    });
  });

  it("returns null when the payload has no id", () => {
    expect(parseWahaAckPayload({ ack: 1 })).toBeNull();
  });

  it("returns null when ack is not a finite number", () => {
    expect(parseWahaAckPayload({ id: "abc", ack: "SERVER" })).toBeNull();
    expect(parseWahaAckPayload({ id: "abc", ack: Number.NaN })).toBeNull();
  });

  it("returns null when the payload is null", () => {
    expect(parseWahaAckPayload(null)).toBeNull();
  });
});
