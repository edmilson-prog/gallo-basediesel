import type {
  IRelease,
  IReleaseCategoryBlock,
  ReleaseCategory,
} from "@/shared/types/about";
import { classifyVersion } from "./classifyVersion";

/**
 * Parses a Keep-a-Changelog 1.1.0 markdown document into IRelease[].
 *
 * Recognised heading shape (case-sensitive on the version brackets):
 *   ## [0.36.0] — Pulse · 2026-05-27
 *   ## [0.36.1] - Patch-codename · 2026-06-01
 *   ## [0.1.0] — Genesis · 2026-04-12
 *
 * The dash separator can be em-dash (—) or hyphen (-).
 * The center separator (between codename and date) can be · or • or - or |.
 * Codename is optional — heading may be "## [0.1.0] · 2026-04-12" without a name.
 *
 * Returns releases sorted descending by version (most recent first).
 */
export function parseChangelog(raw: string): IRelease[] {
  const lines = raw.split(/\r?\n/);

  // Identify H2 release headings — collect [lineIndex, version, codename, date]
  const headings: Array<{
    lineIdx: number;
    version: string;
    codename: string | null;
    date: string;
  }> = [];

  const headingRe =
    /^##\s+\[(\d+\.\d+\.\d+)\](?:\s*[—\-]\s*([^·•\-|][^·•|]*?))?\s*[·•\-|]\s*(\d{4}-\d{2}-\d{2})\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const m = headingRe.exec(lines[i]);
    if (m) {
      headings.push({
        lineIdx: i,
        version: m[1],
        codename: m[2] ? m[2].trim() : null,
        date: m[3],
      });
    }
  }

  // Build releases by slicing between headings
  const releases: IRelease[] = headings.map((h, idx) => {
    const endLine = idx + 1 < headings.length ? headings[idx + 1].lineIdx : lines.length;
    const bodyLines = lines.slice(h.lineIdx + 1, endLine);
    const rawBlock = bodyLines.join("\n").trim();

    const { summary, categories } = parseReleaseBody(bodyLines);
    const block = extractBlock(summary);
    const totalItems = categories.reduce((acc, c) => acc + c.items.length, 0);

    // kind is filled in a second pass once we know the chronological order
    return {
      version: h.version,
      codename: h.codename,
      date: h.date,
      kind: "patch" as const, // placeholder, overwritten below
      summary,
      block,
      categories,
      totalItems,
      raw: rawBlock,
    };
  });

  // Headings appear top-down in the file → most recent first (Keep-a-Changelog convention).
  // For classifyVersion we compare with the *previous* (older) release, which is
  // the NEXT element in the array (one step down chronologically). The last entry
  // has no previous → null.
  for (let i = 0; i < releases.length; i++) {
    const previousVersion = i + 1 < releases.length ? releases[i + 1].version : null;
    releases[i].kind = classifyVersion(releases[i].version, previousVersion);
  }

  return releases;
}

// ---------------------------------------------------------------------------

function parseReleaseBody(bodyLines: string[]): {
  summary: string;
  categories: IReleaseCategoryBlock[];
} {
  const sectionRe = /^###\s+(.+?)\s*$/;
  const sectionStarts: number[] = [];
  for (let i = 0; i < bodyLines.length; i++) {
    if (sectionRe.test(bodyLines[i])) sectionStarts.push(i);
  }

  const summaryEnd = sectionStarts[0] ?? bodyLines.length;
  const summary = bodyLines
    .slice(0, summaryEnd)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const categories: IReleaseCategoryBlock[] = [];
  for (let s = 0; s < sectionStarts.length; s++) {
    const start = sectionStarts[s];
    const end = s + 1 < sectionStarts.length ? sectionStarts[s + 1] : bodyLines.length;
    const headerMatch = sectionRe.exec(bodyLines[start]);
    if (!headerMatch) continue;

    const category = mapCategoryLabel(headerMatch[1]);
    if (category === null) continue; // unknown section — skipped silently

    const items = extractBullets(bodyLines.slice(start + 1, end));
    if (items.length > 0) {
      categories.push({ category, items });
    }
  }

  return { summary, categories };
}

function mapCategoryLabel(label: string): ReleaseCategory | null {
  const key = label.toLowerCase().trim();
  switch (key) {
    case "added":
      return "added";
    case "changed":
      return "changed";
    case "fixed":
      return "fixed";
    case "removed":
      return "removed";
    case "deprecated":
      return "deprecated";
    case "security":
      return "security";
    case "notes":
    case "notas":
      return "notes";
    case "migration notes":
    case "notas de migração":
    case "notas de migracao":
      return "migration";
    default:
      // Project-specific H3 sections without a ReleaseCategory mapping
      // (e.g. "Tech notes", "Notes (Fase 2)", "Audit log", "Marco") are
      // intentionally dropped here. Map them above if their bullets ever
      // need to surface in the Sobre UI.
      return null;
  }
}

/**
 * Extracts top-level bullets, concatenating continuation lines into the same
 * item separated by "\n".
 *
 * A "top-level bullet" starts at column 0 with `- ` or `* `.
 * A continuation line is either (a) an indented sub-bullet / indented text,
 * OR (b) wrapped bullet text that reflowed to column 0 without indentation
 * — both branches are handled by `isContinuation` below.
 * A blank line closes the current item.
 */
function extractBullets(blockLines: string[]): string[] {
  const out: string[] = [];
  let current: string[] = [];

  const isTopBullet = (line: string) => /^[-*]\s+/.test(line);
  const isContinuation = (line: string) =>
    /^\s+\S/.test(line) || (line.trim().length > 0 && !line.startsWith("#"));

  const flush = () => {
    if (current.length === 0) return;
    const joined = current.join("\n").replace(/\n+$/, "").trim();
    if (joined.length > 0) out.push(joined);
    current = [];
  };

  for (const line of blockLines) {
    if (isTopBullet(line)) {
      flush();
      current.push(line.replace(/^[-*]\s+/, ""));
    } else if (line.trim().length === 0) {
      flush();
    } else if (isContinuation(line) && current.length > 0) {
      current.push(line);
    }
  }
  flush();
  return out;
}

function extractBlock(summary: string): string | null {
  const m = /Bloco\s+(\d+\w?)/i.exec(summary);
  return m ? `Bloco ${m[1]}` : null;
}
