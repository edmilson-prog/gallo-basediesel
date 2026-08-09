import { describe, expect, it } from "vitest";
import { shouldDiscardSession } from "./profileResolution";

describe("shouldDiscardSession — may a profile read drop a live session?", () => {
  it("never discards on an inconclusive read", () => {
    // Network blip / 5xx / RLS statement_timeout says nothing about the profile.
    expect(shouldDiscardSession("error", false)).toBe(false);
    expect(shouldDiscardSession("error", true)).toBe(false);
  });

  it("discards an empty read only while no user is established", () => {
    // Boot or sign-in: authenticated with genuinely no `profiles` row. The user
    // cannot use the app, so the guard must send them to login.
    expect(shouldDiscardSession("absent", false)).toBe(true);
  });

  it("keeps a session that is already established", () => {
    // The reported bug: sign-in succeeds and writes the mirror, then the
    // onAuthStateChange listener re-reads `profiles`. A read that leaves without
    // the user's JWT is filtered by RLS (`auth_user_id = auth.uid()`) and comes
    // back as data:null/error:null — indistinguishable from "no row". Zeroing on
    // that wiped the localStorage mirror `requireAuth` reads, so the next
    // navigation bounced to /auth/login while the server session was still
    // valid: two logins minutes apart with no /logout in between.
    //
    // A profile does not vanish mid-session. Only an explicit sign-out ends one.
    expect(shouldDiscardSession("absent", true)).toBe(false);
  });
});
