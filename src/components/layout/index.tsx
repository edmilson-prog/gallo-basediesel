import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Gap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16 | 20 | 24;
const GAP: Record<Gap, string> = {
  0: "gap-0",
  1: "gap-1",
  2: "gap-2",
  3: "gap-3",
  4: "gap-4",
  5: "gap-5",
  6: "gap-6",
  8: "gap-8",
  10: "gap-10",
  12: "gap-12",
  16: "gap-16",
  20: "gap-20",
  24: "gap-24",
};

type Align = "start" | "center" | "end" | "stretch" | "baseline";
type Justify = "start" | "center" | "end" | "between" | "around" | "evenly";

interface IStackProps extends HTMLAttributes<HTMLDivElement> {
  gap?: Gap;
  align?: Align;
  justify?: Justify;
  as?: "div" | "section" | "ul" | "ol" | "nav";
}

const alignClass = (v?: Align) =>
  v ? `items-${v === "stretch" ? "stretch" : v}` : "";
const justifyClass = (v?: Justify) => (v ? `justify-${v}` : "");

export const Stack = forwardRef<HTMLDivElement, IStackProps>(function Stack(
  { className, gap = 4, align, justify, as: Tag = "div", ...rest },
  ref,
) {
  return (
    <Tag
      ref={ref as never}
      className={cn(
        "flex flex-col",
        GAP[gap],
        alignClass(align),
        justifyClass(justify),
        className,
      )}
      {...(rest as Record<string, unknown>)}

    />
  );
});

export const Inline = forwardRef<HTMLDivElement, IStackProps & { wrap?: boolean }>(
  function Inline(
    { className, gap = 2, align = "center", justify, wrap, as: Tag = "div", ...rest },
    ref,
  ) {
    return (
      <Tag
        ref={ref as never}
        className={cn(
          "flex flex-row",
          wrap && "flex-wrap",
          GAP[gap],
          alignClass(align),
          justifyClass(justify),
          className,
        )}
        {...(rest as Record<string, unknown>)}

      />
    );
  },
);

interface IGridProps extends HTMLAttributes<HTMLDivElement> {
  cols?: 1 | 2 | 3 | 4 | 5 | 6 | 8 | 12;
  gap?: Gap;
}
const COLS: Record<NonNullable<IGridProps["cols"]>, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
  8: "grid-cols-2 md:grid-cols-4 lg:grid-cols-8",
  12: "grid-cols-12",
};

export const Grid = forwardRef<HTMLDivElement, IGridProps>(function Grid(
  { className, cols = 3, gap = 4, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn("grid", COLS[cols], GAP[gap], className)}
      {...rest}
    />
  );
});

interface IContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg" | "xl" | "full";
}
const SIZE: Record<NonNullable<IContainerProps["size"]>, string> = {
  sm: "max-w-3xl",
  md: "max-w-5xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
  full: "max-w-none",
};
export const Container = forwardRef<HTMLDivElement, IContainerProps>(
  function Container({ className, size = "lg", ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", SIZE[size], className)}
        {...rest}
      />
    );
  },
);
