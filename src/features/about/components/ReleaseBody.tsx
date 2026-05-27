import type { IRelease, ReleaseCategory } from "@/shared/types/about";
import { ReleaseCategoryBlock } from "./ReleaseCategoryBlock";
import { renderInlineMarkdown } from "../parser/renderInlineMarkdown";
import { ABOUT_I18N } from "../i18n/pt-BR";

interface IProps {
  release: IRelease;
}

/**
 * Fixed render order for category blocks (matches Keep-a-Changelog order
 * of severity / interest). Categories absent from the release are skipped.
 */
const ORDER: ReleaseCategory[] = [
  "added",
  "changed",
  "fixed",
  "removed",
  "deprecated",
  "security",
  "migration",
  "notes",
];

export function ReleaseBody({ release }: IProps) {
  const ordered = ORDER
    .map((cat) => release.categories.find((c) => c.category === cat))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);

  // Fallback when parser found no recognised sections — render raw markdown
  // so the user still sees something.
  if (ordered.length === 0 && release.raw.length > 0) {
    return (
      <div className="space-y-3">
        {release.summary && (
          <p className="leading-relaxed text-muted-foreground">
            {renderInlineMarkdown(release.summary)}
          </p>
        )}
        <p className="text-xs italic text-muted-foreground">
          {ABOUT_I18N.history.rawFallbackNote}
        </p>
        <pre className="max-h-96 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          {release.raw}
        </pre>
      </div>
    );
  }

  return (
    <div>
      {release.summary && (
        <p className="mb-4 leading-relaxed text-muted-foreground">
          {renderInlineMarkdown(release.summary)}
        </p>
      )}
      {ordered.map((block) => (
        <ReleaseCategoryBlock key={block.category} block={block} />
      ))}
    </div>
  );
}
