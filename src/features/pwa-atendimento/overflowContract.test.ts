import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The app never scrolls sideways.
 *
 * A phone has one axis. When anything is wider than the viewport the screen
 * gains a horizontal scrollbar, the fixed header stays put while the content
 * slides out from under it, and every neighbouring row looks broken too — one
 * unbreakable URL ruins the whole screen, not just the message that carried it.
 *
 * jsdom does no layout, so no component test can measure an overflow. What it
 * can measure are the classes that prevent one, and that is what this file
 * does: the seams where text arrives from the customer, the media drawn at a
 * fixed pixel width, and the scrollers that would hand out the second axis.
 *
 * The desktop bubbles have wrapped since day one (`whitespace-pre-wrap
 * break-words` on every `WhatsAppText`); the PWA shipped without it.
 */

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const read = (relative: string) => readFileSync(repoRoot + relative, "utf8");

const FEATURE = "src/features/pwa-atendimento/";

const bubble = read(FEATURE + "components/thread/PwaBubble.tsx");
const list = read(FEATURE + "components/thread/PwaMessageList.tsx");
const viewer = read(FEATURE + "components/ui/PwaMediaViewer.tsx");

/** Every `className="…"` literal in a source file, including inside `cn(…)`. */
const classLists = (source: string) =>
  [...source.matchAll(/className=(?:"([^"]*)"|\{cn\(([\s\S]*?)\)\})/g)].map(
    (match) => match[1] ?? match[2] ?? "",
  );

/**
 * Every seam where text the customer wrote reaches the screen.
 *
 * Free text is the only input with no length or alphabet contract: a pasted
 * Drive link is a single word of 90+ characters, and a `max-w` caps the box,
 * not the word. Anything on this list wraps, or it escapes its container.
 */
const CUSTOMER_TEXT: { seam: string; classes: string }[] = [
  {
    seam: "message body",
    classes: /<WhatsAppText[^>]*className="([^"]*)"/.exec(bubble)?.[1] ?? "",
  },
  {
    seam: "media viewer caption",
    classes: /caption\?\.trim\(\) && \(?\s*<p className="([^"]*)"/.exec(viewer)?.[1] ?? "",
  },
  ...[...bubble.matchAll(/\{caption && \(?\s*<p className="([^"]*)"/g)].map((match, index) => ({
    seam: `bubble caption ${index + 1}`,
    classes: match[1] ?? "",
  })),
];

describe.each(CUSTOMER_TEXT)("customer text — $seam", ({ classes }) => {
  it("was found in the source", () => {
    // Guards the regexes above: a refactor that renames the seam must not
    // quietly turn these assertions into checks against an empty string.
    expect(classes).not.toBe("");
  });

  it("breaks a word that is wider than its container", () => {
    expect(classes).toContain("break-words");
  });

  it("keeps the line breaks the customer typed", () => {
    // HTML collapses newlines, so a multi-line WhatsApp message arrives here
    // as one run-on paragraph without this.
    expect(classes).toContain("whitespace-pre-wrap");
  });
});

describe("lifecycle pill", () => {
  // Assignment and status events are app-generated, so the text is tame — but
  // it is still centred in a flex row with no cap of its own.
  const classes = /<span className="([^"]*)">\s*\{text\}/.exec(bubble)?.[1] ?? "";

  it("was found in the source", () => {
    expect(classes).not.toBe("");
  });

  it("stays inside the screen", () => {
    expect(classes).toContain("break-words");
    expect(classes).toContain("max-w-full");
  });
});

describe("fixed-width media", () => {
  it("never asks for more pixels than the bubble has", () => {
    // The image, video and document bodies are drawn at a fixed width so the
    // thread does not turn into a column of ragged sizes. On a 320px screen
    // that width plus the bubble's padding is wider than the 85% cap allows.
    const fixed = classLists(bubble).filter((classes) => /(?:^|\s)w-\[\d+px\]/.test(classes));
    expect(fixed.length).toBeGreaterThan(0);
    for (const classes of fixed) expect(classes).toContain("max-w-full");
  });
});

describe("the thread scroller", () => {
  it("offers the vertical axis only", () => {
    const scroller = classLists(list)[0] ?? "";
    expect(scroller).toContain("overflow-y-auto");
    expect(scroller).toContain("overflow-x-hidden");
  });
});

describe("every scroller in the feature", () => {
  const files = readdirSync(repoRoot + FEATURE, { recursive: true })
    .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".tsx"))
    .map((entry) => entry.replace(/\\/g, "/"));

  it("finds the feature's components", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files)("%s names the axis it scrolls", (file) => {
    // `overflow-auto` is the shorthand that put the horizontal bar on screen:
    // it hands the second axis to anything that overflows instead of
    // containing it. A vertical scroller says `overflow-y-auto
    // overflow-x-hidden`; a deliberate horizontal strip (the media tabs, the
    // analysis chips) says `overflow-x-auto`. Neither is ambiguous.
    expect(read(FEATURE + file)).not.toMatch(/(?:^|\s)overflow-auto(?:\s|")/);
  });
});
