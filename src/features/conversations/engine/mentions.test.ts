import { describe, it, expect } from "vitest";
import {
  parseMentionQuery,
  applyMention,
  extractMentionedIds,
  segmentNote,
  type IMentionCandidate,
} from "./mentions";

const CANDIDATES: IMentionCandidate[] = [
  { id: "s1", display: "Edmilson Souza" },
  { id: "s2", display: "Ana" },
  { id: "s3", display: "Ana Paula" },
  { id: "s4", display: "Fernando" },
];

describe("parseMentionQuery", () => {
  it("is inactive at the start of an empty value", () => {
    expect(parseMentionQuery("", 0).active).toBe(false);
  });

  it("is inactive when there is no '@' before the caret", () => {
    expect(parseMentionQuery("ola pessoal", 5).active).toBe(false);
  });

  it("activates when '@' opens the message", () => {
    const q = parseMentionQuery("@edm", 4);
    expect(q.active).toBe(true);
    expect(q.query).toBe("edm");
    expect(q.start).toBe(0);
    expect(q.end).toBe(4);
  });

  it("activates when '@' follows whitespace", () => {
    const q = parseMentionQuery("oi @fer", 7);
    expect(q.active).toBe(true);
    expect(q.query).toBe("fer");
    expect(q.start).toBe(3);
  });

  it("does NOT activate inside an e-mail (non-space before '@')", () => {
    expect(parseMentionQuery("user@host", 9).active).toBe(false);
  });

  it("closes (inactive) once a space is typed after the token", () => {
    expect(parseMentionQuery("@ana ", 5).active).toBe(false);
  });

  it("tracks only the token up to the caret, not text after it", () => {
    const q = parseMentionQuery("@anabela resto", 4);
    expect(q.query).toBe("ana");
    expect(q.end).toBe(4);
  });
});

describe("applyMention", () => {
  it("replaces the typed token with '@display ' and places the caret after it", () => {
    const value = "oi @edm";
    const q = parseMentionQuery(value, value.length);
    const result = applyMention(value, q, "Edmilson Souza");
    expect(result.value).toBe("oi @Edmilson Souza ");
    expect(result.caret).toBe("oi @Edmilson Souza ".length);
  });

  it("preserves text that comes after the caret", () => {
    const value = "@an, confere";
    const q = parseMentionQuery(value, 3); // caret right after "@an"
    const result = applyMention(value, q, "Ana");
    expect(result.value).toBe("@Ana , confere");
    expect(result.caret).toBe("@Ana ".length);
  });
});

describe("extractMentionedIds", () => {
  it("returns empty when there are no mentions", () => {
    expect(extractMentionedIds("sem mencao aqui", CANDIDATES)).toEqual([]);
  });

  it("matches a simple single-name mention", () => {
    expect(extractMentionedIds("chama o @Fernando", CANDIDATES)).toEqual(["s4"]);
  });

  it("matches a composite-name mention greedily (longest first)", () => {
    // "@Ana Paula" must resolve to s3, NOT s2 ("Ana")
    expect(extractMentionedIds("ping @Ana Paula", CANDIDATES)).toEqual(["s3"]);
  });

  it("respects a trailing word boundary (does not match @Anabela as @Ana)", () => {
    expect(extractMentionedIds("@Anabela", CANDIDATES)).toEqual([]);
  });

  it("ignores an '@' glued to a previous word char (e-mail)", () => {
    expect(extractMentionedIds("mail user@Ana here", CANDIDATES)).toEqual([]);
  });

  it("dedupes repeated mentions of the same person", () => {
    expect(extractMentionedIds("@Ana e de novo @Ana", CANDIDATES)).toEqual(["s2"]);
  });

  it("returns multiple distinct mentions in order of appearance", () => {
    expect(extractMentionedIds("@Fernando e @Edmilson Souza", CANDIDATES)).toEqual(["s4", "s1"]);
  });
});

describe("segmentNote", () => {
  it("returns a single text segment when there is no mention", () => {
    expect(segmentNote("texto puro", CANDIDATES)).toEqual([{ type: "text", value: "texto puro" }]);
  });

  it("returns an empty array for empty text", () => {
    expect(segmentNote("", CANDIDATES)).toEqual([]);
  });

  it("splits text and mention segments", () => {
    expect(segmentNote("oi @Ana tudo bem", CANDIDATES)).toEqual([
      { type: "text", value: "oi " },
      { type: "mention", value: "@Ana", id: "s2" },
      { type: "text", value: " tudo bem" },
    ]);
  });

  it("prefers the longest (composite) name in segmentation", () => {
    expect(segmentNote("@Ana Paula ok", CANDIDATES)).toEqual([
      { type: "mention", value: "@Ana Paula", id: "s3" },
      { type: "text", value: " ok" },
    ]);
  });
});

import { resolveMentionParticipants } from "./mentions";

describe("resolveMentionParticipants", () => {
  it("resolves mentioned sellers when the author is the conversation's assignee", () => {
    const result = resolveMentionParticipants(["s2", "s3"], {
      assignedSellerId: "s1",
      authorId: "s1",
      isAuthorStaff: false,
      existingParticipantIds: [],
    });
    expect(result).toEqual(["s2", "s3"]);
  });

  it("resolves mentioned sellers when the author is staff, even on someone else's conversation", () => {
    const result = resolveMentionParticipants(["s2"], {
      assignedSellerId: "s1",
      authorId: "s9",
      isAuthorStaff: true,
      existingParticipantIds: [],
    });
    expect(result).toEqual(["s2"]);
  });

  it("resolves nothing when the author is neither staff nor the assignee", () => {
    const result = resolveMentionParticipants(["s2"], {
      assignedSellerId: "s1",
      authorId: "s9",
      isAuthorStaff: false,
      existingParticipantIds: [],
    });
    expect(result).toEqual([]);
  });

  it("excludes the conversation's own assignee from the result", () => {
    const result = resolveMentionParticipants(["s1", "s2"], {
      assignedSellerId: "s1",
      authorId: "s1",
      isAuthorStaff: false,
      existingParticipantIds: [],
    });
    expect(result).toEqual(["s2"]);
  });

  it("excludes sellers who are already collaborators", () => {
    const result = resolveMentionParticipants(["s2", "s3"], {
      assignedSellerId: "s1",
      authorId: "s1",
      isAuthorStaff: false,
      existingParticipantIds: ["s3"],
    });
    expect(result).toEqual(["s2"]);
  });

  it("returns an empty array for an empty mention list", () => {
    expect(
      resolveMentionParticipants([], {
        assignedSellerId: "s1",
        authorId: "s1",
        isAuthorStaff: false,
        existingParticipantIds: [],
      }),
    ).toEqual([]);
  });
});
