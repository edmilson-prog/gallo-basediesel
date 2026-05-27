import type { IReleaseCategoryBlock, ReleaseCategory } from "@/shared/types/about";
import { cn } from "@/lib/utils";
import { renderInlineMarkdown } from "../parser/renderInlineMarkdown";
import { RELEASE_CATEGORY_LABEL } from "../i18n/pt-BR";

interface IProps {
  block: IReleaseCategoryBlock;
}

/**
 * Colored side-bar block listing the bullets of one Keep-a-Changelog section.
 * Color is driven by category — see CATEGORY_COLOR map below.
 */
export function ReleaseCategoryBlock({ block }: IProps) {
  const color = CATEGORY_COLOR[block.category];
  const label = RELEASE_CATEGORY_LABEL[block.category];

  return (
    <div className={cn("mb-3 rounded-r-md border-l-[3px] pl-3 last:mb-0", color.border, color.bg)}>
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 text-xs font-semibold uppercase tracking-wider",
          color.text,
        )}
      >
        <span>{label}</span>
        <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
          {block.items.length}
        </span>
      </div>
      <ul className="mb-2 ml-4 mt-0.5 list-disc space-y-1 text-sm text-muted-foreground">
        {block.items.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            {renderInlineMarkdown(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}

const CATEGORY_COLOR: Record<ReleaseCategory, { border: string; bg: string; text: string }> = {
  added: {
    border: "border-l-success",
    bg: "bg-gradient-to-r from-success/10 to-transparent",
    text: "text-success",
  },
  changed: {
    border: "border-l-warning",
    bg: "bg-gradient-to-r from-warning/10 to-transparent",
    text: "text-warning",
  },
  fixed: {
    border: "border-l-info",
    bg: "bg-gradient-to-r from-info/10 to-transparent",
    text: "text-info",
  },
  removed: {
    border: "border-l-destructive",
    bg: "bg-gradient-to-r from-destructive/10 to-transparent",
    text: "text-destructive",
  },
  deprecated: {
    border: "border-l-destructive",
    bg: "bg-gradient-to-r from-destructive/10 to-transparent",
    text: "text-destructive",
  },
  security: {
    border: "border-l-destructive",
    bg: "bg-gradient-to-r from-destructive/10 to-transparent",
    text: "text-destructive",
  },
  notes: {
    border: "border-l-primary",
    bg: "bg-gradient-to-r from-primary/10 to-transparent",
    text: "text-primary",
  },
  migration: {
    border: "border-l-primary",
    bg: "bg-gradient-to-r from-primary/10 to-transparent",
    text: "text-primary",
  },
};
