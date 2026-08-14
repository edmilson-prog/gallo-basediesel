import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The thread never scrolls sideways.
 *
 * A phone has one axis. When a bubble is wider than the viewport the list gains
 * a horizontal scrollbar, the header stays put while the messages slide out
 * from under it, and every other bubble looks broken too — one unbreakable URL
 * ruins the whole screen, not just its own row.
 *
 * jsdom does no layout, so no component test can measure this. What it can do
 * is guard the three ways the width escapes: text that refuses to wrap, media
 * with a hard pixel width, and a scroller that offers the axis in the first
 * place. The desktop bubbles have carried the first rule since day one
 * (`whitespace-pre-wrap break-words` on every `WhatsAppText`); the PWA shipped
 * without it.
 */

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const read = (relative: string) => readFileSync(repoRoot + relative, "utf8");

const bubble = read("src/features/pwa-atendimento/components/thread/PwaBubble.tsx");
const list = read("src/features/pwa-atendimento/components/thread/PwaMessageList.tsx");

/** Every `className="…"` literal in a source file. */
const classLists = (source: string) =>
  [...source.matchAll(/className=(?:"([^"]*)"|\{cn\(([\s\S]*?)\)\})/g)].map(
    (match) => match[1] ?? match[2] ?? "",
  );

describe("message body", () => {
  const textClasses = /<WhatsAppText[^>]*className="([^"]*)"/.exec(bubble)?.[1] ?? "";

  it("breaks a word that is wider than the bubble", () => {
    // A pasted Drive link is a single word of 90+ characters. `max-w-[85%]`
    // caps the box, not the word — without this the glyphs simply run past it.
    expect(textClasses).toContain("break-words");
  });

  it("keeps the line breaks the customer typed", () => {
    // Same class the desktop bubbles pass. HTML collapses newlines by default,
    // so a multi-line WhatsApp message arrives here as one run-on paragraph.
    expect(textClasses).toContain("whitespace-pre-wrap");
  });

  it("breaks long words in a media caption too", () => {
    // Captions sit under the image and the video, and carry the same links.
    const captions = [...bubble.matchAll(/\{caption && \(?\s*<p className="([^"]*)"/g)].map(
      (match) => match[1] ?? "",
    );
    expect(captions.length).toBeGreaterThan(0);
    for (const caption of captions) expect(caption).toContain("break-words");
  });
});

describe("fixed-width media", () => {
  it("never asks for more pixels than the bubble has", () => {
    // The image and document bodies are drawn at a fixed width so the thread
    // does not turn into a column of ragged sizes. On a 320px screen that
    // width plus the bubble's padding is wider than the 85% cap allows.
    const fixed = classLists(bubble).filter((classes) => /(?:^|\s)w-\[\d+px\]/.test(classes));
    expect(fixed.length).toBeGreaterThan(0);
    for (const classes of fixed) expect(classes).toContain("max-w-full");
  });
});

describe("the scroller", () => {
  it("offers the vertical axis only", () => {
    const scroller = classLists(list)[0] ?? "";
    expect(scroller).toContain("overflow-y-auto");
    expect(scroller).toContain("overflow-x-hidden");
  });

  it("does not fall back to the both-axes shorthand", () => {
    // `overflow-auto` is what put the horizontal bar on screen: it hands the
    // second axis to anything that overflows, instead of containing it.
    expect(list).not.toMatch(/(?:^|\s)overflow-auto(?:\s|")/);
  });
});
