import { describe, expect, it } from "vitest";
import {
  connectErrorMessage,
  CONNECT_ERROR_MESSAGES,
  EvolutionConnectError,
  formatTestPhoneMask,
  isValidCredentialsRef,
  normalizeTestPhoneDigits,
  resolveMockPairingState,
} from "./whatsappConnect";

describe("resolveMockPairingState", () => {
  it("starts closed, moves to connecting, then opens with a fake profile", () => {
    expect(resolveMockPairingState(0).state).toBe("close");
    expect(resolveMockPairingState(2499).state).toBe("close");
    expect(resolveMockPairingState(2500).state).toBe("connecting");
    expect(resolveMockPairingState(4999).state).toBe("connecting");
    const open = resolveMockPairingState(5000);
    expect(open.state).toBe("open");
    expect(open.phoneNumber).toBe("+5555999887766");
    expect(open.profileName).toBe("Gallo Base Diesel (demo)");
  });
});

describe("connectErrorMessage", () => {
  it("maps known codes and falls back to DEFAULT", () => {
    expect(connectErrorMessage(new EvolutionConnectError("x", "UNAUTHORIZED"))).toBe(
      CONNECT_ERROR_MESSAGES.UNAUTHORIZED,
    );
    expect(connectErrorMessage(new Error("boom"))).toBe(CONNECT_ERROR_MESSAGES.DEFAULT);
  });
});

describe("formatTestPhoneMask", () => {
  it("formats progressively while typing", () => {
    expect(formatTestPhoneMask("")).toBe("");
    expect(formatTestPhoneMask("5")).toBe("+5");
    expect(formatTestPhoneMask("55")).toBe("+55");
    expect(formatTestPhoneMask("5554")).toBe("+55 54");
    expect(formatTestPhoneMask("5554999")).toBe("+55 54 999");
    expect(formatTestPhoneMask("555499988")).toBe("+55 54 9-9988");
  });

  it("places the hyphen before the last 4 digits for 8- and 9-digit numbers", () => {
    expect(formatTestPhoneMask("5554999887766")).toBe("+55 54 99988-7766"); // 9 dígitos
    expect(formatTestPhoneMask("555499887766")).toBe("+55 54 9988-7766"); // 8 dígitos
  });

  it("ignores non-digits and caps at 13 digits", () => {
    expect(formatTestPhoneMask("+55 (54) 99988-7766")).toBe("+55 54 99988-7766");
    expect(formatTestPhoneMask("55549998877661234")).toBe("+55 54 99988-7766");
  });
});

describe("normalizeTestPhoneDigits", () => {
  it("accepts DDI+DDD+number with or without formatting", () => {
    expect(normalizeTestPhoneDigits("5554999887766")).toBe("5554999887766"); // 13 digits
    expect(normalizeTestPhoneDigits("555481572275")).toBe("555481572275"); // 12 digits
    expect(normalizeTestPhoneDigits("+55 (54) 99988-7766")).toBe("5554999887766");
  });

  it("rejects numbers without DDI or too long", () => {
    expect(normalizeTestPhoneDigits("54999887766")).toBeNull(); // 11 — sem DDI
    expect(normalizeTestPhoneDigits("55549998877665")).toBeNull(); // 14
    expect(normalizeTestPhoneDigits("")).toBeNull();
  });
});

describe("isValidCredentialsRef", () => {
  it("accepts env-style prefixes", () => {
    expect(isValidCredentialsRef("WA_EVO_CAMPANHAS")).toBe(true);
    expect(isValidCredentialsRef("WA_META_MATRIZ")).toBe(true);
    expect(isValidCredentialsRef("W1")).toBe(true); // short prefix, valid full name
  });

  it("rejects legacy seed refs and invalid characters", () => {
    expect(isValidCredentialsRef("vault://gallo/wa-evo-campanhas")).toBe(false);
    expect(isValidCredentialsRef("wa_evo_campanhas")).toBe(false); // lowercase
    expect(isValidCredentialsRef("WA-EVO")).toBe(false); // hyphen
    expect(isValidCredentialsRef("")).toBe(false); // name would start with _
    expect(isValidCredentialsRef("1WA")).toBe(false); // must start with a letter
    expect(isValidCredentialsRef("A".repeat(60))).toBe(false); // name > 65 chars
  });
});
