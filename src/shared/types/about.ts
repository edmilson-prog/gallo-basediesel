/**
 * Domain types for the /app/configuracoes/sobre page.
 *
 * IRelease is the parsed shape of one Keep-a-Changelog H2 section.
 * Categories preserve the original bullet text in markdown (inline `code`,
 * **bold** and *italic* are rendered by renderInlineMarkdown at display time).
 */

export type ReleaseKind = "major" | "minor" | "patch";

export type ReleaseCategory =
  | "added"
  | "changed"
  | "fixed"
  | "removed"
  | "deprecated"
  | "security"
  | "notes"
  | "migration";

export interface IReleaseCategoryBlock {
  category: ReleaseCategory;
  items: string[];
}

export interface IRelease {
  /** Semver string, no leading "v". Example: "0.36.0". */
  version: string;
  /** Codename if present in the heading. Null for releases without one. */
  codename: string | null;
  /** ISO date "YYYY-MM-DD" extracted from the heading. */
  date: string;
  /** Derived by classifyVersion comparing with the previous release. */
  kind: ReleaseKind;
  /** Text between the H2 heading and the first H3 section. May be empty. */
  summary: string;
  /** First "Bloco Xx" match in the summary, or null. */
  block: string | null;
  /** Sections found, in original document order. */
  categories: IReleaseCategoryBlock[];
  /** Sum of items across all categories. */
  totalItems: number;
  /** Raw markdown of the entire release block — fallback if rendering fails. */
  raw: string;
}
